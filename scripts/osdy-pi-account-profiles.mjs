import {
	constants as fsConstants,
	lstatSync,
	realpathSync,
	statSync,
} from "node:fs";
import {
	chmod,
	lstat,
	mkdir,
	open,
	readFile,
	readlink,
	readdir,
	rename,
	rmdir,
	symlink,
	unlink,
	writeFile,
} from "node:fs/promises";
import { Buffer } from "node:buffer";
import { randomUUID } from "node:crypto";
import { homedir } from "node:os";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const PROFILE_NAME = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,62})$/;
const RESERVED_PROFILE_NAMES = new Set(["default", "profiles", "auth.json"]);

function profileIdentity(name) {
	return name.toLowerCase();
}

function sameProfile(left, right) {
	return profileIdentity(left) === profileIdentity(right);
}

function assertUniqueProfileIdentities(profiles) {
	const identities = new Set();
	for (const profile of profiles) {
		const identity = profileIdentity(profile);
		if (identities.has(identity))
			throw new Error("Profile lookup is ambiguous due to a case-insensitive collision.");
		identities.add(identity);
	}
}
const DEFAULT_ACCOUNT_FILE = "default-account.json";
const ACTIVE_ACCOUNT_FILE = "active-account.json";
const MAX_DEFAULT_ACCOUNT_BYTES = 4096;
const MAX_AUTH_BYTES = 4 * 1024 * 1024;
const ACCOUNT_SWITCH_LOCK_FILE = "account-switch.lock";
const PROFILE_NAMESPACE_LOCK_FILE = "profile-namespace.lock";
const PRIVATE_LOCK_TIMEOUT_MS = 2000;
const PRIVATE_LOCK_RETRY_MS = 25;
let accountSwitch = Promise.resolve();
const SHARED_STATE = [
	"settings.json",
	"models.json",
	"models-store.json",
	"keybindings.json",
	"trust.json",
	"AGENTS.md",
	"SYSTEM.md",
	"APPEND_SYSTEM.md",
	"sessions",
	"extensions",
	"skills",
	"prompts",
	"themes",
	"npm",
	"git",
	"bin",
	"tools",
	// Legacy shared locations retained for existing installations.
	"packages",
	"resources",
];

export function validateProfileName(value) {
	if (
		typeof value !== "string" ||
		!PROFILE_NAME.test(value) ||
		RESERVED_PROFILE_NAMES.has(profileIdentity(value)) ||
		isAbsolute(value) ||
		basename(value) !== value
	) {
		throw new Error(
			"Profile names must use ASCII letters, numbers, and hyphens (not reserved names).",
		);
	}
	return value;
}

export function getSharedAgentDir(env = process.env) {
	const explicit = env.OSDY_PI_SHARED_AGENT_DIR;
	const candidate = resolve(
		explicit ?? env.PI_CODING_AGENT_DIR ?? join(homedir(), ".pi", "agent"),
	);
	if (explicit !== undefined) return candidate;
	const managedPath = join(candidate, "osdy-pi");
	try {
		if (!lstatSync(managedPath).isSymbolicLink()) return candidate;
		const resolvedManagedPath = realpathSync(managedPath);
		if (
			basename(resolvedManagedPath) !== "osdy-pi" ||
			!statSync(resolvedManagedPath).isDirectory()
		)
			return candidate;
		return dirname(resolvedManagedPath);
	} catch {
		return candidate;
	}
}

export function createProfileLayout(sharedAgentDir, name) {
	const safeName = validateProfileName(name);
	const profilesDir = join(resolve(sharedAgentDir), "osdy-pi", "profiles");
	const profileDir = join(profilesDir, safeName);
	return {
		profileDir,
		profilesDir,
		authPath: join(profileDir, "auth.json"),
		sharedState: SHARED_STATE,
	};
}

export function parseAccountCommand(args) {
	if (args[0] !== "account")
		throw new Error(
			"Usage: osdy-pi account list | create <name> | add <name> | rename <old> <new> | remove <name> --confirm <name> [--replacement <other>] | use <name> [-- <pi args...] | default [<name> | --clear]",
		);
	if (args[1] === "list" && args.length === 2) return { action: "list" };
	if (args[1] === "create" && args.length === 3)
		return { action: "create", name: validateProfileName(args[2]) };
	if (args[1] === "add" && args.length === 3)
		return { action: "add", name: validateProfileName(args[2]) };
	if (args[1] === "rename" && args.length === 4)
		return {
			action: "rename",
			oldName: validateProfileName(args[2]),
			newName: validateProfileName(args[3]),
		};
	if (
		args[1] === "remove" &&
		args.length === 5 &&
		args[3] === "--confirm" &&
		args[4] === args[2]
	)
		return {
			action: "remove",
			name: validateProfileName(args[2]),
			replacement: undefined,
		};
	if (
		args[1] === "remove" &&
		args.length === 7 &&
		args[3] === "--confirm" &&
		args[4] === args[2] &&
		args[5] === "--replacement"
	)
		return {
			action: "remove",
			name: validateProfileName(args[2]),
			replacement: validateProfileName(args[6]),
		};
	if (args[1] === "default" && args.length === 2)
		return { action: "default", operation: "query" };
	if (args[1] === "default" && args.length === 3 && args[2] === "--clear")
		return { action: "default", operation: "clear" };
	if (args[1] === "default" && args.length === 3)
		return {
			action: "default",
			operation: "set",
			name: validateProfileName(args[2]),
		};
	if (args[1] === "use" && args.length >= 3) {
		const name = validateProfileName(args[2]);
		const separator = args.indexOf("--", 3);
		if (separator === -1 && args.length === 3)
			return { action: "use", name, piArgs: [] };
		if (separator === 3) return { action: "use", name, piArgs: args.slice(4) };
	}
	throw new Error(
		"Usage: osdy-pi account list | create <name> | add <name> | rename <old> <new> | remove <name> --confirm <name> [--replacement <other>] | use <name> [-- <pi args...] | default [<name> | --clear]",
	);
}

export function planPiLaunch(
	sharedAgentDir,
	name,
	piArgs = [],
	env = process.env,
) {
	const safeName = validateProfileName(name);
	const devExtensionRoot = env.OSDY_PI_DEV_EXTENSION_ROOT;
	if (
		devExtensionRoot !== undefined &&
		(typeof devExtensionRoot !== "string" || !isAbsolute(devExtensionRoot))
	) {
		throw new Error("The development extension root must be absolute.");
	}
	return {
		command: "pi",
		args:
			devExtensionRoot === undefined
				? [...piArgs]
				: ["-e", devExtensionRoot, ...piArgs],
		env: {
			PI_CODING_AGENT_DIR: resolve(sharedAgentDir),
			OSDY_PI_PROFILE_NAME: safeName,
			OSDY_PI_SHARED_AGENT_DIR: resolve(sharedAgentDir),
			PI_CODING_AGENT_SESSION_DIR: join(resolve(sharedAgentDir), "sessions"),
		},
	};
}

async function ensurePrivateDirectory(path) {
	try {
		const stat = await lstat(path);
		if (!stat.isDirectory())
			throw new Error(`Managed profile path is not a directory: ${path}`);
	} catch (error) {
		if (!isErrorCode(error, "ENOENT")) throw error;
		try {
			await mkdir(path, { mode: 0o700 });
		} catch (mkdirError) {
			if (!isErrorCode(mkdirError, "EEXIST")) throw mkdirError;
		}
		const stat = await lstat(path);
		if (!stat.isDirectory())
			throw new Error(`Managed profile path is not a directory: ${path}`);
	}
	await chmod(path, 0o700);
}

function isErrorCode(error, code) {
	return (
		error && typeof error === "object" && "code" in error && error.code === code
	);
}

async function ensureSharedLink(target, source) {
	try {
		const stat = await lstat(target);
		if (!stat.isSymbolicLink())
			throw new Error(
				`Profile state already exists and is not a shared link: ${target}`,
			);
		if ((await readlink(target)) !== source) {
			throw new Error(
				`Profile shared link does not target the shared state: ${target}`,
			);
		}
		return;
	} catch (error) {
		if (!isErrorCode(error, "ENOENT")) throw error;
	}
	await symlink(source, target);
}

async function findExistingProfileName(profilesDir, name) {
	const matches = [];
	try {
		const entries = await readdir(profilesDir, { withFileTypes: true });
		for (const entry of entries)
			if (
				entry.isDirectory() &&
				PROFILE_NAME.test(entry.name) &&
				!RESERVED_PROFILE_NAMES.has(profileIdentity(entry.name)) &&
				sameProfile(entry.name, name)
			)
				matches.push(entry.name);
	} catch (error) {
		if (isErrorCode(error, "ENOENT")) return undefined;
		throw error;
	}
	if (matches.length > 1)
		throw new Error("Profile lookup is ambiguous due to a case-insensitive collision.");
	return matches[0];
}

export async function ensureProfileLayout(sharedAgentDir, name, { hooks = {} } = {}) {
	const sharedDir = resolve(sharedAgentDir);
	const layout = createProfileLayout(sharedDir, name);
	await ensurePrivateDirectory(join(sharedDir, "osdy-pi"));
	return withProfileNamespaceLock(sharedDir, hooks, async () => {
		await ensurePrivateDirectory(layout.profilesDir);
		const existingName = await findExistingProfileName(layout.profilesDir, name);
		if (existingName !== undefined && existingName !== basename(layout.profileDir))
			throw new Error("A profile with the same case-insensitive name already exists.");
		await ensurePrivateDirectory(layout.profileDir);
		for (const stateName of layout.sharedState) {
			await ensureSharedLink(
				join(layout.profileDir, stateName),
				join(sharedDir, stateName),
			);
		}
		return layout;
	});
}

export function getDefaultAccountPath(sharedAgentDir) {
	return join(resolve(sharedAgentDir), "osdy-pi", DEFAULT_ACCOUNT_FILE);
}

export function getActiveAccountPath(sharedAgentDir) {
	return join(resolve(sharedAgentDir), "osdy-pi", ACTIVE_ACCOUNT_FILE);
}

export async function validateExistingProfile(sharedAgentDir, name) {
	const safeName = validateProfileName(name);
	const requestedLayout = createProfileLayout(sharedAgentDir, safeName);
	try {
		const osdyPiStat = await lstat(join(resolve(sharedAgentDir), "osdy-pi"));
		if (!osdyPiStat.isDirectory())
			throw new Error("Managed account path is not a directory.");
		const profilesStat = await lstat(requestedLayout.profilesDir);
		if (!profilesStat.isDirectory())
			throw new Error("Managed profiles path is not a directory.");
		const canonicalName = await findExistingProfileName(
			requestedLayout.profilesDir,
			safeName,
		);
		if (canonicalName === undefined)
			throw new Error("The selected default must be an existing profile.");
		const layout = createProfileLayout(sharedAgentDir, canonicalName);
		const stat = await lstat(layout.profileDir);
		if (!stat.isDirectory())
			throw new Error("The selected profile is not an existing directory.");
		return { ...layout, name: canonicalName };
	} catch (error) {
		if (isErrorCode(error, "ENOENT"))
			throw new Error("The selected default must be an existing profile.");
		throw error;
	}
}

async function readBoundedRegularFile(path) {
	const stat = await lstat(path);
	if (!stat.isFile() || stat.size > MAX_DEFAULT_ACCOUNT_BYTES)
		throw new Error("Default account metadata is not a bounded regular file.");
	const handle = await open(path, "r");
	try {
		const openedStat = await handle.stat();
		if (!openedStat.isFile() || openedStat.size > MAX_DEFAULT_ACCOUNT_BYTES)
			throw new Error("Default account metadata is not a bounded regular file.");
		const buffer = Buffer.alloc(MAX_DEFAULT_ACCOUNT_BYTES + 1);
		const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
		if (bytesRead > MAX_DEFAULT_ACCOUNT_BYTES)
			throw new Error("Default account metadata is too large.");
		return buffer.toString("utf8", 0, bytesRead);
	} finally {
		await handle.close();
	}
}

export async function readDefaultAccount(sharedAgentDir) {
	const defaultPath = getDefaultAccountPath(sharedAgentDir);
	try {
		const defaultDirStat = await lstat(join(resolve(sharedAgentDir), "osdy-pi"));
		if (!defaultDirStat.isDirectory()) return { status: "invalid" };
		const parsed = JSON.parse(await readBoundedRegularFile(defaultPath));
		if (
			typeof parsed !== "object" ||
			parsed === null ||
			Object.keys(parsed).length !== 2 ||
			parsed.version !== 1 ||
			typeof parsed.profile !== "string"
		)
			return { status: "invalid" };
		const profile = await validateExistingProfile(sharedAgentDir, parsed.profile);
		return { status: "valid", profile: profile.name };
	} catch (error) {
		if (isErrorCode(error, "ENOENT")) return { status: "unset" };
		return { status: "invalid" };
	}
}

async function replacePrivateFile(path, contents) {
	const directory = resolve(path, "..");
	const filename = basename(path);
	const temporary = join(
		directory,
		`.${filename}.${process.pid}.${randomUUID()}.tmp`,
	);
	try {
		await writeFile(temporary, contents, {
			mode: 0o600,
			flag: "wx",
		});
		await chmod(temporary, 0o600);
		await rename(temporary, path);
		await chmod(path, 0o600);
	} catch (error) {
		await unlink(temporary).catch(() => {});
		throw error;
	}
}

async function writeAccountMetadata(sharedAgentDir, filename, name) {
	const layout = await validateExistingProfile(sharedAgentDir, name);
	const metadataDir = join(resolve(sharedAgentDir), "osdy-pi");
	await ensurePrivateDirectory(metadataDir);
	await replacePrivateFile(
		join(metadataDir, filename),
		`${JSON.stringify({ version: 1, profile: layout.name })}\n`,
	);
}

async function captureMetadata(sharedAgentDir, filename) {
	const path = join(resolve(sharedAgentDir), "osdy-pi", filename);
	try {
		const stat = await lstat(path);
		if (!stat.isFile() || stat.size > MAX_DEFAULT_ACCOUNT_BYTES)
			throw new Error("Account metadata is not a bounded regular file.");
		return { path, contents: await readFile(path, "utf8") };
	} catch (error) {
		if (isErrorCode(error, "ENOENT")) return { path, contents: undefined };
		throw error;
	}
}

async function restoreMetadata(snapshot) {
	if (snapshot.contents === undefined) {
		await unlink(snapshot.path).catch((error) => {
			if (!isErrorCode(error, "ENOENT")) throw error;
		});
		return;
	}
	await replacePrivateFile(snapshot.path, snapshot.contents);
}

async function updateSelectionMetadata(sharedAgentDir, name, hooks = {}) {
	const activeBefore = await captureMetadata(
		sharedAgentDir,
		ACTIVE_ACCOUNT_FILE,
	);
	const defaultBefore = await captureMetadata(
		sharedAgentDir,
		DEFAULT_ACCOUNT_FILE,
	);
	try {
		await setActiveAccount(sharedAgentDir, name);
		await hooks.afterActiveWrite?.();
		await setDefaultAccount(sharedAgentDir, name);
	} catch (error) {
		const rollbackErrors = [];
		for (const [snapshot, restore] of [
			[activeBefore, hooks.restoreActiveMetadata ?? restoreMetadata],
			[defaultBefore, hooks.restoreDefaultMetadata ?? restoreMetadata],
		]) {
			try {
				await restore(snapshot);
			} catch (rollbackError) {
				rollbackErrors.push(boundedError(rollbackError));
			}
		}
		if (rollbackErrors.length > 0) {
			throw new Error(
				`Selection metadata update failed: ${boundedError(error)}; rollback failures: ${rollbackErrors.join("; ")}`,
				{ cause: error },
			);
		}
		throw error;
	}
}

export async function setDefaultAccount(sharedAgentDir, name) {
	await writeAccountMetadata(sharedAgentDir, DEFAULT_ACCOUNT_FILE, name);
}

export async function setActiveAccount(sharedAgentDir, name) {
	await writeAccountMetadata(sharedAgentDir, ACTIVE_ACCOUNT_FILE, name);
}

export async function readActiveAccount(sharedAgentDir) {
	const activePath = getActiveAccountPath(sharedAgentDir);
	try {
		const parsed = JSON.parse(await readBoundedRegularFile(activePath));
		if (
			typeof parsed !== "object" ||
			parsed === null ||
			Object.keys(parsed).length !== 2 ||
			parsed.version !== 1 ||
			typeof parsed.profile !== "string"
		)
			return { status: "invalid" };
		const profile = await validateExistingProfile(sharedAgentDir, parsed.profile);
		return { status: "valid", profile: profile.name };
	} catch (error) {
		if (isErrorCode(error, "ENOENT")) return { status: "unset" };
		return { status: "invalid" };
	}
}

async function captureOptionalAuth(path) {
	try {
		const sourceStat = await lstat(path);
		if (!sourceStat.isFile() || sourceStat.size > MAX_AUTH_BYTES)
			throw new Error("Account auth is not a bounded regular file.");
		const handle = await open(
			path,
			fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0),
		);
		try {
			const openedStat = await handle.stat();
			if (
				openedStat.dev !== sourceStat.dev ||
				openedStat.ino !== sourceStat.ino ||
				!openedStat.isFile() ||
				openedStat.size > MAX_AUTH_BYTES
			)
				throw new Error("Account auth changed while switching accounts.");
			const contents = Buffer.alloc(openedStat.size);
			const { bytesRead } = await handle.read(contents, 0, contents.length, 0);
			if (bytesRead !== openedStat.size)
				throw new Error("Account auth changed while switching accounts.");
			return contents;
		} finally {
			await handle.close();
		}
	} catch (error) {
		if (isErrorCode(error, "ENOENT")) return undefined;
		throw error;
	}
}

async function restoreOptionalAuth(path, contents) {
	if (contents === undefined) {
		await unlink(path).catch((error) => {
			if (!isErrorCode(error, "ENOENT")) throw error;
		});
		return;
	}
	await replacePrivateFile(path, contents);
}

async function copyRegularAuth(source, destination, hooks = {}) {
	const sourceStat = await lstat(source);
	if (!sourceStat.isFile() || sourceStat.size > MAX_AUTH_BYTES)
		throw new Error("Account auth is not a bounded regular file.");
	await hooks.beforeOpenAuth?.(source);
	const noFollow = fsConstants.O_NOFOLLOW ?? 0;
	let sourceHandle;
	try {
		sourceHandle = await open(source, fsConstants.O_RDONLY | noFollow);
	} catch (error) {
		if (isErrorCode(error, "ELOOP"))
			throw new Error("Account auth is not a bounded regular file.");
		throw error;
	}
	try {
		const openedStat = await sourceHandle.stat();
		if (
			openedStat.dev !== sourceStat.dev ||
			openedStat.ino !== sourceStat.ino ||
			!openedStat.isFile() ||
			openedStat.size > MAX_AUTH_BYTES
		)
			throw new Error("Account auth is not a bounded regular file.");
		const contents = Buffer.alloc(openedStat.size);
		const { bytesRead } = await sourceHandle.read(
			contents,
			0,
			contents.length,
			0,
		);
		if (bytesRead !== openedStat.size)
			throw new Error("Account auth changed while switching accounts.");
		const directory = resolve(destination, "..");
		const temporary = join(
			directory,
			`.auth.json.${process.pid}.${randomUUID()}.tmp`,
		);
		try {
			await writeFile(temporary, contents, { mode: 0o600, flag: "wx" });
			await chmod(temporary, 0o600);
			await rename(temporary, destination);
			await chmod(destination, 0o600);
		} catch (error) {
			await unlink(temporary).catch(() => {});
			throw error;
		}
	} finally {
		await sourceHandle.close();
	}
}

async function assertOptionalRegularAuth(path) {
	try {
		const stat = await lstat(path);
		if (!stat.isFile() || stat.size > MAX_AUTH_BYTES)
			throw new Error("Account auth is not a bounded regular file.");
		return true;
	} catch (error) {
		if (isErrorCode(error, "ENOENT")) return false;
		throw error;
	}
}

async function removeOwnedPrivateLock(lockPath, lockIdentity) {
	const currentLock = await lstat(lockPath).catch(() => undefined);
	if (
		currentLock?.dev === lockIdentity.dev &&
		currentLock.ino === lockIdentity.ino
	)
		await unlink(lockPath).catch(() => {});
}

async function withPrivateLock(sharedDir, lockFile, timeoutMessage, hooks, operation) {
	const lockPath = join(sharedDir, "osdy-pi", lockFile);
	const deadline = Date.now() + PRIVATE_LOCK_TIMEOUT_MS;
	let handle;
	let lockIdentity;
	while (handle === undefined) {
		let candidateHandle;
		let candidateIdentity;
		try {
			candidateHandle = await open(lockPath, "wx", 0o600);
			candidateIdentity = await candidateHandle.stat();
			await hooks.afterLockCreated?.();
			await candidateHandle.writeFile(`${JSON.stringify({ pid: process.pid })}\n`);
			await candidateHandle.chmod(0o600);
			handle = candidateHandle;
			lockIdentity = candidateIdentity;
		} catch (error) {
			if (candidateHandle !== undefined) {
				await candidateHandle.close().catch(() => {});
				if (candidateIdentity !== undefined)
					await removeOwnedPrivateLock(lockPath, candidateIdentity);
			}
			if (!isErrorCode(error, "EEXIST")) throw error;
			if (Date.now() >= deadline) throw new Error(timeoutMessage);
			await delay(PRIVATE_LOCK_RETRY_MS);
		}
	}
	try {
		await hooks.afterLockAcquired?.();
		return await operation();
	} finally {
		await handle.close().catch(() => {});
		await removeOwnedPrivateLock(lockPath, lockIdentity);
	}
}

function withAccountSwitchLock(sharedDir, hooks, operation) {
	return withPrivateLock(
		sharedDir,
		ACCOUNT_SWITCH_LOCK_FILE,
		"Timed out waiting for account switch lock.",
		hooks,
		operation,
	);
}

function withProfileNamespaceLock(sharedDir, hooks, operation) {
	return withPrivateLock(
		sharedDir,
		PROFILE_NAMESPACE_LOCK_FILE,
		"Timed out waiting for profile namespace lock.",
		hooks,
		operation,
	);
}

async function switchAccountAuthNow(sharedAgentDir, destination, hooks = {}) {
	const target = await validateExistingProfile(sharedAgentDir, destination);
	const sharedDir = resolve(sharedAgentDir);
	await ensurePrivateDirectory(sharedDir);
	return withAccountSwitchLock(sharedDir, hooks, async () => {
		const canonicalAuth = join(sharedDir, "auth.json");
		const targetHasAuth = await assertOptionalRegularAuth(target.authPath);
		const active = await readActiveAccount(sharedDir);
		const source =
			active.status === "valid"
				? await validateExistingProfile(sharedDir, active.profile)
				: undefined;
		const canonicalExists = await assertOptionalRegularAuth(canonicalAuth);
		const canonicalBefore = await captureOptionalAuth(canonicalAuth);
		if (source && sameProfile(source.name, target.name)) {
			await updateSelectionMetadata(sharedDir, target.name, hooks);
			return;
		}
		if (source && canonicalExists)
			await copyRegularAuth(canonicalAuth, source.authPath, hooks);
		try {
			if (targetHasAuth)
				await copyRegularAuth(target.authPath, canonicalAuth, hooks);
			else if (canonicalExists) await unlink(canonicalAuth);
			await updateSelectionMetadata(sharedDir, target.name, hooks);
		} catch (error) {
			await restoreOptionalAuth(canonicalAuth, canonicalBefore).catch(() => {});
			throw error;
		}
	});
}

export function switchAccountAuth(
	sharedAgentDir,
	destination,
	{ hooks = {} } = {},
) {
	const next = accountSwitch.then(() =>
		switchAccountAuthNow(sharedAgentDir, destination, hooks),
	);
	accountSwitch = next.catch(() => {});
	return next;
}

export async function clearDefaultAccount(sharedAgentDir) {
	try {
		await unlink(getDefaultAccountPath(sharedAgentDir));
	} catch (error) {
		if (!isErrorCode(error, "ENOENT")) throw error;
	}
}

function refuseActiveProfile(name, activeProfile) {
	if (typeof activeProfile === "string" && sameProfile(activeProfile, name))
		throw new Error(
			"Cannot change the active profile. Close this Pi process first.",
		);
}

async function assertMissingProfilePath(profilesDir, name) {
	const existingName = await findExistingProfileName(profilesDir, name);
	if (existingName !== undefined)
		throw new Error("The new profile path already exists.");
}

async function moveProfileDirectory(oldPath, newPath, profilesDir) {
	if (!sameProfile(basename(oldPath), basename(newPath))) {
		await rename(oldPath, newPath);
		return;
	}
	const temporary = join(
		profilesDir,
		`.profile-rename.${process.pid}.${randomUUID()}.tmp`,
	);
	await rename(oldPath, temporary);
	try {
		await rename(temporary, newPath);
	} catch (error) {
		await rename(temporary, oldPath).catch(() => {});
		throw error;
	}
}

export async function renameProfile(
	sharedAgentDir,
	oldName,
	newName,
	{
		activeProfile = process.env.OSDY_PI_PROFILE_NAME,
		setDefault = setDefaultAccount,
		hooks = {},
	} = {},
) {
	const sharedDir = resolve(sharedAgentDir);
	const safeOldName = validateProfileName(oldName);
	const safeNewName = validateProfileName(newName);
	await ensurePrivateDirectory(join(sharedDir, "osdy-pi"));
	return withProfileNamespaceLock(sharedDir, hooks, async () => {
		const oldProfile = await validateExistingProfile(sharedDir, safeOldName);
		refuseActiveProfile(oldProfile.name, activeProfile);
		const newProfile = createProfileLayout(sharedDir, safeNewName);
		if (!sameProfile(oldProfile.name, safeNewName))
			await assertMissingProfilePath(newProfile.profilesDir, safeNewName);
		const defaultAccount = await readDefaultAccount(sharedDir);
		await moveProfileDirectory(
			oldProfile.profileDir,
			newProfile.profileDir,
			newProfile.profilesDir,
		);
		if (
			defaultAccount.status !== "valid" ||
			!sameProfile(defaultAccount.profile, oldProfile.name)
		)
			return;
		try {
			await setDefault(sharedDir, safeNewName);
		} catch (error) {
			try {
				await moveProfileDirectory(
					newProfile.profileDir,
					oldProfile.profileDir,
					newProfile.profilesDir,
				);
			} catch (rollbackError) {
				throw new Error(
					`Default update failed and profile rollback failed: ${boundedError(error)}; ${boundedError(rollbackError)}`,
				);
			}
			throw new Error(
				`Default update failed; profile rename was rolled back: ${boundedError(error)}`,
			);
		}
	});
}

function boundedError(error) {
	return error instanceof Error ? error.message.slice(0, 180) : "unknown error";
}

async function removeProfileNow(
	sharedAgentDir,
	name,
	{
		confirmation,
		replacement,
		activeProfile = process.env.OSDY_PI_PROFILE_NAME,
	} = {},
) {
	const profile = await validateExistingProfile(sharedAgentDir, name);
	if (confirmation !== profile.name)
		throw new Error("Profile removal requires an exact matching confirmation.");
	refuseActiveProfile(profile.name, activeProfile);
	const defaultAccount = await readDefaultAccount(sharedAgentDir);
	if (
		defaultAccount.status === "valid" &&
		sameProfile(defaultAccount.profile, profile.name)
	) {
		if (replacement === undefined)
			throw new Error("Removing the default profile requires a replacement.");
		const safeReplacement = validateProfileName(replacement);
		if (sameProfile(safeReplacement, profile.name))
			throw new Error(
				"The default replacement must be different from the removed profile.",
			);
		await validateExistingProfile(sharedAgentDir, safeReplacement);
		await setDefaultAccount(sharedAgentDir, safeReplacement);
	} else if (replacement !== undefined) {
		throw new Error(
			"A replacement is only allowed when removing the default profile.",
		);
	}
	const entries = await readdir(profile.profileDir, { withFileTypes: true });
	for (const entry of entries) {
		const entryPath = join(profile.profileDir, entry.name);
		let stat;
		try {
			stat = await lstat(entryPath);
		} catch (error) {
			throw new Error(
				`Profile entry changed during removal: ${entry.name}: ${boundedError(error)}`,
			);
		}
		if (stat.isDirectory())
			throw new Error(
				`Refusing to remove unexpected directory in profile: ${entry.name}`,
			);
		if (!stat.isSymbolicLink() && !stat.isFile())
			throw new Error(
				`Refusing to remove unexpected profile entry: ${entry.name}`,
			);
	}
	for (const entry of entries) {
		try {
			await unlink(join(profile.profileDir, entry.name));
		} catch (error) {
			throw new Error(
				`Could not remove profile entry ${entry.name}: ${boundedError(error)}`,
			);
		}
	}
	try {
		await rmdir(profile.profileDir);
	} catch (error) {
		throw new Error(
			`Could not remove empty profile directory: ${boundedError(error)}`,
		);
	}
}

export async function removeProfile(
	sharedAgentDir,
	name,
	{
		confirmation,
		replacement,
		activeProfile = process.env.OSDY_PI_PROFILE_NAME,
		hooks = {},
	} = {},
) {
	const sharedDir = resolve(sharedAgentDir);
	const safeName = validateProfileName(name);
	await ensurePrivateDirectory(join(sharedDir, "osdy-pi"));
	return withProfileNamespaceLock(sharedDir, hooks, () =>
		removeProfileNow(sharedDir, safeName, {
			confirmation,
			replacement,
			activeProfile,
		}),
	);
}

export async function planDefaultLaunch(
	sharedAgentDir,
	piArgs = [],
	env = process.env,
) {
	const defaultAccount = await readDefaultAccount(sharedAgentDir);
	if (defaultAccount.status === "valid") {
		await switchAccountAuth(sharedAgentDir, defaultAccount.profile);
		return {
			plan: planPiLaunch(sharedAgentDir, defaultAccount.profile, piArgs, env),
			defaultAccount,
		};
	}
	return {
		plan: { command: "pi", args: [...piArgs], env: {} },
		defaultAccount,
	};
}

export async function listProfiles(sharedAgentDir) {
	const { profilesDir } = createProfileLayout(sharedAgentDir, "placeholder");
	try {
		const managedDirectory = await lstat(
		join(resolve(sharedAgentDir), "osdy-pi"),
	);
		if (!managedDirectory.isDirectory()) return [];
		const entries = await readdir(profilesDir, { withFileTypes: true });
		const profiles = [];
		for (const entry of entries) {
			if (
				entry.isDirectory() &&
				PROFILE_NAME.test(entry.name) &&
				!RESERVED_PROFILE_NAMES.has(profileIdentity(entry.name))
			) {
				profiles.push(entry.name);
			}
		}
		assertUniqueProfileIdentities(profiles);
		return profiles.sort(compareStrings);
	} catch (error) {
		if (isErrorCode(error, "ENOENT")) return [];
		throw error;
	}
}

function compareStrings(left, right) {
	if (left < right) return -1;
	if (left > right) return 1;
	return 0;
}

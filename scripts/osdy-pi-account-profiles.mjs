import {
	chmod,
	lstat,
	mkdir,
	open,
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
import { basename, isAbsolute, join, resolve } from "node:path";

const PROFILE_NAME = /^[a-z0-9](?:[a-z0-9-]{0,62})$/;
const RESERVED_PROFILE_NAMES = new Set(["default", "profiles", "auth.json"]);
const DEFAULT_ACCOUNT_FILE = "default-account.json";
const MAX_DEFAULT_ACCOUNT_BYTES = 4096;
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
		RESERVED_PROFILE_NAMES.has(value) ||
		isAbsolute(value) ||
		basename(value) !== value
	) {
		throw new Error(
			"Profile names must use lowercase letters, numbers, and hyphens (not reserved names).",
		);
	}
	return value;
}

export function getSharedAgentDir(env = process.env) {
	return resolve(
		env.OSDY_PI_SHARED_AGENT_DIR ??
			env.PI_CODING_AGENT_DIR ??
			join(homedir(), ".pi", "agent"),
	);
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
	const layout = createProfileLayout(sharedAgentDir, safeName);
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
			PI_CODING_AGENT_DIR: layout.profileDir,
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
		await mkdir(path, { mode: 0o700 });
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

export async function ensureProfileLayout(sharedAgentDir, name) {
	const sharedDir = resolve(sharedAgentDir);
	const layout = createProfileLayout(sharedDir, name);
	await ensurePrivateDirectory(join(sharedDir, "osdy-pi"));
	await ensurePrivateDirectory(layout.profilesDir);
	await ensurePrivateDirectory(layout.profileDir);
	for (const stateName of layout.sharedState) {
		await ensureSharedLink(
			join(layout.profileDir, stateName),
			join(sharedDir, stateName),
		);
	}
	return layout;
}

export function getDefaultAccountPath(sharedAgentDir) {
	return join(resolve(sharedAgentDir), "osdy-pi", DEFAULT_ACCOUNT_FILE);
}

export async function validateExistingProfile(sharedAgentDir, name) {
	const safeName = validateProfileName(name);
	const layout = createProfileLayout(sharedAgentDir, safeName);
	const confinedRoot = `${resolve(layout.profilesDir)}/`;
	if (!resolve(layout.profileDir).startsWith(confinedRoot))
		throw new Error(
			"Profile directory is outside the managed profiles directory.",
		);
	try {
		const osdyPiStat = await lstat(join(resolve(sharedAgentDir), "osdy-pi"));
		if (!osdyPiStat.isDirectory())
			throw new Error("Managed account path is not a directory.");
		const profilesStat = await lstat(layout.profilesDir);
		if (!profilesStat.isDirectory())
			throw new Error("Managed profiles path is not a directory.");
		const stat = await lstat(layout.profileDir);
		if (!stat.isDirectory())
			throw new Error("The selected profile is not an existing directory.");
	} catch (error) {
		if (isErrorCode(error, "ENOENT"))
			throw new Error("The selected default must be an existing profile.");
		throw error;
	}
	return { ...layout, name: safeName };
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
		await validateExistingProfile(sharedAgentDir, parsed.profile);
		return { status: "valid", profile: parsed.profile };
	} catch (error) {
		if (isErrorCode(error, "ENOENT")) return { status: "unset" };
		return { status: "invalid" };
	}
}

export async function setDefaultAccount(sharedAgentDir, name) {
	const layout = await validateExistingProfile(sharedAgentDir, name);
	const defaultDir = join(resolve(sharedAgentDir), "osdy-pi");
	await ensurePrivateDirectory(defaultDir);
	const defaultPath = getDefaultAccountPath(sharedAgentDir);
	const tempPath = join(
		defaultDir,
		`.${DEFAULT_ACCOUNT_FILE}.${process.pid}.${randomUUID()}.tmp`,
	);
	try {
		await writeFile(
			tempPath,
			`${JSON.stringify({ version: 1, profile: layout.name })}\n`,
			{ encoding: "utf8", mode: 0o600, flag: "wx" },
		);
		await chmod(tempPath, 0o600);
		await rename(tempPath, defaultPath);
		await chmod(defaultPath, 0o600);
	} catch (error) {
		await unlink(tempPath).catch(() => {});
		throw error;
	}
}

export async function clearDefaultAccount(sharedAgentDir) {
	try {
		await unlink(getDefaultAccountPath(sharedAgentDir));
	} catch (error) {
		if (!isErrorCode(error, "ENOENT")) throw error;
	}
}

function refuseActiveProfile(name, activeProfile) {
	if (activeProfile === name)
		throw new Error(
			"Cannot change the active profile. Close this Pi process first.",
		);
}

async function assertMissingProfilePath(path) {
	try {
		await lstat(path);
		throw new Error("The new profile path already exists.");
	} catch (error) {
		if (isErrorCode(error, "ENOENT")) return;
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
	} = {},
) {
	const oldProfile = await validateExistingProfile(sharedAgentDir, oldName);
	const safeNewName = validateProfileName(newName);
	refuseActiveProfile(oldProfile.name, activeProfile);
	const newProfile = createProfileLayout(sharedAgentDir, safeNewName);
	await assertMissingProfilePath(newProfile.profileDir);
	const defaultAccount = await readDefaultAccount(sharedAgentDir);
	await rename(oldProfile.profileDir, newProfile.profileDir);
	if (
		defaultAccount.status !== "valid" ||
		defaultAccount.profile !== oldProfile.name
	)
		return;
	try {
		await setDefault(sharedAgentDir, safeNewName);
	} catch (error) {
		try {
			await rename(newProfile.profileDir, oldProfile.profileDir);
		} catch (rollbackError) {
			throw new Error(
				`Default update failed and profile rollback failed: ${boundedError(error)}; ${boundedError(rollbackError)}`,
			);
		}
		throw new Error(
			`Default update failed; profile rename was rolled back: ${boundedError(error)}`,
		);
	}
}

function boundedError(error) {
	return error instanceof Error ? error.message.slice(0, 180) : "unknown error";
}

export async function removeProfile(
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
		defaultAccount.profile === profile.name
	) {
		if (replacement === undefined)
			throw new Error("Removing the default profile requires a replacement.");
		const safeReplacement = validateProfileName(replacement);
		if (safeReplacement === profile.name)
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

export async function planDefaultLaunch(
	sharedAgentDir,
	piArgs = [],
	env = process.env,
) {
	const defaultAccount = await readDefaultAccount(sharedAgentDir);
	if (defaultAccount.status === "valid") {
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
		const entries = await readdir(profilesDir, { withFileTypes: true });
		const profiles = [];
		for (const entry of entries) {
			if (
				entry.isDirectory() &&
				PROFILE_NAME.test(entry.name) &&
				!RESERVED_PROFILE_NAMES.has(entry.name)
			) {
				profiles.push(entry.name);
			}
		}
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

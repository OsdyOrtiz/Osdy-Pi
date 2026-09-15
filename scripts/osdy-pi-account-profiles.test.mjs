import assert from "node:assert/strict";
import {
	lstat,
	mkdir,
	open,
	mkdtemp,
	readFile,
	realpath,
	symlink,
	unlink,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import test from "node:test";
import {
	clearDefaultAccount,
	createProfileLayout,
	ensureProfileLayout,
	getDefaultAccountPath,
	getSharedAgentDir,
	listProfiles,
	parseAccountCommand,
	planDefaultLaunch,
	planPiLaunch,
	readActiveAccount,
	readDefaultAccount,
	setActiveAccount,
	setDefaultAccount,
	switchAccountAuth,
	validateExistingProfile,
	validateProfileName,
	renameProfile,
	removeProfile,
} from "./osdy-pi-account-profiles.mjs";

test("validates portable profile names and rejects traversal or reserved names", () => {
	assert.equal(validateProfileName("work-codex"), "work-codex");
	assert.equal(validateProfileName("Personal"), "Personal");
	assert.equal(validateProfileName("WORK"), "WORK");
	for (const name of [
		"",
		".",
		"..",
		"default",
		"a/b",
		"a\\b",
		"/tmp",
		"two words",
		"default",
		"DEFAULT",
		"Profiles",
		"AUTH.JSON",
	]) {
		assert.throws(() => validateProfileName(name));
	}
});

test("resolves a split agent osdy-pi symlink while preserving explicit and malformed roots", async () => {
	const candidate = await mkdtemp(join(tmpdir(), "osdy-pi-agent-test-"));
	const managedParent = await mkdtemp(join(tmpdir(), "osdy-pi-managed-test-"));
	const managedDir = join(managedParent, "osdy-pi");
	await mkdir(managedDir);
	await symlink(managedDir, join(candidate, "osdy-pi"));
	assert.equal(
		getSharedAgentDir({ PI_CODING_AGENT_DIR: candidate }),
		await realpath(managedParent),
	);
	const explicit = await mkdtemp(join(tmpdir(), "osdy-pi-explicit-test-"));
	assert.equal(
		getSharedAgentDir({
			OSDY_PI_SHARED_AGENT_DIR: explicit,
			PI_CODING_AGENT_DIR: candidate,
		}),
		explicit,
	);
	const brokenCandidate = await mkdtemp(join(tmpdir(), "osdy-pi-broken-test-"));
	await symlink(join(brokenCandidate, "missing-osdy-pi"), join(brokenCandidate, "osdy-pi"));
	assert.equal(
		getSharedAgentDir({ PI_CODING_AGENT_DIR: brokenCandidate }),
		brokenCandidate,
	);
	const malformedCandidate = await mkdtemp(join(tmpdir(), "osdy-pi-malformed-test-"));
	const otherDirectory = join(managedParent, "other");
	await mkdir(otherDirectory);
	await symlink(otherDirectory, join(malformedCandidate, "osdy-pi"));
	assert.equal(
		getSharedAgentDir({ PI_CODING_AGENT_DIR: malformedCandidate }),
		malformedCandidate,
	);
	const fileCandidate = await mkdtemp(join(tmpdir(), "osdy-pi-file-test-"));
	const fileTarget = join(managedParent, "not-a-directory");
	await writeFile(fileTarget, "not a directory");
	await symlink(fileTarget, join(fileCandidate, "osdy-pi"));
	assert.equal(
		getSharedAgentDir({ PI_CODING_AGENT_DIR: fileCandidate }),
		fileCandidate,
	);
});

test("does not traverse malformed agent roots when listing profiles", async () => {
	const validCandidate = await mkdtemp(join(tmpdir(), "osdy-pi-list-valid-test-"));
	const managedParent = await mkdtemp(join(tmpdir(), "osdy-pi-list-managed-test-"));
	await mkdir(join(managedParent, "osdy-pi", "profiles", "work"), {
		recursive: true,
	});
	await symlink(join(managedParent, "osdy-pi"), join(validCandidate, "osdy-pi"));
	assert.deepEqual(
		await listProfiles(getSharedAgentDir({ PI_CODING_AGENT_DIR: validCandidate })),
		["work"],
	);

	const malformedCandidate = await mkdtemp(join(tmpdir(), "osdy-pi-list-malformed-test-"));
	const wrongChild = await mkdtemp(join(tmpdir(), "osdy-pi-list-wrong-child-test-"));
	await mkdir(join(wrongChild, "profiles", "private"), { recursive: true });
	await symlink(wrongChild, join(malformedCandidate, "osdy-pi"));
	assert.deepEqual(
		await listProfiles(getSharedAgentDir({ PI_CODING_AGENT_DIR: malformedCandidate })),
		[],
	);
});

test("parses account create as a non-launching layout command", () => {
	assert.deepEqual(parseAccountCommand(["account", "create", "work"]), {
		action: "create",
		name: "work",
	});
	assert.throws(() =>
		parseAccountCommand(["account", "create", "work", "extra"]),
	);
});

test("parses account commands and preserves Pi arguments only after --", () => {
	assert.deepEqual(parseAccountCommand(["account", "list"]), { action: "list" });
	assert.deepEqual(
		parseAccountCommand([
			"account",
			"use",
			"work",
			"--",
			"--session",
			"/tmp/current.jsonl",
		]),
		{
			action: "use",
			name: "work",
			piArgs: ["--session", "/tmp/current.jsonl"],
		},
	);
	assert.throws(() =>
		parseAccountCommand(["account", "use", "work", "--session", "x"]),
	);
});

test("parses default account query, set, and clear commands", () => {
	assert.deepEqual(parseAccountCommand(["account", "default"]), {
		action: "default",
		operation: "query",
	});
	assert.deepEqual(parseAccountCommand(["account", "default", "work"]), {
		action: "default",
		operation: "set",
		name: "work",
	});
	assert.deepEqual(parseAccountCommand(["account", "default", "--clear"]), {
		action: "default",
		operation: "clear",
	});
	assert.throws(() => parseAccountCommand(["account", "default", "work", "x"]));
});

test("parses exact rename and confirmed remove forms", () => {
	assert.deepEqual(parseAccountCommand(["account", "rename", "old", "new"]), {
		action: "rename",
		oldName: "old",
		newName: "new",
	});
	assert.deepEqual(
		parseAccountCommand(["account", "remove", "old", "--confirm", "old"]),
		{ action: "remove", name: "old", replacement: undefined },
	);
	assert.deepEqual(
		parseAccountCommand([
			"account",
			"remove",
			"old",
			"--confirm",
			"old",
			"--replacement",
			"other",
		]),
		{ action: "remove", name: "old", replacement: "other" },
	);
	for (const args of [
		["account", "rename", "old", "new", "extra"],
		["account", "remove", "old", "--confirm", "other"],
		["account", "remove", "old", "--replacement", "other", "--confirm", "old"],
	])
		assert.throws(() => parseAccountCommand(args));
});

test("resolves profiles case-insensitively, rejects casefold duplicates, and detects legacy collisions", async () => {
	const sharedDir = await mkdtemp(join(tmpdir(), "osdy-pi-profile-test-"));
	await ensureProfileLayout(sharedDir, "Work");
	assert.equal((await validateExistingProfile(sharedDir, "work")).name, "Work");
	await assert.rejects(ensureProfileLayout(sharedDir, "work"), /already exists/i);
	await setDefaultAccount(sharedDir, "work");
	await setActiveAccount(sharedDir, "work");
	assert.deepEqual(await readDefaultAccount(sharedDir), {
		status: "valid",
		profile: "Work",
	});
	assert.deepEqual(await readActiveAccount(sharedDir), {
		status: "valid",
		profile: "Work",
	});
	try {
		await mkdir(createProfileLayout(sharedDir, "WORK").profileDir);
	} catch (error) {
		if (error?.code === "EEXIST") return;
		throw error;
	}
	await assert.rejects(setDefaultAccount(sharedDir, "work"), /ambiguous/i);
});

test("serializes concurrent case-insensitive profile creates and renames", async () => {
	const sharedDir = await mkdtemp(join(tmpdir(), "osdy-pi-profile-test-"));
	let releaseCreate;
	let signalCreateEntered;
	const createHeld = new Promise((resolve) => {
		releaseCreate = resolve;
	});
	const createEntered = new Promise((resolve) => {
		signalCreateEntered = resolve;
	});
	const firstCreate = ensureProfileLayout(sharedDir, "Work", {
		hooks: {
			afterLockAcquired: async () => {
				signalCreateEntered();
				return createHeld;
			},
		},
	});
	await createEntered;
	assert.equal(
		(await lstat(join(sharedDir, "osdy-pi", "profile-namespace.lock"))).isFile(),
		true,
	);
	const secondCreate = ensureProfileLayout(sharedDir, "work");
	releaseCreate();
	await firstCreate;
	await assert.rejects(secondCreate, /already exists/i);
	assert.equal((await validateExistingProfile(sharedDir, "work")).name, "Work");

	await ensureProfileLayout(sharedDir, "first");
	await ensureProfileLayout(sharedDir, "second");
	let releaseRename;
	let signalRenameEntered;
	const renameHeld = new Promise((resolve) => {
		releaseRename = resolve;
	});
	const renameEntered = new Promise((resolve) => {
		signalRenameEntered = resolve;
	});
	const firstRename = renameProfile(sharedDir, "first", "Target", {
		hooks: {
			afterLockAcquired: async () => {
				signalRenameEntered();
				return renameHeld;
			},
		},
	});
	await renameEntered;
	const secondRename = renameProfile(sharedDir, "second", "target");
	releaseRename();
	await firstRename;
	await assert.rejects(secondRename, /already exists/i);
	assert.equal((await validateExistingProfile(sharedDir, "target")).name, "Target");
});

test("renames case-only profiles portably, canonicalizes metadata, and protects active casing", async () => {
	const sharedDir = await mkdtemp(join(tmpdir(), "osdy-pi-profile-test-"));
	await ensureProfileLayout(sharedDir, "work");
	await setDefaultAccount(sharedDir, "work");
	await renameProfile(sharedDir, "work", "WORK");
	assert.deepEqual(await readDefaultAccount(sharedDir), {
		status: "valid",
		profile: "WORK",
	});
	await assert.rejects(
		renameProfile(sharedDir, "work", "Work", { activeProfile: "WORK" }),
		/active profile/,
	);
	const rollbackDir = await mkdtemp(join(tmpdir(), "osdy-pi-profile-test-"));
	await ensureProfileLayout(rollbackDir, "case");
	await setDefaultAccount(rollbackDir, "case");
	await assert.rejects(
		renameProfile(rollbackDir, "case", "CASE", {
			setDefault: async () => {
				throw new Error("metadata failed");
			},
		}),
		/rolled back/,
	);
	assert.equal(
		(await lstat(createProfileLayout(rollbackDir, "case").profileDir)).isDirectory(),
		true,
	);
});

test("plans an auth-only profile directory with shared non-auth state", () => {
	const layout = createProfileLayout("/Users/example/.pi/agent", "work");
	assert.equal(
		layout.profileDir,
		"/Users/example/.pi/agent/osdy-pi/profiles/work",
	);
	assert.equal(
		layout.authPath,
		"/Users/example/.pi/agent/osdy-pi/profiles/work/auth.json",
	);
	assert.deepEqual(layout.sharedState, [
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
		"packages",
		"resources",
	]);
});

test("rejects a profile directory symlink instead of following it", async () => {
	const sharedDir = await mkdtemp(join(tmpdir(), "osdy-pi-profile-test-"));
	const profileDir = createProfileLayout(sharedDir, "work").profileDir;
	await mkdir(join(sharedDir, "osdy-pi", "profiles"), { recursive: true });
	await symlink(join(tmpdir(), "outside-profile"), profileDir);
	await assert.rejects(
		ensureProfileLayout(sharedDir, "work"),
		/not a directory/,
	);
});

test("rejects a shared-state symlink that does not target the shared agent directory", async () => {
	const sharedDir = await mkdtemp(join(tmpdir(), "osdy-pi-profile-test-"));
	const layout = createProfileLayout(sharedDir, "work");
	await mkdir(layout.profileDir, { recursive: true });
	await symlink(
		join(sharedDir, "other-settings.json"),
		join(layout.profileDir, "settings.json"),
	);
	await assert.rejects(
		ensureProfileLayout(sharedDir, "work"),
		/does not target the shared state/,
	);
});

test("stores and clears a default profile atomically with private permissions", async () => {
	const sharedDir = await mkdtemp(join(tmpdir(), "osdy-pi-profile-test-"));
	await ensureProfileLayout(sharedDir, "work");
	await setDefaultAccount(sharedDir, "work");
	const defaultPath = getDefaultAccountPath(sharedDir);
	assert.deepEqual(JSON.parse(await readFile(defaultPath, "utf8")), {
		version: 1,
		profile: "work",
	});
	assert.equal((await lstat(join(sharedDir, "osdy-pi"))).mode & 0o777, 0o700);
	assert.equal((await lstat(defaultPath)).mode & 0o777, 0o600);
	assert.deepEqual(await readDefaultAccount(sharedDir), {
		status: "valid",
		profile: "work",
	});
	await clearDefaultAccount(sharedDir);
	assert.deepEqual(await readDefaultAccount(sharedDir), { status: "unset" });
});

test("creating a profile does not implicitly make it the default", async () => {
	const sharedDir = await mkdtemp(join(tmpdir(), "osdy-pi-profile-test-"));
	await ensureProfileLayout(sharedDir, "work");
	assert.deepEqual(await readDefaultAccount(sharedDir), { status: "unset" });
});

test("rejects defaults for missing profiles and never selects invalid metadata", async () => {
	const sharedDir = await mkdtemp(join(tmpdir(), "osdy-pi-profile-test-"));
	await assert.rejects(
		setDefaultAccount(sharedDir, "missing"),
		/existing profile/,
	);
	const defaultPath = getDefaultAccountPath(sharedDir);
	await mkdir(join(sharedDir, "osdy-pi"), { recursive: true });
	for (const contents of [
		"{",
		JSON.stringify({ version: 2, profile: "work" }),
		JSON.stringify({ version: 1, profile: "missing" }),
	]) {
		await writeFile(defaultPath, contents);
		assert.equal((await readDefaultAccount(sharedDir)).status, "invalid");
	}
	await unlink(defaultPath);
	await symlink("elsewhere.json", defaultPath);
	assert.equal((await readDefaultAccount(sharedDir)).status, "invalid");
});

test("plans unmanaged launches without a default and managed launches for a valid default", async () => {
	const sharedDir = await mkdtemp(join(tmpdir(), "osdy-pi-profile-test-"));
	assert.deepEqual(await planDefaultLaunch(sharedDir), {
		plan: { command: "pi", args: [], env: {} },
		defaultAccount: { status: "unset" },
	});
	await ensureProfileLayout(sharedDir, "work");
	await setDefaultAccount(sharedDir, "work");
	const result = await planDefaultLaunch(sharedDir, [], {
		OSDY_PI_DEV_EXTENSION_ROOT: "/Users/example/Osdy-Pi",
	});
	assert.equal(result.defaultAccount.status, "valid");
	assert.deepEqual(result.plan.args, ["-e", "/Users/example/Osdy-Pi"]);
	assert.equal(result.plan.env.OSDY_PI_PROFILE_NAME, "work");
});

test("renames profiles, updates a default, and rolls back when metadata update fails", async () => {
	const sharedDir = await mkdtemp(join(tmpdir(), "osdy-pi-profile-test-"));
	await ensureProfileLayout(sharedDir, "old");
	await setDefaultAccount(sharedDir, "old");
	await renameProfile(sharedDir, "old", "new");
	assert.equal(
		(await lstat(createProfileLayout(sharedDir, "new").profileDir)).isDirectory(),
		true,
	);
	assert.deepEqual(await readDefaultAccount(sharedDir), {
		status: "valid",
		profile: "new",
	});
	await assert.rejects(renameProfile(sharedDir, "new", "bad/name"));
	await ensureProfileLayout(sharedDir, "collision");
	await assert.rejects(
		renameProfile(sharedDir, "new", "collision"),
		/already exists/,
	);
	await assert.rejects(
		renameProfile(sharedDir, "new", "next", { activeProfile: "new" }),
		/active profile/,
	);
	await assert.rejects(
		renameProfile(sharedDir, "new", "next", {
			setDefault: async () => {
				throw new Error("metadata failed");
			},
		}),
		/rolled back/,
	);
	assert.equal(
		(await lstat(createProfileLayout(sharedDir, "new").profileDir)).isDirectory(),
		true,
	);
});

test("removes only confirmed inactive profiles and protects shared targets", async () => {
	const sharedDir = await mkdtemp(join(tmpdir(), "osdy-pi-profile-test-"));
	await ensureProfileLayout(sharedDir, "work");
	await ensureProfileLayout(sharedDir, "other");
	const layout = createProfileLayout(sharedDir, "work");
	await writeFile(join(sharedDir, "settings.json"), "shared");
	await writeFile(join(layout.profileDir, "note.txt"), "safe");
	await assert.rejects(
		removeProfile(sharedDir, "work", { confirmation: "no" }),
		/confirmation/,
	);
	await assert.rejects(
		removeProfile(sharedDir, "work", {
			confirmation: "work",
			activeProfile: "work",
		}),
		/active profile/,
	);
	await removeProfile(sharedDir, "work", { confirmation: "work" });
	await assert.rejects(lstat(layout.profileDir), /ENOENT/);
	assert.equal(
		(await lstat(join(sharedDir, "settings.json"))).isFile() ||
			(await lstat(join(sharedDir, "settings.json"))).isDirectory(),
		true,
	);
});

test("requires a replacement to remove the default and refuses nested real directories", async () => {
	const sharedDir = await mkdtemp(join(tmpdir(), "osdy-pi-profile-test-"));
	await ensureProfileLayout(sharedDir, "defaulted");
	await ensureProfileLayout(sharedDir, "replacement");
	await setDefaultAccount(sharedDir, "defaulted");
	await assert.rejects(
		removeProfile(sharedDir, "defaulted", { confirmation: "defaulted" }),
		/replacement/,
	);
	await assert.rejects(
		removeProfile(sharedDir, "defaulted", {
			confirmation: "defaulted",
			replacement: "defaulted",
		}),
		/different/,
	);
	await removeProfile(sharedDir, "defaulted", {
		confirmation: "defaulted",
		replacement: "replacement",
	});
	assert.deepEqual(await readDefaultAccount(sharedDir), {
		status: "valid",
		profile: "replacement",
	});
	await ensureProfileLayout(sharedDir, "nested");
	await mkdir(
		join(createProfileLayout(sharedDir, "nested").profileDir, "unexpected"),
	);
	await assert.rejects(
		removeProfile(sharedDir, "nested", { confirmation: "nested" }),
		/unexpected directory/,
	);
	assert.equal(
		(
			await lstat(createProfileLayout(sharedDir, "nested").profileDir)
		).isDirectory(),
		true,
	);
});

test("swaps profile auth into the canonical shared agent directory and persists the prior active auth", async () => {
	const sharedDir = await mkdtemp(join(tmpdir(), "osdy-pi-profile-test-"));
	await ensureProfileLayout(sharedDir, "personal");
	await ensureProfileLayout(sharedDir, "work");
	await writeFile(join(sharedDir, "auth.json"), "personal-auth", {
		mode: 0o600,
	});
	await writeFile(createProfileLayout(sharedDir, "work").authPath, "work-auth", {
		mode: 0o600,
	});
	await setActiveAccount(sharedDir, "personal");
	await setDefaultAccount(sharedDir, "personal");
	await switchAccountAuth(sharedDir, "work");
	assert.equal(
		await readFile(createProfileLayout(sharedDir, "personal").authPath, "utf8"),
		"personal-auth",
	);
	assert.equal(
		await readFile(join(sharedDir, "auth.json"), "utf8"),
		"work-auth",
	);
	assert.equal((await lstat(join(sharedDir, "auth.json"))).mode & 0o777, 0o600);
	assert.deepEqual(await readDefaultAccount(sharedDir), {
		status: "valid",
		profile: "work",
	});
});

test("activates an empty profile for /login without leaving the old canonical auth", async () => {
	const sharedDir = await mkdtemp(join(tmpdir(), "osdy-pi-profile-test-"));
	await ensureProfileLayout(sharedDir, "personal");
	await ensureProfileLayout(sharedDir, "new");
	await writeFile(join(sharedDir, "auth.json"), "personal-auth", {
		mode: 0o600,
	});
	await setActiveAccount(sharedDir, "personal");
	await setDefaultAccount(sharedDir, "personal");
	await switchAccountAuth(sharedDir, "new");
	assert.equal(
		await readFile(createProfileLayout(sharedDir, "personal").authPath, "utf8"),
		"personal-auth",
	);
	await assert.rejects(lstat(join(sharedDir, "auth.json")), /ENOENT/);
	await writeFile(join(sharedDir, "auth.json"), "new-auth", { mode: 0o600 });
	await switchAccountAuth(sharedDir, "personal");
	assert.equal(
		await readFile(createProfileLayout(sharedDir, "new").authPath, "utf8"),
		"new-auth",
	);
	assert.deepEqual(await readDefaultAccount(sharedDir), {
		status: "valid",
		profile: "personal",
	});
});

test("rejects symlink auth files and leaves the canonical auth untouched", async () => {
	const sharedDir = await mkdtemp(join(tmpdir(), "osdy-pi-profile-test-"));
	await ensureProfileLayout(sharedDir, "personal");
	await ensureProfileLayout(sharedDir, "work");
	await writeFile(join(sharedDir, "auth.json"), "personal-auth", {
		mode: 0o600,
	});
	await symlink(
		join(sharedDir, "elsewhere"),
		createProfileLayout(sharedDir, "work").authPath,
	);
	await assert.rejects(switchAccountAuth(sharedDir, "work"), /regular file/);
	assert.equal(
		await readFile(join(sharedDir, "auth.json"), "utf8"),
		"personal-auth",
	);
});

test("first default launch migrates destination auth into an absent canonical auth without active metadata", async () => {
	const sharedDir = await mkdtemp(join(tmpdir(), "osdy-pi-profile-test-"));
	await ensureProfileLayout(sharedDir, "work");
	await writeFile(createProfileLayout(sharedDir, "work").authPath, "work-auth", {
		mode: 0o600,
	});
	await setDefaultAccount(sharedDir, "work");
	await planDefaultLaunch(sharedDir);
	assert.equal(
		await readFile(join(sharedDir, "auth.json"), "utf8"),
		"work-auth",
	);
});

test("rolls back active and default metadata when selection fails after active write", async () => {
	const sharedDir = await mkdtemp(join(tmpdir(), "osdy-pi-profile-test-"));
	await ensureProfileLayout(sharedDir, "personal");
	await ensureProfileLayout(sharedDir, "work");
	await writeFile(join(sharedDir, "auth.json"), "personal-auth", {
		mode: 0o600,
	});
	await writeFile(createProfileLayout(sharedDir, "work").authPath, "work-auth", {
		mode: 0o600,
	});
	await setDefaultAccount(sharedDir, "personal");
	await assert.rejects(
		switchAccountAuth(sharedDir, "work", {
			hooks: {
				afterActiveWrite: async () => {
					throw new Error("injected");
				},
			},
		}),
		/injected/,
	);
	assert.deepEqual(await readActiveAccount(sharedDir), { status: "unset" });
	assert.deepEqual(await readDefaultAccount(sharedDir), {
		status: "valid",
		profile: "personal",
	});
	assert.equal(
		await readFile(join(sharedDir, "auth.json"), "utf8"),
		"personal-auth",
	);
});

test("attempts both metadata rollbacks when the active rollback fails", async () => {
	const sharedDir = await mkdtemp(join(tmpdir(), "osdy-pi-profile-test-"));
	await ensureProfileLayout(sharedDir, "personal");
	await ensureProfileLayout(sharedDir, "work");
	let activeRollbackAttempts = 0;
	let defaultRollbackAttempts = 0;
	await assert.rejects(
		switchAccountAuth(sharedDir, "work", {
			hooks: {
				afterActiveWrite: async () => {
					throw new Error("original failure");
				},
				restoreActiveMetadata: async () => {
					activeRollbackAttempts += 1;
					throw new Error("active rollback failure");
				},
				restoreDefaultMetadata: async () => {
					defaultRollbackAttempts += 1;
					throw new Error("default rollback failure");
				},
			},
		}),
		/original failure.*active rollback failure.*default rollback failure/,
	);
	assert.equal(activeRollbackAttempts, 1);
	assert.equal(defaultRollbackAttempts, 1);
});

test("rejects auth replacement between lstat and open", async () => {
	const sharedDir = await mkdtemp(join(tmpdir(), "osdy-pi-profile-test-"));
	const outside = join(sharedDir, "outside-auth.json");
	await ensureProfileLayout(sharedDir, "work");
	await writeFile(createProfileLayout(sharedDir, "work").authPath, "work-auth", {
		mode: 0o600,
	});
	await writeFile(outside, "outside-auth", { mode: 0o600 });
	await assert.rejects(
		switchAccountAuth(sharedDir, "work", {
			hooks: {
				beforeOpenAuth: async (source) => {
					await unlink(source);
					await symlink(outside, source);
				},
			},
		}),
		/(regular file|changed while switching)/,
	);
	await assert.rejects(lstat(join(sharedDir, "auth.json")), /ENOENT/);
});

test("serializes switches with a lock file and cleans it after an error", async () => {
	const sharedDir = await mkdtemp(join(tmpdir(), "osdy-pi-profile-test-"));
	await ensureProfileLayout(sharedDir, "work");
	let release;
	const held = new Promise((resolve) => {
		release = resolve;
	});
	const first = switchAccountAuth(sharedDir, "work", {
		hooks: { afterLockAcquired: async () => held },
	});
	await delay(20);
	assert.equal(
		(await lstat(join(sharedDir, "osdy-pi", "account-switch.lock"))).isFile(),
		true,
	);
	let secondEntered = false;
	const second = switchAccountAuth(sharedDir, "work", {
		hooks: {
			afterLockAcquired: async () => {
				secondEntered = true;
			},
		},
	});
	await delay(20);
	assert.equal(secondEntered, false);
	release();
	await Promise.all([first, second]);
	await assert.rejects(
		lstat(join(sharedDir, "osdy-pi", "account-switch.lock")),
		/ENOENT/,
	);
	await assert.rejects(
		switchAccountAuth(sharedDir, "work", {
			hooks: {
				afterLockAcquired: async () => {
					throw new Error("lock failure");
				},
			},
		}),
		/lock failure/,
	);
	await assert.rejects(
		lstat(join(sharedDir, "osdy-pi", "account-switch.lock")),
		/ENOENT/,
	);
});

test("cleans an initialized lock after lock setup fails", async () => {
	const sharedDir = await mkdtemp(join(tmpdir(), "osdy-pi-profile-test-"));
	await ensureProfileLayout(sharedDir, "work");
	const lockPath = join(sharedDir, "osdy-pi", "account-switch.lock");
	await assert.rejects(
		switchAccountAuth(sharedDir, "work", {
			hooks: {
				afterLockCreated: async () => {
					throw new Error("lock setup failure");
				},
			},
		}),
		/lock setup failure/,
	);
	await assert.rejects(lstat(lockPath), /ENOENT/);
	await switchAccountAuth(sharedDir, "work");
	await assert.rejects(lstat(lockPath), /ENOENT/);
});

test("does not remove an existing account switch lock while waiting", async () => {
	const sharedDir = await mkdtemp(join(tmpdir(), "osdy-pi-profile-test-"));
	await ensureProfileLayout(sharedDir, "work");
	const lockPath = join(sharedDir, "osdy-pi", "account-switch.lock");
	const foreignLock = await open(lockPath, "wx", 0o600);
	try {
		await assert.rejects(
			switchAccountAuth(sharedDir, "work"),
			/timed out waiting for account switch lock/i,
		);
		assert.equal((await lstat(lockPath)).isFile(), true);
	} finally {
		await foreignLock.close();
		await unlink(lockPath);
	}
	await switchAccountAuth(sharedDir, "work");
	await assert.rejects(lstat(lockPath), /ENOENT/);
});

test("launches Pi through an argument array without exposing auth", () => {
	const plan = planPiLaunch(
		"/Users/example/.pi/agent",
		"work",
		["--session", "/tmp/current.jsonl"],
		{},
	);
	assert.equal(plan.command, "pi");
	assert.deepEqual(plan.args, ["--session", "/tmp/current.jsonl"]);
	assert.equal(plan.env.PI_CODING_AGENT_DIR, "/Users/example/.pi/agent");
	assert.equal(plan.env.OSDY_PI_SHARED_AGENT_DIR, "/Users/example/.pi/agent");
	assert.equal(plan.env.OSDY_PI_PROFILE_NAME, "work");
	assert.equal(
		plan.env.PI_CODING_AGENT_SESSION_DIR,
		"/Users/example/.pi/agent/sessions",
	);
	assert.equal(Object.hasOwn(plan.env, "auth"), false);
});

test("prepends an absolute development extension to profile Pi launches", () => {
	const plan = planPiLaunch(
		"/Users/example/.pi/agent",
		"work",
		["--session", "/tmp/current.jsonl"],
		{ OSDY_PI_DEV_EXTENSION_ROOT: "/Users/example/Osdy-Pi" },
	);
	assert.deepEqual(plan.args, [
		"-e",
		"/Users/example/Osdy-Pi",
		"--session",
		"/tmp/current.jsonl",
	]);
});

test("rejects a relative development extension root", () => {
	assert.throws(
		() =>
			planPiLaunch("/Users/example/.pi/agent", "work", [], {
				OSDY_PI_DEV_EXTENSION_ROOT: "./Osdy-Pi",
			}),
		/development extension root must be absolute/,
	);
});

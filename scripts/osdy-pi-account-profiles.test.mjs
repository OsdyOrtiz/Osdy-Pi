import assert from "node:assert/strict";
import {
	lstat,
	mkdir,
	mkdtemp,
	readFile,
	symlink,
	unlink,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
	clearDefaultAccount,
	createProfileLayout,
	ensureProfileLayout,
	getDefaultAccountPath,
	parseAccountCommand,
	planDefaultLaunch,
	planPiLaunch,
	readDefaultAccount,
	setDefaultAccount,
	validateProfileName,
	renameProfile,
	removeProfile,
} from "./osdy-pi-account-profiles.mjs";

test("validates portable profile names and rejects traversal or reserved names", () => {
	assert.equal(validateProfileName("work-codex"), "work-codex");
	for (const name of [
		"",
		".",
		"..",
		"default",
		"a/b",
		"a\\b",
		"/tmp",
		"two words",
		"UPPER",
	]) {
		assert.throws(() => validateProfileName(name));
	}
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

test("launches Pi through an argument array without exposing auth", () => {
	const plan = planPiLaunch("/Users/example/.pi/agent", "work", [
		"--session",
		"/tmp/current.jsonl",
	]);
	assert.equal(plan.command, "pi");
	assert.deepEqual(plan.args, ["--session", "/tmp/current.jsonl"]);
	assert.equal(
		plan.env.PI_CODING_AGENT_DIR,
		"/Users/example/.pi/agent/osdy-pi/profiles/work",
	);
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

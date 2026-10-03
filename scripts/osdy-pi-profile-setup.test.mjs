import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmod, mkdtemp, mkdir, readFile, readdir, lstat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { resourceLinkType, setupOsdyProfile } from "./osdy-pi-profile-setup.mjs";

async function fixture() {
	const root = await mkdtemp(join(tmpdir(), "osdy-profile-"));
	const officialDir = join(root, "official");
	const profileDir = join(root, "isolated");
	const gentleRoot = join(root, "gentle");
	const osdyRoot = join(root, "osdy");
	await mkdir(officialDir);
	await mkdir(join(gentleRoot, "extensions"), { recursive: true });
	await mkdir(osdyRoot);
	await writeFile(join(gentleRoot, "package.json"), '{"name":"gentle-pi"}\n');
	await writeFile(join(osdyRoot, "package.json"), '{"name":"osdy-pi"}\n');
	for (const name of ["gentle-todo.ts", "ask-user-question.ts", "gentle-agents.ts"])
		await writeFile(join(gentleRoot, "extensions", name), "export {};\n");
	const settings = { theme: "official", packages: ["npm:other", "npm:gentle-pi", "npm:pi-subagents-j0k3r", "npm:osdy-pi"], custom: { saved: true } };
	await writeFile(join(officialDir, "settings.json"), JSON.stringify(settings));
	await writeFile(join(officialDir, "auth.json"), "secret");
	await mkdir(join(officialDir, "npm"));
	return { root, officialDir, profileDir, gentleRoot, osdyRoot, settings };
}

test("Windows link types follow directory targets, including links to directories", async () => {
	const paths = await fixture();
	const directory = join(paths.officialDir, "npm");
	const alias = join(paths.officialDir, "npm-alias");
	await symlink(directory, alias, process.platform === "win32" ? "junction" : "dir");
	assert.equal(await resourceLinkType(directory, "win32"), "junction");
	assert.equal(await resourceLinkType(alias, "win32"), "junction");
	assert.equal(await resourceLinkType(join(paths.officialDir, "auth.json"), "win32"), "file");
	assert.equal(await resourceLinkType(directory, "darwin"), undefined);
	assert.equal(await resourceLinkType(join(paths.officialDir, "auth.json"), "linux"), undefined);
	await setupOsdyProfile(paths);
	assert.equal((await lstat(join(paths.profileDir, "npm-alias"))).isSymbolicLink(), true);
});

test("creates an isolated profile, keeps official bytes and shares resources explicitly", async () => {
	const paths = await fixture();
	const original = await readFile(join(paths.officialDir, "settings.json"));
	const result = await setupOsdyProfile(paths);
	assert.equal(result.status, "configured");
	assert.deepEqual(await readFile(join(paths.officialDir, "settings.json")), original);
	const settings = JSON.parse(await readFile(join(paths.profileDir, "settings.json"), "utf8"));
	assert.equal(settings.theme, "official");
	assert.deepEqual(settings.custom, { saved: true });
	assert.deepEqual(settings.packages, [
		"npm:other",
		{ source: "npm:gentle-pi", extensions: ["-extensions/ask-user-question.ts", "-extensions/gentle-agents.ts"] },
  "npm:pi-subagents-j0k3r", { source: paths.osdyRoot }, "npm:@juicesharp/rpiv-ask-user-question",
	]);
	assert.equal((await lstat(join(paths.profileDir, "auth.json"))).isSymbolicLink(), true);
	assert.equal((await lstat(join(paths.profileDir, "npm"))).isSymbolicLink(), true);
	assert.equal((await lstat(join(paths.profileDir, "sessions"))).isDirectory(), true);
});

test("repeated setup preserves isolated theme, sessions, local files and owned links", async () => {
	const paths = await fixture();
	await setupOsdyProfile(paths);
	const settingsPath = join(paths.profileDir, "settings.json");
	const settings = JSON.parse(await readFile(settingsPath, "utf8"));
	settings.theme = "osdy-pi-dark";
	await writeFile(settingsPath, JSON.stringify(settings));
	await writeFile(join(paths.profileDir, "sessions", "old.jsonl"), "history");
	await writeFile(join(paths.profileDir, "local.json"), "private");
	const localLink = join(paths.profileDir, "custom-link");
	await symlink(join(paths.root, "missing"), localLink);
	assert.equal((await setupOsdyProfile(paths)).status, "configured");
	assert.equal(JSON.parse(await readFile(settingsPath, "utf8")).theme, "osdy-pi-dark");
	const before = await lstat(settingsPath);
	assert.equal((await setupOsdyProfile(paths)).status, "already configured");
	assert.equal((await lstat(settingsPath)).mtimeMs, before.mtimeMs);
	assert.equal(await readFile(join(paths.profileDir, "sessions", "old.jsonl"), "utf8"), "history");
	assert.equal(await readFile(join(paths.profileDir, "local.json"), "utf8"), "private");
	assert.equal((await lstat(localLink)).isSymbolicLink(), true);
});

test("repeated setup preserves explicit profile opt-in, owned filters and unrelated resources", async () => {
 const paths = await fixture(); await setupOsdyProfile(paths);
 const path = join(paths.profileDir, "settings.json");
 const current = JSON.parse(await readFile(path, "utf8"));
 current.packages[1].extensions.push("-extensions/gentle-todo.ts");
 current.packages[1].themes = ["custom.json"];
 current.custom = { isolated: true };
 current.osdyPiTodoProvider = { version: 1, enabled: true, ownedExclusions: [{ index: 1, source: "npm:gentle-pi", wasString: false, hadExtensions: true }] };
 await writeFile(path, JSON.stringify(current));
 await setupOsdyProfile(paths);
 assert.deepEqual(JSON.parse(await readFile(path, "utf8")), current);
});

test("new profile resets actual inherited selection and only its proven owned TODO exclusions", async () => {
 const paths = await fixture();
 const officialPath = join(paths.officialDir, "settings.json");
 const user = { source: "npm:gentle-pi@2", extensions: ["extensions/*.ts", "-extensions/gentle-todo.ts"], skills: [], themes: ["user.json"] };
 await writeFile(officialPath, JSON.stringify({ ...paths.settings, packages: [...paths.settings.packages, user, "../gentle"] }));
 const selected = spawnSync(process.execPath, ["--experimental-strip-types", "--input-type=module", "-e",
  'import { selectTodoProvider } from "./extensions/osdy-pi/todo-provider-settings.ts"; selectTodoProvider({ agentDir: process.argv[1], cwd: process.argv[2], mode: "on" });', paths.officialDir, paths.root], { encoding: "utf8" });
 assert.equal(selected.status, 0, selected.stderr);
 const original = await readFile(officialPath, "utf8");
 await setupOsdyProfile(paths);
 const settings = JSON.parse(await readFile(join(paths.profileDir, "settings.json"), "utf8"));
 assert.equal(settings.osdyPiTodoProvider, undefined);
 assert.deepEqual(settings.packages[1].extensions, ["-extensions/ask-user-question.ts", "-extensions/gentle-agents.ts"]);
 assert.deepEqual(settings.packages[4], { ...user, extensions: [...user.extensions, "-extensions/ask-user-question.ts", "-extensions/gentle-agents.ts"] });
 assert.deepEqual(settings.packages[5], { source: paths.gentleRoot, extensions: ["-extensions/ask-user-question.ts", "-extensions/gentle-agents.ts"] });
 assert.equal(settings.theme, paths.settings.theme);
 assert.deepEqual(settings.custom, paths.settings.custom);
 assert.equal(await readFile(officialPath, "utf8"), original);
});

test("new profile refuses malformed or position-reordered inherited ownership before writes", async () => {
 for (const reorder of [false, true]) {
  const paths = await fixture();
  const packages = [{ source: "npm:gentle-pi", extensions: ["-extensions/gentle-todo.ts"] }, "npm:other"];
  const owned = { index: 0, source: "npm:gentle-pi", wasString: true, hadExtensions: false };
  if (reorder) packages.reverse(); else owned.wasString = "invalid";
  const text = JSON.stringify({ packages, osdyPiTodoProvider: { version: 1, enabled: true, ownedExclusions: [owned] } });
  await writeFile(join(paths.officialDir, "settings.json"), text);
  await assert.rejects(setupOsdyProfile(paths), /ownership/i);
  await assert.rejects(lstat(paths.profileDir), { code: "ENOENT" });
  assert.equal(await readFile(join(paths.officialDir, "settings.json"), "utf8"), text);
 }
});

test("new profile refuses mixed same-source duplicate ownership before restoring inherited filters", async () => {
 const paths = await fixture();
 const text = JSON.stringify({ packages: [
  { source: "npm:gentle-pi", extensions: ["-extensions/gentle-todo.ts"] }, "npm:gentle-pi",
 ], osdyPiTodoProvider: { version: 1, enabled: true,
  ownedExclusions: [{ index: 0, source: "npm:gentle-pi", wasString: true, hadExtensions: false }] } });
 await writeFile(join(paths.officialDir, "settings.json"), text);
 await assert.rejects(setupOsdyProfile(paths), /ambiguous|duplicate/i);
 await assert.rejects(lstat(paths.profileDir), { code: "ENOENT" });
 assert.equal(await readFile(join(paths.officialDir, "settings.json"), "utf8"), text);
});

test("bad official settings and missing Gentle source fail without creating a profile", async () => {
	for (const invalid of ["not-json", '{"packages":{}}', "[]"]) {
		const paths = await fixture();
		await writeFile(join(paths.officialDir, "settings.json"), invalid);
		await assert.rejects(setupOsdyProfile(paths), /settings/i);
		await assert.rejects(lstat(paths.profileDir), { code: "ENOENT" });
	}
	const paths = await fixture();
	await assert.rejects(setupOsdyProfile({ ...paths, gentleRoot: join(paths.root, "missing") }), /Gentle/i);
	await assert.rejects(lstat(paths.profileDir), { code: "ENOENT" });
});

test("does not overwrite conflicting files or linked isolated settings and sessions", async () => {
	const paths = await fixture();
	await mkdir(paths.profileDir);
	await writeFile(join(paths.profileDir, "auth.json"), "local auth");
	await setupOsdyProfile(paths);
	assert.equal(await readFile(join(paths.profileDir, "auth.json"), "utf8"), "local auth");
	for (const isolated of ["settings.json", "sessions"]) {
		const other = await fixture();
		await mkdir(other.profileDir);
		await symlink(join(other.officialDir, isolated), join(other.profileDir, isolated));
		await assert.rejects(setupOsdyProfile(other), new RegExp(isolated));
		assert.deepEqual((await readdir(other.profileDir)), [isolated]);
	}
});

test("rejects profiles hidden inside official settings through a symlinked ancestor", async () => {
	const paths = await fixture();
	const alias = join(paths.root, "alias");
	await symlink(paths.officialDir, alias);
	const original = await readFile(join(paths.officialDir, "settings.json"), "utf8");
	await assert.rejects(setupOsdyProfile({ ...paths, profileDir: join(alias, "nested") }), /separate|nested/i);
	await assert.rejects(lstat(join(paths.officialDir, "nested")), { code: "ENOENT" });
	assert.equal(await readFile(join(paths.officialDir, "settings.json"), "utf8"), original);
	await assert.rejects(setupOsdyProfile({ ...paths, officialDir: alias, profileDir: join(paths.officialDir, "nested") }), /separate|nested/i);
});

test("launcher fails actionably when official settings has no unique Gentle source", async () => {
	const paths = await fixture();
	await writeFile(join(paths.officialDir, "settings.json"), '{"packages":[]}');
	const result = spawnSync(process.execPath, [resolve("bin/osdy.mjs"), "--version"], {
		encoding: "utf8",
		env: { ...process.env, GENTLE_PI_EXTENSION_ROOT: "", OSDY_PI_SOURCE_AGENT_DIR: paths.officialDir, OSDY_PI_AGENT_DIR: paths.profileDir },
	});
	assert.notEqual(result.status, 0);
	assert.match(result.stderr, /GENTLE_PI_EXTENSION_ROOT/);
	await assert.rejects(lstat(paths.profileDir), { code: "ENOENT" });
});

test("launcher returns failure when installed Pi exits on SIGPIPE", async () => {
	const paths = await fixture();
	await writeFile(join(paths.officialDir, "settings.json"), JSON.stringify({ packages: [paths.gentleRoot] }));
	const binDir = join(paths.root, "bin");
	await mkdir(binDir);
	const fakePi = join(binDir, "pi");
	await writeFile(fakePi, "#!/bin/sh\nkill -PIPE $$\n");
	await chmod(fakePi, 0o755);
	const result = spawnSync(process.execPath, [resolve("bin/osdy.mjs"), "--version"], {
		encoding: "utf8",
		env: { ...process.env, PATH: `${binDir}:${process.env.PATH}`, GENTLE_PI_EXTENSION_ROOT: "", OSDY_PI_SOURCE_AGENT_DIR: paths.officialDir, OSDY_PI_AGENT_DIR: paths.profileDir },
	});
	assert.notEqual(result.status, 0);
});

test("launcher infers the unique Gentle source and forwards arguments to installed Pi", async () => {
	const paths = await fixture();
	await writeFile(join(paths.officialDir, "settings.json"), JSON.stringify({ packages: [paths.gentleRoot, "npm:unrelated"] }));
	const binDir = join(paths.root, "bin");
	await mkdir(binDir);
	const fakePi = join(binDir, "pi");
	await writeFile(fakePi, '#!/usr/bin/env node\nconsole.log(JSON.stringify({args:process.argv.slice(2),agent:process.env.PI_CODING_AGENT_DIR}));\n');
	await chmod(fakePi, 0o755);
	const env = { ...process.env, PATH: `${binDir}:${process.env.PATH}`, GENTLE_PI_EXTENSION_ROOT: "", OSDY_PI_SOURCE_AGENT_DIR: paths.officialDir, OSDY_PI_AGENT_DIR: paths.profileDir };
	const setup = spawnSync(process.execPath, [resolve("bin/osdy.mjs"), "setup"], { encoding: "utf8", env });
	assert.equal(setup.status, 0, setup.stderr);
	assert.match(setup.stdout, /configured/);
	const result = spawnSync(process.execPath, [resolve("bin/osdy.mjs"), "--version", "example"], { encoding: "utf8", env });
	assert.equal(result.status, 0, result.stderr);
	assert.deepEqual(JSON.parse(result.stdout), { args: ["--version", "example"], agent: paths.profileDir });
	assert.equal((await lstat(join(paths.profileDir, "sessions"))).isDirectory(), true);
});

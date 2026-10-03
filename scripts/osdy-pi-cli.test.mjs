import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile, lstat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

async function createGentleSource(root) {
	const source = join(root, "gentle-pi");
	await mkdir(join(source, "extensions"), { recursive: true });
	await writeFile(join(source, "package.json"), '{"name":"gentle-pi"}\n');
	await Promise.all(
		[
			"gentle-shell.ts",
			"gentle-todo.ts",
			"ask-user-question.ts",
			"gentle-agents.ts",
		].map((name) =>
			writeFile(join(source, "extensions", name), "export {};\n"),
		),
	);
	return source;
}

test("package metadata publishes both entrypoints and their runtime services", async () => {
	const manifest = JSON.parse(await readFile(resolve("package.json"), "utf8"));
	assert.equal(manifest.bin.osdy, "bin/osdy.mjs");
	assert.equal(manifest.bin["osdy-pi"], "bin/osdy-pi.mjs");
	assert.ok(manifest.files.includes("scripts/osdy-pi-profile-setup.mjs"));
	assert.equal((await readFile(resolve(manifest.bin.osdy), "utf8")).startsWith("#!/usr/bin/env node"), true);
});

test("osdy-pi setup creates an isolated profile without modifying official settings", async () => {
	const root = await mkdtemp(join(tmpdir(), "osdy-pi-setup-cli-"));
	const gentle = await createGentleSource(root);
	const sourceDir = join(root, "official");
	const profileDir = join(root, "isolated");
	await mkdir(sourceDir);
	const initial = JSON.stringify({ theme: "pi-default", packages: [gentle, "npm:other"] });
	await writeFile(join(sourceDir, "settings.json"), initial);
	await writeFile(join(sourceDir, "auth.json"), "private");
	const env = { ...process.env, OSDY_PI_SOURCE_AGENT_DIR: sourceDir, OSDY_PI_AGENT_DIR: profileDir, GENTLE_PI_EXTENSION_ROOT: "" };
	const command = [resolve("bin/osdy-pi.mjs"), "setup"];
	const first = spawnSync(process.execPath, command, { encoding: "utf8", env });
	assert.equal(first.status, 0, first.stderr);
	assert.match(first.stdout, /configured/);
	const second = spawnSync(process.execPath, command, { encoding: "utf8", env });
	assert.equal(second.status, 0, second.stderr);
	assert.match(second.stdout, /already configured/);
	assert.equal(await readFile(join(sourceDir, "settings.json"), "utf8"), initial);
	assert.equal((await lstat(join(profileDir, "auth.json"))).isSymbolicLink(), true);
	assert.deepEqual(JSON.parse(await readFile(join(profileDir, "settings.json"), "utf8")).packages, [
  { source: gentle, extensions: ["-extensions/ask-user-question.ts", "-extensions/gentle-agents.ts"] },
  "npm:other", { source: resolve(".") }, "npm:@juicesharp/rpiv-ask-user-question", "npm:pi-subagents-j0k3r",
 ]);
	const malformed = spawnSync(process.execPath, [...command, "extra"], { encoding: "utf8", env });
	assert.notEqual(malformed.status, 0);
	assert.match(malformed.stderr, /Usage: osdy-pi setup/);
});

test("gentle setup configures the PI_CODING_AGENT_DIR settings file", async () => {
	const root = await mkdtemp(join(tmpdir(), "osdy-pi-cli-"));
	const source = await createGentleSource(root);
	const agentDir = join(root, "agent");
	const result = spawnSync(
		process.execPath,
		[resolve("bin/osdy-pi.mjs"), "gentle", "setup", source],
		{ encoding: "utf8", env: { ...process.env, PI_CODING_AGENT_DIR: agentDir } },
	);

	assert.equal(result.status, 0, result.stderr);
	assert.match(result.stdout, /Gentle coexistence configured/);
	const settings = JSON.parse(
		await readFile(join(agentDir, "settings.json"), "utf8"),
	);
	assert.equal(settings.packages.at(-3).source, source);
 assert.equal(settings.packages.at(-3).extensions.includes("-extensions/gentle-todo.ts"), false);
 assert.equal(settings.osdyPiTodoProvider, undefined);
	assert.deepEqual(settings.packages.slice(-2), [
		"npm:@juicesharp/rpiv-ask-user-question",
		"npm:pi-subagents-j0k3r",
	]);
});

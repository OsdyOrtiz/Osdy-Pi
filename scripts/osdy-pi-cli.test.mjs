import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

async function createGentleSource(root) {
	const source = join(root, "gentle-pi");
	await mkdir(join(source, "extensions"), { recursive: true });
	await writeFile(join(source, "package.json"), '{"name":"gentle-pi"}\n');
	await Promise.all(
		["gentle-shell.ts", "gentle-todo.ts", "gentle-agents.ts"].map((name) =>
			writeFile(join(source, "extensions", name), "export {};\n"),
		),
	);
	return source;
}

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
	assert.equal(settings.packages.at(-1).source, source);
});

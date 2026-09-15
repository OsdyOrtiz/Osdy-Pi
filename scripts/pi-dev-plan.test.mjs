import assert from "node:assert/strict";
import { mkdir, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { DEV_EXTENSION_ROOT_ENV, planPiDevLaunch } from "./pi-dev-plan.mjs";
import {
	ensureProfileLayout,
	setDefaultAccount,
} from "./osdy-pi-account-profiles.mjs";

test("plans the isolated development Pi launch with an absolute extension root", async () => {
	const plan = await planPiDevLaunch("/Users/example/Osdy-Pi", []);
	assert.equal(plan.command, "pi");
	assert.deepEqual(plan.args, ["-e", "/Users/example/Osdy-Pi"]);
	assert.deepEqual(plan.env, {
		PI_CODING_AGENT_DIR: "/Users/example/Osdy-Pi/.pi-dev",
		[DEV_EXTENSION_ROOT_ENV]: "/Users/example/Osdy-Pi",
	});
});

test("dispatches development account commands through the local package launcher", async () => {
	const plan = await planPiDevLaunch("/Users/example/Osdy-Pi", [
		"account",
		"use",
		"work",
		"--",
		"--session",
		"/tmp/current.jsonl",
	]);
	assert.equal(plan.command, process.execPath);
	assert.deepEqual(plan.args, [
		resolve("/Users/example/Osdy-Pi", "bin/osdy-pi.mjs"),
		"account",
		"use",
		"work",
		"--",
		"--session",
		"/tmp/current.jsonl",
	]);
	assert.equal(plan.env[DEV_EXTENSION_ROOT_ENV], "/Users/example/Osdy-Pi");
});

test("activates a development default before launching Pi with the shared directory", async () => {
	const root = await mkdtemp(join(tmpdir(), "osdy-pi-dev-test-"));
	const sharedDir = resolve(root, ".pi-dev");
	await mkdir(sharedDir, { recursive: true });
	await ensureProfileLayout(sharedDir, "work");
	await setDefaultAccount(sharedDir, "work");
	const plan = await planPiDevLaunch(root, []);
	assert.equal(plan.command, "pi");
	assert.deepEqual(plan.args, ["-e", root]);
	assert.equal(plan.env.PI_CODING_AGENT_DIR, sharedDir);
	assert.equal(plan.env.OSDY_PI_PROFILE_NAME, "work");
	assert.equal(plan.env[DEV_EXTENSION_ROOT_ENV], root);
});

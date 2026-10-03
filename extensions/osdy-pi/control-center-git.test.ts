import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import test from "node:test";
import { fileURLToPath } from "node:url";
registerHooks({ resolve(specifier, context, nextResolve) {
	if (specifier.startsWith(".") && specifier.endsWith(".js") && context.parentURL?.endsWith(".ts")) {
		const url = new URL(`${specifier.slice(0, -3)}.ts`, context.parentURL);
		if (existsSync(fileURLToPath(url))) return { shortCircuit: true, url: url.href };
	}
	return nextResolve(specifier, context);
} });
const { createControlCenterGit } = await import("./control-center-git.js");
void test("Git reads branch/status only and delegates persisted enabled changes to its shared owner", async () => {
	let enabled = true;
	const calls: string[][] = [];
	const applied: boolean[] = [];
	const service = createControlCenterGit({
		snapshot: () => ({ enabled, placement: "aboveEditor" }),
		exec: (args) => {
			calls.push(args);
			if (args.includes("branch")) return Promise.resolve("feature\n");
			if (args.includes("status")) return Promise.resolve(" M file.ts\n?? new.ts\n");
			throw new Error("Unexpected Git inspection command");
		},
		applyEnabled: (value) => { enabled = value; applied.push(value); return Promise.resolve(true); },
	});
	const view = await service.read();
	assert.match(view.summary, /Branch: feature.*2 changed/);
	assert.match(view.note, /aboveEditor.*session.*read-only/i);
	assert.deepEqual(calls, [
		["--no-optional-locks", "branch", "--show-current"],
		["--no-optional-locks", "status", "--short", "--untracked-files=normal"],
	]);
	assert.deepEqual(applied, []);
	assert.equal((await service.apply({ kind: "git-enabled", value: false })).failed, false);
	assert.deepEqual(applied, [false]);
	assert.equal((await service.read()).rows[1]?.current, true);
});
void test("Git unavailable and failed persistence are honest, without new workflows", async () => {
	const service = createControlCenterGit({ snapshot: () => ({ enabled: false, placement: "belowEditor" }),
		exec: () => Promise.reject(new Error("not a repository")), applyEnabled: () => Promise.resolve(false) });
	assert.match((await service.read()).summary, /unavailable/);
	assert.match((await service.apply({ kind: "git-enabled", value: true })).message, /Applied live.*could not be saved/);
	const detached = createControlCenterGit({ snapshot: () => ({ enabled: true, placement: "aboveEditor" }),
		exec: () => Promise.resolve(""), applyEnabled: () => Promise.resolve(true) });
	assert.match((await detached.read()).summary, /detached.*clean/);
});

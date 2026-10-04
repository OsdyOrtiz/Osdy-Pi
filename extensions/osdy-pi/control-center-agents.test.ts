import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
registerHooks({ resolve(specifier, context, next) {
	if (specifier.startsWith(".") && specifier.endsWith(".js") && context.parentURL?.endsWith(".ts")) {
		const url = new URL(`${specifier.slice(0, -3)}.ts`, context.parentURL);
		if (existsSync(fileURLToPath(url))) return { shortCircuit: true, url: url.href };
	}
	return next(specifier, context);
} });
const { createControlCenterAgents } = await import("./control-center-agents.js");

function fixture() {
	const home = mkdtempSync(join(tmpdir(), "osdy-cc08-"));
	const agentDir = join(home, ".pi", "agent");
	mkdirSync(agentDir, { recursive: true });
	const path = join(agentDir, "settings.json");
	writeFileSync(path, JSON.stringify({ packages: [{ source: "npm:gentle-pi", extensions: ["!unrelated.ts"], themes: [] }, "npm:unrelated"], unrelated: true }));
	let installs = 0;
	const options = { home, agentDir, cwd: home, env: {}, isIdle: () => true, install: () => {
		installs++;
		const settings = JSON.parse(readFileSync(path, "utf8")) as { packages: unknown[] };
		settings.packages.push("npm:pi-subagents-j0k3r");
		writeFileSync(path, JSON.stringify(settings));
		return Promise.resolve();
	} };
	return { options, path, installs: () => installs };
}

void test("Agents read is inspection-only and describes the confirmed installation and real target", async () => {
	const f = fixture(); const before = readFileSync(f.path, "utf8");
	const service = createControlCenterAgents(f.options);
	assert.equal(f.installs(), 0);
	const view = await service.read(); await service.read();
	assert.match(view.summary, /gentle.*Joker.*not installed/i);
	assert.equal(view.rows.length, 2);
	assert.deepEqual(view.rows.map(row => row.label), ["Joker", "Gentle"]);
	const details = view.rows[0]!.details!.join(" ");
	assert.ok(details.includes(f.path));
	assert.match(details, /Install npm:pi-subagents-j0k3r if absent/);
	assert.match(details, /-extensions\/gentle-agents.ts/);
	assert.match(details, /unrelated.*preserved/i);
	assert.match(details, /reload.*restart/i);
	assert.equal(f.installs(), 0); assert.equal(readFileSync(f.path, "utf8"), before);
});

void test("confirmed Agents selection delegates Joker installation and owned Gentle/Joker filters", async () => {
	const f = fixture(); const service = createControlCenterAgents(f.options);
	assert.equal((await service.apply({ kind: "agents-provider", mode: "joker" })).kind, "reload");
	assert.equal(f.installs(), 1);
	assert.match(readFileSync(f.path, "utf8"), /-extensions\/gentle-agents.ts/);
	assert.match((await service.read()).summary, /joker/i);
	assert.equal((await service.apply({ kind: "agents-provider", mode: "gentle" })).kind, "reload");
	const saved = JSON.parse(readFileSync(f.path, "utf8")) as { packages: unknown[]; unrelated: boolean; osdyPiJokerExclusionOwned: boolean };
	assert.deepEqual(saved.packages[0], { source: "npm:gentle-pi", extensions: ["!unrelated.ts"], themes: [] });
	assert.equal(saved.packages[1], "npm:unrelated");
	assert.deepEqual(saved.packages[2], { source: "npm:pi-subagents-j0k3r", extensions: ["-./index.ts"] });
	assert.equal(saved.unrelated, true); assert.equal(saved.osdyPiJokerExclusionOwned, true);
	assert.equal(f.installs(), 1);
});

void test("isolated Agents owner guard blocks rows, installs and writes even for a personal target", async () => {
	for (const override of [true, false]) {
		const f = fixture(); const before = readFileSync(f.path, "utf8");
		const service = createControlCenterAgents({ ...f.options,
			...(override ? { env: { PI_CODING_AGENT_DIR: f.options.agentDir } } : { agentDir: join(f.options.home, "isolated") }) });
		const view = await service.read();
		assert.deepEqual(view.rows, []); assert.match(view.note, /normal personal Pi.*isolated|override/i);
		const result = await service.apply({ kind: "agents-provider", mode: "joker" });
		assert.equal(result.kind, "rejected"); assert.equal(f.installs(), 0);
		assert.equal(readFileSync(f.path, "utf8"), before);
	}
});

void test("Agents service guards idle, reentrancy and stale owner responses without reload", async () => {
	const f = fixture(); let idle = false; let current = true; let writes = 0; let finish = () => {};
	const service = createControlCenterAgents({ ...f.options, isIdle: () => idle, isCurrent: () => current,
		setup: () => { writes++; return new Promise(resolve => { finish = () => resolve({ installed: false, changed: true, gentleCount: 1 }); }); } });
	const action = { kind: "agents-provider", mode: "joker" } as const;
	assert.equal((await service.apply(action)).kind, "rejected"); assert.equal(writes, 0);
	idle = true; const pending = service.apply(action);
	assert.equal((await service.apply(action)).kind, "rejected"); assert.equal(writes, 1);
	current = false; finish(); assert.equal((await pending).kind, "rejected");
	assert.equal((await service.apply(action)).kind, "rejected"); assert.equal(writes, 1);
});

void test("Agents omits ineligible Gentle and ignores status from an old session", async () => {
	const f = fixture(); writeFileSync(f.path, JSON.stringify({ packages: ["npm:pi-subagents-j0k3r"] }));
	const service = createControlCenterAgents(f.options);
	assert.deepEqual((await service.read()).rows.map(row => row.label), ["Joker"]);
	const stale = createControlCenterAgents({ ...f.options, isCurrent: () => false });
	assert.deepEqual((await stale.read()).rows, []);
	const result = await service.apply({ kind: "agents-provider", mode: "gentle" });
	assert.equal(result.kind, "rejected"); assert.match(result.message, /eligible personal Gentle/);
	assert.equal(f.installs(), 0);
});

void test("Both Agent actions keep current/idle/busy guards and stale completions cannot reload", async () => {
	for (const mode of ["gentle", "joker"] as const) {
		const f = fixture(); const before = readFileSync(f.path, "utf8");
		let current = true; let idle = false; let writes = 0; let finish = () => {};
		const operation = () => {
			writes++;
			return new Promise<{ installed: boolean; changed: boolean; gentleCount: number }>(resolve => {
				finish = () => resolve({ installed: false, changed: true, gentleCount: 1 });
			});
		};
		const service = createControlCenterAgents({ ...f.options, isCurrent: () => current, isIdle: () => idle,
			setup: operation, switchMode: operation });
		const action = { kind: "agents-provider", mode } as const;
		assert.equal((await service.apply(action)).kind, "rejected"); assert.equal(writes, 0);
		idle = true; current = false;
		assert.deepEqual((await service.read()).rows, []);
		assert.equal((await service.apply(action)).kind, "rejected"); assert.equal(writes, 0);
		current = true; const pending = service.apply(action);
		assert.equal((await service.apply(action)).kind, "rejected"); assert.equal(writes, 1);
		current = false; finish(); assert.equal((await pending).kind, "rejected");
		assert.equal(f.installs(), 0); assert.equal(readFileSync(f.path, "utf8"), before);
	}
});

void test("Agents owner errors retain honest failure and never request reload", async () => {
	const f = fixture();
	const service = createControlCenterAgents({ ...f.options, setup: () => Promise.reject(new Error("synthetic failure")) });
	const result = await service.apply({ kind: "agents-provider", mode: "joker" });
	assert.equal(result.kind, "rejected"); assert.match(result.message, /synthetic failure.*Reload not requested/);
	assert.equal(f.installs(), 0);
});

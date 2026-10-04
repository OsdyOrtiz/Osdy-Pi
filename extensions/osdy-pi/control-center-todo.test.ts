import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
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
const { createControlCenterTodo } = await import("./control-center-todo.js");

void test("TODO separates saved selection, eligibility and captured SDK registration without writing", async () => {
	for (const loaded of [false, true]) {
		const agentDir = mkdtempSync(join(tmpdir(), "osdy-cc07-"));
		const path = join(agentDir, "settings.json");
		writeFileSync(path, JSON.stringify({ osdyPiTodoProvider: { version: 1, enabled: true, ownedExclusions: [] } }));
		const before = readFileSync(path, "utf8");
		const service = createControlCenterTodo({ agentDir, cwd: agentDir, loaded, isIdle: () => true });
		const view = await service.read();
		assert.match(view.summary, /Configured: on.*Eligibility: on/);
		assert.ok(view.summary.includes(`Loaded registration: ${loaded ? "on" : "off"}`));
		assert.ok(view.rows.every(row => row.details?.join(" ").includes("Reload")));
		assert.equal(readFileSync(path, "utf8"), before);
	}
});

void test("TODO delegates owned filtering and requests reload only after a successful selection", async () => {
	const agentDir = mkdtempSync(join(tmpdir(), "osdy-cc07-"));
	const path = join(agentDir, "settings.json");
	writeFileSync(path, JSON.stringify({ packages: ["npm:gentle-pi"], unrelated: "preserved" }));
	let idle = false;
	const service = createControlCenterTodo({ agentDir, cwd: agentDir, loaded: false, isIdle: () => idle });
	assert.equal((await service.apply({ kind: "todo-provider", mode: "on" })).kind, "rejected");
	idle = true;
	assert.equal((await service.apply({ kind: "todo-provider", mode: "on" })).kind, "reload");
	assert.match(readFileSync(path, "utf8"), /-extensions\/gentle-todo.ts/);
	assert.equal((await service.apply({ kind: "todo-provider", mode: "off" })).kind, "reload");
	const settings: unknown = JSON.parse(readFileSync(path, "utf8"));
	assert.ok(typeof settings === "object" && settings !== null && "packages" in settings && "unrelated" in settings);
	assert.deepEqual(settings.packages, ["npm:gentle-pi"]);
	assert.equal(settings.unrelated, "preserved");
});

void test("TODO eligibility failure does not erase configured or loaded state, and stale sessions cannot save", async () => {
	let writes = 0;
	const service = createControlCenterTodo({ agentDir: "/synthetic", cwd: "/synthetic", loaded: true,
		isIdle: () => true, isCurrent: () => false,
		inspect: () => ({ configured: true, active: false, reason: "Unfiltered Gentle package", target: "/synthetic/settings.json" }),
		select: () => { writes++; return { changed: true }; } });
	const view = await service.read();
	assert.match(view.summary, /Configured: on.*Eligibility: off.*Loaded registration: on/);
	assert.match(view.note, /Unfiltered Gentle/);
	assert.equal((await service.apply({ kind: "todo-provider", mode: "off" })).kind, "rejected");
	assert.equal(writes, 0);
});

void test("TODO save rejection is honest and never requests reload", async () => {
	const service = createControlCenterTodo({ agentDir: "/synthetic", cwd: "/synthetic", loaded: false,
		isIdle: () => true, select: () => { throw new Error("synthetic save failure"); } });
	const result = await service.apply({ kind: "todo-provider", mode: "on" });
	assert.equal(result.kind, "rejected");
	assert.match(result.message, /synthetic save failure/);
});

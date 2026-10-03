import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import test from "node:test";
import { fileURLToPath } from "node:url";
registerHooks({ resolve(specifier, context, next) {
	if (specifier.startsWith(".") && specifier.endsWith(".js") && context.parentURL?.endsWith(".ts")) {
		const url = new URL(`${specifier.slice(0, -3)}.ts`, context.parentURL);
		if (existsSync(fileURLToPath(url))) return { shortCircuit: true, url: url.href };
	}
	return next(specifier, context);
} });
const { createControlCenterUsage } = await import("./control-center-usage.js");
const { readActiveProfileName } = await import("./account-profiles.js");
void test("Usage reads cached quota and owner history, refresh is explicit", async () => {
	let refreshes = 0;
	const service = createControlCenterUsage({
		quota: () => ({ kind: "ready", snapshot: { fetchedAt: 100, planType: "plus", ordinaryUsageAllowed: true,
			credits: undefined, buckets: [{ id: "codex", label: undefined, primary: { usedPercent: 25, windowMinutes: 300, resetsAt: 200 }, secondary: undefined }] } }),
		history: () => Promise.resolve({ records: [], warnings: [], limited: false, missing: true }),
		refresh: () => { refreshes++; return Promise.resolve(); }, active: () => "work",
	});
	const view = await service.read();
	assert.equal(refreshes, 0);
	assert.match(JSON.stringify(view), /25% used/);
	assert.match(JSON.stringify(view), /No recorded turns/);
	await service.apply({ kind: "usage-range", range: "week" });
	assert.equal(refreshes, 0);
	assert.match((await service.read()).summary, /week/);
	await service.apply({ kind: "usage-refresh" });
	assert.equal(refreshes, 1);
});
void test("Usage filters owner records by current account and reports limited coverage/cost gaps", async () => {
	const now = new Date(2026, 8, 8, 12);
	const record = { version: 1 as const, timestamp: now.getTime(), sessionId: "s", entryId: "e", profile: "work", provider: "openai-codex", model: "gpt", input: 10, output: 5, cacheRead: 3, cacheWrite: 2, estimatedCost: null };
	const service = createControlCenterUsage({ quota: () => ({ kind: "loading", snapshot: undefined }),
		history: () => Promise.resolve({ records: [record, { ...record, entryId: "e2", profile: "personal", input: 100 }], warnings: ["record-limit"], limited: true, missing: false }),
		refresh: () => Promise.resolve(), active: () => "work", now: () => now });
	assert.match(JSON.stringify(await service.read()), /Input: 110/);
	await service.apply({ kind: "usage-account", current: true });
	const view = JSON.stringify(await service.read());
	assert.match(view, /Input: 10/);
	assert.match(view, /Limited\/incomplete coverage/);
	assert.match(view, /Cost unavailable: 1 turns/);
	assert.match(view, /Quota loading/);
});

void test("Usage uses validated external active names and keeps unmanaged filtering distinct", async () => {
	const env: NodeJS.ProcessEnv = {};
	const now = new Date(2026, 8, 8, 12);
	const record = { version: 1 as const, timestamp: now.getTime(), sessionId: "s", entryId: "e", profile: null,
		provider: "openai-codex", model: "gpt", input: 7, output: 0, cacheRead: 0, cacheWrite: 0, estimatedCost: null };
	const service = createControlCenterUsage({ quota: () => ({ kind: "idle" }),
		history: () => Promise.resolve({ records: [record, { ...record, entryId: "e2", profile: "work", input: 13 }], warnings: [], limited: false, missing: false }),
		refresh: () => Promise.resolve(), active: () => readActiveProfileName(env), now: () => now });
	await service.apply({ kind: "usage-account", current: true });
	for (const value of [undefined, "", "../auth.json", "auth.json", "DEFAULT", "token-secret\n", "x".repeat(64)]) {
		env.OSDY_PI_PROFILE_NAME = value;
		assert.equal(readActiveProfileName(env), undefined);
		const view = await service.read();
		assert.match(view.summary, /unmanaged/);
		assert.match(JSON.stringify(view), /Input: 7/);
		assert.equal(JSON.stringify(view).includes("token-secret"), false);
		assert.equal(JSON.stringify(view).includes("auth.json"), false);
	}
	env.OSDY_PI_PROFILE_NAME = "work";
	assert.equal(readActiveProfileName(env), "work");
	assert.match((await service.read()).summary, /work/);
	assert.match(JSON.stringify(await service.read()), /Input: 13/);
});

void test("Explicit refresh still updates local history when quota fails", async () => {
	let reads = 0;
	const service = createControlCenterUsage({ quota: () => ({ kind: "idle" }), active: () => undefined,
		history: () => { reads++; return Promise.resolve({ records: [], warnings: [], limited: false, missing: true }); },
		refresh: () => Promise.reject(new Error("secret")) });
	await service.read();
	assert.equal((await service.apply({ kind: "usage-refresh" })).failed, true);
	assert.equal(reads, 2);
});

void test("Usage reports unavailable sources without raw backend errors", async () => {
	const service = createControlCenterUsage({ quota: () => ({ kind: "error", message: "secret", snapshot: undefined }),
		history: () => Promise.reject(new Error("secret")), refresh: () => Promise.reject(new Error("secret")), active: () => undefined });
	const text = JSON.stringify(await service.read());
	assert.match(text, /Quota unavailable/);
	assert.match(text, /Local history unavailable/);
	assert.equal(text.includes("secret"), false);
	assert.equal((await service.apply({ kind: "usage-refresh" })).failed, true);
});

import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { visibleWidth } from "@earendil-works/pi-tui";
registerHooks({ resolve(specifier, context, next) {
	if (specifier.startsWith(".") && specifier.endsWith(".js") && context.parentURL?.endsWith(".ts")) {
		const url = new URL(`${specifier.slice(0, -3)}.ts`, context.parentURL);
		if (existsSync(fileURLToPath(url))) return { shortCircuit: true, url: url.href };
	}
	return next(specifier, context);
} });
const { createControlCenterUsage } = await import("./control-center-usage.js");
const { ControlCenter } = await import("./control-center.js");
const { readActiveProfileName } = await import("./account-profiles.js");
void test("reset row is owner-enabled even with unavailable quota, but never applies inline", async () => {
	for (const enabled of [false, true]) {
		let calls = 0;
		const service = createControlCenterUsage({ quota: () => ({ kind: "idle" }),
			history: () => Promise.resolve({ records: [], warnings: [], limited: false, missing: true }),
			refresh: () => Promise.resolve(), active: () => undefined,
			useReset: enabled ? () => { calls++; return Promise.resolve(true); } : undefined });
		const row = (await service.read()).rows.find(row => row.label === "Use or check banked reset");
		assert.equal(!!row, enabled);
		if (row) { assert.equal(row.action.kind, "usage-reset"); await service.apply({ kind: "usage-reset" }); }
		assert.equal(calls, 0, "runtime must own the external intent after custom disposal");
	}
});

void test("Usage reads cached quota and owner history, refresh is explicit", async () => {
	let refreshes = 0;
	const service = createControlCenterUsage({
		quota: () => ({ kind: "ready", snapshot: { fetchedAt: 100, planType: "plus", ordinaryUsageAllowed: true,
			credits: undefined, bankedResetCount: 3, buckets: [{ id: "codex", label: undefined, primary: { usedPercent: 25, windowMinutes: 300, resetsAt: 200 }, secondary: undefined }] } }),
		history: () => Promise.resolve({ records: [], warnings: [], limited: false, missing: true }),
		refresh: () => { refreshes++; return Promise.resolve(); }, active: () => "work",
	});
	const view = await service.read();
	assert.equal(refreshes, 0);
	assert.match(JSON.stringify(view), /Active Codex quota/);
	assert.equal(view.rows.find(row => row.quota)?.quota?.usedPercent, 25);
	const banked = view.rows.find(row => row.label === "Banked resets: 3");
	assert.ok(banked);
	assert.equal(banked.group, view.rows.find(row => row.quota)?.group);
	assert.equal(banked.action.kind, "usage-detail");
	assert.match(JSON.stringify(view), /75% left/);
	assert.equal(view.rows.filter(row => row.action.kind === "usage-range").some(row => row.quota !== undefined), false);
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

void test("Cached quota remains distinct from local filters during automatic loading or failure", async () => {
	const snapshot = { fetchedAt: 1000, credits: undefined, planType: undefined, ordinaryUsageAllowed: undefined, bankedResetCount: 0,
		buckets: [{ id: "codex", label: undefined, primary: { usedPercent: 100, windowMinutes: 300, resetsAt: undefined },
			secondary: { usedPercent: 0, windowMinutes: 10080, resetsAt: undefined } }] };
	for (const kind of ["ready", "loading", "error"] as const) {
		const service = createControlCenterUsage({ quota: () => kind === "error" ? { kind, snapshot, message: "private error" } : { kind, snapshot },
			history: () => Promise.resolve({ records: [], warnings: [], limited: false, missing: true }),
			refresh: () => { throw new Error("filter must not refresh"); }, active: () => "work" });
		for (const range of ["day", "week", "month"] as const) {
			assert.equal((await service.apply({ kind: "usage-range", range })).failed, false);
			assert.equal((await service.apply({ kind: "usage-account", current: range !== "week" })).failed, false);
			const view = await service.read();
			const banked = view.rows.find(row => row.label === "Banked resets: 0");
			assert.ok(banked);
			assert.equal(banked.group, view.rows.find(row => row.quota)?.group);
			const stateNote = kind === "loading" ? "refresh pending" : kind === "error" ? "refresh unavailable" : "Cached active-account quota";
			assert.ok(banked.details?.some(detail => detail.includes(stateNote)));
			assert.ok(banked.details?.some(detail => detail.includes("local range filters do not change it")));
			assert.deepEqual(view.rows.filter(row => row.quota).map(row => row.quota?.usedPercent), [100, 0]);
			assert.match(JSON.stringify(view), /0% left/);
			assert.match(JSON.stringify(view), /100% left/);
			assert.equal(view.rows.filter(row => row.action.kind === "usage-range").some(row => row.quota), false);
			assert.doesNotMatch(JSON.stringify(view), /private error/);
		}
	}
	const empty = createControlCenterUsage({ quota: () => ({ kind: "ready", snapshot: { ...snapshot, buckets: [] } }),
		history: () => Promise.resolve({ records: [], warnings: [], limited: false, missing: true }), refresh: () => Promise.resolve(), active: () => undefined });
	assert.match(JSON.stringify(await empty.read()), /Active Codex quota: unknown/);
	assert.ok((await empty.read()).rows.some(row => row.label === "Banked resets: 0"));
});

void test("Usage omits unknown banked resets instead of using legacy credit resets", async () => {
	const service = createControlCenterUsage({
		quota: () => ({ kind: "ready", snapshot: { fetchedAt: 0, planType: undefined, ordinaryUsageAllowed: undefined,
			buckets: [], credits: { hasCredits: true, unlimited: false, balance: "12.50", resetCreditCount: 9 } } }),
		history: () => Promise.resolve({ records: [], warnings: [], limited: false, missing: true }),
		refresh: () => Promise.resolve(), active: () => undefined,
	});
	assert.ok(!(await service.read()).rows.some(row => row.label.includes("Banked resets:")));
});

void test("Usage appends shared expiry details to the count row while preserving cached refresh notes", async () => {
	const now = new Date("2026-06-17T00:00:00Z");
	const future = Date.parse("2026-07-17T00:00:00Z");
	const past = now.getTime() - 60_000;
	for (const kind of ["ready", "loading", "error"] as const) {
		for (const bankedResetDetails of [undefined, [], [{ id: "opaque-future", expiresAt: future }, { id: "opaque-unknown", expiresAt: undefined }, { id: "opaque-past", expiresAt: past }]]) {
			const snapshot = { fetchedAt: now.getTime(), planType: undefined, ordinaryUsageAllowed: undefined,
				buckets: [], credits: undefined, bankedResetCount: 5, bankedResetDetails };
			const usage = createControlCenterUsage({ quota: () => kind === "error" ? { kind, snapshot, message: "private" } : { kind, snapshot },
				history: () => Promise.resolve({ records: [], warnings: [], limited: false, missing: true }),
				refresh: () => { throw new Error("must not fetch"); }, active: () => "work", now: () => now });
			await usage.apply({ kind: "usage-range", range: "week" });
			const view = await usage.read();
			assert.doesNotMatch(JSON.stringify(view), /opaque-/);
			const row = view.rows.find(row => row.label === "Banked resets: 5");
			assert.ok(row?.details);
			assert.match(row.details[0] ?? "", /Cached active-account quota.*local range filters do not change it/);
			if (kind !== "ready") assert.match(row.details[0] ?? "", kind === "loading" ? /refresh pending/ : /refresh unavailable/);
			assert.deepEqual(row.details.slice(1), bankedResetDetails === undefined ? ["Reset expiry details unavailable."]
				: bankedResetDetails.length === 0 ? ["Partial expiry details: 0 of 5 resets listed."] : [
					`Reset 1: expires ${new Date(future).toLocaleString()} (local time)`, "Reset 2: Expiry not provided",
					`Reset 3: expired ${new Date(past).toLocaleString()} (cached; local time)`, "Partial expiry details: 3 of 5 resets listed.",
				]);
		}
	}
});

void test("Usage banked reset row fits narrow and wide Control Center views", async () => {
	const usage = createControlCenterUsage({
		quota: () => ({ kind: "ready", snapshot: { fetchedAt: 0, planType: undefined, ordinaryUsageAllowed: undefined,
			buckets: [], credits: undefined, bankedResetCount: 3, bankedResetDetails: [{ id: "opaque-unknown", expiresAt: undefined }] } }),
		history: () => Promise.resolve({ records: [], warnings: [], limited: false, missing: true }),
		refresh: () => Promise.resolve(), active: () => undefined,
	});
	const panel = new ControlCenter({ usage,
		theme: () => ({ name: "test", appearance: "dark", fg: (_color, text) => `\x1b[32m${text}\x1b[0m` }),
		readThemes: () => [], applyTheme: () => ({ success: true }),
		requestRender: () => {}, height: () => 50, close: () => {},
	});
	for (let index = 0; index < 7; index++) panel.handleInput("\x1b[B");
	await new Promise<void>(resolve => setImmediate(resolve));
	panel.handleInput("\t");
	panel.handleInput("\x1b[H");
	panel.handleInput("\x1b[B");
	panel.handleInput("\x1b[B"); // Select banked count, then expand its read-only details.
	panel.handleInput("?");
	for (const width of [24, 48, 100]) {
		const lines = panel.render(width);
		assert.ok(lines.some(line => line.includes("Banked resets: 3")), `banked count at width ${width}`);
		assert.ok(lines.every(line => visibleWidth(line) <= width), `ANSI width ${width}`);
		if (width === 100) assert.match(lines.join("\n"), /Reset 1: Expiry not provided/);
	}
	panel.dispose();
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

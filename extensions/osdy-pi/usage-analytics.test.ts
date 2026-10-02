import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import test from "node:test";
import { fileURLToPath } from "node:url";
import type { ExtensionAPI, ExtensionCommandContext, ExtensionContext } from "@earendil-works/pi-coding-agent";
import ts from "typescript";
import type { UsageRecord } from "./usage-analytics-data.js";
import type { UsageAnalyticsStore, UsageSnapshot } from "./usage-analytics-store.js";

registerHooks({
	resolve(specifier, context, nextResolve) {
		if (specifier.startsWith(".") && specifier.endsWith(".js") && context.parentURL?.endsWith(".ts")) {
			const url = new URL(`${specifier.slice(0, -3)}.ts`, context.parentURL);
			if (existsSync(fileURLToPath(url))) return { shortCircuit: true, url: url.href };
		}
		return nextResolve(specifier, context);
	},
	load(url, context, nextLoad) {
		if (url.endsWith(".ts")) return { format: "module", shortCircuit: true, source: ts.transpileModule(readFileSync(fileURLToPath(url), "utf8"), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText };
		return nextLoad(url, context);
	},
});
const { registerUsageAnalytics } = await import("./usage-analytics.js");
const { SessionManager } = await import("@earendil-works/pi-coding-agent");
const timestamp = 1900000000000;
function message(overrides: Record<string, unknown> = {}): Record<string, unknown> {
	return { role: "assistant", provider: "openai-codex", model: "actual-model", timestamp, usage: { input: 11, output: 7, cacheRead: 3, cacheWrite: 2, cost: { total: 0.25 } }, ...overrides };
}
function harness() {
	type Handler = (event: unknown, ctx: ExtensionContext) => unknown;
	const handlers = new Map<string, Handler[]>();
	const commands = new Map<string, { handler: (args: string, ctx: ExtensionCommandContext) => Promise<void> }>();
	const records: UsageRecord[] = [];
	const notices: string[] = [];
	let enabled = true;
	let profile: unknown = "Work";
	let sessionId = "019a42f0-7000-7000-8000-0123456789ab";
	let appendError = false;
	let factoryError = false;
	let drainWait: Promise<void> = Promise.resolve();
	let drainError = false;
	let factories = 0;
	let reads = 0;
	let drains = 0;
	let panels = 0;
	let readPanel: (() => Promise<UsageSnapshot>) | undefined;
	const store: UsageAnalyticsStore = {
		directory: "/synthetic-only", append(value) { if (appendError) return Promise.reject(new Error("private path/content")); records.push(value as UsageRecord); return Promise.resolve(); },
		read() { reads++; return Promise.resolve({ records, warnings: [], limited: false, missing: false }); },
		drain() { drains++; return drainError ? Promise.reject(new Error("private drain path")) : drainWait; },
	};
	// Partial public API/context mocks deliberately omit unused capabilities; unexpected reads fail.
	const pi = { on(name: string, handler: Handler) { handlers.set(name, [...handlers.get(name) ?? [], handler]); return () => {}; }, registerCommand(name: string, command: { handler: (args: string, ctx: ExtensionCommandContext) => Promise<void> }) { commands.set(name, command); } } as unknown as ExtensionAPI;
	const ctx = { mode: "tui", hasUI: true, sessionManager: { getSessionId: () => sessionId, getEntries: () => { throw new Error("history scan forbidden"); } }, ui: { notify: (text: string) => notices.push(text), custom: () => { throw new Error("unexpected custom UI"); } } } as unknown as ExtensionCommandContext;
	registerUsageAnalytics(pi, { isEnabled: () => enabled, resolveProfile: () => profile, createStore: () => { factories++; if (factoryError) throw new Error("private factory path"); return store; }, showPanel: (_ctx, options) => { panels++; readPanel = options.read; return Promise.resolve(); } });
	async function emit(name: string, event: unknown = {}): Promise<void> { for (const handler of handlers.get(name) ?? []) await handler(event, ctx); }
	return { ctx, records, notices, commands, emit, start: (turnIndex = 0) => emit("turn_start", { turnIndex, timestamp }), end: (overrides: Record<string, unknown> = {}) => emit("turn_end", { turnIndex: 0, messageEntryId: "a1b2c3d4", message: message(), ...overrides }), command: () => commands.get("osdy-usage")!.handler("", ctx), readPanel: () => readPanel!(), setEnabled: (v: boolean) => { enabled = v; }, setProfile: (v: unknown) => { profile = v; }, setSession: (v: string) => { sessionId = v; }, setAppendError: (v: boolean) => { appendError = v; }, setFactoryError: (v: boolean) => { factoryError = v; }, setDrainWait: (v: Promise<void>) => { drainWait = v; }, setDrainError: (v: boolean) => { drainError = v; }, counts: () => ({ factories, reads, drains, panels }) };
}

void test("registration, replay and compaction do not import; capture actual message with start profile", async () => {
	const h = harness();
	assert.equal(h.counts().factories, 0);
	await h.emit("session_start", { reason: "resume" });
	await h.emit("session_compact"); await h.emit("session_tree"); await h.end();
	assert.equal(h.records.length, 0);
	await h.start(); h.setProfile("Personal"); await h.end();
	assert.deepEqual(h.records[0], { version: 1, timestamp, sessionId: "019a42f0-7000-7000-8000-0123456789ab", entryId: "a1b2c3d4", profile: "Work", provider: "openai-codex", model: "actual-model", input: 11, output: 7, cacheRead: 3, cacheWrite: 2, estimatedCost: 0.25 });
});
void test("accepts IDs generated by installed Pi in-memory session manager", async () => {
	const session = SessionManager.inMemory("/synthetic");
	const entryId = session.appendMessage({ role: "assistant", content: [], api: "openai-responses", provider: "openai-codex", model: "actual-model", stopReason: "stop", timestamp, usage: { input: 11, output: 7, cacheRead: 3, cacheWrite: 2, totalTokens: 23, cost: { input: 0.1, output: 0.1, cacheRead: 0.025, cacheWrite: 0.025, total: 0.25 } } });
	assert.match(entryId, /^[a-f0-9]{8}$/);
	const h = harness(); h.setSession(session.getSessionId()); await h.start(); await h.end({ messageEntryId: entryId });
	assert.equal(h.records[0]?.entryId, entryId);
});
void test("non-Codex and invalid selected labels are unmanaged; missing and zero cost stay distinct", async () => {
	for (const [provider, profile, expected] of [["anthropic", "Work", null], ["openai-codex", "../bad", null], ["openai-codex", undefined, null]] as const) {
		const h = harness(); h.setProfile(profile); await h.start(); await h.end({ message: message({ provider, usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } }) });
		assert.equal(h.records[0]?.profile, expected); assert.equal(h.records[0]?.estimatedCost, null);
	}
	const h = harness(); await h.start(); await h.end({ message: message({ usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: { total: 0 } } }) }); assert.equal(h.records[0]?.estimatedCost, 0);
});
void test("disabled starts/ends, session replacement, wrong index and invalid metadata cannot append", async () => {
	const h = harness(); h.setEnabled(false); await h.start(); h.setEnabled(true); await h.end();
	await h.start(); h.setEnabled(false); await h.end(); h.setEnabled(true);
	await h.start(); h.setSession("other"); await h.end();
	await h.start(); await h.end({ turnIndex: 1 }); await h.end();
	await h.start(); await h.emit("session_start"); await h.end();
	await h.start(); await h.emit("agent_end"); await h.end();
	await h.start(); await h.emit("session_shutdown"); await h.end();
	assert.equal(h.records.length, 0);
	for (const invalid of [message({ role: "user" }), message({ provider: "" }), message({ model: "bad\nmodel" }), message({ timestamp: NaN }), message({ usage: { input: -1, output: 1, cacheRead: 0, cacheWrite: 0 } }), message({ usage: { input: 1.5, output: 1, cacheRead: 0, cacheWrite: 0 } }), message({ usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, cost: { total: -1 } } })]) {
		await h.start(); await h.end({ message: invalid });
	}
	await h.start(); await h.end({ messageEntryId: "../entry" });
	await h.start(); await h.end({ message: message({ timestamp: timestamp - 1 }) });
	await h.emit("turn_start", { turnIndex: -1, timestamp }); await h.end();
	await h.emit("turn_start", { turnIndex: 0, timestamp: NaN }); await h.end();
	assert.equal(h.records.length, 0);
});
void test("duplicate deliveries consume one start without rebinding profile; tuple guard is bounded", async () => {
	const h = harness(); await h.start(); h.setProfile("New"); await h.start(); await h.end(); await h.end();
	assert.equal(h.records[0]?.profile, "Work");
	await h.start(); await h.end(); assert.equal(h.records.length, 1);
	for (let i = 0; i < 300; i++) { await h.start(i); await h.end({ turnIndex: i, messageEntryId: `entry-${i}` }); }
	assert.equal(h.records.length, 301);
});
void test("write failure is nonfatal, warnings are generic once per streak, reads disclose lost coverage", async () => {
	const h = harness(); h.setAppendError(true);
	for (let i = 0; i < 2; i++) { await h.start(i); await h.end({ turnIndex: i, messageEntryId: `fail-${i}` }); }
	assert.equal(h.notices.length, 1); assert.doesNotMatch(h.notices.join(""), /private/);
	await h.command(); await assert.rejects(h.readPanel(), /incomplete/i); assert.equal(h.counts().reads, 0);
	h.setAppendError(false); await h.start(); await h.end({ messageEntryId: "success" });
	h.setAppendError(true); await h.start(); await h.end({ messageEntryId: "failure-again" }); assert.equal(h.notices.length, 2);
	h.setDrainError(true); await h.emit("session_shutdown"); assert.doesNotMatch(h.notices.join(""), /private/);
});
void test("shutdown awaits drain and catches a drain-only failure", async () => {
	const h = harness(); await h.start(); await h.end(); h.setDrainError(true); await h.emit("session_shutdown");
	assert.equal(h.counts().drains, 1); assert.equal(h.notices.length, 1);
});
void test("factory failures are caught at first append and dashboard read without leaking details", async () => {
	const h = harness(); h.setFactoryError(true); await h.start(); await h.end();
	assert.equal(h.notices.length, 1); assert.doesNotMatch(h.notices.join(""), /private/);
	await h.command(); await assert.rejects(h.readPanel(), /unavailable or incomplete/);
	await h.emit("session_shutdown"); assert.equal(h.counts().drains, 0);
});
void test("shutdown does not settle before the store drains", async () => {
	const h = harness(); await h.start(); await h.end();
	let release: (() => void) | undefined;
	h.setDrainWait(new Promise<void>((resolve) => { release = resolve; }));
	let settled = false;
	const shutdown = h.emit("session_shutdown").then(() => { settled = true; });
	await Promise.resolve(); assert.equal(settled, false);
	release!(); await shutdown; assert.equal(settled, true);
});
void test("settings readiness blocks new starts instead of reusing stale enabled state", async () => {
	const h = harness(); await h.start(); await h.emit("session_start");
	h.setEnabled(false); await h.start(); h.setEnabled(true); await h.end(); assert.equal(h.records.length, 0);
	await h.start(); await h.end(); assert.equal(h.records.length, 1);
});
void test("independent command is TUI-only even when RPC hasUI is true, readable while disabled", async () => {
	const h = harness(); assert.deepEqual([...h.commands.keys()], ["osdy-usage"]);
	for (const mode of ["rpc", "json", "print"] as const) { h.ctx.mode = mode; await h.command(); }
	h.ctx.mode = "tui"; h.ctx.hasUI = false; await h.command(); assert.equal(h.counts().panels, 0); assert.equal(h.counts().factories, 0);
	h.ctx.hasUI = true; h.setEnabled(false); await h.command(); await h.readPanel(); assert.equal(h.counts().reads, 1);
	const runtime = readFileSync(new URL("./runtime.ts", import.meta.url), "utf8");
	assert.match(runtime, /pi\.registerCommand\("usage",/); assert.match(runtime, /registerUsageAnalytics\(pi,/);
	assert.match(runtime, /isEnabled: \(\) => usageSettingsReady && state\.enabled/);
	assert.match(runtime, /session_start", async[^]*?usageSettingsReady = false;[^]*?await editorSettingsStore\.load\(\);[^]*?if \(sessionContext !== ctx\) return;[^]*?state\.enabled = editorSettings\.enabled;\s*usageSettingsReady = true;/);
	assert.match(runtime, /session_shutdown", \(\) => {\s*usageSettingsReady = false;/);
});

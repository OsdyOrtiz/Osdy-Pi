import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { registerHooks } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import type { CodexResetRecord, CodexResetStore } from "./codex-reset-store.js";
import type { CodexResetContext, CodexResetInteraction, CodexResetOptions, CodexResetPrompt } from "./codex-reset.js";
import type { CodexBankedResetDetail, CodexUsageSnapshot, ConsumeCodexResetRequest, ConsumeCodexResetResult } from "./codex-usage.js";

registerHooks({
	resolve(specifier, context, nextResolve) {
		if (specifier.startsWith(".") && specifier.endsWith(".js") && context.parentURL?.endsWith(".ts")) {
			const url = new URL(`${specifier.slice(0, -3)}.ts`, context.parentURL);
			if (existsSync(fileURLToPath(url))) return { shortCircuit: true, url: url.href };
		}
		return nextResolve(specifier, context);
	},
});

const { createCodexResetWorkflow } = await import("./codex-reset.js");
const { createCodexResetStore } = await import("./codex-reset-store.js");
const requestId = "11111111-1111-4111-8111-111111111111";
const pending: CodexResetRecord = {
	version: 1, status: "pending", accountId: "synthetic-account", creditId: "exact-credit", requestId, expiresAt: 2_000,
};
const quota = (count: number | undefined = 1, details: CodexBankedResetDetail[] = [{ id: "exact-credit", expiresAt: 2_000 }]): CodexUsageSnapshot => ({
	planType: undefined, ordinaryUsageAllowed: undefined, buckets: [], credits: undefined,
	bankedResetCount: count, bankedResetDetails: details, fetchedAt: 1_000,
});

function harness(overrides: Partial<CodexResetOptions> = {}, initial?: CodexResetRecord) {
	let record = initial;
	let locked = false;
	let context: CodexResetContext | undefined = {
		auth: { accountId: "synthetic-account", accessToken: "synthetic-token" }, generation: 1, sessionId: "synthetic-session",
	};
	const calls: ConsumeCodexResetRequest[] = [];
	const prompts: CodexResetPrompt[] = [];
	let uuidCalls = 0;
	let reads = 0;
	let refreshes = 0;
	const store: CodexResetStore = {
		acquire() {
			if (locked) return Promise.reject(new Error("synthetic-lock"));
			locked = true;
			return Promise.resolve({
				read: () => Promise.resolve(record),
				write: (next: CodexResetRecord) => { record = next; return Promise.resolve(); },
				release: () => { locked = false; return Promise.resolve(); },
			});
		},
	};
	const options: CodexResetOptions = {
		store, getContext: () => context,
		readQuota: () => { reads++; return Promise.resolve(quota()); },
		consume: (_auth, request) => {
			assert.equal(record?.status, "pending", "journal must precede dispatch");
			calls.push(request);
			return Promise.resolve({ kind: "confirmed", code: "reset", windowsReset: 2 });
		},
		refresh: () => { refreshes++; return Promise.resolve(); },
		now: () => 1_000, uuid: () => { uuidCalls++; return requestId; }, ...overrides,
	};
	const interaction: CodexResetInteraction = {
		choose: (choices) => Promise.resolve(choices[0]?.creditId),
		confirm: (prompt) => { prompts.push(prompt); return Promise.resolve(true); },
	};
	return {
		options, interaction, calls, prompts, store,
		create: () => createCodexResetWorkflow(options),
		record: () => record, reads: () => reads, refreshes: () => refreshes, uuidCalls: () => uuidCalls,
		context: () => context, setContext: (next: CodexResetContext | undefined) => { context = next; },
	};
}

void test("async active auth source is awaited while shared guard is already held", async () => {
	const h = harness();
	let finish: (value: CodexResetContext | undefined) => void = () => {};
	let reads = 0;
	h.options.getContext = () => ++reads === 1 ? new Promise(resolve => { finish = resolve; }) : Promise.resolve(h.context());
	const workflow = h.create();
	const first = workflow.run(h.interaction);
	assert.deepEqual(await workflow.run(h.interaction), { kind: "busy" });
	finish(h.context());
	assert.equal((await first).kind, "confirmed");
	assert.equal(h.calls.length, 1);
});

void test("async latest auth revalidation after journal save cancels before POST", async () => {
	const h = harness();
	h.options.getContext = () => Promise.resolve(h.context());
	h.options.store = { async acquire(id) {
		const lease = await h.store.acquire(id);
		return { ...lease, async write(record) { await lease.write(record); if (record.status === "pending") h.setContext(undefined); } };
	} };
	assert.equal((await h.create().run(h.interaction)).kind, "cancelled");
	assert.equal(h.calls.length, 0);
	assert.equal(h.record()?.status, "resolved");
});

void test("expiry is checked after the final awaited active-auth lookup, not before it", async () => {
	let clock = 1_000;
	let pendingChecks = 0;
	const h = harness({ now: () => clock });
	h.options.getContext = () => {
		if (h.record()?.status === "pending" && ++pendingChecks === 2) clock = 2_001;
		return Promise.resolve(h.context());
	};
	assert.equal((await h.create().run(h.interaction)).kind, "cancelled");
	assert.equal(h.calls.length, 0);
	assert.equal(h.record()?.status, "resolved");
});

void test("selected exact ID and UUID are pending before POST; confirmation is active-account and Cancel-first", async () => {
	const h = harness();
	assert.deepEqual(await h.create().run(h.interaction), { kind: "confirmed", code: "reset", windowsReset: 2, refreshFailed: false, journalFailed: false });
	assert.deepEqual(h.calls, [{ creditId: "exact-credit", requestId }]);
	assert.deepEqual(h.prompts, [{ kind: "new", scope: "active-account", cancelFirst: true, creditId: "exact-credit", expiresAt: 2_000 }]);
	assert.equal(h.uuidCalls(), 1);
	assert.equal(h.reads(), 2);
	assert.equal(h.refreshes(), 1);
	assert.equal(h.record()?.status, "resolved");
});

for (const stage of ["choose", "confirm"] as const) {
	void test(`cancel at ${stage} creates no journal or POST`, async () => {
		const h = harness();
		const interaction: CodexResetInteraction = { ...h.interaction };
		if (stage === "choose") interaction.choose = () => Promise.resolve(undefined);
		else interaction.confirm = () => Promise.resolve(false);
		assert.equal((await h.create().run(interaction)).kind, "cancelled");
		assert.equal(h.record(), undefined);
		assert.equal(h.calls.length, 0);
		assert.equal(h.uuidCalls(), 0);
	});
}

for (const snapshot of [quota(0), { ...quota(), bankedResetCount: undefined }, quota(3, []), quota(1, [{ id: "", expiresAt: 2_000 }]), quota(1, [{ id: "expired", expiresAt: 1_000 }])]) {
	void test(`no eligible validated details means no selection/POST (${snapshot.bankedResetCount}:${snapshot.bankedResetDetails?.[0]?.id})`, async () => {
		const h = harness({ readQuota: () => Promise.resolve(snapshot) });
		h.interaction.choose = () => { throw new Error("must not choose"); };
		assert.equal((await h.create().run(h.interaction)).kind, "unavailable");
		assert.equal(h.calls.length, 0);
		assert.equal(h.record(), undefined);
	});
}

void test("unknown expiry remains eligible; choose cannot invent missing capped IDs", async () => {
	const h = harness({ readQuota: () => Promise.resolve(quota(10, [{ id: "exact-credit", expiresAt: undefined }])) });
	assert.equal((await h.create().run(h.interaction)).kind, "confirmed");
	const forged = harness();
	forged.interaction.choose = () => Promise.resolve("invented-credit");
	assert.equal((await forged.create().run(forged.interaction)).kind, "unavailable");
	assert.equal(forged.calls.length, 0);
});

for (const stage of ["readQuota", "choose", "confirm"] as const) {
	void test(`one workflow guard is shared across surfaces while ${stage} awaits`, async () => {
		const h = harness();
		let unblock: (() => void) | undefined;
		let entered: (() => void) | undefined;
		const reached = new Promise<void>((resolve) => { entered = resolve; });
		const wait = new Promise<void>((resolve) => { unblock = resolve; });
		if (stage === "readQuota") h.options.readQuota = async () => { entered?.(); await wait; return quota(); };
		else if (stage === "choose") h.interaction.choose = async () => { entered?.(); await wait; return "exact-credit"; };
		else h.interaction.confirm = async () => { entered?.(); await wait; return true; };
		const workflow = h.create();
		const first = workflow.run(h.interaction);
		await reached;
		assert.deepEqual(await workflow.run(h.interaction), { kind: "busy" });
		unblock?.();
		assert.equal((await first).kind, "confirmed");
		assert.equal(h.calls.length, 1);
	});
}

for (const change of ["account", "generation", "session", "auth", "missing"] as const) {
	void test(`context ${change} change during dialog never dispatches on the new context`, async () => {
		const h = harness();
		h.interaction.confirm = () => {
			const current = h.context();
			assert.ok(current);
			h.setContext(change === "missing" ? undefined : {
				...current, generation: change === "generation" ? 2 : current.generation,
				sessionId: change === "session" ? "next-session" : current.sessionId,
				auth: { ...current.auth, accountId: change === "account" ? "next-account" : current.auth.accountId,
					accessToken: change === "auth" ? "new-token" : current.auth.accessToken },
			});
			return Promise.resolve(true);
		};
		assert.equal((await h.create().run(h.interaction)).kind, "cancelled");
		assert.equal(h.calls.length, 0);
		assert.equal(h.record(), undefined);
	});
}

void test("fresh selection is rechecked after confirmation; disappearance/zero GET is not dispatchable", async () => {
	for (const fresh of [quota(0), quota(1, []), quota(1, [{ id: "exact-credit", expiresAt: 999 }]), quota(1, [{ id: "exact-credit", expiresAt: 3_000 }])]) {
		let reads = 0;
		const h = harness({ readQuota: () => Promise.resolve(++reads === 1 ? quota() : fresh) });
		assert.equal((await h.create().run(h.interaction)).kind, "unavailable");
		assert.equal(h.calls.length, 0);
		assert.equal(h.record(), undefined);
	}
});

void test("post-persist context invalidation resolves definitely-not-sent without invoking consume", async () => {
	const h = harness();
	h.options.store = {
		async acquire(accountId) {
			const lease = await h.store.acquire(accountId);
			return { ...lease, async write(record) { await lease.write(record); if (record.status === "pending") h.setContext(undefined); } };
		},
	};
	assert.equal((await h.create().run(h.interaction)).kind, "cancelled");
	assert.equal(h.calls.length, 0);
	assert.equal(h.record()?.status, "resolved");
});

void test("abort before dispatch is no send, including after durable write", async () => {
	const controller = new AbortController();
	const h = harness();
	h.options.store = { async acquire(accountId) {
		const lease = await h.store.acquire(accountId);
		return { ...lease, async write(record) { await lease.write(record); if (record.status === "pending") controller.abort(); } };
	} };
	assert.equal((await h.create().run(h.interaction, { signal: controller.signal })).kind, "cancelled");
	assert.equal(h.calls.length, 0);
	assert.equal(h.record()?.status, "resolved");
});

for (const transport of [
	() => Promise.resolve({ kind: "unknown" } as const),
	() => { throw new Error("opaque-id-or-secret-must-not-leak"); },
	() => Promise.reject(new Error("opaque-id-or-secret-must-not-leak")),
]) {
	void test(`uncertain transport ${transport.toString().slice(0, 35)} keeps pending and refreshes without GET proof`, async () => {
		const h = harness({ consume: transport, refresh: () => Promise.resolve() });
		assert.deepEqual(await h.create().run(h.interaction), { kind: "unknown", refreshFailed: false, journalFailed: false });
		assert.equal(h.record()?.status, "pending");
	});
}

void test("pending recovery needs explicit confirmation, same IDs, no fresh selection or UUID despite zero GET", async () => {
	const h = harness({ readQuota: () => Promise.resolve(quota(0)), uuid: () => { throw new Error("never mint pending"); } }, pending);
	h.interaction.choose = () => { throw new Error("never choose pending"); };
	h.interaction.confirm = (prompt) => { h.prompts.push(prompt); return Promise.resolve(false); };
	assert.equal((await h.create().run(h.interaction)).kind, "cancelled");
	assert.equal(h.calls.length, 0);
	assert.equal(h.record()?.status, "pending");
	h.interaction.confirm = (prompt) => { h.prompts.push(prompt); return Promise.resolve(true); };
	assert.equal((await h.create().run(h.interaction)).kind, "confirmed");
	assert.deepEqual(h.calls, [{ creditId: pending.creditId, requestId }]);
	assert.deepEqual(h.prompts[0], { kind: "recovery", scope: "active-account", cancelFirst: true, creditId: pending.creditId, requestId, expiresAt: 2_000 });
});

void test("unknown pending survives a real store reload; construction and decline never auto-POST", async (t) => {
	const root = await mkdtemp(join(tmpdir(), "osdy-reset-workflow-test-"));
	t.after(() => rm(root, { recursive: true, force: true }));
	const first = harness({ store: createCodexResetStore(root), consume: () => Promise.resolve({ kind: "unknown" }) });
	assert.equal((await first.create().run(first.interaction)).kind, "unknown");
	const next = harness({ store: createCodexResetStore(root), readQuota: () => Promise.resolve(quota(0)), uuid: () => { throw new Error("no UUID"); } });
	const workflow = next.create();
	assert.equal(next.calls.length, 0);
	next.interaction.confirm = () => Promise.resolve(false);
	assert.equal((await workflow.run(next.interaction)).kind, "cancelled");
	assert.equal(next.calls.length, 0);
	next.options.consume = (_auth, request) => { next.calls.push(request); return Promise.resolve({ kind: "confirmed", code: "already_redeemed", windowsReset: 0 }); };
	const recovered = next.create();
	next.interaction.confirm = () => Promise.resolve(true);
	assert.equal((await recovered.run(next.interaction)).kind, "confirmed");
	assert.deepEqual(next.calls, [{ creditId: "exact-credit", requestId }]);
});

void test("terminal journal failure preserves pending and reports confirmed outcome separately", async () => {
	const h = harness();
	h.options.store = { async acquire(accountId) {
		const lease = await h.store.acquire(accountId);
		return { ...lease, write: (record) => record.status === "resolved" ? Promise.reject(new Error("synthetic path")) : lease.write(record) };
	} };
	assert.deepEqual(await h.create().run(h.interaction), { kind: "confirmed", code: "reset", windowsReset: 2, refreshFailed: false, journalFailed: true });
	assert.equal(h.record()?.status, "pending");
});

void test("refresh failure never overwrites confirmed outcome, and changed contexts are not refreshed", async () => {
	const h = harness({ refresh: () => Promise.reject(new Error("synthetic")) });
	assert.deepEqual(await h.create().run(h.interaction), { kind: "confirmed", code: "reset", windowsReset: 2, refreshFailed: true, journalFailed: false });
	const switched = harness();
	switched.options.consume = () => { switched.setContext(undefined); return Promise.resolve({ kind: "confirmed", code: "reset", windowsReset: 2 }); };
	assert.equal((await switched.create().run(switched.interaction)).kind, "confirmed");
	assert.equal(switched.refreshes(), 0);
});

void test("not-sent adapter result resolves journal without claiming consumption or refreshing", async () => {
	const h = harness({ consume: () => Promise.resolve({ kind: "not-sent", reason: "aborted" }) });
	assert.equal((await h.create().run(h.interaction)).kind, "cancelled");
	assert.equal(h.record()?.status, "resolved");
	assert.equal(h.refreshes(), 0);
});

for (const fault of ["acquire", "read", "write", "release"] as const) {
	void test(`store ${fault} error is generic and fail-closed`, async () => {
		const h = harness();
		h.options.store = { async acquire(accountId) {
			if (fault === "acquire") throw new Error("rawpath/account-secret");
			const lease = await h.store.acquire(accountId);
			return { ...lease, [fault]: () => Promise.reject(new Error("rawpath/account-secret")) };
		} };
		const result = await h.create().run(h.interaction);
		assert.equal(JSON.stringify(result).includes("rawpath"), false);
		if (fault === "release") {
			assert.equal(result.kind, "confirmed");
			assert.equal("journalFailed" in result && result.journalFailed, true);
		} else {
			assert.equal(result.kind, "blocked");
			assert.equal(h.calls.length, 0);
		}
	});
}

void test("pre-dispatch callback rejection releases guard/lease and sends nothing", async () => {
	const h = harness();
	h.interaction.confirm = () => Promise.reject(new Error("raw-auth-must-not-leak"));
	const workflow = h.create();
	assert.equal((await workflow.run(h.interaction)).kind, "blocked");
	assert.equal(h.calls.length, 0);
	h.interaction.confirm = () => Promise.resolve(true);
	assert.equal((await workflow.run(h.interaction)).kind, "confirmed");
});

void test("recovery not-sent cannot resolve the older uncertain attempt", async () => {
	const h = harness({ consume: () => Promise.resolve({ kind: "not-sent", reason: "aborted" }) }, pending);
	assert.equal((await h.create().run(h.interaction)).kind, "cancelled");
	assert.deepEqual(h.record(), pending);
	assert.equal(h.refreshes(), 0);
});

void test("a sent outcome still attempts same-context refresh when the dispatch signal was aborted", async () => {
	const controller = new AbortController();
	const h = harness({ consume: () => { controller.abort(); return Promise.resolve({ kind: "unknown" }); } });
	assert.deepEqual(await h.create().run(h.interaction, { signal: controller.signal }), { kind: "unknown", refreshFailed: false, journalFailed: false });
	assert.equal(h.refreshes(), 1);
});

void test("guard is already held when the synchronous auth getter reenters another surface", async () => {
	const h = harness();
	let second: Promise<unknown> | undefined;
	const workflow = h.create();
	h.options.getContext = () => { second ??= workflow.run(h.interaction); return h.context(); };
	assert.equal((await workflow.run(h.interaction)).kind, "confirmed");
	assert.deepEqual(await second, { kind: "busy" });
});

void test("lease is held before interaction and through refresh even across workflow instances", async () => {
	const h = harness();
	const competing = h.create();
	h.interaction.confirm = async () => {
		assert.equal((await competing.run(h.interaction)).kind, "blocked");
		return true;
	};
	h.options.refresh = async () => { assert.equal((await competing.run(h.interaction)).kind, "blocked"); };
	assert.equal((await h.create().run(h.interaction)).kind, "confirmed");
	assert.equal(h.calls.length, 1);
});

void test("active auth mutation is detected, but a normal long auth token is not a journal ID", async () => {
	const h = harness();
	const active = h.context();
	assert.ok(active);
	active.auth.accessToken = "s".repeat(2_000);
	assert.equal((await h.create().run(h.interaction)).kind, "confirmed");
	const switched = harness();
	switched.interaction.confirm = () => {
		const context = switched.context();
		assert.ok(context);
		context.auth.accountId = "next-account";
		return Promise.resolve(true);
	};
	assert.equal((await switched.create().run(switched.interaction)).kind, "cancelled");
	assert.equal(switched.calls.length, 0);
});

void test("failed not-sent resolution after invalidation retains the pending gate", async () => {
	const h = harness();
	h.options.store = { async acquire(accountId) {
		const lease = await h.store.acquire(accountId);
		return { ...lease, async write(record) {
			if (record.status === "resolved") throw new Error("synthetic terminal fault");
			await lease.write(record);
			h.setContext(undefined);
		} };
	} };
	assert.deepEqual(await h.create().run(h.interaction), { kind: "blocked", journalFailed: true });
	assert.equal(h.record()?.status, "pending");
	assert.equal(h.calls.length, 0);
});

void test("latest context is checked again immediately before invocation, after post-persist validation", async () => {
	const h = harness();
	let persisted = false;
	let checks = 0;
	h.options.getContext = () => persisted && ++checks > 1 ? undefined : h.context();
	h.options.store = { async acquire(accountId) {
		const lease = await h.store.acquire(accountId);
		return { ...lease, async write(record) { await lease.write(record); persisted = true; } };
	} };
	assert.equal((await h.create().run(h.interaction)).kind, "cancelled");
	assert.equal(h.calls.length, 0);
	assert.equal(h.record()?.status, "resolved");
});

void test("expiry crossing while persisting is resolved not-sent", async () => {
	const h = harness();
	let persisted = false;
	h.options.now = () => persisted ? 2_000 : 1_000;
	h.options.store = { async acquire(accountId) {
		const lease = await h.store.acquire(accountId);
		return { ...lease, async write(record) { await lease.write(record); persisted = true; } };
	} };
	assert.equal((await h.create().run(h.interaction)).kind, "cancelled");
	assert.equal(h.calls.length, 0);
	assert.equal(h.record()?.status, "resolved");
});

void test("invalid latest clock after persistence fails closed without POST", async () => {
	const h = harness();
	let persisted = false;
	h.options.now = () => persisted ? Number.NaN : 1_000;
	h.options.store = { async acquire(accountId) {
		const lease = await h.store.acquire(accountId);
		return { ...lease, async write(record) { await lease.write(record); persisted = true; } };
	} };
	assert.equal((await h.create().run(h.interaction)).kind, "cancelled");
	assert.equal(h.calls.length, 0);
	assert.equal(h.record()?.status, "resolved");
});

void test("terminal failure's next invocation is recovery, not selection or a newly minted request", async () => {
	const h = harness();
	h.options.store = { async acquire(accountId) {
		const lease = await h.store.acquire(accountId);
		return { ...lease, write: (record) => record.status === "resolved" ? Promise.reject(new Error("synthetic")) : lease.write(record) };
	} };
	const workflow = h.create();
	assert.equal((await workflow.run(h.interaction)).kind, "confirmed");
	h.interaction.choose = () => { throw new Error("no fresh selection"); };
	h.interaction.confirm = (prompt) => { assert.equal(prompt.kind, "recovery"); return Promise.resolve(false); };
	assert.equal((await workflow.run(h.interaction)).kind, "cancelled");
	assert.equal(h.calls.length, 1);
	assert.equal(h.uuidCalls(), 1);
});

void test("expired pending is explicitly recoverable in a later session but mid-recovery changes cancel", async () => {
	const h = harness({ now: () => 10_000 }, pending);
	const context = h.context();
	assert.ok(context);
	h.setContext({ ...context, generation: 8, sessionId: "later-session" });
	assert.equal((await h.create().run(h.interaction)).kind, "confirmed");
	assert.deepEqual(h.calls, [{ creditId: pending.creditId, requestId }]);
	const switched = harness({}, pending);
	switched.interaction.confirm = () => { switched.setContext(undefined); return Promise.resolve(true); };
	assert.equal((await switched.create().run(switched.interaction)).kind, "cancelled");
	assert.deepEqual(switched.record(), pending);
	assert.equal(switched.calls.length, 0);
});

void test("resolved attempts get a fresh UUID on each new explicitly selected reset", async () => {
	let sequence = 0;
	const h = harness({ uuid: () => ++sequence === 1 ? requestId : "22222222-2222-4222-8222-222222222222" });
	const workflow = h.create();
	assert.equal((await workflow.run(h.interaction)).kind, "confirmed");
	assert.equal((await workflow.run(h.interaction)).kind, "confirmed");
	assert.notEqual(h.calls[0]?.requestId, h.calls[1]?.requestId);
	assert.equal(sequence, 2);
});

void test("confirmed selection uses the chosen row, not first row, and UI cannot mutate the eligible set", async () => {
	const h = harness({ readQuota: () => Promise.resolve(quota(4, [
		{ id: "first-credit", expiresAt: 2_000 }, { id: "exact-credit", expiresAt: 2_000 },
	])) });
	h.interaction.choose = (choices) => { const first = choices[0]; if (first) first.creditId = "forged-credit"; return Promise.resolve("exact-credit"); };
	assert.equal((await h.create().run(h.interaction)).kind, "confirmed");
	assert.equal(h.calls[0]?.creditId, "exact-credit");
});

void test("mutating a UI choice cannot manufacture an eligible backend ID", async () => {
	const h = harness();
	h.interaction.choose = (choices) => {
		const first = choices[0];
		if (first) first.creditId = "forged-credit";
		return Promise.resolve("forged-credit");
	};
	assert.equal((await h.create().run(h.interaction)).kind, "unavailable");
	assert.equal(h.calls.length, 0);
	assert.equal(h.record(), undefined);
});

void test("pre-aborted invocation does not even consult auth or create a pending journal", async () => {
	const h = harness({ getContext: () => { throw new Error("must not read auth"); } });
	assert.equal((await h.create().run(h.interaction, { signal: AbortSignal.abort() })).kind, "cancelled");
	assert.equal(h.calls.length, 0);
	assert.equal(h.record(), undefined);
});

void test("unknown plus failed refresh and failed release stays unknown with independent flags", async () => {
	const h = harness({ consume: () => Promise.resolve({ kind: "unknown" }), refresh: () => Promise.reject(new Error("synthetic")) });
	h.options.store = { async acquire(accountId) {
		const lease = await h.store.acquire(accountId);
		return { ...lease, release: () => Promise.reject(new Error("synthetic")) };
	} };
	assert.deepEqual(await h.create().run(h.interaction), { kind: "unknown", refreshFailed: true, journalFailed: true });
	assert.deepEqual(h.record(), pending);
});

void test("all documented definite outcomes close pending, including no-credit with zero current availability", async () => {
	for (const code of ["reset", "nothing_to_reset", "no_credit", "already_redeemed"] as const) {
		const result: ConsumeCodexResetResult = { kind: "confirmed", code, windowsReset: 0 };
		const h = harness({ consume: () => Promise.resolve(result) }, pending);
		assert.equal((await h.create().run(h.interaction)).kind, "confirmed");
		assert.deepEqual(h.record(), { ...pending, status: "resolved", confirmedCode: code });
	}
});

import assert from "node:assert/strict";
import { existsSync, readFileSync, mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DefaultPackageManager, SettingsManager, type ExtensionAPI, type Theme } from "@earendil-works/pi-coding-agent";
import { KeybindingsManager } from "../../node_modules/@earendil-works/pi-coding-agent/dist/core/keybindings.js";
import { registerHooks } from "node:module";
import test from "node:test";
import { fileURLToPath } from "node:url";
import type { ExtensionCommandContext, ExtensionContext } from "@earendil-works/pi-coding-agent";
import ts from "typescript";
import type { OsdyState, WorkingTreeState, WorkingWidgetState, GlobalEditorSettings, SimpleTheme } from "./types.js";
import type { VisualPreferenceAction } from "./control-center-preferences.js";
import type { ProfileCodexUsageResult } from "./profile-codex-usage.js";
import type { CodexUsageRefreshClock, CodexUsageRefreshTimer } from "./codex-usage-refresh.js";
import type { CodexUsageSnapshot } from "./codex-usage.js";
import { Container, TuiMainScreen, type Component, type OverlayHandle, type Terminal, type TUI, type TuiMouseEvent } from "@earendil-works/pi-tui";

registerHooks({
	resolve(specifier, context, nextResolve) {
		if (
			specifier.startsWith(".") &&
			specifier.endsWith(".js") &&
			context.parentURL?.endsWith(".ts")
		) {
			const sourceUrl = new URL(`${specifier.slice(0, -3)}.ts`, context.parentURL);
			if (existsSync(fileURLToPath(sourceUrl))) {
				return { shortCircuit: true, url: sourceUrl.href };
			}
		}
		return nextResolve(specifier, context);
	},
	load(url, context, nextLoad) {
		if (url.endsWith(".ts")) {
			const source = readFileSync(fileURLToPath(url), "utf8");
			return {
				format: "module",
				shortCircuit: true,
				source: ts.transpileModule(source, {
					compilerOptions: {
						module: ts.ModuleKind.ESNext,
						target: ts.ScriptTarget.ES2022,
					},
				}).outputText,
			};
		}
		return nextLoad(url, context);
	},
});

type ShortcutRegistration = Parameters<ExtensionAPI["registerShortcut"]>[1];

async function resetRuntimeFixture(root = mkdtempSync(join(tmpdir(), "osdy-reset-ui-runtime-")),
	options: Pick<NonNullable<Parameters<typeof registerOsdyPi>[1]>, "fetchCodexUsage" | "generationClock"> = {}) {
	const { registerOsdyPi: registerResetRuntime } = await import("./runtime.js");
	const previousDir = process.env.PI_CODING_AGENT_DIR;
	const previousFetch = globalThis.fetch;
	process.env.PI_CODING_AGENT_DIR = root;
	const commands = new Map<string, { handler(args: string, ctx: ExtensionCommandContext): Promise<void> }>();
	const events = new Map<string, Array<(event: unknown, ctx: ExtensionContext) => Promise<void> | void>>();
	const posts: Array<Record<string, string>> = [];
	const dialogs: Array<{ title: string; options: string[] }> = [];
	const notices: string[] = [];
	let account = "synthetic-account";
	let session = "synthetic-session";
	let open = false;
	let overlays = 0;
	let nextAction = true;
	let beforeAction: () => Promise<void> = () => Promise.resolve();
	let beforeAuth: () => Promise<void> = () => Promise.resolve();
	let onRender: (view: string) => void = () => {};
	let panel: Component | undefined;
	let footer: Component | undefined;
	let renders = 0;
	let mounts = 0;
	const tui = { terminal: { columns: 120, rows: 40 }, requestRender: () => { renders++; }, hasOverlay: () => false } as unknown as TUI;
	const shortcuts = new Map<string, ShortcutRegistration>();
	const views: string[] = [];
	let quotaReads = 0;
	let unknown = false;
	let refreshFails = false;
	let count = 2;
	let answer: (title: string, options: string[], index: number) => Promise<string | undefined> = (_title, options) => Promise.resolve(options.at(-1));
	let onPost: (signal: AbortSignal | undefined) => Promise<void> = () => Promise.resolve();
	const expiry = "2099-07-17T12:30:00Z";
	globalThis.fetch = async (input, init) => {
		const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
		if (url.endsWith("/rate-limit-reset-credits/consume")) {
			assert.equal(init?.method, "POST");
			assert.equal(typeof init.body, "string");
			posts.push(JSON.parse(init.body as string) as Record<string, string>);
			await onPost(init.signal ?? undefined);
			if (unknown) throw new Error("private-backend-error");
			return new Response(JSON.stringify({ code: "reset", windows_reset: 2 }));
		}
		assert.notEqual(init?.method, "POST", "all other requests are GET-only");
		if (refreshFails && posts.length) throw new Error("private-refresh-error");
		if (url.endsWith("/usage")) { quotaReads++; return new Response(JSON.stringify({ rate_limit: { primary_window: { used_percent: 90, limit_window_seconds: 18000 } }, rate_limit_reset_credits: { available_count: posts.length ? 0 : count } })); }
		assert.ok(url.endsWith("/rate-limit-reset-credits"), "no unexpected HTTP destinations");
		return new Response(JSON.stringify({ credits: ["first-credit", "selected-credit"].map(id => ({ id, status: "available", reset_type: "codex_rate_limits", expires_at: expiry })) }));
	};
	const pi = { registerCommand: (name: string, command: { handler(args: string, ctx: ExtensionCommandContext): Promise<void> }) => commands.set(name, command),
		registerShortcut: (key: string, shortcut: ShortcutRegistration) => shortcuts.set(key, shortcut),
		on: (name: string, handler: (event: unknown, ctx: ExtensionContext) => Promise<void> | void) => {
			const list = events.get(name) ?? []; list.push(handler); events.set(name, list);
		}, registerFlag: () => {}, registerMessageRenderer: () => {}, registerEntryRenderer: () => {},
		getThinkingLevel: () => "off", events: { on: () => () => {} }, exec: () => { throw new Error("external execution forbidden"); },
	} as unknown as ExtensionAPI;
	const ctx = { cwd: root, hasUI: true, mode: "tui", model: { provider: "openai-codex", id: "synthetic" }, isIdle: () => true,
		getContextUsage: () => undefined,
		sessionManager: { getSessionId: () => session, getEntries: () => [] }, modelRegistry: { getProviderAuth: async (provider: string) => {
			assert.equal(provider, "openai-codex");
			const token = `header.${Buffer.from(JSON.stringify({ "https://api.openai.com/auth": { chatgpt_account_id: account } })).toString("base64url")}.signature`;
			await beforeAuth();
			return { auth: { apiKey: token } };
		} }, ui: { getEditorComponent: () => undefined, setEditorComponent: () => { mounts++; },
			setHeader: (factory?: (tui: TUI, theme: Theme) => Component & { dispose?(): void }) => { factory?.(tui, ctx.ui.theme).dispose?.(); },
			setFooter: (factory?: (tui: TUI, theme: Theme, data: unknown) => Component) => { footer = factory?.(tui, ctx.ui.theme, {}); },
			setWidget: () => {}, setWorkingVisible: () => {}, notify: (text: string) => { notices.push(text); },
			theme: { name: "dark", appearance: "dark", fg: (_color: string, text: string) => text }, getAllThemes: () => [], setTheme: () => ({ success: false }),
			select: (title: string, options: string[]) => {
				assert.equal(open, false, "custom overlay must close BEFORE any workflow dialog");
				const index = dialogs.length; dialogs.push({ title, options }); return answer(title, options, index);
			},
			custom: async (factory: (tui: unknown, theme: unknown, keys: unknown, done: (result: unknown) => void) => Component) => {
				open = true; overlays++;
				let result: unknown;
				const mounted = factory({ terminal: { rows: 40 }, requestRender: () => { if (panel) onRender(panel.render(120).join("\n")); } }, ctx.ui.theme, undefined, value => { result = value; open = false; });
				panel = mounted;
				views.push(mounted.render(120).join("\n"));
				const act = nextAction;
				nextAction = false;
				if (act) await beforeAction();
				if (!act) mounted.handleInput?.("\x1b");
				else if (mounted.render(120).join("\n").includes("Control Center")) {
					for (let i = 0; i < 8; i++) mounted.handleInput?.("\x1b[B");
					for (let i = 0; i < 100 && !mounted.render(120).join("\n").includes("Use or check banked reset"); i++)
						await new Promise<void>(resolve => setImmediate(resolve));
					assert.match(mounted.render(120).join("\n"), /Use or check banked reset/);
					mounted.handleInput?.("\x1b[C"); mounted.handleInput?.("\x1b[H"); mounted.handleInput?.("\x1b[B"); mounted.handleInput?.("\r");
				} else { assert.match(mounted.render(120).join("\n"), /u use\/check reset/); mounted.handleInput?.("u"); }
				assert.equal(open, false, "action must produce a completion intent, not nested inline confirmation");
				return result;
			},
		} } as unknown as ExtensionCommandContext;
	const lifecycle = async (name: string) => {
		for (const handler of events.get(name) ?? []) if (handler.toString().includes("idleUsageRefresh")) await handler({}, ctx);
	};
	try {
		await registerResetRuntime(pi, { ...options, agentDir: () => root, readActiveProfile: () => Promise.resolve(undefined),
			editorSettingsStore: { path: "/unused", save: () => Promise.resolve(), load: () => Promise.resolve({
				version: 1, enabled: false, editorMode: "simple", headerVariant: "osdy-theme", mascot: "current", workingTreeEnabled: false,
			}) } });
		await lifecycle("session_start");
	} catch (error) { globalThis.fetch = previousFetch; if (previousDir === undefined) delete process.env.PI_CODING_AGENT_DIR; else process.env.PI_CODING_AGENT_DIR = previousDir; throw error; }
	return { root, posts, dialogs, notices, views, expiry,
		emit: async (name: string, event: unknown) => { for (const handler of events.get(name) ?? []) await handler(event, ctx); },
		enable: () => commands.get("osdy-pi")!.handler("enable", ctx),
		footer: () => footer?.render(120).join("\n") ?? "", renders: () => renders, mounts: () => mounts,
		quotaReads: () => quotaReads, overlays: () => overlays,
		open: (surface = "usage") => { nextAction = true; return commands.get(surface)!.handler("", ctx); },
		view: (shortcut = false) => { nextAction = false; return shortcut
			? shortcuts.get("ctrl+alt+u")!.handler(ctx) : commands.get("usage")!.handler("", ctx); },
		panel: () => panel?.render(120).join("\n") ?? "",
		beforeAuth: (next: typeof beforeAuth) => { beforeAuth = next; },
		onRender: (next: typeof onRender) => { onRender = next; },
		beforeAction: (next: typeof beforeAction) => { beforeAction = next; },
		setAnswer: (next: typeof answer) => { answer = next; }, setAccount: () => { account = "next-account"; },
		setSession: () => { session = "next-session"; }, setUnknown: () => { unknown = true; },
		setRefreshFailure: () => { refreshFails = true; }, setCount: (next: number) => { count = next; },
		setPost: (next: typeof onPost) => { onPost = next; }, shutdown: () => lifecycle("session_shutdown"),
		replace: () => lifecycle("session_start"),
		close: async () => { await lifecycle("session_shutdown"); globalThis.fetch = previousFetch;
			if (previousDir === undefined) delete process.env.PI_CODING_AGENT_DIR; else process.env.PI_CODING_AGENT_DIR = previousDir; },
	};
}

void test("generation lifecycle uses delta-only estimates and final event usage without remounting", async () => {
	let now = 0;
	const f = await resetRuntimeFixture(undefined, { generationClock: () => now });
	const message = { role: "assistant", usage: { output: 80, reasoning: 40 }, stopReason: "stop" };
	const delta = (type: string, text: string) => f.emit("message_update", {
		message, assistantMessageEvent: { type, delta: text, partial: message },
	});
	try {
		await f.enable();
		const mounts = f.mounts();
		await f.emit("message_start", { message });
		assert.match(f.footer(), /tok\/s …/);
		now = 5000; await delta("thinking_delta", "abcd");
		now = 6000; await delta("text_delta", "abcd");
		await delta("toolcall_delta", "abcd");
		assert.match(f.footer(), /≈3\.0 tok\/s/);
		await delta("text_end", "not counted");
		assert.match(f.footer(), /≈3\.0 tok\/s/);
		now = 7000; await f.emit("message_end", { message });
		assert.match(f.footer(), /40\.0 tok\/s/);
		assert.doesNotMatch(f.footer(), /≈|tok ↑/);
		await f.emit("message_start", { message: { role: "toolResult" } });
		assert.match(f.footer(), /40\.0 tok\/s/);
		await f.emit("agent_end", {});
		assert.match(f.footer(), /40\.0 tok\/s/);
		assert.equal(f.mounts(), mounts);
		assert.ok(f.renders() > 0);
		await f.emit("message_start", { message });
		await delta("text_delta", "abcd"); now += 1000;
		await f.emit("message_end", { message: { ...message, stopReason: "aborted" } });
		assert.match(f.footer(), /tok\/s —/);
		await f.emit("message_start", { message });
		await delta("text_delta", "abcd"); now += 1000;
		await delta("error", "ignored");
		assert.match(f.footer(), /tok\/s —/);
		await f.emit("message_end", { message });
		assert.match(f.footer(), /tok\/s —/);
		await f.emit("message_start", { message });
		await delta("text_delta", "abcd"); now += 1000;
		await f.emit("agent_end", {});
		assert.match(f.footer(), /tok\/s —/);
		await f.emit("message_start", { message });
		await delta("text_delta", "abcd"); now += 1000;
		await f.replace(); await f.enable();
		await f.emit("message_end", { message });
		assert.match(f.footer(), /tok\/s —/);
		await f.emit("message_start", { message });
		await delta("text_delta", "abcd"); now += 1000;
		await f.shutdown();
		await f.emit("message_end", { message });
		assert.match(f.footer(), /tok\/s —/);
	} finally { await f.close(); }
});

void test("registered active surfaces select and Cancel-first confirm before exactly one mocked POST", async () => {
	for (const surface of ["usage", "osdyConfig"]) {
		const f = await resetRuntimeFixture();
		try {
			await f.open(surface);
			assert.equal(f.posts.length, 1, JSON.stringify({ surface, dialogs: f.dialogs, notices: f.notices }));
			assert.equal(f.posts[0]?.credit_id, "selected-credit");
			assert.match(f.posts[0]?.redeem_request_id ?? "", /^[0-9a-f-]{36}$/i);
			assert.deepEqual(f.dialogs[1]?.options, ["Cancel", "Use reset"]);
			assert.match(f.dialogs[1]?.title ?? "", /active Codex account.*one banked reset/i);
			assert.ok(f.dialogs[1]?.title.includes(new Date(f.expiry).toLocaleString()));
			assert.doesNotMatch(JSON.stringify(f.dialogs) + f.notices.join(""), /synthetic-account|selected-credit|redeem_request|private-/);
			assert.ok(f.quotaReads() >= 3, "fresh pre-confirm/post-confirm/result snapshots");
			assert.equal(f.overlays(), surface === "usage" ? 2 : 1);
		} finally { await f.close(); }
	}
});

void test("registered Cancel and ESC at either dialog never POST", async () => {
	for (const cancelAt of [0, 1]) for (const answer of [undefined, "Cancel"]) {
		const f = await resetRuntimeFixture();
		try { f.setAnswer((_title, options, index) => Promise.resolve(index === cancelAt ? answer : options.at(-1))); await f.open(); assert.equal(f.posts.length, 0); }
		finally { await f.close(); }
	}
});


const profileLabels = await import("./profile-label.js");
const { showControlCenter } = await import("./control-center.js");

void test("unknown pending across registration reload only checks the same durable request after explicit confirmation", async () => {
	const first = await resetRuntimeFixture();
	first.setUnknown();
	try { await first.open(); assert.equal(first.posts.length, 1); assert.match(first.notices.join(""), /Outcome unknown; do not start another reset/); }
	finally { await first.close(); }
	const next = await resetRuntimeFixture(first.root);
	try {
		next.setCount(0); assert.equal(next.posts.length, 0, "no startup replay");
		next.setAnswer(() => Promise.resolve("Cancel"));
		await next.open(); assert.equal(next.posts.length, 0);
		assert.deepEqual(next.dialogs[0]?.options, ["Cancel", "Check pending attempt"]);
		next.setAnswer((_title, options) => Promise.resolve(options[1]));
		await next.open("osdyConfig");
		assert.deepEqual(next.posts, first.posts, "same UUID and selected credit, not a new attempt");
		assert.equal(next.dialogs.length, 2, "recovery does not select a fresh reset");
		assert.match(next.dialogs[1]?.title ?? "", /same previous request.*not a new attempt/);
	} finally { await next.close(); }
});

void test("active account/session changes at old-panel activation or during confirmation cannot POST", async () => {
	for (const boundary of ["panel", "confirmation"] as const) for (const change of ["account", "session", "generation"] as const) {
		const f = await resetRuntimeFixture();
		const mutate = () => change === "generation" ? f.replace() : Promise.resolve(change === "account" ? f.setAccount() : f.setSession());
		try {
			if (boundary === "panel") f.beforeAction(mutate);
			else f.setAnswer(async (_title, options, index) => { if (index === 1) await mutate(); return options.at(-1); });
			await f.open(); assert.equal(f.posts.length, 0, `${boundary}/${change}`);
			assert.equal(f.overlays(), 1, "stale panels exit instead of reopening on new identity");
		} finally { await f.close(); }
	}
});

void test("one registration shares busy guard across Usage and Control Center while human selection awaits", async () => {
	const f = await resetRuntimeFixture();
	let finish: () => void = () => {};
	let entered: () => void = () => {};
	const reached = new Promise<void>(resolve => { entered = resolve; });
	f.setAnswer((_title, options, index) => index === 0 ? new Promise(resolve => { finish = () => resolve(options.at(-1)); entered(); }) : Promise.resolve(options.at(-1)));
	try {
		const first = f.open(); await reached;
		await f.open("osdyConfig");
		assert.equal(f.posts.length, 0); assert.equal(f.dialogs.length, 1);
		assert.match(f.notices.join(""), /already in progress/);
		finish(); await first; assert.equal(f.posts.length, 1);
	} finally { finish(); await f.close(); }
});

void test("shutdown or new session after dispatch aborts the HTTP attempt as unknown, preserving pending for explicit recovery", async () => {
	for (const boundary of ["shutdown", "session"] as const) {
		const f = await resetRuntimeFixture();
		f.setPost(async signal => { await (boundary === "shutdown" ? f.shutdown() : f.replace()); assert.equal(signal?.aborted, true); throw new Error("private-dispatch-error"); });
		try { await f.open(); assert.equal(f.posts.length, 1); assert.match(f.notices.join(""), /Outcome unknown.*Quota refresh failed/); assert.equal(f.overlays(), 1); }
		finally { await f.close(); }
		const next = await resetRuntimeFixture(f.root);
		try { next.setAnswer(() => Promise.resolve("Cancel")); await next.open(); assert.deepEqual(next.dialogs[0]?.options, ["Cancel", "Check pending attempt"]); assert.equal(next.posts.length, 0); }
		finally { await next.close(); }
	}
});

void test("confirmed result refreshes the reopened view; failed refresh cannot turn it into failure or expose backend errors", async () => {
	for (const fails of [false, true]) {
		const f = await resetRuntimeFixture();
		try {
			if (fails) f.setRefreshFailure();
			await f.open();
			assert.equal(f.posts.length, 1);
			assert.match(f.notices.join(""), /Banked reset consumed/);
			if (fails) assert.match(f.notices.join(""), /Quota refresh failed/);
			else assert.match(f.views.at(-1) ?? "", /Banked resets: 0/);
			assert.doesNotMatch(f.notices.join("") + f.views.join(""), /private-|reset failed/i);
		} finally { await f.close(); }
	}
});

function runtimeGate() {
	let resolve: () => void = () => {};
	const promise = new Promise<void>(done => { resolve = done; });
	return { promise, resolve };
}

for (const fails of [false, true]) {
	void test(`post-reset refresh ${fails ? "error" : "success"} cannot overwrite newer quota after delayed auth revalidation`, async () => {
		const authEntered = runtimeGate();
		const releaseAuth = runtimeGate();
		const currentPublished = runtimeGate();
		const snapshot = (count: number): CodexUsageSnapshot => ({ fetchedAt: count, planType: "plus",
			ordinaryUsageAllowed: true, buckets: [], credits: undefined, bankedResetCount: count,
			bankedResetDetails: count === 2 ? [{ id: "selected-credit", expiresAt: Date.parse("2099-07-17T12:30:00Z") }] : [] });
		let holdOldResult = true;
		let oldSignal: AbortSignal | undefined;
		const f = await resetRuntimeFixture(undefined, { fetchCodexUsage: (_auth, { signal }) => {
			if (!f.posts.length) return Promise.resolve(snapshot(2));
			if (holdOldResult) {
				holdOldResult = false; oldSignal = signal;
				f.beforeAuth(() => {
					f.beforeAuth(() => Promise.resolve());
					authEntered.resolve();
					return releaseAuth.promise;
				});
				return fails ? Promise.reject(new Error("private-old-refresh-error")) : Promise.resolve(snapshot(0));
			}
			return Promise.resolve(snapshot(7));
		} });
		f.onRender(view => { if (/Banked resets: 7/.test(view)) currentPublished.resolve(); });
		const old = f.open("osdyConfig");
		try {
			await authEntered.promise;
			assert.equal(oldSignal?.aborted, false, "old refresh reached its awaited publication auth check");
			await f.view();
			await currentPublished.promise;
			assert.equal(oldSignal?.aborted, true, "new usage refresh supersedes the auth-blocked reset refresh");
			assert.match(f.panel(), /Banked resets: 7/, "new quota is published before old auth resumes");
			releaseAuth.resolve();
			await old;
			assert.match(f.panel(), /Banked resets: 7/, `old ${fails ? "error" : "success"} must not replace current quota`);
			assert.equal(f.posts.length, 1);
			assert.match(f.notices.join(""), /Banked reset consumed.*Quota refresh failed/);
			assert.doesNotMatch(f.notices.join(""), /private-/);
		} finally { releaseAuth.resolve(); await old; await f.close(); }
	});
}

for (const shortcut of [false, true]) for (const boundary of ["replace", "session-id", "shutdown"] as const) {
	void test(`${shortcut ? "usage shortcut" : "/usage"} cannot mount after ${boundary} during delayed reset binding`, async () => {
		const f = await resetRuntimeFixture();
		const authEntered = runtimeGate();
		const releaseAuth = runtimeGate();
		f.beforeAuth(() => {
			f.beforeAuth(() => Promise.resolve());
			authEntered.resolve();
			return releaseAuth.promise;
		});
		const opening = f.view(shortcut);
		try {
			await authEntered.promise;
			assert.equal(f.overlays(), 0, "binding is held before custom UI mounting");
			if (boundary === "replace") await f.replace();
			else if (boundary === "session-id") f.setSession();
			else await f.shutdown();
			releaseAuth.resolve();
			await opening;
			assert.equal(f.overlays(), 0, "stale opening must not mount an overlay or refresh its quota");
			assert.equal(f.quotaReads(), 0);
			assert.equal(f.posts.length, 0);
		} finally { releaseAuth.resolve(); await opening; await f.close(); }
	});
}

void test("registered Account factory isolates profile preview from active quota and cancels SDK overlay requests", async () => {
	const { bindControlCenterAccount } = await import("./control-center-account.js");
	const { registerOsdyPi } = await import("./runtime.js");
	const previous = process.env.PI_CODING_AGENT_DIR;
	process.env.PI_CODING_AGENT_DIR = mkdtempSync(join(tmpdir(), "osdy-preview-runtime-"));
	const commands = new Map<string, { handler(args: string, ctx: ExtensionCommandContext): Promise<void> }>();
	const notices: string[] = []; const queries: string[] = []; const views: string[] = [];
	let signal: AbortSignal | undefined; let finish = () => {}; let factoryCalls = 0; let renderCount = 0;
	let current: (() => boolean) | undefined;
	const pi = { registerCommand: (name: string, command: { handler(args: string, ctx: ExtensionCommandContext): Promise<void> }) => commands.set(name, command),
		registerShortcut: () => {}, on: () => {}, registerFlag: () => {}, registerMessageRenderer: () => {}, registerEntryRenderer: () => {}, events: { on: () => () => {} },
		exec: () => { throw new Error("launcher or provider forbidden"); } } as unknown as ExtensionAPI;
	const ctx = { cwd: process.cwd(), mode: "tui", hasUI: true, isIdle: () => true, waitForIdle: () => Promise.resolve(), ui: {
		notify: (text: string) => notices.push(text),
		setEditorComponent: () => {}, setHeader: () => {}, setFooter: () => {}, setWidget: () => {}, setWorkingVisible: () => {},
		theme: { name: "dark", appearance: "dark", fg: (_color: string, text: string) => text }, getAllThemes: () => [], setTheme: () => ({ success: false }),
		custom: async (factory: (tui: unknown, theme: unknown, keys: unknown, done: (result: unknown) => void) => Component & { handleInput(data: string): void }) => {
			let result: unknown;
			const panel = factory({ terminal: { rows: 40 }, requestRender: () => { renderCount++; } }, undefined, undefined, value => { result = value; });
			for (let i = 0; i < 7; i++) panel.handleInput("\x1b[B");
			for (let i = 0; i < 16; i++) await Promise.resolve();
			panel.handleInput("\x1b[C"); views.push(panel.render(140).join("\n"));
			panel.handleInput("\r"); for (let i = 0; i < 16; i++) await Promise.resolve();
			panel.handleInput("\r"); for (let i = 0; i < 16; i++) await Promise.resolve();
			views.push(panel.render(140).join("\n"));
			panel.handleInput("\x1b"); assert.equal(result, undefined, "Back does not finish custom UI");
			panel.handleInput("\x1b"); return result;
		},
	} } as unknown as ExtensionCommandContext;
	try {
		await registerOsdyPi(pi, { accountFactory: (context, _refresh, render, _backend, options) => {
			factoryCalls++; current = options?.isCurrent;
			return bindControlCenterAccount(context, () => { throw new Error("active refresh forbidden"); }, render,
				{ profiles: () => Promise.resolve(["work"]), run: () => Promise.resolve({ code: 0, stdout: "No default account.", stderr: "" }),
					activate: () => { throw new Error("activation forbidden"); } },
				{ ...options, usage: (profile, requestSignal) => { queries.push(profile); signal = requestSignal;
					return new Promise(resolve => { finish = () => resolve({ status: "unavailable", profile, checkedAt: 1000, reason: "remote-usage-unavailable" }); }); } });
		} });
		const handler = commands.get("osdyConfig"); assert.ok(handler); await handler.handler("", ctx);
		const before = renderCount; finish(); for (let i = 0; i < 16; i++) await Promise.resolve();
		assert.equal(factoryCalls, 1); assert.equal(current?.(), true); assert.deepEqual(queries, ["work"]);
		assert.match(views[0] ?? "", /View usage/); assert.match(views[1] ?? "", /Querying stored-profile Codex usage: work/);
		assert.equal(signal?.aborted, true); assert.equal(renderCount, before); assert.deepEqual(notices, []);
	} finally {
		if (previous === undefined) delete process.env.PI_CODING_AGENT_DIR; else process.env.PI_CODING_AGENT_DIR = previous;
	}
});

void test("Control Center refuses RPC, print, JSON and missing UI without custom or mutation", async () => {
 for (const mode of ["rpc", "print", "json", "tui"] as const) {
  const notices: string[] = [];
  await showControlCenter({
   mode, hasUI: mode === "rpc",
   ui: {
    notify: (message) => { notices.push(message); },
    custom: () => { throw new Error("custom must not run"); },
    get theme(): Theme { throw new Error("theme must not be read"); },
    getAllThemes: () => { throw new Error("themes must not be read"); },
    setTheme: () => { throw new Error("settings must not mutate"); },
   },
  });
  assert.match(notices.join("\n"), /interactive terminal UI/);
 }
});

void test("runtime forwards tool identity and unknown start args to the working controller", () => {
	const source = readFileSync(new URL("./runtime.ts", import.meta.url), "utf8");
	assert.match(source, /controller\.onToolStart\(event\.toolName, event\.toolCallId, event\.args\)/);
	assert.match(source, /controller\.onToolEnd\(event\.toolCallId\)/);
});

void test("Control Center reports custom UI startup errors", async () => {
 const notices: string[] = [];
 await showControlCenter({
  mode: "tui", hasUI: true,
  ui: {
   notify: (message) => { notices.push(message); },
   custom: () => Promise.reject(new Error("overlay failed")),
   get theme(): Theme { throw new Error("factory not invoked"); },
   getAllThemes: () => [], setTheme: () => ({ success: false }),
  },
 });
 assert.match(notices.join("\n"), /overlay failed/);
});

const { PLUGIN_EVENTS, subscribeQuestionPromptAudioNotification } =
	await import("./plugin-events.js");
const {
	createActiveSessionRefresh,
	getOsdyCommandCompletions,
	handleAgentsSetupCommand,
	refreshCodexUsage,
 registerOsdyPi,
 handleTodoProviderCommand,
 applyVisualPreference,
 withEditorMountHold,
} = await import("./runtime.js");

void test("shared visual actions apply immediately, save the complete settings, and keep live state on save failure", async () => {
	for (const enabled of [true, false]) {
		for (const action of [
			{ kind: "header", value: "neon" }, { kind: "mascot", value: "bts" },
			{ kind: "mascot", value: "osdy-halloween" },
			{ kind: "editor", value: "simple" }, { kind: "editor", value: "extended" },
			{ kind: "editor", value: "auto" },
		] as const satisfies readonly VisualPreferenceAction[]) {
			const state: OsdyState = { enabled, headerVariant: "osdy-theme", mascot: "current", editorMode: "auto",
				editorEffective: true, smallMode: false, workingTreeEnabled: false, workingTreePlacement: "aboveEditor",
				codexUsage: { kind: "idle" }, fallbackEditorFactory: undefined, tui: undefined };
			const tree: WorkingTreeState = { enabled: false, visible: false, loading: false, snapshot: null, error: undefined, tui: undefined };
			const working: WorkingWidgetState = { active: false, activity: "thinking", label: "Working", frame: 0, timer: undefined, tui: undefined };
			let mounts = 0;
			let editor: unknown = "unchanged";
			const ctx = { hasUI: true, ui: { setHeader: () => { mounts++; }, setFooter: () => {}, setWidget: () => {},
				setWorkingVisible: () => {}, setEditorComponent: (factory: unknown) => { editor = factory; } } } as unknown as ExtensionContext;
			const writes: GlobalEditorSettings[] = [];
			let finish: () => void = () => {};
			const pending = applyVisualPreference(action, {} as ExtensionAPI, ctx, state, working, tree,
				{ path: "/unused", load: () => Promise.reject(new Error("must not load")), save: (settings) => {
					writes.push(settings);
					return new Promise<void>((resolve) => { finish = resolve; });
				} });
			assert.equal(action.kind === "header" ? state.headerVariant : action.kind === "mascot" ? state.mascot : state.editorMode, action.value);
			assert.equal(mounts, enabled && action.kind !== "editor" ? 1 : 0);
			if (action.kind === "editor" && action.value === "simple" && enabled) assert.equal(editor, undefined, "simple uses Pi's native editor");
			assert.deepEqual(writes, [{ version: 1, enabled, headerVariant: state.headerVariant, mascot: state.mascot,
				editorMode: state.editorMode, workingTreeEnabled: false }]);
			finish();
			assert.equal(await pending, true);
			assert.equal(await applyVisualPreference(action, {} as ExtensionAPI, ctx, state, working, tree,
				{ path: "/unused", load: () => Promise.reject(new Error("must not load")), save: () => Promise.reject(new Error("disk full")) }), false);
			assert.equal(action.kind === "header" ? state.headerVariant : action.kind === "mascot" ? state.mascot : state.editorMode, action.value);
			if (enabled) {
				state.tui = { terminal: { columns: 20, rows: 6 }, requestRender: () => {}, hasOverlay: () => false } as unknown as TUI;
				await applyVisualPreference({ kind: "editor", value: "extended" }, {} as ExtensionAPI, ctx, state, working, tree,
					{ path: "/unused", load: () => Promise.reject(new Error("must not load")), save: () => Promise.resolve() });
				assert.equal(state.editorMode, "extended");
				assert.equal(state.smallMode, true);
				assert.equal(state.editorEffective, false, "small terminals retain the native editor even with extended selected");
			}
		}
	}
});

const { isSmallResponsiveMode } = await import("./utils.js");
const { createResponsiveCoordinator, reconcileResponsiveUi, disableOsdyPi } = await import("./runtime-helpers.js");

const { setAppearanceProviders, inspectAppearanceSettings } = await import("./appearance-provider-settings.js");

async function focusFixture(options: { appearance?: { agentDir: string; home: string }; boundary?: boolean; throwApply?: boolean; synchronousThrow?: boolean; underlyingOverlay?: boolean; startupFailure?: boolean; registered?: boolean; shortcut?: boolean; idle?: boolean; todoDir?: string; reloadFails?: boolean; visualsEnabled?: boolean; legacyEnabled?: boolean;
	accountFactory?: NonNullable<Parameters<typeof registerOsdyPi>[1]>["accountFactory"] } = {}) {
	let input: (data: string) => void = () => {};
	const columns = options.boundary
		? Array.from({ length: 300 }, (_, i) => i + 1).find(width =>
			isSmallResponsiveMode("osdy-theme", width, 40) !== isSmallResponsiveMode("neon", width, 40))!
		: 300;
	let width = columns;
	const terminal: Terminal = {
		get columns() { return width; }, rows: 40, kittyProtocolActive: false,
		start: (onInput) => { input = onInput; }, stop: () => {}, drainInput: async () => {},
		write: () => {}, moveBy: () => {}, hideCursor: () => {}, showCursor: () => {},
		clearLine: () => {}, clearFromCursor: () => {}, clearScreen: () => {}, setTitle: () => {}, setProgress: () => {},
	};
	const tui = new TuiMainScreen(terminal);
	const editorArea = new Container();
	tui.addChild(editorArea);
	const makeEditor = () => ({ focused: false, input: "", render: () => [], invalidate: () => {},
		handleInput(data: string) { this.input += data; } });
	const editor = makeEditor();
	const editors = [editor];
	editorArea.addChild(editor);
	tui.setFocus(editor);
	const smallMode = isSmallResponsiveMode("osdy-theme", columns, 40);
	const fallback = () => { throw new Error("fixture tracks factories without invoking the captured fallback"); };
	const editorFactories: unknown[] = [];
	const state: OsdyState = { enabled: true, headerVariant: "osdy-theme", mascot: "current", editorMode: "auto",
		editorEffective: !smallMode, smallMode, workingTreeEnabled: false, workingTreePlacement: "aboveEditor",
		codexUsage: { kind: "idle" }, fallbackEditorFactory: fallback, tui };
	const tree: WorkingTreeState = { enabled: false, visible: false, loading: false, snapshot: null, error: undefined, tui: undefined };
	const working: WorkingWidgetState = { active: false, activity: "thinking", label: "Working", frame: 0, timer: undefined, tui: undefined };
	let resolveSave: () => void = () => {};
	let rejectSave: () => void = () => {};
	const store = { path: "/unused", load: () => Promise.reject(new Error("must not load")), save: (settings: GlobalEditorSettings) => new Promise<void>((resolve, reject) => {
		writes.push(settings);
		resolveSave = resolve; rejectSave = () => reject(new Error("disk full"));
	}) };
	let panel: Component & { dispose?(): void };
	let handle: OverlayHandle;
	let otherHandle: OverlayHandle | undefined;
	let complete: (result?: unknown) => void = () => {};
	let current = true;
	let headerMounts = 0;
	let startupHeaderMounts = 0;
	const writes: GlobalEditorSettings[] = [];
	const appearanceWrites: boolean[] = [];
	let appearanceSettled = Promise.resolve();
	const tools: string[] = [];
	const registeredCommands: string[] = [];
	const registeredShortcuts: string[] = [];
	let replacements = 0;
	let closes = 0;
	const notices: string[] = [];
	const theme = { name: "dark", appearance: "dark" as const, fg: (_color: string, text: string) => text };
	const lifecycle: string[] = [];
	let idle = options.idle ?? true;
	const ctx = { cwd: options.appearance?.home ?? options.todoDir ?? "/synthetic", isIdle: () => idle,
		hasUI: true, mode: "tui", modelRegistry: { getProviderAuth: () => Promise.resolve(undefined) }, ui: {
		theme, getAllThemes: () => [{ name: "dark", path: undefined }],
		setTheme: () => { theme.name = "light"; panel.invalidate(); return { success: true }; },
		notify: (message: string) => { notices.push(message); },
		setHeader: (factory?: (tui: TUI, theme: Theme) => Component & { dispose?(): void }) => {
			headerMounts++;
			factory?.(tui, theme as Theme).dispose?.(); // Bind the runtime TUI without leaving animation timers.
		}, setFooter: () => {}, setWidget: () => {}, setWorkingVisible: () => {},
		getEditorComponent: () => fallback,
		setEditorComponent: (factory?: unknown) => {
			lifecycle.push("editor-mount");
			editorFactories.push(factory);
			replacements++;
			const replacement = makeEditor();
			editors.push(replacement);
			editorArea.clear(); editorArea.addChild(replacement);
			tui.setFocus(replacement); // Pi's public setCustomEditorComponent always does this.

		},
		custom: async <T,>(factory: Parameters<ExtensionContext["ui"]["custom"]>[0], customOptions: Parameters<ExtensionContext["ui"]["custom"]>[1]) => {
			if (options.startupFailure) throw new Error("factory failed");
			return new Promise<T>((resolve) => {
				// SDK done hides the top overlay BEFORE disposal. Manual handle.hide is not cancellation.
				const finish = (result: unknown) => {
					lifecycle.push("done"); closes++; tui.hideOverlay(); lifecycle.push("hidden");
					resolve(result as T); panel.dispose?.(); lifecycle.push("disposed");
				};
				complete = result => finish(result);
				panel = factory(tui, theme as Theme, undefined as never, finish) as typeof panel;
				const overlayOptions = customOptions?.overlayOptions;
				handle = tui.showOverlay(panel, typeof overlayOptions === "function" ? overlayOptions() : overlayOptions);
				customOptions?.onHandle?.(handle);
			});
		},
	} };
	tui.start();
	const runtimeCtx = ctx as unknown as ExtensionContext;
	const commandCtx = { ...ctx,
		waitForIdle: () => { lifecycle.push("idle"); idle = true; return Promise.resolve(); },
		reload: () => {
			lifecycle.push("reload"); return options.reloadFails ? Promise.reject(new Error("reload failed")) : Promise.resolve();
		},
	} as unknown as ExtensionCommandContext;
	const coordinator = createResponsiveCoordinator({} as ExtensionAPI, runtimeCtx, state, tree);
	coordinator.start();
	const showDirect = () => withEditorMountHold({} as ExtensionAPI, runtimeCtx, state, tree, async () => { await showControlCenter(runtimeCtx, {
		snapshot: () => state,
		apply: action => {
			if (options.synchronousThrow) {
				throw new Error("UI apply failed");
			}
			if (options.throwApply) return Promise.reject(new Error("UI apply failed"));
			if (action.kind === "visuals") throw new Error("Appearance requires the registered runtime transaction");
			return applyVisualPreference(action, {} as ExtensionAPI, runtimeCtx, state, working, tree, store);
		},
	}); }, () => current);
	let shutdown = () => {};
	let transition = () => Promise.resolve();
	let reopen = showDirect;
	if (options.registered) {
		coordinator.stop();
		const commands = new Map<string, { handler(args: string, ctx: ExtensionCommandContext): Promise<void> }>();
		const shortcuts = new Map<string, ShortcutRegistration>();
		const handlers = new Map<string, Array<(event: unknown, ctx: ExtensionContext) => Promise<void> | void>>();
		const pi = { registerCommand: (name: string, command: { handler(args: string, ctx: ExtensionCommandContext): Promise<void> }) => { registeredCommands.push(name); commands.set(name, command); },
			registerShortcut: (key: string, shortcut: ShortcutRegistration) => { registeredShortcuts.push(key); shortcuts.set(key, shortcut); },
			on: (name: string, handler: (event: unknown, ctx: ExtensionContext) => Promise<void> | void) => {
				const registered = handlers.get(name) ?? []; registered.push(handler); handlers.set(name, registered);
			},
			registerFlag: () => {}, registerMessageRenderer: () => {}, registerEntryRenderer: () => {}, events: { on: () => () => {} },
			registerTool: (tool: { name: string }) => tools.push(tool.name),
			exec: () => Promise.resolve({ code: 0, killed: false, stderr: "", stdout: JSON.stringify(ctx.cwd) }),
		} as unknown as ExtensionAPI;
		const previousDir = process.env.PI_CODING_AGENT_DIR;
		const previousConfig = process.env.XDG_CONFIG_HOME;
		mkdirSync(".pi-dev", { recursive: true });
		const syntheticAgentDir = mkdtempSync(join(process.cwd(), ".pi-dev", "osdy-modal-runtime-"));
		process.env.PI_CODING_AGENT_DIR = syntheticAgentDir;
		process.env.XDG_CONFIG_HOME = syntheticAgentDir;
		try {
			await registerOsdyPi(pi, { ...(options.accountFactory ? { accountFactory: options.accountFactory } : {}),
				agentDir: () => options.appearance?.agentDir ?? syntheticAgentDir,
				inspectAppearanceSettings: options.appearance ? inspectAppearanceSettings : () => undefined,
				setAppearanceProviders: options.appearance
					? value => {
						const applying = setAppearanceProviders({ ...value, home: options.appearance!.home, env: {} });
						appearanceSettled = applying.then(() => {}, () => {});
						return applying;
					}
					: value => new Promise((resolve, reject) => {
						appearanceWrites.push(value.visualsEnabled);
						resolveSave = () => resolve({ changed: true }); rejectSave = () => reject(new Error("disk full"));
					}),
				readActiveProfile: () => Promise.resolve(undefined), editorSettingsStore: {
				...store, load: () => Promise.resolve({ version: 1, enabled: options.legacyEnabled ?? true, visualsEnabled: options.visualsEnabled ?? true, editorMode: "auto", headerVariant: "osdy-theme",
					mascot: "current", workingTreeEnabled: false }),
			} });
		} finally {
			if (previousDir === undefined) delete process.env.PI_CODING_AGENT_DIR; else process.env.PI_CODING_AGENT_DIR = previousDir;
			if (previousConfig === undefined) delete process.env.XDG_CONFIG_HOME; else process.env.XDG_CONFIG_HOME = previousConfig;
		}
		// TODO contributes a lifecycle listener before runtime; do not mistake it for startup.
		const runtimeLifecycleIndex = tools.includes("todo") ? 3 : 2;
		shutdown = () => { void handlers.get("session_shutdown")?.[runtimeLifecycleIndex]?.({}, runtimeCtx); };
		if (options.shortcut) {
			try {
				assert.ok(shortcuts.has("ctrl+alt+o"), "Ctrl+Alt+O must open Control Center");
				assert.equal(shortcuts.has("f1"), false);
				assert.equal(shortcuts.has("f2"), false);
				assert.equal("reload" in runtimeCtx, false, "shortcuts receive only the base context");
				assert.equal("waitForIdle" in runtimeCtx, false, "shortcuts cannot wait through command-only hooks");
			} catch (error) { shutdown(); tui.stop(); throw error; }
		}
		await handlers.get("session_start")?.[runtimeLifecycleIndex]?.({}, runtimeCtx);
		startupHeaderMounts = headerMounts;
		replacements = 0;
		headerMounts = 0;
		transition = async () => { await handlers.get("session_start")?.[runtimeLifecycleIndex]?.({}, runtimeCtx); };
		reopen = options.shortcut
			? async () => { await shortcuts.get("ctrl+alt+o")!.handler(runtimeCtx); }
			: () => commands.get("osdyConfig")!.handler("", commandCtx);
	}
	if (options.underlyingOverlay) otherHandle = tui.showOverlay({ render: () => ["Other overlay"], invalidate: () => {} });
	const showing = reopen();
	await Promise.resolve();
	return { tui, showing, state, tree, notices, writes, appearanceWrites, tools, registeredCommands, registeredShortcuts, lifecycle, editorFactories, fallback, shutdown, transition, reopen, resize: (columns: number) => { width = columns; }, headerMounts: () => headerMounts, startupHeaderMounts,
		failFactory: () => withEditorMountHold({} as ExtensionAPI, runtimeCtx, state, tree,
			() => ctx.ui.custom(() => { throw new Error("factory callback failed"); }, { overlay: true })),
		invalidateRuntime: () => { current = false; state.editorMountHold = undefined; state.editorReconcilePending = false; coordinator.stop(); },
		disable: () => { state.enabled = false; disableOsdyPi(runtimeCtx, state); },
		reconcile: () => reconcileResponsiveUi({} as ExtensionAPI, runtimeCtx, state, tree), send: (data: string) => input(data), text: () => panel.render(100).join("\n"),
		focused: () => handle.isFocused(), replacements: () => replacements, closes: () => closes,
		resolveSave: () => resolveSave(), rejectSave: () => rejectSave(), complete: (result?: unknown) => complete(result),
		setIdle: (value: boolean) => { idle = value; }, settleAppearance: () => appearanceSettled,
		editors, mountedEditor: () => editors.find(candidate => editorArea.children.includes(candidate))!,
		other: () => otherHandle, cleanup: () => { shutdown(); coordinator.stop(); panel?.dispose?.(); handle?.hide(); otherHandle?.hide(); tui.stop(); } };
}
for (const shortcut of [false, true]) for (const closePending of [false, true]) {
	void test(`registered ${shortcut ? "Ctrl+Alt+O" : "command"} Account real TUI ${closePending ? "aborts pending preview and ignores late completion" : "renders selected profile quota before Escape restores mounted input"}`, async () => {
		const { bindControlCenterAccount } = await import("./control-center-account.js");
		const queries: string[] = []; const metadataCalls: string[][] = [];
		let signal: AbortSignal | undefined;
		let finish: (result: ProfileCodexUsageResult) => void = () => {};
		let factoryCalls = 0; let renders = 0; let activations = 0; let activeRefreshes = 0;
		const checkedAt = 1_900_000_000_000; const resetsAt = checkedAt / 1000 + 3600;
		const result: ProfileCodexUsageResult = {
			status: "ready", profile: "work", checkedAt,
			quotaSnapshot: { fetchedAt: checkedAt, planType: "plus", ordinaryUsageAllowed: true, credits: undefined,
				buckets: [{ id: "codex", label: "Codex", primary: { usedPercent: 37, windowMinutes: 300, resetsAt }, secondary: undefined }] },
		};
		const f = await focusFixture({ registered: true, shortcut, idle: false, accountFactory: (context, _refresh, render, _backend, options) => {
			factoryCalls++;
			return bindControlCenterAccount(context, () => { activeRefreshes++; throw new Error("active quota refresh forbidden"); }, render,
				{ profiles: () => Promise.resolve(["personal", "work"]),
					run: (args) => { metadataCalls.push([...args]); assert.deepEqual(args, ["account", "default"]);
						return Promise.resolve({ code: 0, stdout: "No default account.", stderr: "" }); },
					activate: () => { activations++; throw new Error("activation forbidden"); } },
				{ ...options, usage: (profile, requestSignal) => { queries.push(profile); signal = requestSignal;
					return new Promise(resolve => { finish = resolve; }); } });
		} });
		// Count actual TUI render requests, including any incorrectly resurrected preview.
		const requestRender = f.tui.requestRender.bind(f.tui);
		f.tui.requestRender = (...args) => { renders++; return requestRender(...args); };
		try {
			const mounted = f.mountedEditor();
			// Queue an editor replacement to exercise the registered runtime mount hold.
			chooseVisual(f, 3); f.resolveSave(); await flushFocus();
			assert.equal(f.replacements(), 0);
			f.send("\x1b[D");
			for (let i = 0; i < 4; i++) f.send("\x1b[B");
			await flushFocus(); await flushFocus();
			f.send("\x1b[C"); f.send("\x1b[H");
			// Select work's profile row; direct actions never add a second list.
			f.send("\x1b[B");
			assert.match(f.text(), /> work/);
			assert.match(f.text(), /v View usage/);
			assert.doesNotMatch(f.text(), /Actions \/ work/);
			assert.deepEqual(queries, [], "navigation must not query quota");
			f.send("v"); await flushFocus(); f.send("r"); f.send("\r"); await flushFocus();
			assert.deepEqual(queries, ["work"], "duplicate Enter while pending must not fetch again");
			assert.match(f.text(), /Querying stored-profile Codex usage: work/);
			assert.equal(f.focused(), true); assert.equal(f.mountedEditor(), mounted);
			assert.equal(signal?.aborted, false);
			if (!closePending) {
				finish(result); await flushFocus(); await flushFocus();
				const text = f.text();
				assert.match(text, /Stored-profile Codex usage checked/);
				assert.match(text, /Profile: work/); assert.ok(text.includes(`Session${String.fromCharCode(27)}[22m · 5h`));
				assert.match(text, /63% left · 37% used/);
				assert.match(text, /█+░+/);
				assert.ok(text.includes(`Local: ${new Date(resetsAt * 1000).toLocaleString()}`));
				assert.match(text, /Reset: resets in|Reset: reset time passed/);
				assert.match(text, /Refresh.*Back/);
				assert.ok(text.includes(`Checked: ${new Date(checkedAt).toLocaleString()} (local time)`));
				assert.doesNotMatch(text, /Confirm account action/);
			}
			f.lifecycle.length = 0;
			f.send(closePending ? "b" : "\x1b");
			assert.equal(f.closes(), 0, "quota Back keeps the overlay and editor hold");
			assert.match(f.text(), /> work/);
			assert.match(f.text(), /v View usage/);
			f.send("\x1b"); await f.showing;
			assert.deepEqual(f.lifecycle, ["done", "hidden", "disposed", "editor-mount"]);
			assert.equal(f.closes(), 1); assert.equal(f.replacements(), 1);
			assert.equal(f.tui.hasOverlay(), false); assert.equal(f.focused(), false);
			assert.notEqual(f.mountedEditor(), mounted);
			assertEditorContinuity(f);
			if (closePending) {
				assert.equal(signal?.aborted, true);
				const before = renders; const reads = metadataCalls.length;
				finish(result); await flushFocus(); await flushFocus();
				assert.equal(renders, before, "late completion must not repaint the disposed panel");
				assert.equal(metadataCalls.length, reads, "late completion must not reload preview metadata");
				assert.equal(f.text(), ""); assertEditorContinuity(f);
			}
			assert.equal(factoryCalls, 1); assert.equal(activations, 0); assert.equal(activeRefreshes, 0);
			assert.ok(metadataCalls.length > 0); assert.deepEqual(f.notices, []);
		} finally { f.tui.requestRender = requestRender; f.cleanup(); }
	});
}

for (const shortcut of [false, true]) void test(`registered ${shortcut ? "Ctrl+Alt+O" : "command"} Account confirms mutations and respects its idle capability`, async () => {
	const { bindControlCenterAccount } = await import("./control-center-account.js");
	const previous = process.env.OSDY_PI_PROFILE_NAME;
	try {
		for (const initialIdle of [false, true]) {
			process.env.OSDY_PI_PROFILE_NAME = "personal";
			let defaultProfile: string | undefined = "personal";
			const mutations: string[] = [];
			const f = await focusFixture({ registered: true, shortcut, idle: initialIdle,
				accountFactory: (context, _refresh, render, _backend, options) => {
					assert.equal(typeof context.waitForIdle, shortcut ? "undefined" : "function");
					return bindControlCenterAccount(context,
						() => { mutations.push("refresh"); return Promise.resolve(); }, render,
						{ profiles: () => Promise.resolve(["work", "personal"]),
							activate: profile => { mutations.push(`switch:${profile}`); return Promise.resolve(); },
							run: args => {
								if (args.length === 3) {
									mutations.push(`default:${args[2]}`);
									defaultProfile = args[2] === "--clear" ? undefined : args[2];
								}
								return Promise.resolve({ code: 0, stdout: defaultProfile ?? "No default account.", stderr: "" });
							},
						}, options);
				},
			});
			try {
				for (let i = 0; i < 7; i++) f.send("\x1b[B");
				await flushFocus(); await flushFocus();
				f.send("\x1b[C"); f.send("\x1b[H");
				assert.match(f.text(), /> work/);
				const refused = shortcut && !initialIdle;
				for (const key of ["s", "d", "c"]) {
					f.setIdle(initialIdle);
					const beforeCancel = [...mutations];
					f.send(key);
					assert.match(f.text(), /> Cancel/);
					f.send("\r");
					assert.deepEqual(mutations, beforeCancel, "Cancel never mutates");
					f.send(key); f.text(); f.send("\x1b[B"); f.send("\r");
					await flushFocus(); await flushFocus();
					assert.match(f.text(), refused ? /Account operation failed; change not confirmed/ : key === "s" ? /Account switched/ : /Default account saved/);
					assert.equal(f.closes(), 0, "Account changes keep the panel open");
				}
				assert.deepEqual(mutations, refused ? [] : ["switch:work", "refresh", "default:work", "default:--clear"]);
				assert.equal(process.env.OSDY_PI_PROFILE_NAME, refused ? "personal" : "work");
				assert.equal(defaultProfile, refused ? "personal" : undefined);
				assert.equal(f.lifecycle.filter(event => event === "idle").length, !shortcut && !initialIdle ? 3 : 0);
				f.send("\x1b"); await f.showing;
				assert.equal(f.tui.hasOverlay(), false);
				assert.ok(!f.lifecycle.includes("reload"));
				assertEditorContinuity(f);
			} finally { f.cleanup(); }
		}
	} finally {
		if (previous === undefined) delete process.env.OSDY_PI_PROFILE_NAME;
		else process.env.OSDY_PI_PROFILE_NAME = previous;
	}
});

void test("registered TODO selection reloads from the command but Ctrl+Alt+O requests manual reload after disposal and hold release", async () => {
	for (const { shortcut, reloadFails } of [
		{ shortcut: false, reloadFails: false }, { shortcut: false, reloadFails: true }, { shortcut: true, reloadFails: false },
	]) {
		const previousDir = process.env.PI_CODING_AGENT_DIR;
		const agentDir = mkdtempSync(join(tmpdir(), "osdy-cc07-runtime-"));
		process.env.PI_CODING_AGENT_DIR = agentDir;
		const f = await focusFixture({ registered: true, shortcut, todoDir: agentDir, reloadFails });
		try {
			f.lifecycle.length = 0;
			// Queue simple editor while this real overlay still owns input.
			for (let i = 0; i < 3; i++) f.send("\x1b[B");
			f.send("\x1b[C"); f.send("\x1b[F"); f.send("\r");
			f.resolveSave(); await Promise.resolve(); await Promise.resolve();
			assert.equal(f.replacements(), 0);
			f.send("\x1b[D"); f.send("\x1b[H");
			for (let i = 0; i < 9; i++) f.send("\x1b[B");
			await Promise.resolve(); await Promise.resolve();
			assert.match(f.text(), /Configured: off.*Loaded registration: off/);
			f.send("\x1b[C"); f.send("\x1b[H"); f.send("\r");
			assert.match(f.text(), /> Cancel/);
			assert.match(f.text(), /Reload follows/);
			f.send("\x1b[B"); f.send("\r");
			await f.showing;
			assert.deepEqual(f.lifecycle, ["done", "hidden", "disposed", "editor-mount", ...(shortcut ? [] : ["reload"])]);
			assert.equal(f.closes(), 1);
			assert.equal(f.tui.hasOverlay(), false);
			if (shortcut) {
				assert.equal(f.notices.length, 1);
				assert.match(f.notices[0]!, /saved.*run \/reload.*manually/i);
			} else assert.deepEqual(f.notices, [], "no stale-context notification even after reload rejection");
			assert.match(readFileSync(join(agentDir, "settings.json"), "utf8"), /"enabled": true/);
		} finally {
			f.cleanup();
			if (previousDir === undefined) delete process.env.PI_CODING_AGENT_DIR; else process.env.PI_CODING_AGENT_DIR = previousDir;
		}
	}
});

for (const shortcut of [false, true]) for (const initial of [true, false]) void test(`registered visuals ${initial ? "off" : "on"} via ${shortcut ? "shortcut" : "command"} saves before disposal and reload`, async () => {
	const f = await focusFixture({ registered: true, shortcut, visualsEnabled: initial });
	try {
		f.lifecycle.length = 0;
		for (let i = 0; i < 10; i++) f.send("\x1b[B");
		assert.match(f.text(), /Control Center \/ Visuals/);
		assert.equal(f.writes.length, 0, "inspection never saves");
		f.send("\x1b[C"); f.send(initial ? "\x1b[F" : "\x1b[H"); f.send("\r");
		assert.equal(f.appearanceWrites.at(-1), !initial);
		assert.equal(f.writes.length, 0, "appearance never writes editor settings");
		assert.deepEqual(f.lifecycle, [], "pending save neither closes nor reloads");
		f.send("\x1b"); f.send("\r");
		assert.equal(f.closes(), 0, "transactional visual switch keeps the panel until save finishes");
		assert.equal(f.appearanceWrites.length, 1, "duplicate input cannot save twice");
		f.resolveSave(); await f.showing;
		assert.deepEqual(f.lifecycle, ["done", "hidden", "disposed", ...(initial ? ["editor-mount"] : []), ...(shortcut ? [] : ["reload"])]);
		assert.equal(f.writes.length, 0, "service owns the sole root transaction");
		if (shortcut) assert.match(f.notices.join("\n"), /saved.*\/reload.*manually/i);
		else assert.deepEqual(f.notices, []);
	} finally { f.cleanup(); }
});

function appearanceFixture(optedIn = true) {
	mkdirSync(".pi-dev", { recursive: true });
	const home = mkdtempSync(join(process.cwd(), ".pi-dev", "appearance-integration-"));
	const agentDir = join(home, ".pi", "agent"); mkdirSync(agentDir, { recursive: true });
	const path = join(agentDir, "settings.json");
	const joker = join(agentDir, "npm", "node_modules", "pi-subagents-j0k3r"); mkdirSync(joker, { recursive: true });
	writeFileSync(join(joker, "package.json"), JSON.stringify({ name: "pi-subagents-j0k3r", version: "1.0.0", pi: { extensions: ["./index.ts"] } }));
	writeFileSync(join(joker, "index.ts"), 'throw new Error("fixture must never execute");');
	writeFileSync(path, JSON.stringify({ packages: ["npm:pi-subagents-j0k3r"],
		osdyPiTodoProvider: { version: 1, enabled: optedIn, ownedExclusions: [] }, unrelated: { keep: true } }));
	return { home, agentDir, path };
}
function switchVisuals(f: Awaited<ReturnType<typeof focusFixture>>, enabled: boolean) {
	for (let i = 0; i < 10; i++) f.send("\x1b[B");
	f.send("\x1b[C"); f.send(enabled ? "\x1b[H" : "\x1b[F"); f.send("\r");
}
for (const optedIn of [true, false]) void test(`registered appearance transaction restores TODO opt-in=${optedIn} across registration and sibling saves`, async () => {
	const appearance = appearanceFixture(optedIn);
	const original = JSON.parse(readFileSync(appearance.path, "utf8")) as Record<string, unknown>;
	for (const enabled of [false, true]) {
		const f = await focusFixture({ registered: true, appearance, visualsEnabled: true });
		try {
			assert.equal(f.tools.includes("todo"), !enabled && optedIn, "factory TODO follows committed provider selection");
			f.lifecycle.length = 0;
			switchVisuals(f, enabled); await f.showing;
			assert.equal(inspectAppearanceSettings(appearance.agentDir), enabled);
			assert.ok(f.lifecycle.indexOf("reload") > f.lifecycle.indexOf("disposed"));
			assert.equal(f.writes.length, 0);
		} finally { f.cleanup(); }
		const next = await focusFixture({ registered: true, appearance, visualsEnabled: !enabled });
		try {
			assert.equal(next.tools.includes("todo"), enabled && optedIn, "new factory restores prior TODO selection, never forces opt-in");
			assert.equal(next.registeredCommands.includes("todos"), enabled && optedIn);
			assert.equal(next.registeredShortcuts.includes("ctrl+shift+t"), enabled && optedIn);
			assert.equal(next.startupHeaderMounts > 0, enabled, "startup respects the root visual override");
			const beforeSibling = readFileSync(appearance.path, "utf8");
			chooseVisual(next, 1); next.resolveSave(); await flushFocus();
			assert.equal(readFileSync(appearance.path, "utf8"), beforeSibling, "sibling preferences leave override and undo untouched");
			next.send("\x1b[D"); for (let i = 0; i < 9; i++) next.send("\x1b[B");
			assert.match(next.text(), enabled ? /Current: on/ : /Current: off/, "root overrides conflicting editor v1");
			next.send("\x1b"); await next.showing;
		} finally { next.cleanup(); }
		const saved = JSON.parse(readFileSync(appearance.path, "utf8")) as Record<string, unknown>;
		assert.deepEqual(saved.packages, enabled ? original.packages : [{ source: "npm:pi-subagents-j0k3r", extensions: ["-./index.ts"] }]);
		assert.deepEqual(saved.unrelated, original.unrelated);
		const settings = SettingsManager.inMemory({ packages: saved.packages as Array<string | { source: string; extensions?: string[] }> });
		const resources = await new DefaultPackageManager({ ...appearance, cwd: appearance.home, settingsManager: settings }).resolve(() => {
			throw new Error("fixture must never install missing packages");
		});
		assert.equal(resources.extensions.find(item => item.path.endsWith("/pi-subagents-j0k3r/index.ts"))?.enabled, enabled,
			"public SDK resource filters suspend/restore Joker without executing it");
	}
});
void test("registered appearance refuses active Joker in a custom root without redirecting or reloading", async () => {
	const appearance = appearanceFixture();
	const custom = join(appearance.home, "custom"); mkdirSync(custom);
	const path = join(custom, "settings.json");
	const before = readFileSync(appearance.path, "utf8"); writeFileSync(path, before);
	const f = await focusFixture({ registered: true, appearance: { ...appearance, agentDir: custom } });
	try {
		switchVisuals(f, false);
		await f.settleAppearance(); await flushFocus();
		assert.match(f.text(), /normal personal Pi/i);
		assert.match(f.text(), /Current: on/);
		assert.equal(readFileSync(path, "utf8"), before);
		assert.equal(readFileSync(appearance.path, "utf8"), before, "no redirect to personal root");
		assert.equal(f.closes(), 0); assert.ok(!f.lifecycle.includes("reload"));
		f.send("\x1b"); await f.showing;
	} finally { f.cleanup(); }
});
void test("registered appearance rejection leaves root, current preference, overlay and reload untouched", async () => {
	const appearance = appearanceFixture();
	writeFileSync(appearance.path, JSON.stringify({ packages: ["npm:pi-subagents-j0k3r"], osdyPiAppearance: { version: 999 } }));
	const before = readFileSync(appearance.path, "utf8");
	const f = await focusFixture({ registered: true, appearance, visualsEnabled: false });
	try {
		assert.match(f.notices.join("\n"), /appearance.*invalid/i, "invalid startup metadata is explicit without blocking command registration");
		switchVisuals(f, false); await flushFocus();
		assert.match(f.text(), /invalid.*metadata/i);
		assert.match(f.text(), /Current: on/);
		assert.equal(f.closes(), 0); assert.ok(!f.lifecycle.includes("reload"));
		assert.equal(readFileSync(appearance.path, "utf8"), before); assert.equal(f.writes.length, 0);
		f.send("\x1b"); await f.showing;
	} finally { f.cleanup(); }
});

void test("registered visuals save failure preserves preference, panel and legacy master off", async () => {
	const f = await focusFixture({ registered: true, visualsEnabled: false, legacyEnabled: false });
	try {
		for (let i = 0; i < 10; i++) f.send("\x1b[B");
		assert.match(f.text(), /master.*off/i);
		f.send("\x1b[C"); f.send("\x1b[H"); f.send("\r");
		assert.deepEqual(f.appearanceWrites, [true]);
		f.rejectSave(); await flushFocus();
		assert.match(f.text(), /not saved.*reload not requested/i);
		assert.match(f.text(), /Current: off/);
		assert.equal(f.closes(), 0);
		f.send("\r"); f.resolveSave(); await f.showing;
		assert.equal(f.writes.length, 0, "visual preference never writes legacy master");
		assert.ok(f.lifecycle.includes("reload"));
	} finally { f.cleanup(); }
});

void test("registered visuals stale save completion cannot mutate live preference after replacement or shutdown", async () => {
	for (const transition of ["replacement", "shutdown"] as const) {
		const f = await focusFixture({ registered: true, visualsEnabled: true });
		try {
			for (let i = 0; i < 10; i++) f.send("\x1b[B");
			f.send("\x1b[C"); f.send("\x1b[F"); f.send("\r");
			assert.deepEqual(f.appearanceWrites, [false]);
			if (transition === "replacement") await f.transition();
			else f.shutdown();
			f.complete({ kind: "closed" }); await f.showing;
			f.resolveSave(); await flushFocus();
			assert.ok(!f.lifecycle.includes("reload"));
			const reopened = f.reopen(); await flushFocus();
			for (let i = 0; i < 10; i++) f.send("\x1b[B");
			assert.match(f.text(), /Current: on/, transition);
			f.send("\x1b"); await reopened;
		} finally { f.cleanup(); }
	}
});

void test("Ctrl+Alt+O ignores a reload result after runtime shutdown", async () => {
	const f = await focusFixture({ registered: true, shortcut: true });
	try {
		f.shutdown();
		f.lifecycle.length = 0;
		f.complete({ kind: "reload" });
		await f.showing;
		assert.deepEqual(f.lifecycle, ["done", "hidden", "disposed"]);
		assert.deepEqual(f.notices, []);
		assert.equal(f.tui.hasOverlay(), false);
	} finally { f.cleanup(); }
});

for (const shortcut of [false, true]) void test(`registered ${shortcut ? "Ctrl+Alt+O" : "command"} Agents uses synthetic normal Pi and handles reload only after SDK disposal and hold release`, { timeout: 5000 }, async () => {
	const previousHome = process.env.HOME; const previousDir = process.env.PI_CODING_AGENT_DIR;
	const home = mkdtempSync(join(tmpdir(), "osdy-cc08-runtime-"));
	const agentDir = join(home, ".pi", "agent"); mkdirSync(agentDir, { recursive: true });
	const path = join(agentDir, "settings.json");
	writeFileSync(path, JSON.stringify({ packages: ["npm:gentle-pi", "npm:pi-subagents-j0k3r"], unrelated: true }));
	process.env.HOME = home; delete process.env.PI_CODING_AGENT_DIR;
	const f = await focusFixture({ registered: true, shortcut, todoDir: home });
	try {
		f.lifecycle.length = 0;
		for (let i = 0; i < 3; i++) f.send("\x1b[B");
		f.send("\x1b[C"); f.send("\x1b[F"); f.send("\r"); f.resolveSave(); await flushFocus();
		assert.equal(f.replacements(), 0);
		f.send("\x1b[D"); f.send("\x1b[F"); f.send("\x1b[A");
		while (f.text().includes("Loading")) await new Promise<void>(resolve => setImmediate(resolve));
		assert.match(f.text(), /Agent mode: mixed/);
		assert.doesNotMatch(readFileSync(path, "utf8"), /-\.\/index.ts/);
		f.send("\x1b[C"); f.send("\x1b[F"); f.send("\r");
		assert.match(f.text(), /> Cancel/); assert.ok(f.text().replace(/[║\s]/g, "").includes(path), f.text());
		f.send("\r"); assert.equal(f.closes(), 0);
		f.send("g"); f.text(); f.send("\x1b[B"); f.send("\r");
		await f.showing;
		assert.deepEqual(f.lifecycle, ["done", "hidden", "disposed", "editor-mount", ...(shortcut ? [] : ["reload"])]);
		assert.equal(f.closes(), 1); assert.equal(f.tui.hasOverlay(), false);
		if (shortcut) {
			assert.equal(f.notices.length, 1);
			assert.match(f.notices[0]!, /saved.*run \/reload.*manually/i);
		} else assert.deepEqual(f.notices, []);
		assert.match(readFileSync(path, "utf8"), /-\.\/index.ts/);
		assert.match(readFileSync(path, "utf8"), /"unrelated": true/);
	} finally {
		f.cleanup();
		if (previousHome === undefined) delete process.env.HOME; else process.env.HOME = previousHome;
		if (previousDir === undefined) delete process.env.PI_CODING_AGENT_DIR; else process.env.PI_CODING_AGENT_DIR = previousDir;
	}
});

void test("registered Agents isolated navigation exposes the owner block without settings effects or reload", async () => {
	const previousDir = process.env.PI_CODING_AGENT_DIR;
	const agentDir = mkdtempSync(join(tmpdir(), "osdy-cc08-isolated-"));
	const path = join(agentDir, "settings.json"); const before = JSON.stringify({ unrelated: true });
	writeFileSync(path, before); process.env.PI_CODING_AGENT_DIR = agentDir;
	const f = await focusFixture({ registered: true, todoDir: agentDir });
	try {
		f.send("\x1b[F"); f.send("\x1b[A"); await flushFocus();
		assert.match(f.text(), /normal personal Pi.*override or isolated/);
		f.send("\x1b[C"); f.send("g"); f.send("j"); f.send("\r"); await flushFocus();
		assert.equal(readFileSync(path, "utf8"), before); assert.equal(f.closes(), 0);
		f.send("\x1b"); await f.showing;
		assert.ok(!f.lifecycle.includes("reload"));
	} finally {
		f.cleanup();
		if (previousDir === undefined) delete process.env.PI_CODING_AGENT_DIR; else process.env.PI_CODING_AGENT_DIR = previousDir;
	}
});

void test("deferred editor policy keeps the mounted editor while Header saves live through real TUI", async () => {
	const f = await focusFixture({ boundary: true });
	try {
		const original = f.mountedEditor();
		const effective = f.state.editorEffective;
		chooseVisual(f, 1, 1);
		assert.equal(f.state.headerVariant, "neon");
		assert.equal(f.headerMounts(), 1, "Header remount is immediate");
		assert.equal(f.writes.at(-1)?.headerVariant, "neon", "save starts immediately");
		assert.match(f.text(), /Saving globally/);
		assert.equal(f.replacements(), 0, "editor replacement must wait until custom completion");
		assert.equal(f.state.editorEffective, effective, "effective reports the mounted editor, not the queued desire");
		assert.equal(f.mountedEditor(), original);
		f.send("\x1b[D"); f.send("\x1b[B");
		assert.match(f.text(), /Control Center \/ Mascot/);
		f.send("\x1b"); await f.showing;
		assert.equal(f.replacements(), 1);
		assertEditorContinuity(f);
		f.resolveSave(); await flushFocus();
		assertEditorContinuity(f);
	} finally { f.cleanup(); }
});

void test("Header saves the Slanted variant live through real TUI", async () => {
	const f = await focusFixture({ boundary: true });
	try {
		chooseVisual(f, 1, 3);
		assert.equal(f.state.headerVariant, "slanted");
		assert.equal(f.writes.at(-1)?.headerVariant, "slanted");
		f.send("\x1b"); await f.showing;
		f.resolveSave(); await flushFocus();
	} finally { f.cleanup(); }
});

function assertEditorContinuity(f: Awaited<ReturnType<typeof focusFixture>>) {
	const mounted = f.mountedEditor();
	const before = mounted.input;
	const previousInputs = new Map(f.editors.map(editor => [editor, editor.input]));
	f.send("editor-marker");
	assert.equal(mounted.input, `${before}editor-marker`, "post-close input must reach the mounted editor");
	assert.equal(mounted.focused, true);
	for (const detached of f.editors.filter(editor => editor !== mounted)) {
		assert.equal(detached.input, previousInputs.get(detached), "detached editors must never receive new input");
		assert.equal(detached.focused, false);
	}
}
const flushFocus = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
function chooseVisual(f: Awaited<ReturnType<typeof focusFixture>>, category: number, rowsDown?: number) {
	for (let i = 0; i < category; i++) f.send("\x1b[B");
	f.send("\x1b[C");
	if (rowsDown === undefined) f.send("\x1b[F");
	for (let i = 0; i < (rowsDown ?? 0); i++) f.send("\x1b[B");
	f.send("\r");
}

for (const [name, category, boundary, expectedReplacements] of [
	["Header boundary", 1, true, 1], ["Header without boundary", 1, false, 0],
	["Mascot responsive reconciliation", 2, false, 1], ["Editor replacement", 3, false, 1],
] as const) {
	void test(`real TUI keeps ${name} navigation and Escape working while save is pending`, async () => {
		const f = await focusFixture({ boundary });
		try {
			// Mascot remount can reconcile an editor whose responsive state needs updating.
			if (category === 2) f.state.editorEffective = false;
			chooseVisual(f, category, category === 1 ? 1 : undefined);
			assert.equal(f.replacements(), 0, "mounted editor must survive the modal");
			assert.equal(f.focused(), true, "visible Control Center must retain keyboard ownership before save finishes");
			assert.match(f.text(), /Saving globally/);
			f.send("\x1b[D"); f.send("\x1b[B");
			assert.match(f.text(), new RegExp(`Control Center / ${["", "Mascot", "Editor", "Companion"][category]}`));
			f.send("\x1b"); await f.showing;
			assert.equal(f.closes(), 1, "Escape must reach the overlay through TUI");
			assert.equal(f.replacements(), expectedReplacements);
			assertEditorContinuity(f);
			f.resolveSave(); await flushFocus();
			assert.equal(f.focused(), false); assert.deepEqual(f.notices, []);
		} finally { f.cleanup(); }
	});
}

for (const failure of ["save", "apply", "synchronous apply"] as const) {
	void test(`real TUI restores focus after ${failure} failure and preserves honest feedback`, async () => {
		const f = await focusFixture({ throwApply: failure === "apply", synchronousThrow: failure === "synchronous apply" });
		try {
			chooseVisual(f, 3);
			assert.equal(f.focused(), true);
			if (failure === "save") f.rejectSave();
			await flushFocus();
			assert.match(f.text(), failure === "save" ? /Applied live.*could not be saved/ : /Preference failed: UI apply failed.*Not saved/);
			f.send("\x1b"); await f.showing;
			assert.equal(f.closes(), 1); assert.deepEqual(f.notices, []);
			assertEditorContinuity(f);
		} finally { f.cleanup(); }
	});
}

void test("real TUI close during save ignores late failure without regaining focus", async () => {
	const f = await focusFixture();
	try {
		chooseVisual(f, 3); f.send("\x1b"); await f.showing;
		f.rejectSave(); await flushFocus();
		assert.equal(f.closes(), 1); assert.equal(f.focused(), false);
		assert.equal(f.tui.hasOverlay(), false); assert.deepEqual(f.notices, []);
		assertEditorContinuity(f);
	} finally { f.cleanup(); }
});

void test("real TUI never steals another overlay's focus or resurrects completed interactions", async (t) => {
	t.mock.timers.enable({ apis: ["setInterval"] });
	const f = await focusFixture({ underlyingOverlay: true });
	try {
		const original = f.mountedEditor();
		chooseVisual(f, 3);
		t.mock.timers.tick(150);
		assert.equal(f.replacements(), 0);
		f.send("\x1b"); await f.showing;
		assert.equal(f.other()?.isFocused(), true);
		assert.equal(f.replacements(), 0);
		assert.equal(f.state.editorEffective, true);
		f.rejectSave(); await flushFocus();
		t.mock.timers.tick(150);
		assert.equal(f.other()?.isFocused(), true);
		assert.equal(f.focused(), false);
		assert.equal(f.mountedEditor(), original);
		f.other()?.hide();
		assertEditorContinuity(f); // Original mounted focus chain is still valid before retry.
		assert.equal(f.replacements(), 0);
		t.mock.timers.tick(150);
		assert.equal(f.replacements(), 1, "pending retry runs even without a small-mode change");
		assert.equal(f.state.editorEffective, false);
		assert.equal(f.tui.hasOverlay(), false, "original modal is never resurrected");
		assertEditorContinuity(f);
		assert.deepEqual(f.notices, []);
	} finally { f.cleanup(); }
});

void test("real TUI theme invalidation and a later overlay during save do not change focus ownership", async () => {
	const f = await focusFixture();
	try {
		f.send("\x1b[C"); f.send("\r");
		assert.equal(f.focused(), true); assert.match(f.text(), /Current: light/);
		f.send("\x1b[D"); chooseVisual(f, 3);
		const other = f.tui.showOverlay({ render: () => ["Later overlay"], invalidate: () => {} });
		try {
			f.resolveSave(); await flushFocus();
			assert.equal(other.isFocused(), true); assert.equal(f.focused(), false);
		} finally { other.hide(); }
		f.send("\x1b"); await f.showing;
		assertEditorContinuity(f);
	} finally { f.cleanup(); }
});

void test("real TUI coalesces two editor changes to the latest mounted mode on Escape", async () => {
	const f = await focusFixture();
	try {
		chooseVisual(f, 3);
		f.resolveSave(); await flushFocus();
		// Simple then extended returns to the original actual mode; no reconstruction is needed.
		f.send("\x1b[A"); f.send("\r");
		assert.equal(f.state.editorMode, "extended");
		assert.equal(f.replacements(), 0);
		assert.equal(f.focused(), true);
		f.send("\x1b"); await f.showing;
		assertEditorContinuity(f);
		f.resolveSave(); await flushFocus();
		assertEditorContinuity(f);
		assert.deepEqual(f.notices, []);
	} finally { f.cleanup(); }
});

void test("public custom completion releases the hold and ignores late save success", async () => {
	const f = await focusFixture();
	try {
		chooseVisual(f, 3);
		f.complete(); await f.showing;
		assert.equal(f.state.editorMountHold, undefined);
		assert.equal(f.tui.hasOverlay(), false);
		assertEditorContinuity(f);
		f.resolveSave(); await flushFocus();
		assertEditorContinuity(f);
		assert.deepEqual(f.notices, []);
	} finally { f.cleanup(); }
});

void test("SDK custom startup failure releases editor ownership without changing mounted input", async () => {
	const f = await focusFixture({ startupFailure: true });
	try {
		await f.showing;
		assert.equal(f.state.editorMountHold, undefined);
		assert.equal(f.replacements(), 0);
		assert.match(f.notices.join("\n"), /factory failed/);
		assertEditorContinuity(f);
	} finally { f.cleanup(); }
});

void test("resize and swapped Header keep responsive state live while latest editor choice waits", async (t) => {
	t.mock.timers.enable({ apis: ["setInterval"] });
	for (const mode of ["simple", "extended"] as const) {
		const f = await focusFixture({ boundary: true });
		try {
			chooseVisual(f, 1);
			f.resolveSave(); await flushFocus();
			f.send("\x1b[H"); f.send("\r"); // Swap back to osdy-theme.
			f.resolveSave(); await flushFocus();
			f.send("\x1b[D"); f.send("\x1b[B"); f.send("\x1b[B");
			f.send("\x1b[C"); f.send(mode === "simple" ? "\x1b[F" : "\x1b[H");
			if (mode === "extended") f.send("\x1b[B");
			f.send("\r");
			assert.equal(f.state.editorMode, mode);
			f.resize(20);
			t.mock.timers.tick(150);
			assert.equal(f.state.smallMode, true);
			assert.equal(f.replacements(), 0);
			f.resize(300);
			t.mock.timers.tick(150);
			assert.equal(f.state.smallMode, false);
			assert.equal(f.replacements(), 0);
			assert.equal(f.headerMounts(), 2);
			f.send("\x1b"); await f.showing;
			assert.equal(f.state.editorEffective, mode === "extended");
			assert.equal(f.replacements(), mode === "simple" ? 1 : 0);
			assertEditorContinuity(f);
			f.resolveSave(); await flushFocus();
		} finally { f.cleanup(); }
	}
});

void test("disable under a modal restores fallback only after all overlays clear", async (t) => {
	t.mock.timers.enable({ apis: ["setInterval"] });
	const f = await focusFixture({ underlyingOverlay: true });
	try {
		chooseVisual(f, 3);
		f.disable();
		assert.equal(f.replacements(), 0);
		assert.equal(f.state.editorEffective, true);
		f.send("\x1b"); await f.showing;
		t.mock.timers.tick(150);
		assert.equal(f.replacements(), 0);
		assert.equal(f.other()?.isFocused(), true);
		f.other()?.hide();
		t.mock.timers.tick(150);
		assert.equal(f.replacements(), 1);
		assert.equal(f.state.editorEffective, false);
		assert.equal(f.state.editorReconcilePending, false);
		assert.equal(f.editorFactories.at(-1), f.fallback, "disable restores the captured fallback, not the native editor");
		assertEditorContinuity(f);
		f.rejectSave(); await flushFocus();
		t.mock.timers.tick(450);
		assert.equal(f.replacements(), 1, "disabled watcher retires after fallback reconciliation");
	} finally { f.cleanup(); }
});

void test("invalidated runtime completion and pending watcher never remount old UI", async (t) => {
	t.mock.timers.enable({ apis: ["setInterval"] });
	const f = await focusFixture();
	try {
		chooseVisual(f, 3);
		f.invalidateRuntime();
		f.send("\x1b"); await f.showing;
		f.rejectSave(); await flushFocus();
		t.mock.timers.tick(450);
		assert.equal(f.replacements(), 0);
		assert.equal(f.state.editorMountHold, undefined);
		assert.equal(f.state.editorReconcilePending, false);
		assertEditorContinuity(f);
	} finally { f.cleanup(); }
});

void test("runtime hold is per state, repeated interactions release it, and no-UI failures leak nothing", async () => {
	const f = await focusFixture();
	try {
		f.send("\x1b"); await f.showing;
		for (let i = 0; i < 3; i++) {
			await withEditorMountHold({} as ExtensionAPI, { hasUI: true, mode: "tui" } as ExtensionContext,
				f.state, f.tree, () => {
					assert.equal(f.state.editorMountHold?.count, 1);
					return Promise.resolve();
				});
			assert.equal(f.state.editorMountHold, undefined);
		}
		await assert.rejects(withEditorMountHold({} as ExtensionAPI, { hasUI: false, mode: "tui" } as ExtensionContext,
			f.state, f.tree, () => Promise.reject(new Error("no UI"))), /no UI/);
		assert.equal(f.state.editorMountHold, undefined);
		await assert.rejects(f.failFactory(), /factory callback failed/);
		assert.equal(f.state.editorMountHold, undefined, "actual custom factory rejection releases the runtime hold");
		assert.equal(f.tui.hasOverlay(), false);
		await assert.rejects(withEditorMountHold({} as ExtensionAPI, { hasUI: true, mode: "tui" } as ExtensionContext,
			f.state, f.tree, () => { throw new Error("synchronous startup failed"); }), /synchronous startup failed/);
		assert.equal(f.state.editorMountHold, undefined);
		const other = await focusFixture();
		try {
			chooseVisual(other, 3);
			assert.equal(f.state.editorMountHold, undefined);
			assert.equal(other.state.editorMountHold?.count, 1);
			other.send("\x1b"); await other.showing;
			other.resolveSave(); await flushFocus();
		} finally { other.cleanup(); }
	} finally { f.cleanup(); }
});

void test("registered runtime modal wiring defers editor changes and shutdown cancels pending work", async (t) => {
	t.mock.timers.enable({ apis: ["setInterval"] });
	const f = await focusFixture({ registered: true, underlyingOverlay: true });
	try {
		chooseVisual(f, 3);
		assert.equal(f.writes.at(-1)?.editorMode, "simple");
		assert.equal(f.replacements(), 0);
		assert.match(f.text(), /Effective: extended/);
		f.send("\x1b"); await f.showing;
		assert.equal(f.other()?.isFocused(), true);
		t.mock.timers.tick(150);
		assert.equal(f.replacements(), 0);
		f.shutdown();
		f.other()?.hide();
		t.mock.timers.tick(450);
		f.rejectSave(); await flushFocus();
		assert.equal(f.replacements(), 0, "shutdown invalidates pending watcher work");
		assertEditorContinuity(f);
		assert.deepEqual(f.notices, []);
	} finally { f.cleanup(); }
});

for (const shortcut of [false, true]) void test(`registered ${shortcut ? "Ctrl+Alt+O" : "command"} session transition ignores the old modal finally and uses the new watcher`, async (t) => {
	t.mock.timers.enable({ apis: ["setInterval"] });
	const f = await focusFixture({ registered: true, shortcut });
	try {
		chooseVisual(f, 3);
		await f.transition();
		assert.match(f.text(), /Effective: extended/, "session remount also reports the actual editor while queued");
		assert.equal(f.replacements(), 0, "new session also respects any overlay");
		f.send("\x1b"); await f.showing;
		assert.equal(f.replacements(), 0, "old finally cannot remount after transition");
		t.mock.timers.tick(150);
		assert.equal(f.replacements(), 1, "new watcher reconciles the newly loaded auto choice");
		f.rejectSave(); await flushFocus();
		assert.equal(f.replacements(), 1);
		assertEditorContinuity(f);
		const showingAgain = f.reopen(); await flushFocus();
		chooseVisual(f, 3);
		assert.equal(f.replacements(), 1);
		f.send("\x1b"); await showingAgain;
		assert.equal(f.replacements(), 2, "repeated opens have fresh ownership");
		f.resolveSave(); await flushFocus();
		assertEditorContinuity(f);
		assert.deepEqual(f.notices, []);
	} finally { f.cleanup(); }
});

void test("registered Ctrl+Alt+O and osdyConfig share the same panel, live values and legacy persistence/notifications", async () => {
	const previousDir = process.env.PI_CODING_AGENT_DIR;
	process.env.PI_CODING_AGENT_DIR = fileURLToPath(new URL("./.startup-test-missing", import.meta.url));
	const commands = new Map<string, { handler(args: string, ctx: ExtensionCommandContext): Promise<void> }>();
	const shortcuts = new Map<string, ShortcutRegistration>();
	const writes: GlobalEditorSettings[] = [];
	const notices: { message: string; level: string | undefined }[] = [];
	const gitCalls: { command: string; args: string[] }[] = [];
	let failure = false;
	let mounts = 0;
	let panels = 0;
	const pi = { registerCommand: (name: string, command: { handler(args: string, ctx: ExtensionCommandContext): Promise<void> }) => commands.set(name, command),
		registerShortcut: (key: string, shortcut: ShortcutRegistration) => shortcuts.set(key, shortcut),
		on: () => {}, registerFlag: () => {}, registerMessageRenderer: () => {}, registerEntryRenderer: () => {},
		exec: (command: string, args: string[]) => {
			gitCalls.push({ command, args: [...args] });
			const subcommand = args[0] === "--no-optional-locks" ? args[1] : args[0];
			return Promise.resolve({ stdout: subcommand === "branch" ? "test-branch\n" : "", stderr: "", code: 0, killed: false });
		},
		events: { on: () => () => {} } } as unknown as ExtensionAPI;
	const ctx = { cwd: process.cwd(), mode: "tui", hasUI: true, ui: {
		notify: (message: string, level?: string) => { notices.push({ message, level }); },
		setHeader: () => { mounts++; }, setFooter: () => {}, setWidget: () => {}, setWorkingVisible: () => {},
		setEditorComponent: () => {},
		theme: { name: "dark", appearance: "dark", fg: (_color: string, text: string) => text },
		getAllThemes: () => [{ name: "dark", path: undefined }],
		setTheme: () => { throw new Error("preferences must not set theme"); },
		custom: async (factory: (tui: unknown, theme: unknown, keys: unknown, done: () => void) => { render(width: number): string[]; handleInput(data: string): void; dispose(): void }) => {
			panels++;
			const panel = factory({ terminal: { rows: 24 }, requestRender: () => {} }, undefined, undefined, () => {});
			panel.handleInput("\x1b[B");
			assert.match(panel.render(100).join("\n"), /Current: neon/);
			panel.handleInput("\x1b[C");
			panel.handleInput("\x1b[H");
			panel.handleInput("\r");
			assert.equal(writes.at(-1)?.headerVariant, "osdy-theme", "modal persists through the same store immediately");
			assert.match(panel.render(100).join("\n"), /Current: osdy-theme/);
			await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
			assert.match(panel.render(100).join("\n"), /Saved globally: osdy-theme/);
			panel.handleInput("\x1b[D");
			for (let i = 0; i < 3; i++) panel.handleInput("\x1b[B");
			assert.ok(panel.render(100).join("\n").includes("Tiny Doodle"));
			assert.ok(!panel.render(100).join("\n").includes("Pi Simple"));
			panel.handleInput("\x1b[C"); panel.handleInput("\x1b[H");
			panel.handleInput("\x1b[B"); panel.handleInput("\r");
			assert.equal(writes.at(-1)?.companionStyle, "drawn");
			assert.equal(writes.at(-1)?.companionEnabled, true);
			for (let i = 0; i < 8; i++) await Promise.resolve();
			assert.match(panel.render(100).join("\n"), /Current: Tiny Doodle/);
			panel.handleInput("\x1b[D"); panel.handleInput("\x1b[B");
			for (let i = 0; i < 8; i++) await Promise.resolve();
			assert.match(panel.render(100).join("\n"), /Branch: test-branch/);
			assert.match(panel.render(100).join("\n"), /disabled.*current/);
			panel.handleInput("\x1b[C"); panel.handleInput("\x1b[H"); panel.handleInput("\r");
			assert.equal(writes.at(-1)?.workingTreeEnabled, true, "modal uses shared legacy Git store owner");
			for (let i = 0; i < 64; i++) await Promise.resolve();
			assert.match(panel.render(100).join("\n"), /enabled.*current/);
			panel.handleInput("\x1b"); panel.dispose();
			return { kind: "closed" };
		},
	} } as unknown as ExtensionCommandContext;
	try {
		await registerOsdyPi(pi, { editorSettingsStore: { path: "/unused", load: () => Promise.reject(new Error("must not load")),
			save: (settings) => { writes.push(settings); return failure ? Promise.reject(new Error("disk full")) : Promise.resolve(); } } });
		const legacy = commands.get("osdy-pi"); const modal = commands.get("osdyConfig");
		assert.ok(legacy); assert.ok(modal);
		assert.equal(commands.has("osdy"), false, "the Control Center command is renamed, not aliased");
		await legacy.handler("companion drawn", ctx);
		const beforeWithdrawal = writes.length;
		const retained = writes.at(-1);
		for (const withdrawn of ["simple", "mini", "micro", "terminal-mini"]) {
			await legacy.handler(`companion ${withdrawn}`, ctx);
			assert.equal(writes.length, beforeWithdrawal, `withdrawn companion choice ${withdrawn} must not save`);
			assert.deepEqual(notices.at(-1), {
				message: "Usage: /osdy-pi companion on | off | toggle | original | drawn | rounded | terminal | slim | slim-small | status", level: "warning",
			});
		}
		await legacy.handler("invalid", ctx);
		assert.ok(notices.at(-1)?.message.includes("companion on|off|toggle|original|drawn|rounded|terminal|slim|slim-small|status"));
		assert.doesNotMatch(notices.at(-1)?.message ?? "", /companion \S*simple/);
		assert.equal(writes.length, beforeWithdrawal);
		await legacy.handler("editor simple", ctx);
		assert.deepEqual(notices.at(-1), { message: "osdy-pi editor mode: simple", level: "info" });
		assert.deepEqual(writes.at(-1), { ...retained, editorMode: "simple" }, "rejected companion command must not mutate live settings");
		for (const [args, expected, field, value] of [
			["header neon", "osdy-pi header: neon", "headerVariant", "neon"],
			["header block-shadow", "osdy-pi header: block-shadow", "headerVariant", "block-shadow"],
			["header slanted", "osdy-pi header: slanted", "headerVariant", "slanted"],
			["mascot bts", "osdy-pi mascot: Lavender Bandit", "mascot", "bts"],
			["mascot pi", "osdy-pi mascot: Hoodie Pi", "mascot", "pi"],
			["mascot osdy-halloween", "osdy-pi mascot: Little Vampire", "mascot", "osdy-halloween"],
			["editor off", "osdy-pi editor mode: simple", "editorMode", "simple"],
			["editor on", "osdy-pi editor mode: extended", "editorMode", "extended"],
			["editor toggle", "osdy-pi editor mode: simple", "editorMode", "simple"],
			["editor auto", "osdy-pi editor mode: auto", "editorMode", "auto"],
			["companion off", "osdy-pi companion: off", "companionEnabled", false],
			["companion on", "osdy-pi companion: on", "companionEnabled", true],
			["companion toggle", "osdy-pi companion: off", "companionEnabled", false],
			["companion drawn", "osdy-pi companion: Tiny Doodle", "companionStyle", "drawn"],
			["companion rounded", "osdy-pi companion: Big Cuddle", "companionStyle", "rounded"],
			["companion terminal", "osdy-pi companion: Retro Buddy", "companionStyle", "terminal"],
			["companion slim", "osdy-pi companion: Slim Ringtail", "companionStyle", "slim"],
			["companion slim-small", "osdy-pi companion: Pocket Ringtail", "companionStyle", "slim-small"],
			["companion off", "osdy-pi companion: off", "companionEnabled", false],
			["companion original", "osdy-pi companion: Pixel Pal", "companionEnabled", true],
		] as const) {
			await legacy.handler(args, ctx);
			assert.deepEqual(notices.at(-1), { message: expected, level: "info" });
			assert.equal(writes.at(-1)?.[field], value);
		}
		await legacy.handler("working-tree off", ctx);
		assert.equal(writes.at(-1)?.workingTreeEnabled, false);
		assert.equal(notices.at(-1)?.message, "osdy-pi working tree disabled");
		const before = writes.length;
		await legacy.handler("mascot status", ctx);
		assert.deepEqual(notices.at(-1), { message: "osdy-pi mascot: Little Vampire", level: "info" });
		for (const args of ["working-tree status", "header status", "mascot status", "editor status", "header invalid", "mascot bts extra", "mascot osdy-halloween extra", "mascot invalid", "editor simple extra", "companion status", "companion invalid", "companion on extra", "companion drawn extra", "companion simple extra"]) await legacy.handler(args, ctx);
		assert.equal(writes.length, before, "status and invalid inputs never save");
		assert.equal(shortcuts.has("f1"), false);
		assert.equal(shortcuts.has("f2"), false);
		assert.deepEqual([...shortcuts.keys()].sort(), ["ctrl+alt+o", "ctrl+alt+s", "ctrl+alt+u"]);
		assert.equal("reload" in ctx, false);
		for (const open of [() => modal.handler("", ctx), () => shortcuts.get("ctrl+alt+o")!.handler(ctx)]) {
			await legacy.handler("header neon", ctx);
			await legacy.handler("working-tree off", ctx);
			const beforeModalGitCalls = gitCalls.length;
			const beforeModalNotices = notices.length;
			await open();
			assert.deepEqual(notices.slice(beforeModalNotices).filter((notice) => notice.level === "error"), [],
				"modal integration assertions must not be swallowed as Control Center error notifications");
			assert.deepEqual(gitCalls.slice(beforeModalGitCalls, beforeModalGitCalls + 2), [
				{ command: "git", args: ["--no-optional-locks", "branch", "--show-current"] },
				{ command: "git", args: ["--no-optional-locks", "status", "--short", "--untracked-files=normal"] },
			], "both entry points inspect Git through the same read-only owner");
		}
		assert.equal(panels, 2);
		failure = true;
		await legacy.handler("working-tree off", ctx);
		assert.match(notices.at(-1)?.message ?? "", /disabled but could not be saved/);
		await legacy.handler("working-tree status", ctx);
		assert.equal(notices.at(-1)?.message, "osdy-pi working tree disabled");
		for (const args of ["header neon", "mascot current", "editor simple", "companion on"]) {
			await legacy.handler(args, ctx);
			assert.match(notices.at(-1)?.message ?? "", /changed but could not be saved/);
			assert.equal(notices.at(-1)?.level, "warning");
		}
		await legacy.handler("header status", ctx);
		assert.equal(notices.at(-1)?.message, "osdy-pi header: neon", "failed saves retain live values");
		assert.ok(mounts >= 5);
	} finally {
		if (previousDir === undefined) delete process.env.PI_CODING_AGENT_DIR; else process.env.PI_CODING_AGENT_DIR = previousDir;
	}
});

void test("registered shortcuts preserve command no-UI and Control Center mode/error guards", async () => {
	const previous = process.env.PI_CODING_AGENT_DIR;
	process.env.PI_CODING_AGENT_DIR = fileURLToPath(new URL("./.startup-test-missing", import.meta.url));
	const commands = new Map<string, { handler(args: string, ctx: ExtensionCommandContext): Promise<void> }>();
	const shortcuts = new Map<string, ShortcutRegistration>();
	const notices: { message: string; level: string | undefined }[] = [];
	let customCalls = 0;
	const pi = { registerCommand: (name: string, command: { handler(args: string, ctx: ExtensionCommandContext): Promise<void> }) => commands.set(name, command),
		registerShortcut: (key: string, shortcut: ShortcutRegistration) => shortcuts.set(key, shortcut),
		on: () => {}, registerFlag: () => {}, registerMessageRenderer: () => {}, registerEntryRenderer: () => {},
		events: { on: () => () => {} }, exec: () => { throw new Error("external execution forbidden"); },
	} as unknown as ExtensionAPI;
	const ctx = { cwd: "/synthetic", hasUI: false, mode: "tui", ui: {
		notify: (message: string, level?: string) => notices.push({ message, level }),
		custom: () => { customCalls++; throw new Error("overlay failed"); },
		setEditorComponent: () => {}, setHeader: () => {}, setFooter: () => {}, setWidget: () => {}, setWorkingVisible: () => {},
	} } as unknown as ExtensionContext;
	const commandCtx = { ...ctx, reload: () => { throw new Error("reload forbidden"); } } as unknown as ExtensionCommandContext;
	try {
		await registerOsdyPi(pi);
		assert.equal(shortcuts.has("f1"), false);
		assert.equal(shortcuts.has("f2"), false);
		assert.deepEqual([...shortcuts.keys()].sort(), ["ctrl+alt+o", "ctrl+alt+s", "ctrl+alt+u"]);
		for (const [key, command] of [["ctrl+alt+o", "osdyConfig"], ["ctrl+alt+u", "usage"]] as const) {
			notices.length = 0;
			await commands.get(command)!.handler("", commandCtx);
			const commandNotice = notices.at(-1);
			await shortcuts.get(key)!.handler(ctx);
			assert.deepEqual(notices.at(-1), commandNotice);
			assert.equal(commandNotice?.level, "warning");
			assert.match(commandNotice?.message ?? "", /interactive.*UI/);
		}
		assert.equal(customCalls, 0);
		for (const mode of ["rpc", "json", "print"] as const) {
			await shortcuts.get("ctrl+alt+o")!.handler({ ...ctx, mode, hasUI: true });
			assert.match(notices.at(-1)?.message ?? "", /interactive terminal UI/);
		}
		assert.equal(customCalls, 0);
		await shortcuts.get("ctrl+alt+o")!.handler({ ...ctx, hasUI: true });
		assert.equal(customCalls, 1);
		assert.deepEqual(notices.at(-1), { message: "Control Center unavailable: overlay failed", level: "error" });
	} finally {
		if (previous === undefined) delete process.env.PI_CODING_AGENT_DIR; else process.env.PI_CODING_AGENT_DIR = previous;
	}
});

void test("actual factory registers no TODO surfaces by default, and all three only with opt-in", async () => {
 const root = mkdtempSync(join(tmpdir(), "osdy-runtime-todo-"));
 const agentDir = join(root, "agent"); mkdirSync(agentDir);
 mkdirSync(join(root, "rpiv-todo"));
 writeFileSync(join(root, "rpiv-todo", "config.json"), "{}");
 const previous = process.env.PI_CODING_AGENT_DIR;
 const previousConfig = process.env.XDG_CONFIG_HOME;
 const previousCwd = process.cwd();
 process.chdir(root);
 process.env.PI_CODING_AGENT_DIR = agentDir;
 process.env.XDG_CONFIG_HOME = root;
 try {
  for (const [settings, enabled, probes] of [
   ["{}", false, 0],
   ["{bad", false, 0],
   [JSON.stringify({ osdyPiTodoProvider: { enabled: true } }), false, 0],
   [JSON.stringify({ osdyPiTodoProvider: { version: 1, enabled: false, ownedExclusions: [] } }), false, 0],
   [JSON.stringify({ osdyPiTodoProvider: { version: 1, enabled: true, ownedExclusions: [] } }), true, 1],
   [JSON.stringify({ osdyPiTodoProvider: { version: 1, enabled: true, ownedExclusions: [] }, packages: ["npm:gentle-pi"] }), false, 1],
  ] as const) {
   writeFileSync(join(agentDir, "settings.json"), settings);
   const commands: string[] = []; const tools: string[] = []; const shortcuts: string[] = [];
   let execCalls = 0;
   const pi = { registerCommand: (name: string) => commands.push(name), registerTool: (tool: { name: string }) => tools.push(tool.name),
    registerShortcut: (key: string) => shortcuts.push(key), exec: (command: string, args: string[], options: { timeout: number; cwd?: string }) => {
     execCalls++;
     assert.equal(command, process.execPath);
     assert.deepEqual(args, ["--input-type=commonjs", "--eval", "process.stdout.write(JSON.stringify(process.cwd()))"]);
     assert.equal(options.cwd, undefined); assert.equal(options.timeout, 2000);
     return Promise.resolve({ stdout: JSON.stringify(root), stderr: "", code: 0, killed: false });
    }, registerFlag: () => {}, registerMessageRenderer: () => {}, registerEntryRenderer: () => {}, on: () => {}, events: { on: () => () => {} } } as unknown as ExtensionAPI;
   await registerOsdyPi(pi);
   assert.ok(commands.includes("osdy-pi"));
   assert.ok(commands.includes("osdyConfig"));
   assert.equal(commands.includes("osdy"), false);
   assert.equal(commands.includes("todos"), enabled); assert.equal(tools.includes("todo"), enabled);
   assert.ok(shortcuts.includes("ctrl+alt+o")); assert.ok(shortcuts.includes("ctrl+alt+u")); assert.ok(shortcuts.includes("ctrl+alt+s"));
   assert.equal(shortcuts.includes("f1"), false); assert.equal(shortcuts.includes("f2"), false);
   assert.equal(shortcuts.includes("ctrl+shift+t"), enabled);
   assert.equal(shortcuts.length, enabled ? 4 : 3);
   assert.equal(execCalls, probes);
  }
 } finally {
  process.chdir(previousCwd);
  if (previous === undefined) delete process.env.PI_CODING_AGENT_DIR; else process.env.PI_CODING_AGENT_DIR = previous;
  if (previousConfig === undefined) delete process.env.XDG_CONFIG_HOME; else process.env.XDG_CONFIG_HOME = previousConfig;
 }
});

void test("registered TODO and historical markers preserve legacy off-on-off ownership unless visuals are explicitly off", async (t) => {
 t.mock.timers.enable({ apis: ["setInterval", "setTimeout"] });
 const root = mkdtempSync(join(tmpdir(), "osdy-visual-ownership-"));
 mkdirSync(join(root, "rpiv-todo"));
 writeFileSync(join(root, "rpiv-todo", "config.json"), "{}");
 writeFileSync(join(root, "settings.json"), JSON.stringify({ osdyPiTodoProvider: { version: 1, enabled: true, ownedExclusions: [] } }));
 const previousDir = process.env.PI_CODING_AGENT_DIR; const previousConfig = process.env.XDG_CONFIG_HOME;
 process.env.PI_CODING_AGENT_DIR = root; process.env.XDG_CONFIG_HOME = root;
 try {
  for (const visualsEnabled of [undefined, true, false]) {
   let settings: GlobalEditorSettings = { version: 1, enabled: false, editorMode: "simple", workingTreeEnabled: false,
    headerVariant: "osdy-theme", mascot: "current", ...(visualsEnabled === undefined ? {} : { visualsEnabled }) };
   const handlers = new Map<string, Array<(event: unknown, ctx: ExtensionContext) => Promise<void> | void>>();
   const commands = new Map<string, { handler(args: string, ctx: ExtensionCommandContext): Promise<void> }>();
   const widgets = new Map<string, boolean>();
   type MarkerRenderer = (entry: { data: { role: string } }, options: { expanded: boolean }, theme: Theme) => Component | undefined;
   let renderMarker: MarkerRenderer | undefined;
   let todo: { execute(id: string, params: { action: "list" }, signal: undefined, update: undefined, ctx: ExtensionContext): Promise<{ details: { tasks: unknown[] } }> } | undefined;
   let entries = 0;
   const pi = {
    on: (name: string, handler: (event: unknown, ctx: ExtensionContext) => Promise<void> | void) => { handlers.set(name, [...(handlers.get(name) ?? []), handler]); },
    registerCommand: (name: string, command: { handler(args: string, ctx: ExtensionCommandContext): Promise<void> }) => commands.set(name, command),
    registerTool: (tool: NonNullable<typeof todo> & { name: string }) => { if (tool.name === "todo") todo = tool; },
    registerEntryRenderer: (_name: string, renderer: MarkerRenderer) => { renderMarker = renderer; },
    appendEntry: () => { entries++; }, registerShortcut: () => {}, registerFlag: () => {}, registerMessageRenderer: () => {},
    exec: () => Promise.resolve({ code: 0, stdout: JSON.stringify(root), stderr: "", killed: false }), events: { on: () => () => {} },
   } as unknown as ExtensionAPI;
   const theme = { fg: (_color: string, text: string) => text } as Theme;
   const ctx = { cwd: root, mode: "tui", hasUI: true, isIdle: () => true,
    modelRegistry: { getProviderAuth: () => Promise.resolve(undefined) },
    sessionManager: { getSessionId: () => "ownership", getBranch: () => [{ type: "message", message: { role: "toolResult", toolName: "todo",
     details: { nextId: 2, tasks: [{ id: 1, subject: "Retained task", status: "pending" }] } } }] },
    ui: { theme, notify: () => {}, getEditorComponent: () => undefined, setEditorComponent: () => {}, setHeader: () => {}, setFooter: () => {},
     setWorkingVisible: () => {}, setWidget: (key: string, factory: unknown) => { widgets.set(key, factory !== undefined); } },
   } as unknown as ExtensionCommandContext;
   await registerOsdyPi(pi, { agentDir: () => root, readActiveProfile: () => Promise.resolve(undefined),
    editorSettingsStore: { path: "/unused", load: () => Promise.resolve(settings), save: value => { settings = value; return Promise.resolve(); } } });
   const emit = async (name: string, event: unknown = {}) => { for (const handler of handlers.get(name) ?? []) await handler(event, ctx); };
   const marker = renderMarker?.({ data: { role: "assistant" } }, { expanded: false }, theme);
   assert.deepEqual(marker?.render(40), [], "replay waits for loaded settings");
   const expectedVisible = visualsEnabled !== false;
   const assertVisibility = () => {
    assert.equal(widgets.get("osdy-todos") === true, expectedVisible, `TODO visibility with visuals=${String(visualsEnabled)}`);
    assert.equal(Boolean(marker?.render(40).length), expectedVisible, "historical marker visibility ignores legacy master");
   };
   try {
    await emit("session_start"); assertVisibility();
    await emit("message_start", { message: { role: "assistant" } });
    await emit("message_end", { message: { role: "assistant", content: [{ type: "text", text: "answer" }] } });
    assert.equal(entries, 0, "legacy off still prevents new markers");
    assert.ok(todo); assert.ok(commands.has("todos"));
    assert.equal((await todo.execute("list", { action: "list" }, undefined, undefined, ctx)).details.tasks.length, 1);
    await commands.get("osdy-pi")!.handler("on", ctx); assertVisibility();
    await commands.get("osdy-pi")!.handler("off", ctx); assertVisibility();
    assert.equal(settings.visualsEnabled, visualsEnabled, "legacy persistence preserves the independent preference");
    await emit("session_shutdown"); await emit("session_start"); assertVisibility();
   } finally { await emit("session_shutdown"); }
  }
 } finally {
  if (previousDir === undefined) delete process.env.PI_CODING_AGENT_DIR; else process.env.PI_CODING_AGENT_DIR = previousDir;
  if (previousConfig === undefined) delete process.env.XDG_CONFIG_HOME; else process.env.XDG_CONFIG_HOME = previousConfig;
 }
});

void test("official SDK factory uses SDK cwd, not the safe process cwd, before TODO registration", async () => {
 const { loadExtensionFromFactory, createExtensionRuntime } = await import("../../node_modules/@earendil-works/pi-coding-agent/dist/core/extensions/loader.js");
 const { default: factory } = await import("../osdy-pi.js");
 const root = mkdtempSync(join(tmpdir(), "osdy-sdk-cwd-"));
 const agentDir = join(root, "agent"); const safe = join(root, "safe"); const unsafe = join(root, "unsafe");
 mkdirSync(agentDir); mkdirSync(safe); mkdirSync(join(unsafe, ".pi"), { recursive: true });
 writeFileSync(join(unsafe, ".pi", "settings.json"), JSON.stringify({ packages: ["npm:gentle-pi"] }));
 mkdirSync(join(root, "rpiv-todo"));
 writeFileSync(join(root, "rpiv-todo", "config.json"), "{}");
 const previous = process.env.PI_CODING_AGENT_DIR; const previousCwd = process.cwd();
 const previousConfig = process.env.XDG_CONFIG_HOME;
 process.env.PI_CODING_AGENT_DIR = agentDir; process.env.XDG_CONFIG_HOME = root; process.chdir(safe);
 const eventBus = { on: () => () => {}, emit: () => {} };
 try {
  writeFileSync(join(agentDir, "settings.json"), JSON.stringify({ osdyPiTodoProvider: { version: 1, enabled: true, ownedExclusions: [] } }));
  for (const [cwd, active] of [[unsafe, false], [safe, true], [join(root, "missing"), false]] as const) {
   const runtime = createExtensionRuntime();
   try {
    const extension = await loadExtensionFromFactory(factory, cwd, eventBus, runtime);
    assert.ok(extension.commands.has("osdy-pi"));
    assert.ok(extension.commands.has("osdyConfig"));
    assert.equal(extension.commands.has("osdy"), false);
    assert.equal(extension.tools.has("todo"), active, cwd);
    assert.equal(extension.commands.has("todos"), active, cwd);
    assert.ok(extension.shortcuts.has("ctrl+alt+o")); assert.ok(extension.shortcuts.has("ctrl+alt+u")); assert.ok(extension.shortcuts.has("ctrl+alt+s"));
    assert.equal(extension.shortcuts.has("f1"), false); assert.equal(extension.shortcuts.has("f2"), false);
    assert.equal(extension.shortcuts.has("ctrl+shift+t"), active, cwd);
    assert.equal(extension.shortcuts.size, active ? 4 : 3, cwd);
   } finally { runtime.invalidate(); }
  }
 } finally {
  process.chdir(previousCwd);
  if (previous === undefined) delete process.env.PI_CODING_AGENT_DIR; else process.env.PI_CODING_AGENT_DIR = previous;
  if (previousConfig === undefined) delete process.env.XDG_CONFIG_HOME; else process.env.XDG_CONFIG_HOME = previousConfig;
 }
});

void test("unavailable, failed and invalid SDK cwd probes fail closed", async () => {
 const root = mkdtempSync(join(tmpdir(), "osdy-sdk-probe-"));
 const previous = process.env.PI_CODING_AGENT_DIR;
 process.env.PI_CODING_AGENT_DIR = root;
 writeFileSync(join(root, "settings.json"), JSON.stringify({ osdyPiTodoProvider: { version: 1, enabled: true, ownedExclusions: [] } }));
 const ok = { stdout: JSON.stringify(root), stderr: "", code: 0, killed: false };
 try {
  for (const result of [undefined, new Error("exec unavailable"), { ...ok, code: 1 }, { ...ok, killed: true },
   { ...ok, stderr: "warning" }, { ...ok, stdout: "not json" }, { ...ok, stdout: '"relative"' },
   { ...ok, stdout: JSON.stringify(`${root}\u0000`) }, { ...ok, stdout: "{}" }, { ...ok, stdout: "x".repeat(16385) }]) {
   const commands: string[] = []; const tools: string[] = []; const shortcuts: string[] = [];
   const pi = { registerCommand: (name: string) => commands.push(name), registerTool: (tool: { name: string }) => tools.push(tool.name),
    registerShortcut: (key: string) => shortcuts.push(key),
    exec: result === undefined ? undefined : () => result instanceof Error ? Promise.reject(result) : Promise.resolve(result),
    registerFlag: () => {}, registerMessageRenderer: () => {}, registerEntryRenderer: () => {}, on: () => {}, events: { on: () => () => {} },
   } as unknown as ExtensionAPI;
   await registerOsdyPi(pi);
   assert.ok(commands.includes("osdy-pi")); assert.equal(commands.includes("todos"), false);
   assert.equal(tools.includes("todo"), false); assert.deepEqual(shortcuts.sort(), ["ctrl+alt+o", "ctrl+alt+s", "ctrl+alt+u"]);
   assert.equal(shortcuts.includes("f1"), false); assert.equal(shortcuts.includes("f2"), false);
  }
 } finally {
  if (previous === undefined) delete process.env.PI_CODING_AGENT_DIR; else process.env.PI_CODING_AGENT_DIR = previous;
 }
});

void test("TODO command confirms, cancels, reports activation and never touches stale context after reload", async () => {
 const root = mkdtempSync(join(tmpdir(), "osdy-command-todo-"));
 const previous = process.env.PI_CODING_AGENT_DIR; process.env.PI_CODING_AGENT_DIR = root;
 let stale = false; let accepted = false; let writes = 0; const notices: string[] = [];
 const ctx = { hasUI: true, cwd: root, ui: {
  confirm: (_title: string, message: string) => { assert.match(message, new RegExp(root)); return Promise.resolve(accepted); },
  notify: (message: string) => { assert.equal(stale, false); notices.push(message); },
 }, reload: () => { stale = true; return Promise.reject(new Error("reload failed")); } } as unknown as ExtensionCommandContext;
 try {
  const select = () => { writes++; return { changed: true }; };
  await handleTodoProviderCommand("on", ctx, false, select); assert.equal(writes, 0);
  accepted = true; await handleTodoProviderCommand("on", ctx, false, select); assert.equal(writes, 1);
  assert.ok(notices.some((text) => /restart|reload/i.test(text)));
  stale = false; await handleTodoProviderCommand("status", ctx, false); assert.ok(notices.some((text) => /configured.*actual/i.test(text)));
  await handleTodoProviderCommand("off", ctx, false, () => { throw new Error("write denied"); });
  assert.ok(notices.some((text) => /write denied/.test(text)));
  assert.deepEqual(getOsdyCommandCompletions("todo"), ["on", "off", "status"].map((action) => ({ value: `todo ${action}`, label: `todo ${action}` })));
 } finally { if (previous === undefined) delete process.env.PI_CODING_AGENT_DIR; else process.env.PI_CODING_AGENT_DIR = previous; }
});

void test("TODO command persists on/off in a disposable custom profile before successful reload", async () => {
 const root = mkdtempSync(join(tmpdir(), "osdy-command-switch-"));
 const previous = process.env.PI_CODING_AGENT_DIR;
 process.env.PI_CODING_AGENT_DIR = root;
 writeFileSync(join(root, "settings.json"), JSON.stringify({ packages: ["npm:gentle-pi"], theme: "retained" }));
 let reloaded = false;
 let reloads = 0;
 const ctx = {
  hasUI: true,
  cwd: root,
  ui: {
   confirm: () => Promise.resolve(true),
   notify: () => { assert.equal(reloaded, false); },
  },
  reload: () => { reloaded = true; reloads++; return Promise.resolve(); },
 } as unknown as ExtensionCommandContext;
 try {
  await handleTodoProviderCommand("on", ctx, false);
  let settings = JSON.parse(readFileSync(join(root, "settings.json"), "utf8")) as {
   theme: string; packages: unknown[]; osdyPiTodoProvider: { enabled: boolean };
  };
  assert.equal(settings.osdyPiTodoProvider.enabled, true);
  assert.equal(settings.theme, "retained");
  reloaded = false;
  await handleTodoProviderCommand("off", ctx, true);
  settings = JSON.parse(readFileSync(join(root, "settings.json"), "utf8")) as typeof settings;
  assert.equal(settings.osdyPiTodoProvider.enabled, false);
  assert.deepEqual(settings.packages, ["npm:gentle-pi"]);
  assert.equal(reloads, 2);
  reloaded = false;
  await handleTodoProviderCommand("bad", ctx, false);
  assert.equal(reloads, 2);
 } finally {
  if (previous === undefined) delete process.env.PI_CODING_AGENT_DIR;
  else process.env.PI_CODING_AGENT_DIR = previous;
 }
});

void test("startup label reader validates the dynamic module and active metadata only", async () => {
	const env = { OSDY_PI_SHARED_AGENT_DIR: "/unused/shared" };
	let reads = 0;
	for (const [record, expected] of [
		[{ status: "valid", profile: "work" }, "work"],
		[{ status: "unset" }, undefined],
		[{ status: "invalid" }, undefined],
		[{ status: "valid", profile: "default" }, undefined],
		[{ status: "valid", profile: "../bad" }, undefined],
		[null, undefined],
	] as const) {
		assert.equal(await profileLabels.readLastActiveProfileLabel(env, () => Promise.resolve({
			getSharedAgentDir: (received: NodeJS.ProcessEnv) => {
				assert.equal(received, env);
				return "/unused/shared";
			},
			readActiveAccount: (directory: string) => {
				assert.equal(directory, "/unused/shared");
				reads++;
				return Promise.resolve(record);
			},
		})), expected);
	}
	assert.equal(reads, 6);
	for (const module of [null, {}, { getSharedAgentDir: "bad" }, {
		getSharedAgentDir: () => 42, readActiveAccount: () => { throw new Error("unexpected read"); },
	}, {
		getSharedAgentDir: () => "/unused/shared", readActiveAccount: () => { throw new Error("read denied"); },
	}]) assert.equal(await profileLabels.readLastActiveProfileLabel(env, () => Promise.resolve(module)), undefined);
	assert.equal(await profileLabels.readLastActiveProfileLabel(env, () => Promise.reject(new Error("import failed"))), undefined);
});

void test("real session_start restores labels before editor mounting and rejects stale results", async () => {
	const previousDir = process.env.PI_CODING_AGENT_DIR;
	const previousName = process.env.OSDY_PI_PROFILE_NAME;
	// This nonexistent package-local directory prevents reads of personal settings.
	process.env.PI_CODING_AGENT_DIR = fileURLToPath(new URL("./.startup-test-missing", import.meta.url));
	try {
		for (const scenario of ["restore", "invalid-env", "explicit", "unset", "invalid", "deleted", "failure", "replace", "shutdown", "switch"] as const) {
			delete process.env.OSDY_PI_PROFILE_NAME;
			if (scenario === "explicit") process.env.OSDY_PI_PROFILE_NAME = "launcher";
			if (scenario === "invalid-env") process.env.OSDY_PI_PROFILE_NAME = "../invalid";
			const handlers = new Map<string, Array<(event: unknown, ctx: ExtensionContext) => Promise<void> | void>>();
			const mounted: string[] = [];
			let reads = 0;
			let complete: (value: string | undefined) => void = () => {};
			let entered: () => void = () => {};
			const started = new Promise<void>((resolve) => { entered = resolve; });
			const pending = new Promise<string | undefined>((resolve) => { complete = resolve; });
			const pi = {
				on: (name: string, handler: (event: unknown, ctx: ExtensionContext) => Promise<void> | void) => {
					const registered = handlers.get(name) ?? [];
					registered.push(handler);
					handlers.set(name, registered);
				},
				registerCommand: () => {}, registerShortcut: () => {}, registerFlag: () => {}, registerMessageRenderer: () => {}, registerEntryRenderer: () => {},
				events: { on: () => () => {} },
				exec: () => Promise.resolve({ code: 1, stdout: "", stderr: "unavailable" }),
			} as unknown as ExtensionAPI;
			const ctx = {
				hasUI: true, cwd: process.env.PI_CODING_AGENT_DIR,
				modelRegistry: { getProviderAuth: () => Promise.resolve(undefined) },
				ui: {
					getEditorComponent: () => undefined,
					setEditorComponent: () => {
						const label = profileLabels.resolveActiveProfileLabel();
						mounted.push(`${profileLabels.resolveEditorTitleLabel(label)}|${profileLabels.formatModelMetadata("test-model", "high", label)}`);
					},
					setHeader: () => {}, setFooter: () => {}, setWidget: () => {}, setWorkingVisible: () => {},
				},
			} as unknown as ExtensionContext;
			await registerOsdyPi(pi, { readActiveProfile: () => {
				reads++; entered();
				return scenario === "failure" ? Promise.reject(new Error("read failed")) : pending;
			} });
			// Speech and role-marker resets precede the existing visual runtime lifecycle.
			const start = handlers.get("session_start")?.[2];
			const shutdown = handlers.get("session_shutdown")?.[2];
			assert.ok(start); assert.ok(shutdown);
			try {
				const startup = start({}, ctx);
				if (scenario !== "explicit") {
					await Promise.race([started, Promise.resolve(startup)]);
					assert.equal(reads, 1, "session_start must read the last active identity");
				}
				if (scenario === "switch") process.env.OSDY_PI_PROFILE_NAME = "new-selection";
				if (scenario === "shutdown") await shutdown({}, ctx);
				let replacement: Promise<void> | void = undefined;
				if (scenario === "replace") {
					process.env.OSDY_PI_PROFILE_NAME = "new-session";
					replacement = start({}, { ...ctx });
				}
				complete(["unset", "invalid", "deleted"].includes(scenario) ? undefined : "last-active");
				await startup;
				await replacement;
				const expected = scenario === "explicit" ? "launcher" : scenario === "switch" ? "new-selection" : scenario === "replace" ? "new-session" :
					["unset", "invalid", "deleted", "failure", "shutdown"].includes(scenario) ? undefined : "last-active";
				assert.equal(process.env.OSDY_PI_PROFILE_NAME, expected, scenario);
				assert.equal(reads, scenario === "explicit" ? 0 : 1, scenario);
				assert.equal(mounted.length, scenario === "shutdown" ? 0 : 1, scenario);
				if (mounted.length) assert.equal(mounted[0], `${expected ?? "Osdy-Pi"}|test-model · ${expected ? `${expected} · ` : ""}think high`, scenario);
			} finally { await shutdown({}, ctx); }
		}
	} finally {
		if (previousDir === undefined) delete process.env.PI_CODING_AGENT_DIR; else process.env.PI_CODING_AGENT_DIR = previousDir;
		if (previousName === undefined) delete process.env.OSDY_PI_PROFILE_NAME; else process.env.OSDY_PI_PROFILE_NAME = previousName;
	}
});

class TestEventBus {
	event: string | undefined;
	handler: ((data: unknown) => void) | undefined;

	on(event: string, handler: (data: unknown) => void): () => void {
		this.event = event;
		this.handler = handler;
		return () => {
			this.handler = undefined;
		};
	}

	emit(event: string, data: unknown): void {
		if (event === this.event) this.handler?.(data);
	}
}

class TestExtensionApi {
	readonly events = new TestEventBus();
	lifecycleOnCallCount = 0;

	on(): void {
		this.lifecycleOnCallCount += 1;
	}
}

class TestSessionContextProvider {
	context: ExtensionContext | undefined;

	getCurrentSessionContext(): ExtensionContext | undefined {
		return this.context;
	}
}

void test("runtime wires distinct loaded marker creation and visual-only rendering gates", () => {
 const source = readFileSync(new URL("./runtime.ts", import.meta.url), "utf8");
 assert.match(source, /registerMessageRoleMarkers\(pi, \(\) => usageSettingsReady && areVisualsEnabled\(state\),\s*\(\) => usageSettingsReady && state\.visualsEnabled !== false\)/);
 assert.equal(source.match(/registerMessageRoleMarkers\(pi, /g)?.length, 1);
});

void test("runtime passes one session store to exactly one todo tool and command", () => {
 const source = readFileSync(new URL("./runtime.ts", import.meta.url), "utf8");
 assert.equal(source.match(/createTodoSessionStore\(\)/g)?.length, 1);
 assert.equal(source.match(/registerTodoTool\(pi, todoStore\)/g)?.length, 1);
 assert.equal(source.match(/registerTodosCommand\(pi, todoStore\)/g)?.length, 1);
 assert.equal(source.match(/if \(todoStore\) registerTodoWidget\(pi, todoStore, undefined, undefined, \(\) => state\.visualsEnabled !== false\)/g)?.length, 1);
});

void test("agents setup requires interactive confirmation and reloads only after success", async () => {
	const notices: string[] = [];
	let installs = 0;
	let reloads = 0;
	let accepted = false;
	const ui = {
		confirm: (_title: string, message: string) => {
			assert.match(message, /pi-subagents-j0k3r/);
			assert.match(message, /gentle-agents\.ts/);
			assert.match(message, /settings\.json/);
			return Promise.resolve(accepted);
		},
		notify: (message: string) => { notices.push(message); },
	};
	const ctx = { mode: "tui", hasUI: true, cwd: "/tmp", ui, reload: () => { reloads++; return Promise.resolve(); } } as unknown as ExtensionCommandContext;
	const setup = () => { installs++; return Promise.resolve({ installed: true, changed: true, gentleCount: 1 }); };
	await handleAgentsSetupCommand("setup", ctx, setup);
	assert.equal(installs, 0);
	accepted = true;
	await handleAgentsSetupCommand("setup", ctx, setup);
	assert.equal(installs, 1);
	assert.equal(reloads, 1);
	await handleAgentsSetupCommand("status", ctx, setup, () => Promise.resolve({ jokerInstalled: true, gentleCount: 1, filtered: true, mode: "joker" as const }));
	assert.ok(notices.some((notice) => notice.includes("agent exclusion complete")));
	await handleAgentsSetupCommand("invalid", ctx, setup);
	assert.equal(installs, 1);
	assert.ok(notices.some((notice) => notice.includes("Usage:")));
	assert.deepEqual(getOsdyCommandCompletions("agents"), ["setup", "on", "off", "status"].map((action) => ({ value: `agents ${action}`, label: `agents ${action}` })));
});

void test("agents off confirms and switches, reports actual mode, and guides restart on failed reload", async () => {
	const notices: string[] = [];
	const confirmations: string[] = [];
	const modes: string[] = [];
	const ctx = { hasUI: true, cwd: "/tmp", ui: {
		confirm: (_title: string, message: string) => { confirmations.push(message); return Promise.resolve(true); },
		notify: (message: string) => { notices.push(message); },
	}, reload: () => Promise.reject(new Error("reload failed")) } as unknown as ExtensionCommandContext;
	await handleAgentsSetupCommand("off", ctx, undefined, () => Promise.resolve({ jokerInstalled: true, gentleCount: 1, filtered: false, mode: "gentle" }),
		(options) => { modes.push(options.mode); return Promise.resolve({ installed: false, changed: true, gentleCount: 1 }); });
	assert.deepEqual(modes, ["off"]);
	assert.match(confirmations[0] ?? "", /Joker.*Gentle|Gentle.*Joker/i);
	assert.ok(notices.some((notice) => /restart Pi/i.test(notice)));
	await handleAgentsSetupCommand("status", ctx, undefined, () => Promise.resolve({ jokerInstalled: true, gentleCount: 1, filtered: false, mode: "gentle" }));
	assert.ok(notices.some((notice) => /Gentle/.test(notice)));
	assert.deepEqual(getOsdyCommandCompletions("agents"), ["setup", "on", "off", "status"].map((action) => ({ value: `agents ${action}`, label: `agents ${action}` })));
});

void test("companion command completes only retained choices while editor simple remains available", () => {
	assert.deepEqual(getOsdyCommandCompletions("companion"),
		["on", "off", "toggle", "original", "drawn", "rounded", "terminal", "slim", "slim-small", "status"].map(action => ({
			value: `companion ${action}`, label: `companion ${action}`,
		})));
	assert.deepEqual(getOsdyCommandCompletions("companion si"), []);
	assert.deepEqual(getOsdyCommandCompletions("editor si"), [{ value: "editor simple", label: "editor simple" }]);
});

void test("header command completes only catalog choices and is persisted through session wiring", () => {
	assert.deepEqual(getOsdyCommandCompletions("header"), [
		{ value: "header osdy-theme", label: "header osdy-theme" },
		{ value: "header neon", label: "header neon" },
		{ value: "header block-shadow", label: "header block-shadow" },
		{ value: "header slanted", label: "header slanted" },
		{ value: "header status", label: "header status" },
	]);
	assert.deepEqual(getOsdyCommandCompletions("header n"), [
		{ value: "header neon", label: "header neon" },
	]);
	assert.deepEqual(getOsdyCommandCompletions("classic"), []);

	const source = readFileSync(new URL("./runtime.ts", import.meta.url), "utf8");
	assert.match(
		source,
		/async function handleHeaderCommand[\s\S]*?applyVisualPreference\(\{ kind: "header", value: action \}/,
	);
	assert.match(source, /headerVariant: state\.headerVariant/);
	assert.match(source, /state\.headerVariant = editorSettings\.headerVariant;/);
	assert.doesNotMatch(source, /registerCommand\(`osdy-pi-\$\{variant\}`/);
	assert.doesNotMatch(source, /\["osdy-theme", "classic"\]/);
	assert.doesNotMatch(source, /if \(isHeaderVariant\(action\)\)/);
});

void test("uninstall command is offered and wired through guarded Pi CLI removal", () => {
 assert.deepEqual(getOsdyCommandCompletions("uninstall"), [
  { value: "uninstall", label: "uninstall" },
 ]);
 const source = readFileSync(new URL("./runtime.ts", import.meta.url), "utf8");
 assert.match(source, /action === "uninstall"/);
 assert.match(source, /!ctx\.hasUI \|\| !ctx\.isProjectTrusted\(\)/);
 assert.match(source, /runOsdyUninstall\(/);
 assert.match(source, /pi\.exec\("pi", \["remove", source/);
});

void test("mascot command completes all four choices and status while persisting with immediate refresh", () => {
	assert.deepEqual(getOsdyCommandCompletions("mascot"), [
		{ value: "mascot current", label: "mascot current" },
		{ value: "mascot bts", label: "mascot bts" },
		{ value: "mascot osdy-halloween", label: "mascot osdy-halloween" },
		{ value: "mascot pi", label: "mascot pi" },
		{ value: "mascot status", label: "mascot status" },
	]);
	assert.deepEqual(getOsdyCommandCompletions("mascot p"), [
		{ value: "mascot pi", label: "mascot pi" },
	]);
	assert.deepEqual(getOsdyCommandCompletions("mascot b"), [
		{ value: "mascot bts", label: "mascot bts" },
	]);
	assert.deepEqual(getOsdyCommandCompletions("mascot o"), [
		{ value: "mascot osdy-halloween", label: "mascot osdy-halloween" },
	]);
	assert.deepEqual(getOsdyCommandCompletions("mascot d"), []);

	const source = readFileSync(new URL("./runtime.ts", import.meta.url), "utf8");
	assert.match(
		source,
		/applyVisualPreference\(\{ kind: "mascot", value: action \}/,
	);
	assert.match(source, /state\.mascot = editorSettings\.mascot;/);
	assert.match(source, /function mascotLabel\(mascot: MascotChoice\): string/);
	assert.match(source, /osdy-pi mascot: \$\{mascotLabel\(state\.mascot\)\}/);
});

void test("account switching requests an editor render independently of usage refresh", () => {
	const source = readFileSync(new URL("./runtime.ts", import.meta.url), "utf8");

	assert.match(
		source,
		/registerAccountProfilesCommand\(pi, \{[\s\S]*?requestRender: \(\) => \{[\s\S]*?state\.tui\?\.requestRender\(\);[\s\S]*?\},[\s\S]*?refreshUsage: async \(\) => \{[\s\S]*?const activeSessionContext = sessionContext;[\s\S]*?await refreshCurrentCodexUsage\(activeSessionContext\)/,
	);
});

void test("usage refresh resolves the active session instead of a distinct command context", async () => {
	const activeSessionContext = { id: "active-session" };
	const commandContext = { id: "command-context" };
	const refreshedContexts: Array<{ id: string }> = [];
	const refreshActiveSessionUsage = createActiveSessionRefresh(
		() => activeSessionContext,
		(context) => {
			refreshedContexts.push(context);
			return Promise.resolve();
		},
	);

	assert.notEqual(commandContext, activeSessionContext);
	await refreshActiveSessionUsage();
	assert.deepEqual(refreshedContexts, [activeSessionContext]);
});

void test("agent settlement refreshes enabled active Codex sessions without comparing event context identity", () => {
	const source = readFileSync(new URL("./runtime.ts", import.meta.url), "utf8");
	const agentSettledHandler = source.match(
		/pi\.on\("agent_settled", \(\) => \{([\s\S]*?)\n\t\}\);/,
	)?.[1];
	const agentEndHandler = source.match(
		/pi\.on\("agent_end", \(_event, ctx\) => \{([\s\S]*?)\n\t\}\);/,
	)?.[1];

	assert.ok(agentSettledHandler);
	assert.match(
		agentSettledHandler,
		/const activeSessionContext = sessionContext;[\s\S]*?state\.enabled[\s\S]*?activeSessionContext &&[\s\S]*?activeSessionContext\.model\?\.provider === "openai-codex"[\s\S]*?void refreshCurrentCodexUsage\(activeSessionContext\)/,
	);
	assert.doesNotMatch(agentSettledHandler, /activeSessionContext\s*===\s*ctx/);
	assert.ok(agentEndHandler);
	assert.doesNotMatch(agentEndHandler, /refreshCurrentCodexUsage/);
});

void test("Codex usage state refresh repaints the shared TUI after loading and error", async () => {
	const renderedStates: string[] = [];
	const state = {
		codexUsage: { kind: "idle" } as const,
		tui: {
			requestRender: () => renderedStates.push(state.codexUsage.kind),
		},
	};

	await refreshCodexUsage(
		{
			modelRegistry: {
				getProviderAuth: () => Promise.resolve(undefined),
			},
		},
		state,
		new AbortController(),
	);

	assert.deepEqual(renderedStates, ["loading", "error"]);
	assert.equal(state.codexUsage.kind, "error");
});

void test("Codex usage refresh repaints the shared TUI with its ready quota snapshot", async () => {
	const snapshot = {
		planType: "plus",
		ordinaryUsageAllowed: true,
		buckets: [
			{
				id: "codex",
				label: undefined,
				primary: { usedPercent: 37, windowMinutes: 300, resetsAt: undefined },
				secondary: undefined,
			},
		],
		credits: undefined,
		fetchedAt: 1_900_000_000_000,
	};
	const renderedStates: string[] = [];
	const state = {
		codexUsage: { kind: "idle" } as const,
		tui: {
			requestRender: () => renderedStates.push(state.codexUsage.kind),
		},
	};
	const accessToken = `header.${Buffer.from(
		JSON.stringify({
			"https://api.openai.com/auth": { chatgpt_account_id: "account-id" },
		}),
	).toString("base64url")}.signature`;

	await refreshCodexUsage(
		{
			modelRegistry: {
				getProviderAuth: () => Promise.resolve({ auth: { apiKey: accessToken } }),
			},
		},
		state,
		new AbortController(),
		() => Promise.resolve(snapshot),
	);

	assert.deepEqual(renderedStates, ["loading", "ready"]);
	assert.deepEqual(state.codexUsage, { kind: "ready", snapshot });
});

class IdleQuotaClock implements CodexUsageRefreshClock {
	now = 0;
	jobs = new Map<CodexUsageRefreshTimer, { at: number; run(): void }>();
	setTimeout(run: () => void, delay: number): CodexUsageRefreshTimer {
		const timer = { cancel: () => { this.jobs.delete(timer); } };
		this.jobs.set(timer, { at: this.now + delay, run });
		return timer;
	}
	async advance(ms: number): Promise<void> {
		this.now += ms;
		for (const [timer, job] of this.jobs) {
			if (job.at <= this.now) { this.jobs.delete(timer); job.run(); }
		}
		for (let i = 0; i < 16; i++) await Promise.resolve();
	}
}

async function idleQuotaFixture(visualsEnabled = true, workspaceEditor = false) {
	const clock = new IdleQuotaClock();
	const shortcuts = new Map<string, ShortcutRegistration>();
	const authSessions: number[] = [];
	const commands = new Map<string, { handler(args: string, ctx: ExtensionCommandContext): Promise<void> }>();
	const handlers = new Map<string, Array<(event: unknown, ctx: ExtensionContext) => Promise<void> | void>>();
	const requests: Array<{ signal: AbortSignal; resolve(snapshot: CodexUsageSnapshot): void; reject(error: Error): void }> = [];
	let enabled = true; let hasUI = true; let idle = true; let provider = "openai-codex"; let mode = "tui";
	let session = 0; let authCalls = 0; let panel: Component | undefined;
	let visualMounts = 0;
	let editor: Component | undefined;
	let overlay = false; let holdPanel = false; let failPanel = false; let overlays = 0;
	let closePanel: (() => void) | undefined;
	const notices: string[] = [];
	const theme = { fg: (_color: string, text: string) => text, bold: (text: string) => text };
	const identity = (text: string) => text;
	const tui = { mode: "fullscreen", terminal: { columns: 120, rows: 40 }, requestRender() {}, hasOverlay: () => overlay } as unknown as TUI;
	const writes: GlobalEditorSettings[] = [];
	const snapshot = (fetchedAt: number): CodexUsageSnapshot => ({ fetchedAt, planType: "plus", ordinaryUsageAllowed: true,
		buckets: workspaceEditor ? [{ id: "codex", label: undefined,
			primary: { usedPercent: 25, windowMinutes: 300, resetsAt: undefined },
			secondary: { usedPercent: 60, windowMinutes: 10080, resetsAt: undefined } }] : [], credits: undefined });
	const pi = { getThinkingLevel: () => "off", registerCommand: (name: string, command: { handler(args: string, ctx: ExtensionCommandContext): Promise<void> }) => commands.set(name, command),
		registerShortcut: (key: string, shortcut: ShortcutRegistration) => shortcuts.set(key, shortcut),
		on: (name: string, handler: (event: unknown, ctx: ExtensionContext) => Promise<void> | void) => {
			const list = handlers.get(name) ?? []; list.push(handler); handlers.set(name, list);
		}, registerFlag: () => {}, registerMessageRenderer: () => {}, registerEntryRenderer: () => {},
		events: { on: () => () => {} }, exec: () => { throw new Error("external execution forbidden"); },
	} as unknown as ExtensionAPI;
	const accessToken = `header.${Buffer.from(JSON.stringify({ "https://api.openai.com/auth": { chatgpt_account_id: "fake-account" } })).toString("base64url")}.signature`;
	const makeContext = () => {
		const generation = session;
		return ({ cwd: "/synthetic-idle-quota", get hasUI() { return hasUI; }, get mode() { return mode; },
		get model() { return { provider, id: "fake-codex", name: `session-${session}` }; }, isIdle: () => idle,
		getContextUsage: () => undefined,
		...(workspaceEditor ? { sessionManager: { getSessionId: () => `session-${generation}`, getEntries: () => [] } } : {}),
		getThinkingLevel: () => "off", modelRegistry: { getProviderAuth: () => {
			authCalls++; authSessions.push(generation); return Promise.resolve({ auth: { apiKey: accessToken } });
		} }, ui: { theme, getEditorComponent: () => undefined,
			setEditorComponent: (factory: Parameters<ExtensionContext["ui"]["setEditorComponent"]>[0]) => {
				visualMounts++;
				if (workspaceEditor && factory) editor = factory(tui, { borderColor: identity, selectList: {
					selectedPrefix: identity, selectedText: identity, description: identity, scrollInfo: identity, noMatch: identity,
				} }, new KeybindingsManager());
			},
			setHeader: (factory?: (tui: TUI, theme: SimpleTheme) => Component & { dispose?(): void }) => {
				visualMounts++; if (workspaceEditor) factory?.(tui, theme).dispose?.();
			}, setFooter: () => { visualMounts++; },
			setWidget: () => { visualMounts++; }, setWorkingVisible: () => { visualMounts++; }, notify: (message: string) => { notices.push(message); },
			custom: (factory: (tui: unknown, theme: unknown, keys: unknown, done: () => void) => Component) => {
				overlays++; if (failPanel) throw new Error("overlay failed");
				panel = factory({ requestRender: () => {} }, theme, undefined, () => { overlay = false; closePanel?.(); });
				if (!holdPanel) return Promise.resolve();
				overlay = true;
				return new Promise<void>(resolve => { closePanel = resolve; });
			},
		},
		}) as unknown as ExtensionContext;
	};
	let ctx = makeContext();
	const previousDir = process.env.PI_CODING_AGENT_DIR;
	// A nonexistent synthetic directory prevents factory inspection of personal settings.
	process.env.PI_CODING_AGENT_DIR = "/nonexistent-osdy-idle-quota-fixture";
	try {
		await registerOsdyPi(pi, { readActiveProfile: () => Promise.resolve(undefined), codexUsageClock: clock,
			fetchCodexUsage: (_auth, { signal }) => new Promise((resolve, reject) => { requests.push({ signal, resolve, reject }); }),
			editorSettingsStore: { path: "/unused", save: settings => { writes.push(settings); return Promise.resolve(); }, load: () => Promise.resolve({
				version: 1, enabled, visualsEnabled, editorMode: workspaceEditor ? "extended" : "simple", headerVariant: "osdy-theme", mascot: "current", workingTreeEnabled: false,
			}) },
		});
	} finally {
		if (previousDir === undefined) delete process.env.PI_CODING_AGENT_DIR; else process.env.PI_CODING_AGENT_DIR = previousDir;
	}
	const lifecycle = async (name: string) => {
		const handler = handlers.get(name)?.find(candidate => candidate.toString().includes(
			name === "agent_settled" ? "refreshCurrentCodexUsage" : "idleUsageRefresh"));
		assert.ok(handler, `runtime ${name} handler must be registered`);
		await handler({}, ctx); await clock.advance(0);
	};
	return { clock, requests, snapshot, authSessions, writes, commands, notices, editor: () => editor!, overlays: () => overlays,
		hold: () => { holdPanel = true; }, fail: (value: boolean) => { failPanel = value; }, overlay: (value: boolean) => { overlay = value; },
		dismiss: () => panel?.handleInput?.("\x1b"), visualMounts: () => visualMounts, authCalls: () => authCalls, context: () => ctx,
		start: () => lifecycle("session_start"), stop: () => lifecycle("session_shutdown"), settle: () => lifecycle("agent_settled"),
		replace: async () => { session++; ctx = makeContext(); await lifecycle("session_start"); },
		manual: async () => { await commands.get("usage")!.handler("", ctx as ExtensionCommandContext); await clock.advance(0); },
		shortcut: async (context: ExtensionContext = ctx) => {
			assert.ok(shortcuts.has("ctrl+alt+u"), "Ctrl+Alt+U must open subscription usage");
			assert.equal(shortcuts.has("f1"), false);
			assert.equal(shortcuts.has("f2"), false);
			assert.equal("reload" in context, false);
			await shortcuts.get("ctrl+alt+u")!.handler(context); await clock.advance(0);
		},
		visual: async (action: "on" | "off") => { await commands.get("osdy-pi")!.handler(action, ctx as ExtensionCommandContext); },
		panel: () => panel!.render(100).join("\n"),
		set: (values: { enabled?: boolean; hasUI?: boolean; idle?: boolean; provider?: string; mode?: string }) => {
			enabled = values.enabled ?? enabled; hasUI = values.hasUI ?? hasUI; idle = values.idle ?? idle;
			provider = values.provider ?? provider; mode = values.mode ?? mode;
		},
		complete: async (index: number, at = index) => { requests[index]!.resolve(snapshot(at)); await clock.advance(0); },
	};
}

void test("visual-only off retains startup, idle, settlement and explicit quota refresh", async () => {
	const f = await idleQuotaFixture(false);
	try {
		await f.start(); assert.equal(f.requests.length, 1);
		await f.complete(0); await f.clock.advance(60_000); assert.equal(f.requests.length, 2);
		await f.complete(1); await f.settle(); assert.equal(f.requests.length, 3);
		await f.complete(2); await f.shortcut(); assert.equal(f.requests.length, 4);
		await f.complete(3);
		assert.equal(f.visualMounts(), 0, "startup, settlement and quota panels never claim automatic visual surfaces");
		for (const name of ["osdyConfig", "osdy-account", "osdy-usage"]) assert.ok(f.commands.has(name));
		await f.visual("off"); assert.equal(f.writes.at(-1)?.enabled, false);
		await f.visual("on");
		assert.equal(f.writes.at(-1)?.enabled, true);
		assert.equal(f.writes.at(-1)?.visualsEnabled, false, "legacy master changes preserve the separate preference");
	} finally { await f.stop(); }
});

void test("registered idle quota runtime respects timing, in-flight manual requests and settlement", async () => {
	const f = await idleQuotaFixture();
	try {
		await f.start(); assert.equal(f.requests.length, 1);
		await f.clock.advance(60_000); assert.equal(f.requests.length, 1, "startup still in flight");
		await f.complete(0);
		await f.clock.advance(59_999); assert.equal(f.requests.length, 1);
		await f.clock.advance(1); assert.equal(f.requests.length, 2);
		await f.manual(); assert.equal(f.requests.length, 3);
		assert.equal(f.requests[1]?.signal.aborted, true, "manual refresh wins over idle query");
		await f.complete(1); assert.match(f.panel(), /Refreshing|Loading|loading|refreshing/);
		await f.clock.advance(60_000); assert.equal(f.requests.length, 3, "timer must not supersede manual query");
		await f.settle(); assert.equal(f.requests.length, 4, "settlement remains a lifecycle refresh");
		assert.equal(f.requests[2]?.signal.aborted, true);
		await f.complete(2); await f.complete(3);
		await f.clock.advance(60_000); assert.equal(f.requests.length, 5);
		assert.equal(f.authCalls(), 5, "only active auth is queried");
		assert.equal(f.clock.jobs.size, 0, "timer is suspended while idle query is pending");
	} finally { await f.stop(); }
});

void test("workspace Usage left-click opens the existing live /usage modal once and follows the foreground context", async () => {
 const f = await idleQuotaFixture(true, true);
 const click = (editor = f.editor(), change: Partial<TuiMouseEvent> = {}) => {
  const lines = editor.render(120);
  const y = lines.findIndex(line => line.includes("Session"));
  assert.ok(y >= 0, "applicable quota content must remain visible");
  return editor.handleMouse?.({ type: "click", button: "left", x: 5, y, screenX: 15, screenY: y + 20,
   width: 120, height: lines.length, shift: false, alt: false, ctrl: false, ...change });
 };
 try {
  await f.start(); await f.complete(0);
  for (const change of [{ button: "right" }, { type: "press" }, { type: "release" }, { type: "drag" }, { type: "wheel" }] as const)
   assert.equal(click(f.editor(), change), undefined);
  assert.equal(f.overlays(), 0);
  f.hold();
  assert.equal(click()?.handled, true, "a quota left-click must call the shared modal opener");
  click(); await f.clock.advance(0);
  assert.equal(f.overlays(), 1);
  assert.match(f.panel(), /Codex subscription usage/);
  assert.match(f.panel(), /u use\/check reset/, "mouse preserves reset binding, not a replacement modal");
  await f.complete(1); f.dismiss(); await f.clock.advance(0);
  f.fail(true); click(); await f.clock.advance(0);
  assert.match(f.notices.join("\n"), /overlay failed/);
  f.fail(false); click(); await f.clock.advance(0);
  assert.equal(f.overlays(), 3, "error releases the opening guard");
  await f.complete(2); f.dismiss(); await f.clock.advance(0);
  const oldEditor = f.editor();
  await f.replace(); await f.complete(3);
  click(oldEditor); await f.clock.advance(0);
  assert.equal(f.authSessions.at(-1), 1, "stale editor uses current foreground auth/context");
  await f.complete(4);
  f.dismiss(); await f.clock.advance(0);
  f.overlay(true); const count = f.overlays(); click(); await f.clock.advance(0);
  assert.equal(f.overlays(), count, "existing overlay is not replaced by a workspace click");
  f.overlay(false);
 } finally { f.dismiss(); await f.stop(); }
});

void test("Ctrl+Alt+U opens the usage command panel and refreshes the latest session from a base context", async () => {
	const f = await idleQuotaFixture();
	try {
		await f.start(); await f.complete(0);
		await f.manual();
		const commandPanel = f.panel();
		await f.shortcut();
		assert.equal(f.panel(), commandPanel, "both entry points render the same loading dashboard and metadata");
		assert.equal(f.requests.length, 3);
		assert.equal(f.requests[1]?.signal.aborted, true, "Ctrl+Alt+U supersedes the command refresh");
		await f.complete(1); await f.complete(2);
		assert.match(f.panel(), /Codex subscription usage/);
		const oldContext = f.context();
		await f.replace(); await f.complete(3);
		await f.shortcut(oldContext);
		assert.equal(f.authSessions.at(-1), 1, "even an older shortcut context refreshes current session auth");
		await f.stop();
		assert.equal(f.requests[4]?.signal.aborted, true);
		await f.complete(4);
		assert.equal(f.clock.jobs.size, 0, "shutdown ignores the late shortcut query result");
	} finally { await f.stop(); }
});

void test("registered idle quota runtime skips disabled UI, non-Codex and busy sessions", async () => {
	const f = await idleQuotaFixture();
	try {
		await f.start(); await f.complete(0);
		for (const values of [{ hasUI: false }, { hasUI: true, mode: "rpc" }, { mode: "tui", provider: "other" },
			{ provider: "openai-codex", idle: false }]) {
			f.set(values); await f.clock.advance(60_000); assert.equal(f.requests.length, 1);
		}
		f.set({ idle: true }); await f.clock.advance(60_000); assert.equal(f.requests.length, 2);
		await f.complete(1);
		await f.visual("off"); await f.clock.advance(60_000); assert.equal(Number(f.requests.length), 2);
		await f.visual("on"); await f.clock.advance(60_000); assert.equal(Number(f.requests.length), 3);
		await f.complete(2);
		f.set({ enabled: false }); await f.replace();
		const before = f.requests.length; await f.clock.advance(60_000); assert.equal(f.requests.length, before);
		f.set({ enabled: true }); await f.replace(); await f.complete(before);
		await f.clock.advance(60_000); assert.equal(f.requests.length, before + 2);
	} finally { await f.stop(); }
});

void test("registered idle quota runtime backs off errors and recovers after a successful query", async () => {
	const f = await idleQuotaFixture();
	try {
		await f.start(); await f.complete(0);
		await f.clock.advance(60_000); f.requests[1]!.reject(new Error("offline")); await f.clock.advance(0);
		await f.clock.advance(119_999); assert.equal(f.requests.length, 2);
		await f.clock.advance(1); assert.equal(f.requests.length, 3);
		await f.complete(2); await f.clock.advance(60_000); assert.equal(f.requests.length, 4);
	} finally { await f.stop(); }
});

void test("registered idle quota runtime cleans pending timers and rejects old-session results", async () => {
	const f = await idleQuotaFixture();
	try {
		await f.start(); await f.complete(0);
		await f.stop(); assert.equal(f.clock.jobs.size, 0);
		await f.clock.advance(60_000); assert.equal(f.requests.length, 1);
		await f.start(); await f.replace();
		assert.equal(f.requests[1]?.signal.aborted, true);
		await f.complete(1); await f.complete(2);
		await f.clock.advance(60_000); assert.equal(f.requests.length, 4);
		await f.replace(); assert.equal(f.requests[3]?.signal.aborted, true);
		await f.complete(3); assert.equal(f.clock.jobs.size, 1, "old completion cannot add a timer");
		await f.manual(); await f.complete(4);
		assert.match(f.panel(), /Refreshing|Loading|loading|refreshing/, "old session cannot publish quota");
		await f.stop(); assert.equal(f.requests[5]?.signal.aborted, true);
		await f.complete(5);
		assert.equal(f.clock.jobs.size, 0);
		await f.clock.advance(600_000); assert.equal(f.requests.length, 6);
	} finally { await f.stop(); }
});

void test("aborted auth resolution cannot start a remote query or repaint stale state", async () => {
	let finish: (value: { auth: { apiKey: string } }) => void = () => {};
	let renders = 0; let queries = 0;
	const state: Pick<OsdyState, "codexUsage" | "tui"> = { codexUsage: { kind: "idle" },
		tui: { requestRender: () => { renders++; } } as unknown as TUI };
	const abort = new AbortController();
	const pending = refreshCodexUsage({ modelRegistry: { getProviderAuth: () => new Promise(resolve => { finish = resolve; }) } },
		state, abort, () => { queries++; return Promise.reject(new Error("forbidden")); });
	abort.abort(); state.codexUsage = { kind: "idle" }; finish({ auth: { apiKey: "synthetic" } });
	assert.equal(await pending, undefined); assert.equal(queries, 0); assert.equal(renders, 1);
	assert.deepEqual(state.codexUsage, { kind: "idle" });
});

void test("automatic Codex refresh retains the last snapshot on loading and failure", async () => {
	const snapshot = { planType: undefined, ordinaryUsageAllowed: undefined, buckets: [], credits: undefined, fetchedAt: 123 };
	const state: Pick<OsdyState, "codexUsage"> = { codexUsage: { kind: "ready", snapshot } };
	let finish: (value: undefined) => void = () => {};
	const pending = refreshCodexUsage({ modelRegistry: { getProviderAuth: () => new Promise(resolve => { finish = resolve; }) } },
		state, new AbortController(), undefined, true);
	assert.deepEqual(state.codexUsage, { kind: "loading", snapshot });
	finish(undefined);
	assert.equal(await pending, false);
	assert.equal(state.codexUsage.kind, "error");
	assert.ok("snapshot" in state.codexUsage);
	assert.equal(state.codexUsage.snapshot, snapshot);
});

void test("Codex refresh discards prior usage snapshots and shutdown resets usage state", () => {
	const source = readFileSync(new URL("./runtime.ts", import.meta.url), "utf8");
	assert.match(
		source,
		/state\.codexUsage = \{ kind: "loading", snapshot: undefined \}/,
	);
	assert.match(source, /kind: "error",[\s\S]*?snapshot: undefined,/);
	assert.match(
		source,
		/pi\.on\("session_shutdown", \(\) => \{[\s\S]*?codexUsageAbort\?\.abort\(\);[\s\S]*?state\.codexUsage = \{ kind: "idle" \}/,
	);
});

void test("agent and tool completion reclaim the Gentle changed-files widget", () => {
	const source = readFileSync(new URL("./runtime.ts", import.meta.url), "utf8");
	const agentEndHandler = source.match(
		/pi\.on\("agent_end", \(_event, ctx\) => \{([\s\S]*?)\n\t\}\);/,
	)?.[1];
	const toolExecutionEndHandler = source.match(
		/pi\.on\("tool_execution_end", \(event, ctx\) => \{([\s\S]*?)\n\t\}\);/,
	)?.[1];

	assert.ok(agentEndHandler);
	assert.ok(toolExecutionEndHandler);
	assert.match(
		agentEndHandler,
		/if \(areVisualsEnabled\(state\)\) clearGentleShellChangesWidget\(ctx\)/,
	);
	assert.match(
		toolExecutionEndHandler,
		/if \(areVisualsEnabled\(state\)\) clearGentleShellChangesWidget\(ctx\)/,
	);
});

void test("session shutdown does not restore the captured fallback editor", () => {
	const source = readFileSync(new URL("./runtime.ts", import.meta.url), "utf8");
	const shutdownHandler = source.match(
		/pi\.on\("session_shutdown", \(\) => \{([\s\S]*?)\n\t\}\);/,
	)?.[1];

	assert.ok(shutdownHandler);
	assert.doesNotMatch(shutdownHandler, /disableOsdyPi|setEditorComponent/);
});

void test("persisted disabled startup leaves Gentle UI unclaimed and simple startup stays native", () => {
	const source = readFileSync(new URL("./runtime.ts", import.meta.url), "utf8");
	const sessionStartHandler = source.match(
		/pi\.on\("session_start", async \(_event, ctx\) => \{([\s\S]*?)\n\t\}\);/,
	)?.[1];

	assert.ok(sessionStartHandler);
	assert.match(
		sessionStartHandler,
		/state\.fallbackEditorFactory = ctx\.ui\.getEditorComponent\(\);[\s\S]*?state\.enabled = editorSettings\.enabled;[\s\S]*?if \(!state\.enabled\) return;/,
	);
	assert.match(
		sessionStartHandler,
		/state\.editorMode = editorSettings\.editorMode;[\s\S]*?claimOsdyVisualLayer\(/,
	);
	assert.match(
		sessionStartHandler,
		/if \(!state\.enabled\) return;[\s\S]*?startResponsive\(\)/,
	);
	assert.match(
		source,
		/const startResponsive = \(\): void => \{[\s\S]*?responsiveCoordinator = createResponsiveCoordinator\(/,
	);
});

void test("enable, disable, and their on/off aliases persist the complete visual settings", () => {
	const source = readFileSync(new URL("./runtime.ts", import.meta.url), "utf8");

	assert.match(source, /\["enable", "on"\]\.includes\(action\)/);
	assert.match(source, /\["disable", "off"\]\.includes\(action\)/);
	assert.match(
		source,
		/settingsStore\.save\(\{[\s\S]*?enabled: state\.enabled,[\s\S]*?editorMode: state\.editorMode,[\s\S]*?workingTreeEnabled: state\.workingTreeEnabled,[\s\S]*?\}\)/,
	);
});

void test("registers session-backed todo surfaces without the old ODD tool", () => {
 const source = readFileSync(new URL("./runtime.ts", import.meta.url), "utf8");
 assert.match(source, /import \{ registerTodoTool \} from "\.\/todo-tool\.js"/);
 assert.match(source, /import \{ registerTodosCommand \} from "\.\/todo-command\.js"/);
 assert.doesNotMatch(source, /registerOddTodo|odd-todo-ui/);
});

void test("does not import or register the response-card Markdown transformer", () => {
	const source = readFileSync(new URL("./runtime.ts", import.meta.url), "utf8");

	assert.doesNotMatch(source, /response-card/);
	assert.doesNotMatch(source, /pi\.registerMarkdownTransformer\(/);
});

void test("every registered theme defines native user message colors", () => {
	const manifest = JSON.parse(
		readFileSync(new URL("../../package.json", import.meta.url), "utf8"),
	) as { pi: { themes: string[] } };

	assert.equal(manifest.pi.themes.length, 23);
	assert.equal(new Set(manifest.pi.themes).size, 23, "theme registrations must be unique");
	for (const themePath of manifest.pi.themes) {
		const theme = JSON.parse(
			readFileSync(
				new URL(`../../${themePath.replace(/^\.\//, "")}`, import.meta.url),
				"utf8",
			),
		) as { colors: Record<string, unknown> };
		for (const token of ["userMessageBg", "userMessageText"]) {
			const value = theme.colors[token];
			assert.equal(
				typeof value === "string" && value.trim() !== "",
				true,
				`${themePath} must define a non-empty ${token}`,
			);
		}
	}
});

void test("new dark themes are explicitly registered with unique matching names", () => {
	const manifest = JSON.parse(
		readFileSync(new URL("../../package.json", import.meta.url), "utf8"),
	) as { pi: { themes: string[] } };
	const names = manifest.pi.themes.map((path) => {
		const theme = JSON.parse(readFileSync(new URL(`../../${path}`, import.meta.url), "utf8")) as { name: string };
		assert.equal(path, `./themes/${theme.name}.json`);
		return theme.name;
	});
	assert.equal(new Set(names).size, names.length, "theme names must be unique");
	for (const name of ["osdy-pi-gruvbox-dark", "osdy-pi-nord", "osdy-pi-rose-pine", "osdy-pi-daniela-cute", "osdy-pi-halloween", "osdy-pi-halloween-killer", "osdy-pi-spider-man-classic", "osdy-pi-miles-morales", "osdy-pi-spider-verse"]) {
		assert.equal(manifest.pi.themes.filter((path) => path === `./themes/${name}.json`).length, 1);
		assert.equal(names.filter((registered) => registered === name).length, 1);
	}
});

void test("README documents all 23 themes including three Spider-Man-inspired palettes", () => {
	const readme = readFileSync(new URL("../../README.md", import.meta.url), "utf8");
	assert.match(readme, /\*\*23 themes\*\*/);
	assert.match(readme, /23 built-in themes/);
	assert.doesNotMatch(readme, /\b(?:18|20) (?:built-in )?themes\b/);
	assert.equal(readme.match(/^\| `osdy-pi-[^`]+` \|/gm)?.length, 23);
	for (const name of ["osdy-pi-spider-man-classic", "osdy-pi-miles-morales", "osdy-pi-spider-verse"]) {
		assert.ok(readme.includes(`| \`${name}\` |`), `${name}: documented theme row`);
	}
	assert.match(readme, /\| `osdy-pi-daniela-cute` \| Daniela Cute/);
	assert.match(readme, /\| `osdy-pi-halloween` \|.*[Pp]umpkin.*violet.*lime/);
	assert.match(readme, /\| `osdy-pi-halloween-killer` \|.*[Gg]othic.*blood.red.*violet/);
});

void test("Tokyo Night retains its approved native user card colors", () => {
	const theme = JSON.parse(
		readFileSync(
			new URL("../../themes/osdy-pi-tokyo-night.json", import.meta.url),
			"utf8",
		),
	) as { colors: Record<string, unknown> };

	assert.deepEqual(
		{
			userMessageBg: theme.colors.userMessageBg,
			userMessageText: theme.colors.userMessageText,
		},
		{
			userMessageBg: "#283b59",
			userMessageText: "text",
		},
	);
});

void test("question prompts subscribe through the plugin event bus", () => {
	const api = new TestExtensionApi();
	const sessionContextProvider = new TestSessionContextProvider();
	const notifiedContexts: ExtensionContext[] = [];

	subscribeQuestionPromptAudioNotification(api, sessionContextProvider, {
		onQuestionRequested: (ctx) => notifiedContexts.push(ctx),
	});

	assert.equal(api.events.event, PLUGIN_EVENTS.QUESTION_PROMPT);
	assert.equal(api.lifecycleOnCallCount, 0);
	api.events.emit(PLUGIN_EVENTS.QUESTION_PROMPT, undefined);
	assert.deepEqual(notifiedContexts, []);

	// SAFETY: The notification contract only passes this context through unchanged.
	const sessionContext = {} as ExtensionContext;
	sessionContextProvider.context = sessionContext;
	api.events.emit(PLUGIN_EVENTS.QUESTION_PROMPT, { question: "Continue?" });
	assert.deepEqual(notifiedContexts, [sessionContext]);
});

import assert from "node:assert/strict";
import { existsSync, readFileSync, mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI, Theme } from "@earendil-works/pi-coding-agent";
import { registerHooks } from "node:module";
import test from "node:test";
import { fileURLToPath } from "node:url";
import type { ExtensionCommandContext, ExtensionContext } from "@earendil-works/pi-coding-agent";
import ts from "typescript";
import type { OsdyState, WorkingTreeState, WorkingWidgetState, GlobalEditorSettings } from "./types.js";
import type { VisualPreferenceAction } from "./control-center-preferences.js";
import type { ProfileCodexUsageResult } from "./profile-codex-usage.js";
import { Container, TuiMainScreen, type Component, type OverlayHandle, type Terminal, type TUI } from "@earendil-works/pi-tui";

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

const profileLabels = await import("./profile-label.js");
const { showControlCenter } = await import("./control-center.js");

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
		on: () => {}, registerFlag: () => {}, registerMessageRenderer: () => {}, registerEntryRenderer: () => {}, events: { on: () => () => {} },
		exec: () => { throw new Error("launcher or provider forbidden"); } } as unknown as ExtensionAPI;
	const ctx = { cwd: process.cwd(), mode: "tui", hasUI: true, isIdle: () => true, waitForIdle: () => Promise.resolve(), ui: {
		notify: (text: string) => notices.push(text),
		setEditorComponent: () => {}, setHeader: () => {}, setFooter: () => {}, setWidget: () => {}, setWorkingVisible: () => {},
		theme: { name: "dark", appearance: "dark", fg: (_color: string, text: string) => text }, getAllThemes: () => [], setTheme: () => ({ success: false }),
		custom: async (factory: (tui: unknown, theme: unknown, keys: unknown, done: (result: unknown) => void) => Component & { handleInput(data: string): void }) => {
			let result: unknown;
			const panel = factory({ terminal: { rows: 40 }, requestRender: () => { renderCount++; } }, undefined, undefined, value => { result = value; });
			for (let i = 0; i < 6; i++) panel.handleInput("\x1b[B");
			for (let i = 0; i < 16; i++) await Promise.resolve();
			panel.handleInput("\x1b[C"); views.push(panel.render(140).join("\n"));
			panel.handleInput("\r"); for (let i = 0; i < 16; i++) await Promise.resolve();
			panel.handleInput("\r"); views.push(panel.render(140).join("\n"));
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
		assert.match(views[0] ?? "", /View usage: work/); assert.match(views[1] ?? "", /Querying stored-profile Codex usage: work/);
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
			{ kind: "editor", value: "simple" }, { kind: "editor", value: "extended" },
			{ kind: "editor", value: "auto" },
		] as const satisfies readonly VisualPreferenceAction[]) {
			const state: OsdyState = { enabled, headerVariant: "osdy-theme", mascot: "current", editorMode: "auto",
				editorEffective: true, smallMode: false, workingTreeEnabled: false, workingTreePlacement: "aboveEditor",
				codexUsage: { kind: "idle" }, fallbackEditorFactory: undefined, tui: undefined };
			const tree: WorkingTreeState = { enabled: false, visible: false, loading: false, snapshot: null, error: undefined, tui: undefined };
			const working: WorkingWidgetState = { active: false, label: "Working", frame: 0, timer: undefined, tui: undefined };
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

async function focusFixture(options: { boundary?: boolean; throwApply?: boolean; synchronousThrow?: boolean; underlyingOverlay?: boolean; startupFailure?: boolean; registered?: boolean; todoDir?: string; reloadFails?: boolean;
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
	const working: WorkingWidgetState = { active: false, label: "Working", frame: 0, timer: undefined, tui: undefined };
	let resolveSave: () => void = () => {};
	let rejectSave: () => void = () => {};
	const store = { path: "/unused", load: () => Promise.reject(new Error("must not load")), save: (settings: GlobalEditorSettings) => new Promise<void>((resolve, reject) => {
		writes.push(settings);
		resolveSave = resolve; rejectSave = () => reject(new Error("disk full"));
	}) };
	let panel: Component & { dispose?(): void };
	let handle: OverlayHandle;
	let otherHandle: OverlayHandle | undefined;
	let complete: () => void = () => {};
	let current = true;
	let headerMounts = 0;
	const writes: GlobalEditorSettings[] = [];
	let replacements = 0;
	let closes = 0;
	const notices: string[] = [];
	const theme = { name: "dark", appearance: "dark" as const, fg: (_color: string, text: string) => text };
	const lifecycle: string[] = [];
	const ctx = { cwd: options.todoDir ?? "/synthetic", isIdle: () => true,
		reload: () => { lifecycle.push("reload"); return options.reloadFails ? Promise.reject(new Error("reload failed")) : Promise.resolve(); },
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
				complete = () => finish(undefined);
				panel = factory(tui, theme as Theme, undefined as never, finish) as typeof panel;
				const overlayOptions = customOptions?.overlayOptions;
				handle = tui.showOverlay(panel, typeof overlayOptions === "function" ? overlayOptions() : overlayOptions);
				customOptions?.onHandle?.(handle);
			});
		},
	} };
	tui.start();
	const runtimeCtx = ctx as unknown as ExtensionContext;
	const coordinator = createResponsiveCoordinator({} as ExtensionAPI, runtimeCtx, state, tree);
	coordinator.start();
	const showDirect = () => withEditorMountHold({} as ExtensionAPI, runtimeCtx, state, tree, async () => { await showControlCenter(runtimeCtx, {
		snapshot: () => state,
		apply: action => {
			if (options.synchronousThrow) {
				throw new Error("UI apply failed");
			}
			if (options.throwApply) return Promise.reject(new Error("UI apply failed"));
			return applyVisualPreference(action, {} as ExtensionAPI, runtimeCtx, state, working, tree, store);
		},
	}); }, () => current);
	let shutdown = () => {};
	let transition = () => Promise.resolve();
	let reopen = showDirect;
	if (options.registered) {
		coordinator.stop();
		const commands = new Map<string, { handler(args: string, ctx: ExtensionCommandContext): Promise<void> }>();
		const handlers = new Map<string, Array<(event: unknown, ctx: ExtensionContext) => Promise<void> | void>>();
		const pi = { registerCommand: (name: string, command: { handler(args: string, ctx: ExtensionCommandContext): Promise<void> }) => commands.set(name, command),
			on: (name: string, handler: (event: unknown, ctx: ExtensionContext) => Promise<void> | void) => {
				const registered = handlers.get(name) ?? []; registered.push(handler); handlers.set(name, registered);
			},
			registerFlag: () => {}, registerMessageRenderer: () => {}, registerEntryRenderer: () => {}, events: { on: () => () => {} },
		} as unknown as ExtensionAPI;
		const previousDir = process.env.PI_CODING_AGENT_DIR;
		process.env.PI_CODING_AGENT_DIR = mkdtempSync(join(tmpdir(), "osdy-modal-runtime-"));
		try {
			await registerOsdyPi(pi, { ...(options.accountFactory ? { accountFactory: options.accountFactory } : {}), readActiveProfile: () => Promise.resolve(undefined), editorSettingsStore: {
				...store, load: () => Promise.resolve({ version: 1, enabled: true, editorMode: "auto", headerVariant: "osdy-theme",
					mascot: "current", workingTreeEnabled: false }),
			} });
		} finally {
			if (previousDir === undefined) delete process.env.PI_CODING_AGENT_DIR; else process.env.PI_CODING_AGENT_DIR = previousDir;
		}
		await handlers.get("session_start")?.[1]?.({}, runtimeCtx);
		replacements = 0;
		headerMounts = 0;
		shutdown = () => { void handlers.get("session_shutdown")?.[1]?.({}, runtimeCtx); };
		transition = async () => { await handlers.get("session_start")?.[1]?.({}, runtimeCtx); };
		reopen = () => commands.get("osdyConfig")!.handler("", runtimeCtx as ExtensionCommandContext);
	}
	if (options.underlyingOverlay) otherHandle = tui.showOverlay({ render: () => ["Other overlay"], invalidate: () => {} });
	const showing = reopen();
	await Promise.resolve();
	return { tui, showing, state, tree, notices, writes, lifecycle, editorFactories, fallback, shutdown, transition, reopen, resize: (columns: number) => { width = columns; }, headerMounts: () => headerMounts,
		failFactory: () => withEditorMountHold({} as ExtensionAPI, runtimeCtx, state, tree,
			() => ctx.ui.custom(() => { throw new Error("factory callback failed"); }, { overlay: true })),
		invalidateRuntime: () => { current = false; state.editorMountHold = undefined; state.editorReconcilePending = false; coordinator.stop(); },
		disable: () => { state.enabled = false; disableOsdyPi(runtimeCtx, state); },
		reconcile: () => reconcileResponsiveUi({} as ExtensionAPI, runtimeCtx, state, tree), send: (data: string) => input(data), text: () => panel.render(100).join("\n"),
		focused: () => handle.isFocused(), replacements: () => replacements, closes: () => closes,
		resolveSave: () => resolveSave(), rejectSave: () => rejectSave(), complete: () => complete(),
		editors, mountedEditor: () => editors.find(candidate => editorArea.children.includes(candidate))!,
		other: () => otherHandle, cleanup: () => { shutdown(); coordinator.stop(); panel?.dispose?.(); handle?.hide(); otherHandle?.hide(); tui.stop(); } };
}
for (const closePending of [false, true]) {
	void test(`registered Account real TUI ${closePending ? "aborts pending preview and ignores late completion" : "renders selected profile quota before Escape restores mounted input"}`, async () => {
		const { bindControlCenterAccount } = await import("./control-center-account.js");
		const queries: string[] = []; const metadataCalls: string[][] = [];
		let signal: AbortSignal | undefined;
		let finish: (result: ProfileCodexUsageResult) => void = () => {};
		let factoryCalls = 0; let renders = 0; let activations = 0; let activeRefreshes = 0;
		const checkedAt = 1_900_000_000_000; const resetsAt = checkedAt + 3_600_000;
		const result: ProfileCodexUsageResult = {
			status: "ready", profile: "work", checkedAt,
			quotaSnapshot: { fetchedAt: checkedAt, planType: "plus", ordinaryUsageAllowed: true, credits: undefined,
				buckets: [{ id: "codex", label: "Codex", primary: { usedPercent: 37, windowMinutes: 300, resetsAt }, secondary: undefined }] },
		};
		const f = await focusFixture({ registered: true, accountFactory: (context, _refresh, render, _backend, options) => {
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
			for (let i = 0; i < 3; i++) f.send("\x1b[B");
			await flushFocus(); await flushFocus();
			f.send("\x1b[C"); f.send("\x1b[H");
			// Each inactive profile has preview, switch and default rows: select work's preview.
			for (let i = 0; i < 3; i++) f.send("\x1b[B");
			assert.match(f.text(), /> View usage: work/);
			assert.deepEqual(queries, [], "navigation must not query quota");
			f.send("\r"); await flushFocus(); f.send("\r"); await flushFocus();
			assert.deepEqual(queries, ["work"], "duplicate Enter while pending must not fetch again");
			assert.match(f.text(), /Querying stored-profile Codex usage: work/);
			assert.equal(f.focused(), true); assert.equal(f.mountedEditor(), mounted);
			assert.equal(signal?.aborted, false);
			if (!closePending) {
				finish(result); await flushFocus(); await flushFocus();
				const text = f.text();
				assert.match(text, /Stored-profile Codex usage checked/);
				assert.match(text, /Profile: work/); assert.match(text, /Codex \/ Session: 63% remaining/);
				assert.ok(text.includes(`Next reset: ${new Date(resetsAt).toLocaleString()}`));
				assert.ok(text.includes(`Checked: ${new Date(checkedAt).toLocaleString()} (local time)`));
				assert.doesNotMatch(text, /Confirm account action/);
			}
			f.lifecycle.length = 0;
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

void test("registered TODO reload follows public done, SDK hide/dispose and deferred editor mount release", async () => {
	for (const reloadFails of [false, true]) {
		const previousDir = process.env.PI_CODING_AGENT_DIR;
		const agentDir = mkdtempSync(join(tmpdir(), "osdy-cc07-runtime-"));
		process.env.PI_CODING_AGENT_DIR = agentDir;
		const f = await focusFixture({ registered: true, todoDir: agentDir, reloadFails });
		try {
			f.lifecycle.length = 0;
			// Queue simple editor while this real overlay still owns input.
			for (let i = 0; i < 3; i++) f.send("\x1b[B");
			f.send("\x1b[C"); f.send("\x1b[F"); f.send("\r");
			f.resolveSave(); await Promise.resolve(); await Promise.resolve();
			assert.equal(f.replacements(), 0);
			f.send("\x1b[D"); f.send("\x1b[H");
			for (let i = 0; i < 8; i++) f.send("\x1b[B");
			await Promise.resolve(); await Promise.resolve();
			assert.match(f.text(), /Configured: off.*Loaded registration: off/);
			f.send("\x1b[C"); f.send("\x1b[H"); f.send("\r");
			assert.match(f.text(), /> Cancel/);
			assert.match(f.text(), /Reload follows/);
			f.send("\x1b[B"); f.send("\r");
			await f.showing;
			assert.deepEqual(f.lifecycle, ["done", "hidden", "disposed", "editor-mount", "reload"]);
			assert.equal(f.closes(), 1);
			assert.equal(f.tui.hasOverlay(), false);
			assert.deepEqual(f.notices, [], "no stale-context notification even after reload rejection");
			assert.match(readFileSync(join(agentDir, "settings.json"), "utf8"), /"enabled": true/);
		} finally {
			f.cleanup();
			if (previousDir === undefined) delete process.env.PI_CODING_AGENT_DIR; else process.env.PI_CODING_AGENT_DIR = previousDir;
		}
	}
});

void test("registered Agents uses synthetic normal Pi and reloads only after SDK disposal and hold release", { timeout: 5000 }, async () => {
	const previousHome = process.env.HOME; const previousDir = process.env.PI_CODING_AGENT_DIR;
	const home = mkdtempSync(join(tmpdir(), "osdy-cc08-runtime-"));
	const agentDir = join(home, ".pi", "agent"); mkdirSync(agentDir, { recursive: true });
	const path = join(agentDir, "settings.json");
	writeFileSync(path, JSON.stringify({ packages: ["npm:gentle-pi", "npm:pi-subagents-j0k3r"], unrelated: true }));
	process.env.HOME = home; delete process.env.PI_CODING_AGENT_DIR;
	const f = await focusFixture({ registered: true, todoDir: home });
	try {
		f.lifecycle.length = 0;
		for (let i = 0; i < 3; i++) f.send("\x1b[B");
		f.send("\x1b[C"); f.send("\x1b[F"); f.send("\r"); f.resolveSave(); await flushFocus();
		assert.equal(f.replacements(), 0);
		f.send("\x1b[D"); f.send("\x1b[F");
		while (f.text().includes("Loading")) await new Promise<void>(resolve => setImmediate(resolve));
		assert.match(f.text(), /Agent mode: mixed/);
		assert.doesNotMatch(readFileSync(path, "utf8"), /-\.\/index.ts/);
		f.send("\x1b[C"); f.send("\x1b[F"); f.send("\r");
		assert.match(f.text(), /> Cancel/); assert.ok(f.text().includes(path));
		f.send("\r"); assert.equal(f.closes(), 0);
		f.send("\r"); f.text(); f.send("\x1b[B"); f.send("\r");
		await f.showing;
		assert.deepEqual(f.lifecycle, ["done", "hidden", "disposed", "editor-mount", "reload"]);
		assert.equal(f.closes(), 1); assert.equal(f.tui.hasOverlay(), false); assert.deepEqual(f.notices, []);
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
		f.send("\x1b[F"); await flushFocus();
		assert.match(f.text(), /normal personal Pi.*override or isolated/);
		f.send("\x1b[C"); f.send("\r"); await flushFocus();
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
		chooseVisual(f, 1);
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
function chooseVisual(f: Awaited<ReturnType<typeof focusFixture>>, category: number) {
	for (let i = 0; i < category; i++) f.send("\x1b[B");
	f.send("\x1b[C"); f.send("\x1b[F"); f.send("\r");
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
			chooseVisual(f, category);
			assert.equal(f.replacements(), 0, "mounted editor must survive the modal");
			assert.equal(f.focused(), true, "visible Control Center must retain keyboard ownership before save finishes");
			assert.match(f.text(), /Saving globally/);
			f.send("\x1b[D"); f.send("\x1b[B");
			assert.match(f.text(), new RegExp(`Control Center / ${["", "Mascot", "Editor", "Git"][category]}`));
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

void test("registered runtime session transition ignores the old modal finally and uses the new watcher", async (t) => {
	t.mock.timers.enable({ apis: ["setInterval"] });
	const f = await focusFixture({ registered: true });
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

void test("registered legacy commands and osdyConfig share live values and existing persistence/notifications", async () => {
	const previousDir = process.env.PI_CODING_AGENT_DIR;
	process.env.PI_CODING_AGENT_DIR = fileURLToPath(new URL("./.startup-test-missing", import.meta.url));
	const commands = new Map<string, { handler(args: string, ctx: ExtensionCommandContext): Promise<void> }>();
	const writes: GlobalEditorSettings[] = [];
	const notices: { message: string; level: string | undefined }[] = [];
	const gitCalls: { command: string; args: string[] }[] = [];
	let failure = false;
	let mounts = 0;
	let panels = 0;
	const pi = { registerCommand: (name: string, command: { handler(args: string, ctx: ExtensionCommandContext): Promise<void> }) => commands.set(name, command),
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
		for (const [args, expected, field, value] of [
			["header neon", "osdy-pi header: neon", "headerVariant", "neon"],
			["mascot bts", "osdy-pi mascot: Bts", "mascot", "bts"],
			["editor off", "osdy-pi editor mode: simple", "editorMode", "simple"],
			["editor on", "osdy-pi editor mode: extended", "editorMode", "extended"],
			["editor toggle", "osdy-pi editor mode: simple", "editorMode", "simple"],
			["editor auto", "osdy-pi editor mode: auto", "editorMode", "auto"],
		] as const) {
			await legacy.handler(args, ctx);
			assert.deepEqual(notices.at(-1), { message: expected, level: "info" });
			assert.equal(writes.at(-1)?.[field], value);
		}
		await legacy.handler("working-tree off", ctx);
		assert.equal(writes.at(-1)?.workingTreeEnabled, false);
		assert.equal(notices.at(-1)?.message, "osdy-pi working tree disabled");
		const before = writes.length;
		for (const args of ["working-tree status", "header status", "mascot status", "editor status", "header invalid", "mascot bts extra", "editor simple extra"]) await legacy.handler(args, ctx);
		assert.equal(writes.length, before, "status and invalid inputs never save");
		const beforeModalGitCalls = gitCalls.length;
		const beforeModalNotices = notices.length;
		await modal.handler("", ctx);
		assert.deepEqual(notices.slice(beforeModalNotices).filter((notice) => notice.level === "error"), [],
			"modal integration assertions must not be swallowed as Control Center error notifications");
		assert.equal(panels, 1);
		assert.deepEqual(gitCalls.slice(beforeModalGitCalls, beforeModalGitCalls + 2), [
			{ command: "git", args: ["--no-optional-locks", "branch", "--show-current"] },
			{ command: "git", args: ["--no-optional-locks", "status", "--short", "--untracked-files=normal"] },
		], "modal inspection uses exact read-only Git commands, including the global option");
		failure = true;
		await legacy.handler("working-tree off", ctx);
		assert.match(notices.at(-1)?.message ?? "", /disabled but could not be saved/);
		await legacy.handler("working-tree status", ctx);
		assert.equal(notices.at(-1)?.message, "osdy-pi working tree disabled");
		for (const args of ["header neon", "mascot current", "editor simple"]) {
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
   assert.equal(shortcuts.length > 0, enabled);
   assert.equal(execCalls, probes);
  }
 } finally {
  process.chdir(previousCwd);
  if (previous === undefined) delete process.env.PI_CODING_AGENT_DIR; else process.env.PI_CODING_AGENT_DIR = previous;
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
    assert.equal(extension.shortcuts.size > 0, active, cwd);
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
   assert.equal(tools.includes("todo"), false); assert.equal(shortcuts.length, 0);
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
				registerCommand: () => {}, registerFlag: () => {}, registerMessageRenderer: () => {}, registerEntryRenderer: () => {},
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
			// Role-marker resets register first; the runtime lifecycle registers second.
			const start = handlers.get("session_start")?.[1];
			const shutdown = handlers.get("session_shutdown")?.[1];
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

void test("runtime wires standalone role markers to the existing enabled state", () => {
 const source = readFileSync(new URL("./runtime.ts", import.meta.url), "utf8");
 assert.match(source, /registerMessageRoleMarkers\(pi, \(\) => state\.enabled\)/);
 assert.equal(source.match(/registerMessageRoleMarkers\(pi, /g)?.length, 1);
});

void test("runtime passes one session store to exactly one todo tool and command", () => {
 const source = readFileSync(new URL("./runtime.ts", import.meta.url), "utf8");
 assert.equal(source.match(/createTodoSessionStore\(\)/g)?.length, 1);
 assert.equal(source.match(/registerTodoTool\(pi, todoStore\)/g)?.length, 1);
 assert.equal(source.match(/registerTodosCommand\(pi, todoStore\)/g)?.length, 1);
 assert.equal(source.match(/registerTodoWidget\(pi, todoStore\)/g)?.length, 1);
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

void test("header command completes only catalog choices and is persisted through session wiring", () => {
	assert.deepEqual(getOsdyCommandCompletions("header"), [
		{ value: "header osdy-theme", label: "header osdy-theme" },
		{ value: "header neon", label: "header neon" },
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

void test("mascot command completes current, Bts, and status while persisting with immediate refresh", () => {
	assert.deepEqual(getOsdyCommandCompletions("mascot"), [
		{ value: "mascot current", label: "mascot current" },
		{ value: "mascot bts", label: "mascot bts" },
		{ value: "mascot status", label: "mascot status" },
	]);
	assert.deepEqual(getOsdyCommandCompletions("mascot b"), [
		{ value: "mascot bts", label: "mascot bts" },
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
		/if \(state\.enabled\) clearGentleShellChangesWidget\(ctx\)/,
	);
	assert.match(
		toolExecutionEndHandler,
		/if \(state\.enabled\) clearGentleShellChangesWidget\(ctx\)/,
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

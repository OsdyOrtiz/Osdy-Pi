import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { InteractiveMode, type ExtensionContext } from "@earendil-works/pi-coding-agent";
import { TuiAltScreen, visibleWidth, type Component, type OverlayHandle } from "@earendil-works/pi-tui";
import type { AccountProfileChoice } from "./account-profile-selector.js";

registerHooks({ resolve(specifier, context, next) {
	if (specifier.startsWith(".") && specifier.endsWith(".js") && context.parentURL?.endsWith(".ts")) {
		const url = new URL(`${specifier.slice(0, -3)}.ts`, context.parentURL);
		if (existsSync(fileURLToPath(url))) return { shortCircuit: true, url: url.href };
	}
	return next(specifier, context);
} });
const { AccountProfileSelector, selectAccountProfile } = await import("./account-profile-selector.js");
const { renderCodexUsageDashboardContentLines } = await import("./codex-usage-ui.js");
const theme = { fg: (_color: string, text: string) => text };
const choice: AccountProfileChoice = { profile: "Work", label: "Work · 5h 75% left", usage: {
	status: "ready", profile: "Work", checkedAt: 0, quotaSnapshot: {
		fetchedAt: 0, planType: "plus", credits: undefined, ordinaryUsageAllowed: true,
		bankedResetCount: 2, bankedResetDetails: [{ id: "one", expiresAt: 86400000 }, { id: "two", expiresAt: undefined }],
		buckets: [{ id: "codex", label: undefined,
			primary: { usedPercent: 25, windowMinutes: 300, resetsAt: 3600 },
			secondary: { usedPercent: 60, windowMinutes: 10080, resetsAt: 86400 } },
		{ id: "extra", label: "Extra quota", primary: { usedPercent: 5, windowMinutes: 60, resetsAt: 100 }, secondary: undefined }],
	},
} };

// Exercise the installed SDK's actual custom lifecycle and fullscreen input router,
// without a real terminal, session, auth, or network. Only its host editor is stubbed.
async function mountedSelector(choices: readonly AccountProfileChoice[]) {
	let input: (data: string) => void = () => {};
	let resize: () => void = () => {};
	const terminal = {
		columns: 80, rows: 8, kittyProtocolActive: false,
		start: (onInput: (data: string) => void, onResize: () => void) => { input = onInput; resize = onResize; },
		stop() {}, async drainInput() {}, write() {}, moveBy() {}, hideCursor() {},
		showCursor() {}, clearLine() {}, clearFromCursor() {}, clearScreen() {},
		setTitle() {}, setProgress() {},
	};
	const tui = new TuiAltScreen(terminal);
	let component: Component | undefined;
	let handle: OverlayHandle | undefined;
	let options: Parameters<ExtensionContext["ui"]["custom"]>[1];
	const host = {
		ui: tui, editor: { getText: () => "preserved", setText() {} },
		editorContainer: { clear() {}, addChild(value: Component) { component = value; } },
		keybindings: {}, disposeActiveSelector() {},
	};
	// This private SDK method is the implementation behind ctx.ui.custom.
	const custom = (InteractiveMode.prototype as unknown as {
		showExtensionCustom: ExtensionContext["ui"]["custom"];
	}).showExtensionCustom;
	const ui = { custom: ((factory, opts) => {
		options = opts;
		return custom.call(host, (sdkTui, sdkTheme, keys, done) => {
			// Inject a deterministic theme instead of initializing user theme discovery.
			const result = factory(sdkTui, theme as typeof sdkTheme, keys, done);
			if (!(result instanceof Promise)) component = result;
			return result;
		}, { ...opts, onHandle: value => { handle = value; opts?.onHandle?.(value); } });
	}) as ExtensionContext["ui"]["custom"] };
	const result = selectAccountProfile(ui, choices);
	await Promise.resolve();
	tui.start();
	tui.renderNow();
	assert(component);
	return { tui, terminal, result, component, options,
		bounds: () => handle?.getBounds(),
		screen: () => (tui as unknown as { previousScreen: string[] }).previousScreen.join("\n"),
		input: (key: string) => { input(key); tui.renderNow(); },
		resize: (columns: number, rows: number) => { terminal.columns = columns; terminal.rows = rows; resize(); tui.renderNow(); },
	};
}

void test("custom selector mounts a capturing fullscreen overlay and receives viewport navigation", async () => {
	const choices = Array.from({ length: 30 }, (_value, index) => ({ ...choice, profile: `Profile-${index}`, label: `Profile-${index}`, usage: undefined }));
	const mounted = await mountedSelector(choices);
	try {
		assert.equal(mounted.options?.overlay, true);
		assert(mounted.tui.hasOverlay());
		mounted.input("\u001b[F");
		assert.match(mounted.screen(), /> Profile-29/);
		mounted.input("\u001b[H");
		assert.match(mounted.screen(), /> Profile-0/);
		mounted.input("\u001b[6~");
		assert.match(mounted.screen(), /> Profile-6/);
		mounted.input("\u001b[5~");
		assert.match(mounted.screen(), /> Profile-0/);
		mounted.input("v");
		mounted.input("\r");
		assert(mounted.tui.hasOverlay(), "Enter in details must not complete");
		mounted.input("b");
		mounted.input("\r");
		assert.equal(await mounted.result, "Profile-0");
		assert.equal(mounted.tui.hasOverlay(), false);
	} finally { mounted.tui.stop(); }
});

void test("SDK overlay and component share a responsive viewport at short heights and resize", async () => {
	const mounted = await mountedSelector([choice]);
	try {
		assert.equal(mounted.options?.overlay, true);
		const options = typeof mounted.options?.overlayOptions === "function" ? mounted.options.overlayOptions() : mounted.options?.overlayOptions;
		assert.deepEqual(options, { width: "100%", maxHeight: "100%", margin: 0, nonCapturing: false });
		mounted.input("v");
		for (const [width, height] of [[80, 8], [12, 4], [1, 1], [32, 3], [100, 24], [80, 8]] as const) {
			mounted.resize(width, height);
			mounted.input("\u001b[F");
			const lines = mounted.component.render(width);
			assert(lines.length <= height);
			assert(lines.every(line => visibleWidth(line) <= width));
			assert.deepEqual(mounted.bounds(), { row: 0, col: 0, width, height: lines.length });
			if (height >= 3) {
				assert.equal(lines.length, height, "use exactly the SDK viewport, without invisible content");
				assert.match(lines.at(-1)!, /esc\/b/);
			}
		}
		assert.match(mounted.screen(), /Banked resets: 2/);
		mounted.input("\u001b[H");
		assert.match(mounted.screen(), /Checked:/);
		mounted.input("\u001b");
		mounted.input("\u001b");
		assert.equal(await mounted.result, undefined);
	} finally { mounted.tui.stop(); }
});

void test("details reuse the complete dashboard without active-model attribution or action controls", () => {
	const results: (string | undefined)[] = [];
	const panel = new AccountProfileSelector([choice], theme, () => 500, () => {}, value => results.push(value));
	panel.handleInput("v");
	assert(choice.usage?.status === "ready");
	const dashboard = renderCodexUsageDashboardContentLines(theme, choice.usage.quotaSnapshot,
		{ profile: "Work", provider: "openai-codex" }, 0, 100);
	assert.deepEqual(panel.render(100).slice(3, -1), dashboard);
	assert.match(dashboard.join("\n"), /Banked resets: 2/);
	assert.match(dashboard.join("\n"), /Extra quota/);
	for (const key of ["\r", "r", "u", "s"]) panel.handleInput(key);
	assert.deepEqual(results, []);
	panel.handleInput("\u001b");
	panel.handleInput("\r");
	panel.handleInput("\r");
	assert.deepEqual(results, ["Work"]);
});

void test("details scrolling and resizing bound every line and reach the final dashboard fields", () => {
	let height = 8;
	let renders = 0;
	const panel = new AccountProfileSelector([choice], theme, () => height, () => { renders++; }, () => assert.fail("details cannot finish"));
	panel.handleInput("v");
	for (const width of [1, 3, 12, 32, 100]) {
		for (const key of ["\u001b[H", "\u001b[B", "\u001b[6~", "\u001b[5~", "\u001b[F"]) {
			panel.render(width);
			panel.handleInput(key);
			const lines = panel.render(width);
			assert(lines.length <= height);
			assert(lines.every(line => visibleWidth(line) <= width));
		}
	}
	assert.match(panel.render(100).join("\n"), /Banked resets: 2/);
	height = 4;
	assert(panel.render(12).length <= height);
	height = 500;
	const expanded = panel.render(100).join("\n");
	assert.match(expanded, /Checked:/);
	assert.match(expanded, /Extra quota/);
	assert(renders > 0);
});

void test("long lists keep highlight visible, back preserves identity, and cancellation returns undefined", () => {
	const choices = Array.from({ length: 30 }, (_value, index) => ({ profile: `Profile-${index}`, label: `Profile-${index}`, usage: undefined }));
	const results: (string | undefined)[] = [];
	const panel = new AccountProfileSelector(choices, theme, () => 5, () => {}, value => results.push(value));
	panel.handleInput("\u001b[F");
	assert.match(panel.render(80).join("\n"), /> Profile-29/);
	panel.handleInput("v");
	assert.match(panel.render(80).join("\n"), /usage unavailable/i);
	panel.handleInput("\u001b[B"); // Scroll, never change the profile in details.
	panel.handleInput("\u001b");
	assert.match(panel.render(80).join("\n"), /> Profile-29/);
	panel.handleInput("\u001b");
	panel.handleInput("\r");
	assert.deepEqual(results, [undefined]);
});

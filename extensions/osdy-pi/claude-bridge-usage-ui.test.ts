import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { visibleWidth, type Component, type TUI } from "@earendil-works/pi-tui";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import ts from "typescript";

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
const { parseClaudeBridgeUsage } = await import("./claude-bridge-usage.js");
const { renderClaudeBridgeUsageLines, showClaudeBridgeUsagePanel } = await import("./claude-bridge-usage-ui.js");
const theme = { fg: (_color: string, text: string) => text };
const snapshot = (values: Record<string, string>) => parseClaudeBridgeUsage(Object.fromEntries(Object.entries(values).map(([key, value]) => [`anthropic-ratelimit-unified-${key}`, value])), Date.UTC(2030, 0, 1));
const render = (values: Record<string, string>, width = 100) => renderClaudeBridgeUsageLines(theme, snapshot(values), width).join("\n");

void test("waiting view explains first bridge response and passive controls", () => {
	const text = renderClaudeBridgeUsageLines(theme, undefined, 100).join("\n");
	assert.match(text, /waiting.*Claude Bridge.*response/i);
	assert.match(text, /esc.*q.*close/i);
	assert.doesNotMatch(text, /refresh|account|profile|credit|reset capability/i);
});
void test("Session and Weekly show remaining capacity, reset times and capture time", () => {
	const text = render({ "5h-utilization": "0.25", "7d-utilization": "0.75", "5h-reset": "1893463200", "7d-reset": "1893549600" });
	assert.match(text, /Session.*75% left/); assert.match(text, /Weekly.*25% left/);
	assert.match(text, /2030-01-01 02:00 UTC/); assert.match(text, /2030-01-02 02:00 UTC/);
	assert.match(text, /captured.*2030-01-01/i);
	assert.doesNotMatch(text, /Codex|profile|credit|u use|refresh/i);
});
void test("sparse windows and overage do not invent ordinary Weekly", () => {
	const text = render({ "5h-reset": "1893463200", "7d_oi-utilization": "0.8" });
	assert.match(text, /Session.*unknown/i); assert.match(text, /Weekly.*unknown/i);
	assert.doesNotMatch(text, /Weekly.*20%/);
	assert.match(text, /reset.*unknown/i);
});
void test("provider-origin text is never emitted unsanitized", () => {
	const text = render({ status: "\u001b[31mEVIL\nFORGED", "5h-utilization": "0.5" });
	assert.equal(text.includes(String.fromCharCode(27)), false);
	assert.doesNotMatch(text, /EVIL|FORGED/);
});
void test("all lines fit narrow and wide terminal widths", () => {
	for (const width of [32, 48, 100, 140]) for (const line of renderClaudeBridgeUsageLines(theme, snapshot({ "5h-utilization": "0.3" }), width)) assert.ok(visibleWidth(line) <= width, `${width}: ${line}`);
});

void test("modal ignores r/u, closes with q or Esc and unsubscribes redraw", async () => {
	for (const close of ["q", "\u001b"]) {
		let done = false; let redraws = 0; let listener: (() => void) | undefined;
		const ctx = { ui: { custom: (factory: (tui: TUI, theme: unknown, keys: unknown, done: () => void) => Component) => {
			const panel = factory({ requestRender: () => { redraws++; } } as TUI, theme, undefined, () => { done = true; });
			panel.handleInput?.("r"); panel.handleInput?.("u"); assert.equal(done, false);
			listener?.(); assert.equal(redraws, 1);
			panel.handleInput?.(close); assert.equal(done, true);
			return Promise.resolve();
		} } } as unknown as Pick<ExtensionContext, "ui">;
		await showClaudeBridgeUsagePanel(ctx, () => undefined, fn => { listener = fn; return () => { listener = undefined; }; });
		assert.equal(listener, undefined);
	}
});

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import test from "node:test";
import { fileURLToPath } from "node:url";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { visibleWidth, type Component, type TUI } from "@earendil-works/pi-tui";
import ts from "typescript";
import type { ClaudeBridgeUsageSnapshot } from "./claude-bridge-usage.js";
import type { CodexUsageSnapshot } from "./codex-usage.js";
import type { SimpleTheme } from "./types.js";

registerHooks({
 resolve(specifier, context, next) {
  if (specifier.startsWith(".") && specifier.endsWith(".js") && context.parentURL?.endsWith(".ts")) {
   const url = new URL(`${specifier.slice(0, -3)}.ts`, context.parentURL);
   if (existsSync(fileURLToPath(url))) return { shortCircuit: true, url: url.href };
  }
  return next(specifier, context);
 },
 load(url, context, next) {
  if (url.endsWith(".ts")) return { format: "module", shortCircuit: true,
   source: ts.transpileModule(readFileSync(fileURLToPath(url), "utf8"), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText };
  return next(url, context);
 },
});
const { renderCombinedCompanionUsage, showCombinedUsagePanel } = await import("./combined-usage-ui.js");
const theme: SimpleTheme = { fg: (_name, text) => text };
const codex: CodexUsageSnapshot = { fetchedAt: 1_900_000_000_000, planType: "plus", ordinaryUsageAllowed: true,
 bankedResetCount: 2, credits: { hasCredits: true, unlimited: false, balance: "12", resetCreditCount: 1 },
 buckets: [{ id: "codex", label: undefined, primary: { usedPercent: 25, windowMinutes: 300, resetsAt: undefined }, secondary: undefined },
 { id: "extra", label: "Extra allowance", primary: { usedPercent: 10, windowMinutes: 60, resetsAt: undefined }, secondary: undefined }] };
const bridge: ClaudeBridgeUsageSnapshot = { session: { usedPercent: 20, resetsAt: undefined }, weekly: undefined,
 overageIncluded: undefined, status: undefined, reset: undefined, representativeClaim: undefined,
 overageStatus: undefined, overageReset: undefined, capturedAt: codex.fetchedAt };

void test("compact usage shows only the selected provider below the column breakpoint without a separate label row", () => {
 for (const provider of ["openai-codex", "claude-bridge"]) {
  for (const width of [40, 62, 63, 120]) {
   const raw = renderCombinedCompanionUsage(theme, { kind: "ready", snapshot: codex }, bridge, width, provider);
   const text = raw.join("\n");
   assert.ok(raw.every(line => visibleWidth(line) <= width));
   if (width < 63) {
    assert.match(text, provider === "claude-bridge" ? /Claude Bridge.*Session.*80% left/ : /Codex.*Session.*75% left/);
    assert.doesNotMatch(text, provider === "claude-bridge" ? /Codex|75% left/ : /Claude Bridge|80% left/);
   } else {
    assert.match(text, /Codex/); assert.match(text, /Claude Bridge/);
   }
  }
 }
});

async function inspectPanel(provider: string, inspect: (panel: Component) => void, useReset?: () => Promise<boolean>): Promise<void> {
 const ctx = { ui: { custom: <T>(factory: (tui: TUI, theme: SimpleTheme, keys: unknown, done: (result: T) => void) => Component) => {
  let result: T; let settled = false;
  const panel = factory({ terminal: { rows: 100 }, requestRender() {} } as unknown as TUI, theme, undefined, value => { result = value; settled = true; });
  inspect(panel);
  if (!settled) panel.handleInput?.("q");
  return Promise.resolve(result!);
 } } } as unknown as Pick<ExtensionContext, "ui">;
 await showCombinedUsagePanel(ctx, () => ({ kind: "ready", snapshot: codex }), () => bridge,
  () => () => {}, () => Promise.resolve(), { profile: "work", provider }, () => true, useReset);
}

void test("narrow Usage follows the selected provider and wide Usage retains both", async () => {
 for (const provider of ["openai-codex", "claude-bridge"]) {
  await inspectPanel(provider, panel => {
   const narrow = panel.render(60).join("\n");
   assert.match(narrow, provider === "claude-bridge" ? /80% left/ : /75% left/);
   assert.doesNotMatch(narrow, provider === "claude-bridge" ? /75% left/ : /80% left/);
   const wide = panel.render(240).join("\n");
   assert.match(wide, /75% left/); assert.match(wide, /80% left/);
  });
 }
});

void test("Codex-only quotas and account details live in a separate keyboard-accessible tab", async () => {
 await inspectPanel("claude-bridge", panel => {
  const usage = panel.render(120).join("\n");
  assert.match(usage, /Usage.*Codex details/);
  assert.doesNotMatch(usage, /Quotas \+ account|Plan:|Credits:|Banked resets:|Extra allowance/);
  panel.handleInput?.("\t");
  const details = panel.render(120).join("\n");
  for (const field of ["Quotas + account", "Plan: plus", "Credits: 12", "Banked resets: 2", "Extra allowance", "75% left", "90% left"]) assert.ok(details.includes(field), field);
  assert.doesNotMatch(details, /80% left|Provider: claude-bridge/);
  panel.handleInput?.("\t");
  assert.equal(panel.render(120).join("\n"), usage);
 });
});

void test("narrow modal reads live model changes and does not offer reset when guarded", async () => {
 let model = { provider: "openai-codex" };
 let resets = 0;
 const ctx = { get model() { return model; }, ui: { custom: <T>(factory: (tui: TUI, theme: SimpleTheme, keys: unknown, done: (result: T) => void) => Component) => {
  let result: T;
  const panel = factory({ terminal: { rows: 100 }, requestRender() {} } as unknown as TUI, theme, undefined, value => { result = value; });
  assert.match(panel.render(60).join("\n"), /75% left/);
  model = { provider: "claude-bridge" };
  const bridgeView = panel.render(60).join("\n");
  assert.match(bridgeView, /80% left/); assert.doesNotMatch(bridgeView, /75% left|u use\/check reset/);
  panel.handleInput?.("\t"); panel.handleInput?.("u");
  assert.doesNotMatch(panel.render(60).join("\n"), /u use\/check reset/);
  panel.handleInput?.("q"); return Promise.resolve(result!);
 } } } as unknown as Pick<ExtensionContext, "ui" | "model">;
 await showCombinedUsagePanel(ctx, () => ({ kind: "ready", snapshot: codex }), () => bridge,
  () => () => {}, () => Promise.resolve(), { provider: "openai-codex" }, () => model.provider !== "claude-bridge",
  () => { resets++; return Promise.resolve(false); });
 assert.equal(resets, 0);
});

void test("reset remains reachable from each usage tab", async () => {
 for (const details of [false, true]) {
  let resets = 0;
  await inspectPanel("openai-codex", panel => {
   panel.render(120);
   if (details) panel.handleInput?.("\t");
   assert.match(panel.render(120).join("\n"), /u use\/check reset/);
   panel.handleInput?.("u");
  }, () => { resets++; return Promise.resolve(false); });
  assert.equal(resets, 1);
 }
});

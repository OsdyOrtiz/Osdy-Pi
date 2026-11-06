import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import test from "node:test";
import { fileURLToPath } from "node:url";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { visibleWidth, wrapTextWithAnsi, type Component, type TUI } from "@earendil-works/pi-tui";
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
const { showCombinedUsagePanel } = await import("./combined-usage-ui.js");
const { renderCodexUsageDashboardContentLines } = await import("./codex-usage-ui.js");
const { doubleBorderBox } = await import("./modal-frame.js");
const theme: SimpleTheme = { fg: (_name, text) => `\x1b[36m${text}\x1b[0m` };
const plain = (text: string) => text.replace(new RegExp(`${String.fromCharCode(27)}\\[[0-?]*[ -/]*[@-~]`, "g"), "");
const now = Date.parse("2030-01-01T00:00:00Z");
const codex: CodexUsageSnapshot = { fetchedAt: now, planType: "plus", ordinaryUsageAllowed: true,
 credits: { hasCredits: true, unlimited: false, balance: "12", resetCreditCount: 2 }, bankedResetCount: 3,
 buckets: [{ id: "codex", label: undefined, primary: { usedPercent: 25, windowMinutes: 300, resetsAt: now / 1000 + 3600 },
  secondary: { usedPercent: 60, windowMinutes: 10080, resetsAt: now / 1000 + 86400 } }] };
const bridge: ClaudeBridgeUsageSnapshot = { session: { usedPercent: 20, resetsAt: now / 1000 + 7200 },
 weekly: { usedPercent: 70, resetsAt: now / 1000 + 172800 }, overageIncluded: undefined, status: undefined,
 reset: undefined, representativeClaim: undefined, overageStatus: undefined, overageReset: undefined, capturedAt: now };

async function modal(width: number, snapshot: ClaudeBridgeUsageSnapshot | undefined = bridge): Promise<string[]> {
 let lines: string[] = [];
 const ctx = { ui: { custom: <T>(factory: (tui: TUI, theme: SimpleTheme, keys: unknown, done: (result: T) => void) => Component) => {
  let result: T;
  const panel = factory({ terminal: { rows: 300 }, requestRender() {} } as unknown as TUI, theme, undefined, value => { result = value; });
  lines = panel.render(width); panel.handleInput?.("q");
  return Promise.resolve(result!);
 } } } as unknown as Pick<ExtensionContext, "ui">;
 await showCombinedUsagePanel(ctx, () => ({ kind: "ready", snapshot: codex }), () => snapshot,
  () => () => {}, () => Promise.resolve(), { profile: "work" }, () => false);
 return lines;
}

void test("Claude shows spaced, simple windows with remaining capacity and next resets", async t => {
 t.mock.method(Date, "now", () => now);
 const lines = (await modal(60)).map(plain);
 const section = lines.slice(lines.findIndex(line => line.includes("Claude Bridge") && !line.includes("subscription usage")));
 const text = section.join("\n");
 for (const value of [/Session/, /Weekly/, /80% left/, /30% left/, /[█░]/, /reset/i]) assert.match(text, value);
 assert.doesNotMatch(text, /Captured:|Window:|\b300m\b|\b10080m\b|% used/i);
 const session = section.findIndex(line => /Session/.test(line));
 const weekly = section.findIndex(line => /Weekly/.test(line));
 assert.ok(weekly > session && section.slice(session + 1, weekly).some(line => /^║\s*║$/.test(line)), "separate window groups with whitespace");
 const sessionText = section.slice(session, weekly).join(" ");
 const weeklyText = section.slice(weekly).join(" ");
 assert.ok(sessionText.includes(new Date(now + 7200_000).toLocaleString()) || /2030-01-01 02:00|2h/.test(sessionText));
 assert.ok(weeklyText.includes(new Date(now + 172800_000).toLocaleString()) || /2030-01-03 00:00|2d/.test(weeklyText));
});

void test("narrow modal preserves Claude window names and remaining percentages", async t => {
 t.mock.method(Date, "now", () => now);
 const raw = await modal(14);
 assert.ok(raw.every(line => visibleWidth(line) <= 14));
 const text = raw.map(plain).join("\n");
 for (const value of ["Session", "Weekly", "80%", "30%"]) assert.ok(text.includes(value), `missing ${value}`);
});

void test("Claude missing values stay unknown while a known reset survives", async t => {
 t.mock.method(Date, "now", () => now);
 const partial: ClaudeBridgeUsageSnapshot = { ...bridge, session: { usedPercent: undefined, resetsAt: now / 1000 + 7200 }, weekly: undefined };
 const lines = (await modal(60, partial)).map(plain);
 const text = lines.slice(lines.findIndex(line => line.includes("Claude Bridge") && !line.includes("subscription usage"))).join("\n");
 assert.match(text, /Session.*unknown/i); assert.match(text, /Weekly.*unknown/i);
 assert.match(text, /2030|2h/); assert.doesNotMatch(text, /0% left|100% left|NaN|Invalid Date/);
});

void test("stacked modal retains the exact Codex dashboard content and controls", async t => {
 t.mock.method(Date, "now", () => now);
 const width = 60;
 const raw = await modal(width); const lines = raw.map(plain);
 const start = lines.findIndex(line => /^║\s*Codex\s*║$/.test(line));
 const end = lines.findIndex((line, index) => index > start && /Claude Bridge/.test(line));
 assert.ok(start >= 0 && end > start);
 const expected = renderCodexUsageDashboardContentLines(theme, codex, { profile: "work" }, now, width - 2);
 expected.push(theme.fg("muted", `Fetched: ${new Date(codex.fetchedAt).toLocaleString()} (cached)`));
 const framed = doubleBorderBox(theme, width, "unused", expected.flatMap(line => wrapTextWithAnsi(line, width - 2))).slice(1, -1);
 assert.deepEqual(raw.slice(start + 1, start + 1 + framed.length), framed, "Codex content and styling stay byte-identical");
 assert.match(lines.join("\n"), /r refresh Codex/);
 // The frame wraps the final hint at 60 columns; preserve both words across the border.
 assert.match(lines.join("\n"), /esc\/q\s*║\s*\n║\s*close/);
});

void test("combined modal requests enough host width for provider columns on a wide terminal", async () => {
 let requestedWidth: number | `${number}%` | undefined;
 const ctx = { ui: { custom: <T>(factory: (tui: TUI, theme: SimpleTheme, keys: unknown, done: (result: T) => void) => Component,
  options: { overlay: boolean; overlayOptions: { width?: number | `${number}%`; minWidth?: number } }) => {
  assert.equal(options.overlay, true);
  requestedWidth = options.overlayOptions.width;
  let result: T;
  const panel = factory({ terminal: { columns: 240, rows: 100 }, requestRender() {} } as unknown as TUI,
   theme, undefined, value => { result = value; });
  panel.handleInput?.("q");
  return Promise.resolve(result!);
 } } } as unknown as Pick<ExtensionContext, "ui">;
 await showCombinedUsagePanel(ctx, () => ({ kind: "ready", snapshot: codex }), () => bridge,
  () => () => {}, () => Promise.resolve(), {}, () => false);
 assert.ok(requestedWidth !== undefined);
 const columns = typeof requestedWidth === "number" ? requestedWidth : Math.floor(240 * Number.parseFloat(requestedWidth) / 100);
 assert.ok(columns >= 160, `host offers only ${columns} columns on a 240-column terminal`);
});

void test("modal providers share a row when wide and stack without loss when narrow", async t => {
 t.mock.method(Date, "now", () => now);
 for (const width of [60, 240]) {
  const raw = await modal(width); const lines = raw.map(plain);
  assert.ok(raw.every(line => visibleWidth(line) <= width));
  const headings = lines.filter(line => /Codex/.test(line) && /Claude Bridge/.test(line) && !/subscription usage/.test(line));
  assert.equal(headings.length > 0, width === 240, `provider layout at ${width}`);
  const text = lines.join("\n");
  for (const value of ["75% left", "40% left", "80% left", "30% left"]) assert.ok(text.includes(value), value);
 }
});

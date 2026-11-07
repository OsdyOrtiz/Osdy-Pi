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
const { showCombinedUsagePanel, renderCombinedCompanionUsage } = await import("./combined-usage-ui.js");
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

async function modal(width: number, snapshot: ClaudeBridgeUsageSnapshot | undefined = bridge,
 codexSnapshot: CodexUsageSnapshot = codex, provider = "openai-codex", keys: string[] = []): Promise<string[]> {
 let lines: string[] = [];
 const ctx = { ui: { custom: <T>(factory: (tui: TUI, theme: SimpleTheme, keys: unknown, done: (result: T) => void) => Component) => {
  let result: T;
  const panel = factory({ terminal: { rows: 300 }, requestRender() {} } as unknown as TUI, theme, undefined, value => { result = value; });
  panel.render(width);
  for (const key of keys) panel.handleInput?.(key);
  lines = panel.render(width); panel.handleInput?.("q");
  return Promise.resolve(result!);
 } } } as unknown as Pick<ExtensionContext, "ui">;
 await showCombinedUsagePanel(ctx, () => ({ kind: "ready", snapshot: codexSnapshot }), () => snapshot,
  () => () => {}, () => Promise.resolve(), { profile: "work", provider }, () => false);
 return lines;
}

void test("Claude /usage groups reported windows in Codex-style cards with reset details", async t => {
 t.mock.method(Date, "now", () => now);
 const lines = (await modal(60, bridge, codex, "claude-bridge")).map(plain);
 const section = lines.slice(lines.findIndex(line => line.includes("Claude Bridge") && !line.includes("subscription usage")));
 const text = section.join("\n");
 assert.equal(section.filter(line => line.includes("╭")).length, 2, "one group box per reported window");
 assert.equal(section.filter(line => line.includes("╰")).length, 2);
 for (const value of [/Session/, /Weekly/, /Window: 5h/, /Window: 7d/, /Reset: resets in 2h/, /Reset: resets in 2d/,
  /Local:/, /UTC: 2030-01-01 02:00/, /UTC: 2030-01-03 00:00/, /Quotas/, /80% left/, /30% left/, /[█░]/]) assert.match(text, value);
 assert.doesNotMatch(text, /Captured:|Profile:|Plan:|Credits:|overage|\b300m\b|\b10080m\b/i);
});

void test("narrow modal preserves Claude window names and remaining percentages", async t => {
 t.mock.method(Date, "now", () => now);
 const raw = await modal(14, bridge, codex, "claude-bridge");
 assert.ok(raw.every(line => visibleWidth(line) <= 14));
 const lines = raw.map(plain);
 const start = lines.findIndex(line => /^║Claude\s*║$/.test(line));
 assert.ok(start > 0, "Claude section is visible at width 14");
 const text = lines.slice(start).join("\n");
 for (const value of ["Session", "Weekly", "80%", "30%"]) assert.ok(text.includes(value), `Claude is missing ${value}`);
});

const emptyBridge: ClaudeBridgeUsageSnapshot = { ...bridge, session: undefined, weekly: undefined };
const noCodex: CodexUsageSnapshot = { ...codex, buckets: [{ id: "codex", label: undefined, primary: undefined, secondary: undefined }] };

for (const sample of [
 { name: "session only", session: bridge.session, weekly: undefined, expected: ["Session", "80% left", "2030-01-01 02:00"], absent: ["Weekly", "2030-01-03"] },
 { name: "weekly only", session: undefined, weekly: bridge.weekly, expected: ["Weekly", "30% left", "2030-01-03 00:00"], absent: ["Session", "2030-01-01 02:00"] },
 { name: "both", session: bridge.session, weekly: bridge.weekly, expected: ["Session", "80% left", "Weekly", "30% left"], absent: [] },
 { name: "none", session: undefined, weekly: undefined, expected: [], absent: ["Session", "Weekly", "Next reset"] },
 { name: "reset only", session: { usedPercent: undefined, resetsAt: now / 1000 + 7200 }, weekly: undefined, expected: [], absent: ["Session", "Weekly", "Next reset", "2030-01-01 02:00"] },
 { name: "nonfinite", session: { usedPercent: Number.NaN, resetsAt: now / 1000 + 7200 }, weekly: undefined, expected: [], absent: ["Session", "Weekly", "Next reset", "2030-01-01 02:00"] },
 { name: "reported zero", session: { usedPercent: 0, resetsAt: now / 1000 + 7200 }, weekly: undefined, expected: ["Session", "100% left", "2030-01-01 02:00"], absent: ["Weekly"] },
 { name: "overage included only", session: undefined, weekly: undefined, overageIncluded: bridge.weekly, expected: [], absent: ["Session", "Weekly", "Next reset", "30% left"] },
] as const) {
 void test(`Claude modal omits unusable quota windows: ${sample.name}`, async t => {
  t.mock.method(Date, "now", () => now);
  const snapshot: ClaudeBridgeUsageSnapshot = { ...emptyBridge, ...sample };
  const lines = (await modal(60, snapshot, codex, "claude-bridge")).map(plain);
  const text = lines.slice(lines.findIndex(line => line.includes("Claude Bridge") && !line.includes("subscription usage"))).join("\n");
  for (const value of sample.expected) assert.ok(text.includes(value), `${sample.name}: missing ${value}`);
  for (const value of sample.absent) assert.ok(!text.includes(value), `${sample.name}: unexpected ${value}`);
  assert.doesNotMatch(text, /unknown|NaN|Invalid Date|No quota windows available/i);
  if (sample.expected.length) assert.match(text, /[█░]/);
 });
}

for (const sample of [
 { name: "session only", primary: codex.buckets[0]!.primary, secondary: undefined, expected: ["Session", "75% left", "2030-01-01 01:00"], absent: ["Weekly", "2030-01-02"] },
 { name: "weekly only", primary: undefined, secondary: codex.buckets[0]!.secondary, expected: ["Weekly", "40% left", "2030-01-02 00:00"], absent: ["Session", "2030-01-01 01:00"] },
 { name: "both", primary: codex.buckets[0]!.primary, secondary: codex.buckets[0]!.secondary, expected: ["Session", "Weekly", "75% left", "40% left"], absent: [] },
 { name: "none", primary: undefined, secondary: undefined, expected: [], absent: ["Session", "Weekly"] },
 { name: "nonfinite with reset", primary: { usedPercent: Number.POSITIVE_INFINITY, windowMinutes: 300, resetsAt: now / 1000 + 3600 }, secondary: undefined, expected: [], absent: ["Session", "Weekly", "2030-01-01 01:00"] },
 { name: "reported zero", primary: { usedPercent: 0, windowMinutes: 300, resetsAt: now / 1000 + 3600 }, secondary: undefined, expected: ["Session", "100% left", "2030-01-01 01:00"], absent: ["Weekly"] },
] as const) {
 void test(`Codex modal omits unusable main quota windows: ${sample.name}`, async t => {
  t.mock.method(Date, "now", () => now);
  const snapshot: CodexUsageSnapshot = { ...codex, buckets: [{ id: "codex", label: undefined, primary: sample.primary, secondary: sample.secondary }] };
  const lines = (await modal(60, emptyBridge, snapshot)).map(plain);
  const start = lines.findIndex(line => /^║\s*Codex\s*║$/.test(line));
  assert.ok(start >= 0);
  const text = lines.slice(start).join("\n");
  for (const value of sample.expected) assert.ok(text.includes(value), `${sample.name}: missing ${value}`);
  for (const value of sample.absent) assert.ok(!text.includes(value), `${sample.name}: unexpected ${value}`);
  assert.doesNotMatch(text, /Codex (?:Session|Weekly): unknown|No quota windows available|NaN|Infinity/);
  if (sample.expected.length) assert.match(text, /[█░]/);
 });
}

for (const sample of [
 { name: "session only", primary: codex.buckets[0]!.primary, secondary: undefined, session: bridge.session, weekly: undefined,
  expected: ["Session", "75% left", "80% left"], absent: ["Weekly"] },
 { name: "weekly only", primary: undefined, secondary: codex.buckets[0]!.secondary, session: undefined, weekly: bridge.weekly,
  expected: ["Weekly", "40% left", "30% left"], absent: ["Session"] },
 { name: "both", primary: codex.buckets[0]!.primary, secondary: codex.buckets[0]!.secondary, session: bridge.session, weekly: bridge.weekly,
  expected: ["Session", "Weekly", "75% left", "40% left", "80% left", "30% left"], absent: [] },
 { name: "none or reset only", primary: undefined, secondary: undefined, session: { usedPercent: undefined, resetsAt: now / 1000 + 7200 }, weekly: undefined,
  expected: [], absent: ["Session", "Weekly", "2030"] },
 { name: "nonfinite", primary: { usedPercent: Number.NaN, windowMinutes: 300, resetsAt: now / 1000 + 3600 }, secondary: undefined,
  session: { usedPercent: Number.POSITIVE_INFINITY, resetsAt: now / 1000 + 7200 }, weekly: undefined, expected: [], absent: ["Session", "Weekly"] },
 { name: "reported zeros", primary: { usedPercent: 0, windowMinutes: 300, resetsAt: undefined }, secondary: undefined,
  session: { usedPercent: 0, resetsAt: undefined }, weekly: undefined, expected: ["Session", "100% left"], absent: ["Weekly"] },
] as const) {
 void test(`compact provider windows omit absent values: ${sample.name}`, () => {
  const codexSnapshot: CodexUsageSnapshot = { ...codex, buckets: [{ id: "codex", label: undefined, primary: sample.primary, secondary: sample.secondary }] };
  const bridgeSnapshot: ClaudeBridgeUsageSnapshot = { ...emptyBridge, session: sample.session, weekly: sample.weekly, overageIncluded: bridge.weekly };
  for (const width of [120]) {
   const raw = renderCombinedCompanionUsage(theme, { kind: "ready", snapshot: codexSnapshot }, bridgeSnapshot, width);
   const lines = raw.map(plain); const text = lines.join("\n");
   assert.ok(raw.every(line => visibleWidth(line) <= width));
   for (const value of sample.expected) assert.ok(text.includes(value), `${sample.name}/${width}: missing ${value}`);
   for (const value of sample.absent) assert.ok(!text.includes(value), `${sample.name}/${width}: unexpected ${value}`);
   assert.doesNotMatch(text, /unknown|No quota windows|NaN|Infinity/i);
   if (sample.expected.length) assert.match(text, /[█░]/);
  }
 });
}

void test("Claude modal shows an unknown reset only for a reported window", async t => {
 t.mock.method(Date, "now", () => now);
 const snapshot: ClaudeBridgeUsageSnapshot = { ...emptyBridge, weekly: { usedPercent: 0, resetsAt: undefined } };
 const lines = (await modal(60, snapshot, noCodex, "claude-bridge")).map(plain);
 const text = lines.slice(lines.findIndex(line => line.includes("Claude Bridge") && !line.includes("subscription usage"))).join("\n");
 assert.match(text, /Weekly/); assert.match(text, /100% left/);
 assert.match(text, /Reset: unavailable/); assert.doesNotMatch(text, /Session/);
 assert.equal((text.match(/Reset:/g) ?? []).length, 1);
});

void test("narrow modal omits missing rows while retaining a reported zero", async t => {
 t.mock.method(Date, "now", () => now);
 const snapshot: ClaudeBridgeUsageSnapshot = { ...emptyBridge, session: { usedPercent: 0, resetsAt: now / 1000 + 7200 } };
 const lines = await modal(14, snapshot, noCodex, "claude-bridge");
 assert.ok(lines.every(line => visibleWidth(line) <= 14));
 const visible = lines.map(plain);
 const start = visible.findIndex(line => /^║Claude\s*║$/.test(line));
 assert.ok(start > 0, "Claude section is visible at width 14");
 const text = visible.slice(start).join("\n");
 assert.match(text, /Session/); assert.match(text, /100%/);
 assert.doesNotMatch(text, /Weekly|No quota windows|NaN/);
});

void test("wide modal keeps asymmetric provider windows and their resets side by side", async t => {
 t.mock.method(Date, "now", () => now);
 const partialCodex: CodexUsageSnapshot = { ...codex, buckets: [{ ...codex.buckets[0]!, secondary: undefined }] };
 const partialBridge: ClaudeBridgeUsageSnapshot = { ...emptyBridge, weekly: bridge.weekly };
 const raw = await modal(240, partialBridge, partialCodex);
 assert.ok(raw.every(line => visibleWidth(line) <= 240));
 const lines = raw.map(plain); const text = lines.join("\n");
 assert.ok(lines.some(line => /Codex/.test(line) && /Claude Bridge/.test(line) && !/subscription usage/.test(line)));
 for (const value of ["Session", "75% left", "2030-01-01 01:00", "Weekly", "30% left", "2030-01-03 00:00"]) assert.ok(text.includes(value), value);
 assert.doesNotMatch(text, /Codex Weekly: unknown|Session: unknown|Weekly: unknown|No quota windows available/);
});

void test("partial main quota preserves additional Codex bucket account data", async t => {
 t.mock.method(Date, "now", () => now);
 const snapshot: CodexUsageSnapshot = { ...codex, buckets: [
  { id: "codex", label: undefined, primary: codex.buckets[0]!.primary, secondary: undefined },
  { id: "extra", label: "Extra allowance", primary: { usedPercent: 13, windowMinutes: 300, resetsAt: now / 1000 + 3600 }, secondary: undefined },
 ] };
 const text = (await modal(60, emptyBridge, snapshot, "openai-codex", ["\t"])).map(plain).join("\n");
 assert.match(text, /Extra allowance/); assert.match(text, /87% left/);
 assert.match(text, /75% left/); assert.doesNotMatch(text, /Codex Weekly: unknown/);
});

void test("empty Codex main bucket does not hide additional buckets or account data", async t => {
 t.mock.method(Date, "now", () => now);
 const snapshot: CodexUsageSnapshot = { ...codex, buckets: [
  { id: "codex", label: undefined, primary: undefined, secondary: undefined },
  { id: "extra", label: "Extra allowance", primary: { usedPercent: 13, windowMinutes: 300, resetsAt: now / 1000 + 3600 }, secondary: undefined },
 ] };
 const text = (await modal(60, emptyBridge, snapshot, "openai-codex", ["\t"])).map(plain).join("\n");
 assert.match(text, /Extra allowance/); assert.match(text, /87% left/);
 assert.match(text, /Profile: work/); assert.match(text, /Banked resets: 3/);
 assert.doesNotMatch(text, /No quota windows available|Codex (?:Session|Weekly): unknown/);
});

void test("partial modal keeps refresh, scroll and banked reset controls", async () => {
 let refreshes = 0; let resets = 0;
 const ctx = { ui: { custom: async <T>(factory: (tui: TUI, theme: SimpleTheme, keys: unknown, done: (result: T) => void) => Component) => {
  let result: T;
  const panel = factory({ terminal: { rows: 10 }, requestRender() {} } as unknown as TUI, theme, undefined, value => { result = value; });
  await Promise.resolve();
  const top = panel.render(120).map(plain).join("\n");
  assert.match(top, /u use\/check reset/); assert.match(top, /r refresh Codex/);
  panel.handleInput?.("r"); await Promise.resolve();
  panel.handleInput?.("\x1b[F");
  const bottom = panel.render(120).map(plain).join("\n");
  assert.notEqual(bottom, top, "End scrolls through the modal");
  panel.handleInput?.("\x1b[H");
  assert.equal(panel.render(120).map(plain).join("\n"), top, "Home restores the top");
  panel.handleInput?.("\t");
  const detailsTop = panel.render(120).map(plain).join("\n");
  panel.handleInput?.("\x1b[F");
  assert.notEqual(panel.render(120).map(plain).join("\n"), detailsTop, "details also scrolls");
  panel.handleInput?.("\x1b[H");
  assert.equal(panel.render(120).map(plain).join("\n"), detailsTop);
  panel.handleInput?.("u");
  return result!;
 } } } as unknown as Pick<ExtensionContext, "ui">;
 await showCombinedUsagePanel(ctx, () => ({ kind: "ready", snapshot: codex }), () => bridge,
  () => () => {}, () => { refreshes++; return Promise.resolve(); }, { profile: "work" }, () => true,
  () => { resets++; return Promise.resolve(false); });
 assert.equal(refreshes, 2); assert.equal(resets, 1);
});

void test("Codex details preserve account fields and controls", async t => {
 t.mock.method(Date, "now", () => now);
 const width = 60;
 const lines = (await modal(width, bridge, codex, "openai-codex", ["\t"])).map(plain);
 const text = lines.join("\n");
 for (const field of ["Quotas + account", "Profile: work", "Plan: plus", "Banked resets: 3", "Credits: 12", "Fetched:", "r refresh Codex"]) assert.ok(text.includes(field), field);
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

void test("modal providers share a row when wide and show only the active provider when narrow", async t => {
 t.mock.method(Date, "now", () => now);
 for (const width of [60, 240]) {
  const raw = await modal(width); const lines = raw.map(plain);
  assert.ok(raw.every(line => visibleWidth(line) <= width));
  const headings = lines.filter(line => /Codex/.test(line) && /Claude Bridge/.test(line) && !/subscription usage/.test(line));
  assert.equal(headings.length > 0, width === 240, `provider layout at ${width}`);
  const text = lines.join("\n");
  for (const value of width === 240 ? ["75% left", "40% left", "80% left", "30% left"] : ["75% left", "40% left"]) assert.ok(text.includes(value), value);
  if (width === 60) assert.doesNotMatch(text, /80% left|30% left/);
 }
});

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import test from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { KeybindingsManager } from "../../node_modules/@earendil-works/pi-coding-agent/dist/core/keybindings.js";
import { CustomEditor, type ExtensionAPI, type ExtensionContext, type Theme } from "@earendil-works/pi-coding-agent";
import { visibleWidth, sliceByColumn, type Component, type EditorTheme, type TUI, type TuiMouseEvent } from "@earendil-works/pi-tui";
import type { OsdyState, WorkingTreeState, WorkingWidgetState } from "./types.js";

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
const previousProfile = process.env.OSDY_PI_PROFILE_NAME;
test.beforeEach(() => { process.env.OSDY_PI_PROFILE_NAME = "Osdy-Work"; });
test.afterEach(() => {
 if (previousProfile === undefined) delete process.env.OSDY_PI_PROFILE_NAME;
 else process.env.OSDY_PI_PROFILE_NAME = previousProfile;
});
const { mountOsdyUi, syncWorkingTreeWidget, reconcileResponsiveUi } = await import("./runtime-helpers.js");
const { registerTodoWidget } = await import("./todo-widget.js");
const { createTodoSessionStore } = await import("./todo-session.js");
const { companionLayout } = await import("./companion-panel.js");
const { createFooterComponent } = await import("./ui.js");
type Widget = { component: Component & { dispose?(): void }; placement: string };

function workspace(placement: "aboveEditor" | "belowEditor" = "aboveEditor", companion = true, heading?: string, widgetLines = 7) {
 const color = (text: string) => `\u001b[33m${text}\u001b[39m`;
 const theme = { fg: (_name: string, text: string) => color(text), bold: color, strikethrough: color } as Theme;
 const editorTheme: EditorTheme = { borderColor: color, selectList: {
  selectedPrefix: color, selectedText: color, description: color, scrollInfo: color, noMatch: color,
 } };
 const terminal = { columns: 120, rows: 40 };
 const hostState = { mode: "fullscreen", overlay: false };
 const host = { terminal, get mode() { return hostState.mode; }, requestRender() {}, hasOverlay: () => hostState.overlay } as unknown as TUI;
 const model = { provider: "test", id: "test", contextWindow: 200000 };
 const widgets = new Map<string, Widget>();
 let footer: Component & { dispose?(): void };
 let branch = "main";
 const statuses = new Map<string, string>();
 const handlers = new Map<string, (event: { toolName?: string }, ctx: ExtensionContext) => void>();
 let shortcut: ((ctx: ExtensionContext) => void) | undefined;
 let editor: CustomEditor;
 const pi = {
  getThinkingLevel: () => "off",
  on(name: string, handler: (event: { toolName?: string }, ctx: ExtensionContext) => void) { handlers.set(name, handler); },
  registerShortcut(_key: string, options: { handler: (ctx: ExtensionContext) => void }) { shortcut = options.handler; },
 } as unknown as ExtensionAPI;
 const state: OsdyState = {
  codexUsage: { kind: "idle" }, enabled: true, editorEffective: false, editorMode: "extended",
  fallbackEditorFactory: undefined, headerVariant: "slanted", mascot: "pi", smallMode: false,
  tui: host, workingTreeEnabled: true, workingTreePlacement: placement, companionEnabled: companion,
 };
 const working: WorkingWidgetState = { active: true, activity: "exploring", label: "Exploring...", frame: 0, timer: undefined, tui: undefined };
 const tree: WorkingTreeState = {
  enabled: true, visible: true, loading: false, error: undefined, tui: undefined,
  snapshot: { files: [], totalFiles: 3, additions: 42, removals: 8, stagedFiles: 1, unstagedFiles: 2, untrackedFiles: 0 },
 };
 const ctx = {
  hasUI: true, cwd: "/synthetic", model,
  getContextUsage: () => ({ percent: 60 }), sessionManager: { getSessionId: () => "main", getEntries: () => [] },
  ui: {
   theme, setHeader() {}, setWorkingVisible() {},
   setFooter(factory: (tui: TUI, theme: Theme, data: { getGitBranch(): string; getExtensionStatuses(): Map<string, string> }) => Component) {
    footer?.dispose?.();
    footer = factory(host, theme, { getGitBranch: () => branch, getExtensionStatuses: () => statuses });
   },
   setEditorComponent(factory: Parameters<ExtensionContext["ui"]["setEditorComponent"]>[0]) {
    if (factory) {
     const component = factory(host, editorTheme, new KeybindingsManager());
     assert.ok(component instanceof CustomEditor); editor = component;
    }
   },
   setWidget(key: string, factory: ((tui: TUI, theme: Theme) => Component) | undefined, options?: { placement: string }) {
    widgets.get(key)?.component.dispose?.();
    if (factory) widgets.set(key, { component: factory(host, theme), placement: options?.placement ?? "aboveEditor" });
    else widgets.delete(key);
   },
  },
 } as unknown as ExtensionContext;
 mountOsdyUi(pi, ctx, state, working, tree);
 const store = createTodoSessionStore();
 store.set("main", { tasks: Array.from({ length: 8 }, (_, i) => ({ id: i + 1, subject: `Task ${i + 1}`, status: "pending" })), nextId: 9 });
 registerTodoWidget(pi, store, () => ({ maxWidgetLines: widgetLines }), heading ? {
  t: (key, fallback) => key === "overlay.heading" ? heading : key === "overlay.more" ? "más" : fallback,
  status: status => status === "pending" ? "pendientes" : status,
 } : undefined);
 const emit = (name: string) => handlers.get(name)?.({ toolName: "todo" }, ctx);
 emit("session_start");
 const stacked = (width: number) => [...widgets.values()].flatMap(({ component }) => component.render(width));
 const snapshot = (width: number) => ({ editor: editor.render(width), widgets: [...widgets].map(([key, item]) => ({ key, placement: item.placement, lines: item.component.render(width) })) });
 const mouse = (x: number, y: number, change: Partial<TuiMouseEvent> = {}, width = 120) => editor.handleMouse({
  type: "click", button: "left", x, y, screenX: x + 10, screenY: y + 20, width,
  height: editor.render(width).length, shift: false, alt: false, ctrl: false, ...change,
 });
 return { state, host, hostState, model, terminal, tree, working, widgets, store, emit, stacked, snapshot, mouse,
  footer: () => footer,
  replaceFooter: () => ctx.ui.setFooter((_tui, theme, data) => createFooterComponent(pi, ctx, state, data, theme)),
  setBranch: (value: string) => { branch = value; }, statuses, shortcut: () => shortcut?.(ctx), editor: editor!,
  replaceGit: () => syncWorkingTreeWidget(ctx, state, working, tree),
  reconcile: () => reconcileResponsiveUi(pi, ctx, state, tree),
 };
}
const plain = (lines: string[]) => lines.join("\n").replace(new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, "g"), "");

function cardPosition(editor: Component, width: number, title: string): { x: number; y: number } {
 const rows = editor.render(width).map(line => plain([line]));
 const prefix = `✦─ ${title}`;
 const y = rows.findIndex(line => line.includes(prefix));
 assert.ok(y >= 0, `missing ${title} card`);
 const row = rows[y] ?? "";
 return { x: visibleWidth(row.slice(0, row.indexOf(prefix))), y };
}

function renderedCard(editor: Component, width: number, title: string): { x: number; y: number; width: number; body: string[] } {
 const at = cardPosition(editor, width, title);
 const rows = editor.render(width).map(line => plain([line]));
 const top = rows[at.y] ?? "";
 const start = top.indexOf(`✦─ ${title}`);
 const columns = visibleWidth(top.slice(start, top.indexOf("✦", start + 1) + 1));
 const body: string[] = [];
 for (const row of rows.slice(at.y + 1)) {
  if (sliceByColumn(row, at.x, 1) === "╰") break;
  body.push(sliceByColumn(row, at.x + 1, columns - 2).trim());
 }
 return { ...at, width: columns, body };
}

void test("Companion-off output matches the pre-change ANSI baseline at both Git placements", () => {
 for (const placement of ["aboveEditor", "belowEditor"] as const) {
  const h = workspace(placement, false);
  const hash = createHash("sha256").update(JSON.stringify([40, 80, 120].map(h.snapshot))).digest("hex");
  assert.equal(hash, placement === "aboveEditor" ? "ce294f8a2f25111d12881e510ce250b70e913895189dfe01070280c3b8be92cc" : "c5aca5ed5f65aeb6aea8f85d9e9d0706a1e958f0dfb07422c3ea0923664c9e55");
 }
});

const quota = { fetchedAt: 123, planType: "plus", ordinaryUsageAllowed: true, credits: undefined,
 buckets: [{ id: "codex", label: undefined,
  primary: { usedPercent: 25, windowMinutes: 300, resetsAt: undefined },
  secondary: { usedPercent: 60, windowMinutes: 10080, resetsAt: undefined } }] };

void test("quota-present habitual output retains its pre-Usage ANSI baseline", t => {
 const h = workspace("belowEditor", false);
 h.model.provider = "openai-codex"; h.state.codexUsage = { kind: "ready", snapshot: quota };
 const outputs = [40, 80, 120].map(h.snapshot);
 h.state.companionEnabled = true; h.terminal.rows = 27; outputs.push(h.snapshot(120));
 t.mock.method(h.editor, "isShowingAutocomplete", () => true); outputs.push(h.snapshot(120));
 assert.equal(createHash("sha256").update(JSON.stringify(outputs)).digest("hex"), "228df4558eab70833cc966155ffbb69c88b5966371cda7def2debba4d599c2b0");
});

const providerStatuses = [
 ["a-engram", "🧠 osdy-pi · ✓ saved #14968"],
 ["b-permissions", "Permissions: YOLO 🚀 YOLO ON 🔥 — destructive confirmations remain"],
 ["pi-lens-lsp", "LSP Active: typescript, marksman, ast-grep, typos, opengrep"],
] as const;

void test("native status ordering, sanitization and small-mode formatting retain the pre-delta baseline", () => {
 const h = workspace("aboveEditor", false);
 for (const [key, text] of [...providerStatuses].reverse()) h.statuses.set(key, ` ${text}\n\t `);
 const output = [h.footer().render(240), h.footer().render(80)];
 h.state.smallMode = true; output.push(h.footer().render(120));
 h.state.editorEffective = false; output.push(h.footer().render(120));
 assert.equal(createHash("sha256").update(JSON.stringify(output)).digest("hex"), "bf0d7a1a7053817b49f0d503fc0b9e6bac2226f43a425dd83685714e118bb521");
});

void test("dynamic provider statuses move once, update/remove live and keep identity-safe disposal", () => {
 const h = workspace(); h.model.provider = "openai-codex"; h.state.codexUsage = { kind: "ready", snapshot: quota };
 for (const [key, text] of providerStatuses) h.statuses.set(key, text);
 const rows = h.editor.render(200);
 assert.match(plain(rows), /Permissions: YOLO/);
 for (const [, text] of providerStatuses) assert.ok(plain(rows).includes(text), "preserve each complete provider message");
 assert.match(plain(rows), /Pixel Pal/); assert.equal(rows.length, 14);
 assert.deepEqual(h.footer().render(200), [], "no native location or status duplicate while shared");
 h.statuses.set("a-engram", "🧠 next saved #14969"); h.statuses.delete("pi-lens-lsp");
 assert.match(plain(h.editor.render(200)), /next saved #14969/);
 assert.doesNotMatch(plain(h.editor.render(200)), /saved #14968|LSP Active/);
 const old = h.footer(); h.replaceFooter(); old.dispose?.();
 assert.match(plain(h.editor.render(200)), /next saved #14969/, "old disposal cannot detach the current provider");
 h.state.companionEnabled = false; const habitual = h.footer().render(120);
 h.state.companionEnabled = true; h.state.companionStyle = "drawn";
 assert.deepEqual(h.footer().render(120), habitual, "impossible shared fit restores exact status footer");
 h.statuses.clear(); h.state.companionStyle = "original";
 assert.doesNotMatch(plain(h.editor.render(200)), /Permissions|saved #/);
});

void test("status and card geometry stays bounded across widths, missing siblings and styles", t => {
 const cases = [
  { style: "original", width: 120, statuses: false },
  { style: "original", width: 160, statuses: true },
  { style: "original", width: 200, statuses: true },
  { style: "original", width: 200, statuses: true, omit: "git" },
  { style: "original", width: 200, statuses: true, omit: "todo" },
  { style: "rounded", width: 110, statuses: true },
  { style: "drawn", width: 120, statuses: true, fallback: true },
  { style: "drawn", width: 120, statuses: false, omit: "all" },
 ] as const;
 for (const sample of cases) {
  const h = workspace(); h.state.companionStyle = sample.style; h.terminal.rows = 48;
  h.model.provider = "openai-codex"; h.state.codexUsage = { kind: "ready", snapshot: quota };
  if (sample.statuses) for (const [key, text] of providerStatuses) h.statuses.set(key, text);
  const omit = "omit" in sample ? sample.omit : undefined;
  if (omit === "todo" || omit === "all") { h.store.set("main", { tasks: [], nextId: 1 }); h.emit("tool_execution_end"); }
  if (omit === "git" || omit === "all") h.tree.enabled = false;
  if (omit === "all") h.state.codexUsage = { kind: "idle" };
  const rows = h.editor.render(sample.width);
  assert.ok(rows.every(line => visibleWidth(line) <= sample.width));
  if ("fallback" in sample) {
   const native = h.snapshot(sample.width), footer = h.footer().render(sample.width);
   h.state.companionEnabled = false;
   assert.deepEqual(h.snapshot(sample.width), native);
   assert.deepEqual(h.footer().render(sample.width), footer);
   t.diagnostic(`${sample.style}/${sample.width}: exact native fallback, ${rows.length} editor-component rows`);
   continue;
  }
  assert.equal(rows.length, companionLayout(sample.style).boxHeight);
  assert.deepEqual(h.stacked(sample.width), []); assert.deepEqual(h.footer().render(sample.width), []);
  const left = rows.map(row => sliceByColumn(plain([row]), 0, sample.width - companionLayout(sample.style).columns));
  const cards = ["● Todos", "Usage", "Git"].filter(title => left.some(row => row.includes(`✦─ ${title}`)))
   .map(title => ({ title, ...renderedCard(h.editor, sample.width, title) }));
  const firstCard = cards.length ? Math.min(...cards.map(card => card.y)) : left.findIndex(row => row.startsWith("╭"));
  const statusRows = left.slice(0, firstCard).filter(row => row.startsWith("│")).length;
  assert.equal(statusRows > 0, sample.statuses);
  const editorY = left.findIndex(row => row.startsWith("╭"));
  t.diagnostic(`${sample.style}/${sample.width}${omit ? ` minus ${omit}` : ""}: ${rows.length} rows; statuses=${statusRows}; editor y=${editorY}, rows=${rows.length - editorY}; ${cards.map(card => `${card.title} x=${card.x},y=${card.y},w=${card.width},body=${card.body.length}`).join("; ")}`);
 }
});

void test("cards adapt across three columns, sibling removal and actual summary content", t => {
 const h = workspace(); h.model.provider = "openai-codex"; h.state.codexUsage = { kind: "ready", snapshot: quota };
 const rows = h.editor.render(200).map(line => plain([line]));
 const todo = cardPosition(h.editor, 200, "● Todos");
 const usage = cardPosition(h.editor, 200, "Usage"), git = cardPosition(h.editor, 200, "Git");
 assert.equal(git.y, todo.y, "free width must allow Git to leave the rigid quota sidebar");
 assert.equal(usage.y, todo.y); assert.ok(todo.x < usage.x && usage.x < git.x);
 const cardWidth = (title: string) => {
  const at = cardPosition(h.editor, 200, title);
  const row = plain([h.editor.render(200)[at.y] ?? ""]);
  const start = row.indexOf(`✦─ ${title}`);
  return visibleWidth(row.slice(start, row.indexOf("✦", start + 1) + 1));
 };
 const usageBefore = cardWidth("Usage");
 h.tree.enabled = false;
 assert.ok(cardWidth("Usage") > usageBefore, "a remaining card claims released width");
 h.tree.enabled = true; h.tree.snapshot = { ...h.tree.snapshot!, stagedFiles: 12345, unstagedFiles: 67890 };
 const summary = renderedCard(h.editor, 160, "Git").body.join(" ");
 assert.match(summary, /staged 12345/);
 assert.match(summary, /unstaged 67890/);
 for (const width of [120, 160, 200]) {
  const measurements = ["● Todos", "Usage", "Git"].map(title => ({ title, ...renderedCard(h.editor, width, title) }));
  t.diagnostic(`${width} columns: ${measurements.map(card => `${card.title} x=${card.x}, width=${card.width}, body=${card.body.length}`).join("; ")}`);
 }
 assert.ok(rows.every(line => visibleWidth(line) <= 200));
});

void test("activity is topmost and the live footer location moves once, restoring exactly on fallback", () => {
 const h = workspace(); h.model.provider = "openai-codex"; h.state.codexUsage = { kind: "ready", snapshot: quota };
 h.statuses.set("other-extension", "Keep this status");
 const rows = h.editor.render(120).map(line => plain([line]));
 const activity = rows.findIndex(line => line.includes("Exploring"));
 assert.ok(activity >= 0 && activity < cardPosition(h.editor, 120, "● Todos").y, "activity must precede every other card");
 assert.match(rows[activity] ?? "", /\/synthetic \(main\)/);
 assert.equal(rows.filter(line => line.includes("/synthetic")).length, 1);
 assert.doesNotMatch(plain(h.footer().render(120)), /\/synthetic/);
 assert.doesNotMatch(plain(h.footer().render(120)), /Keep this status/);
 assert.match(plain(rows), /Keep this status/);
 h.setBranch("feature");
 assert.match(plain(h.editor.render(120)), /\/synthetic \(feature\)/);
 h.working.active = false;
 assert.doesNotMatch(plain(h.editor.render(120)), /Exploring|Idle/);
 assert.match(plain(h.editor.render(120)), /\/synthetic \(feature\)/);
 h.state.companionEnabled = false;
 const habitual = h.footer().render(120);
 assert.match(plain(habitual), /\/synthetic \(feature\)/);
 h.state.companionEnabled = true; h.state.companionStyle = "drawn";
 assert.deepEqual(h.footer().render(120), habitual, "fit fallback restores exact location and statuses");
});

void test("visible default Companion bounds the ENTIRE all-card left block including the editor", () => {
 const h = workspace();
 h.model.provider = "openai-codex"; h.state.codexUsage = { kind: "ready", snapshot: quota };
 const lines = h.editor.render(120);
 assert.match(plain(lines), /Pixel Pal/, "must achieve a real shared fit, not always hide Companion");
 assert.ok(lines.length <= companionLayout("original").boxHeight, `entire shared block has ${lines.length} rows`);
 assert.deepEqual(h.stacked(120), []);
});

void test("all cards use a two-column upper band rather than an eighteen-row stack at 120 columns", () => {
 const h = workspace();
 h.model.provider = "openai-codex"; h.state.codexUsage = { kind: "ready", snapshot: quota };
 const lines = h.editor.render(120);
 const rows = lines.map(line => plain([line]).slice(0, 93));
 const todoY = rows.findIndex(line => line.includes("Todos"));
 const usageY = rows.findIndex(line => line.includes("✦─ Usage "));
 assert.equal(usageY, todoY, "TODO and Usage must share the upper row, not stack full-width");
 assert.ok((rows[usageY]?.indexOf("✦─ Usage ") ?? 0) >= 39, "Usage has a separate readable right column");
 assert.equal(lines.length, 14, "overflow moves to the TODO border; cards plus editor fit Companion");
});

void test("responsive grouping measures compact widths and lets absent cards release their cells", t => {
 const h = workspace(); h.model.provider = "openai-codex";
 for (const [width, withQuota, withoutQuota] of [[89, 7, 6], [100, 7, 14], [120, 14, 14], [160, 14, 14]] as const) {
  h.state.codexUsage = { kind: "ready", snapshot: quota };
  const lines = h.editor.render(width);
  assert.equal(lines.length, withQuota, `all cards at ${width} columns`);
  assert.ok(lines.every(line => visibleWidth(line) <= width));
  if (width <= 100) {
   assert.doesNotMatch(plain(lines), /Pixel Pal|✦─ Usage /);
   const fallback = h.snapshot(width);
   h.state.companionEnabled = false;
   assert.deepEqual(h.snapshot(width), fallback, "fit rejection restores habitual widgets in the same cycle");
   h.state.companionEnabled = true;
  } else {
   assert.match(plain(lines), /Pixel Pal/);
   assert.equal(cardPosition(h.editor, width, "Usage").y, cardPosition(h.editor, width, "● Todos").y);
   assert.deepEqual(h.stacked(width), []);
  }
  h.state.codexUsage = { kind: "idle" };
  assert.equal(h.editor.render(width).length, withoutQuota);
  t.diagnostic(`${width} columns: ${withQuota}/${withoutQuota} editor-component rows with/without quota; ${width <= 100 ? "habitual widgets restored" : "Companion visible"}`);
 }
 h.state.codexUsage = { kind: "ready", snapshot: quota };
 h.store.set("main", { tasks: [], nextId: 1 }); h.emit("tool_execution_end");
 const usageOnlyTop = h.editor.render(120).map(line => plain([line]).slice(0, 93));
 const usage = cardPosition(h.editor, 120, "Usage");
 assert.equal(usage.x, 0);
 assert.match(usageOnlyTop[usage.y] ?? "", /✦─ Usage .*✦ ✦─ Git .*✦$/);
 assert.match(usageOnlyTop[usage.y + 1] ?? "", /Session/);
 assert.match(usageOnlyTop[usage.y + 2] ?? "", /Weekly/, "released TODO width gives Usage and Git readable peer columns");
 assert.equal(usageOnlyTop.length, 14, "no TODO: spare height stays within Companion's band");
 h.tree.enabled = false; h.working.active = false; h.state.codexUsage = { kind: "idle" };
 assert.equal(h.editor.render(120).length, 14, "no cards: keep only original Companion/editor geometry");
});

void test("Session and Weekly move together into Usage above the editor without lower duplicates", () => {
 const h = workspace();
 h.model.provider = "openai-codex"; h.state.codexUsage = { kind: "ready", snapshot: quota };
 const original = structuredClone(h.store.get("main"));
 const lines = h.editor.render(120); const rows = lines.map(line => plain([line]));
 const usage = rows.findIndex(line => line.includes("✦─ Usage "));
 assert.ok(usage >= 0, "the quota block must have its own inline Usage frame");
 const editorTop = rows.findIndex(line => line.startsWith("╭"));
 assert.ok(usage < editorTop);
 assert.match(rows[usage + 1] ?? "", /Session.*75%/);
 assert.match(rows[usage + 2] ?? "", /Weekly.*40%/);
 assert.equal(rows.filter(line => line.includes("Session")).length, 1);
 assert.equal(rows.filter(line => line.includes("Weekly")).length, 1);
 assert.equal(lines.length, 14, "Usage fits beside three tasks and their overflow border, above the six-row editor");
 assert.ok(lines.every(line => visibleWidth(line) <= 120));
 assert.equal(rows.at(-1)?.startsWith("╰"), true, "nothing repeats beneath the editor");
 assert.deepEqual(h.store.get("main"), original);
 h.model.provider = "other"; assert.doesNotMatch(plain(h.editor.render(120)), /Usage|Session|Weekly/);
 h.model.provider = "openai-codex"; h.state.codexUsage = { kind: "idle" };
 assert.doesNotMatch(plain(h.editor.render(120)), /✦─ Usage /);
});

void test("only fullscreen Usage title/content left-clicks invoke its entrypoint without taking focus", () => {
 const h = workspace(); let opens = 0;
 h.model.provider = "openai-codex"; h.state.codexUsage = { kind: "ready", snapshot: quota };
 h.state.openUsage = () => { opens++; return Promise.resolve(); };
 const click = (dy = 0, change: Partial<TuiMouseEvent> = {}) => {
  const title = cardPosition(h.editor, 120, "Usage");
  assert.ok(title.x > 0, "Usage must receive a horizontally translated hit target");
  return h.mouse(title.x + 5, title.y + dy, change);
 };
 h.hostState.mode = "regular"; assert.equal(click(), undefined);
 h.hostState.mode = "fullscreen";
 assert.deepEqual(click(), { handled: true });
 assert.deepEqual(click(1), { handled: true });
 assert.equal(opens, 2);
 assert.equal(click(3), undefined, "bottom border stays inert");
 for (const change of [{ type: "wheel", wheelDelta: 1 }, { type: "drag" }, { type: "press" }, { button: "right" }] as const)
  assert.equal(click(1, change), undefined);
 const todo = cardPosition(h.editor, 120, "● Todos");
 const wheel = { type: "wheel", button: "none", wheelDelta: 1 } as const;
 const before = plain(h.editor.render(120));
 const usage = cardPosition(h.editor, 120, "Usage");
 assert.equal(h.mouse(usage.x - 1, todo.y + 1, wheel), undefined, "inter-column gap cannot scroll TODO");
 assert.equal(h.mouse(usage.x - 2, todo.y + 1, wheel), undefined, "TODO right border cannot scroll tasks");
 assert.equal(h.mouse(usage.x + 5, usage.y + 4, wheel), undefined, "padding below Usage is not its content");
 assert.equal(plain(h.editor.render(120)), before);
 assert.equal(opens, 2);
 h.hostState.overlay = true; assert.equal(click(), undefined); assert.equal(opens, 2);
 h.hostState.overlay = false; h.state.companionEnabled = false;
 const quotaRow = h.editor.render(120).findIndex(line => line.includes("Session"));
 h.mouse(5, quotaRow);
 assert.equal(opens, 2, "habitual bars acquire no Usage interaction");
});

void test("enabled panels share the Companion band, without stack duplicates or lost preview rows", () => {
 const h = workspace();
 const original = structuredClone(h.store.get("main"));
 const lines = h.editor.render(120);
 assert.match(plain(lines), /Todos \(0\/8\)/);
 for (const id of [1, 2, 3]) assert.match(plain(lines), new RegExp(`Task ${id}`));
 assert.doesNotMatch(plain(lines), /Task 4/);
 assert.match(plain(lines), /Git changes.*3 files/);
 assert.match(plain(lines), /Exploring/);
 // With no quotas, tasks and Git share columns below the activity/location
 // strip. Bottom padding keeps the unchanged six-row editor within Companion.
 assert.equal(lines.length, 14);
 assert.match(plain(lines), /\+5 more \(5 pending\)/);
 assert.ok(lines.every(line => visibleWidth(line) <= 120));
 assert.deepEqual(h.stacked(120), []);
 assert.deepEqual(h.store.get("main"), original);
});

void test("localized TODO and Git keep separate frames under the topmost activity/location strip", () => {
 const h = workspace("aboveEditor", true, "Tareas");
 const rows = h.editor.render(120).map(line => plain([line]).slice(0, 93));
 const todo = rows.findIndex(line => line.includes("✦─ ● Tareas"));
 assert.match(rows[todo] ?? "", /^✦─ ● Tareas \(0\/8\).*✦/);
 assert.ok(rows.findIndex(line => line.includes("Exploring")) < todo);
 assert.equal(rows.filter(line => line.includes("Tareas")).length, 1, "reuse the native localized heading as title");
 assert.doesNotMatch(rows.join("\n"), /Todos/);
 assert.match(rows.join("\n"), /\+5 más \(5 pendientes\)/, "localized overflow survives in the frame border");
 const git = rows.findIndex(line => line.includes("✦─ Git "));
 assert.ok(git > 0);
 assert.match(rows[git] ?? "", /✦─ Git .*✦$/);
 assert.match(rows[git + 1] ?? "", /│.*Git changes.*│$/);
 assert.match(renderedCard(h.editor, 120, "Git").body.join(" "), /staged 1.*unstaged 2/);
 assert.doesNotMatch(rows.join("\n"), /✦─ Activity /);
 assert.ok(h.editor.render(120).every(line => visibleWidth(line) <= 120));
 assert.deepEqual(h.stacked(120), []);
});

void test("framed TODO title/wheel ignore bottom and side borders while editor offsets still type", () => {
 const h = workspace(); h.state.companionStyle = "rounded"; h.terminal.rows = 48;
 const original = structuredClone(h.store.get("main"));
 const rows = () => h.editor.render(120).map(line => plain([line]));
 const title = () => rows().findIndex(line => line.startsWith("✦─ ● Todos"));
 assert.ok(title() >= 0, "TODO heading must be the top frame title");
 assert.equal(h.mouse(5, title())?.handled, true);
 assert.match(rows().join("\n"), /Task 5/);
 const wheel = { type: "wheel", button: "none", wheelDelta: 1 } as const;
 assert.equal(h.mouse(5, title() + 1, wheel)?.handled, true);
 const bottom = rows().findIndex((line, index) => index > title() && line.startsWith("╰"));
 assert.equal(h.mouse(5, bottom, wheel), undefined);
 assert.equal(h.mouse(0, title() + 1, wheel), undefined);
 assert.match(rows()[title() + 1] ?? "", /Task 2/);
 h.editor.setText("abcd");
 const editorTop = rows().findIndex(line => line.startsWith("╭"));
 assert.equal(h.mouse(4, editorTop + 1)?.focus, true);
 h.editor.handleInput("X"); assert.equal(h.editor.getText(), "abXcd");
 h.shortcut(); assert.match(rows().join("\n"), /ctrl\+shift\+t to expand/);
 assert.deepEqual(h.store.get("main"), original);
});

void test("narrow fit fallback and absent cards preserve readable remaining output", () => {
 const h = workspace();
 assert.doesNotMatch(plain(h.editor.render(89)), /Pixel Pal|✦─ Git /, "stacking cannot exceed Original's height cap");
 assert.match(plain(h.stacked(89)), /Todos.*|Git changes/);
 // A taller style can retain the same readable stack without exceeding its box.
 h.state.companionStyle = "rounded"; h.terminal.rows = 48;
 const narrow = h.editor.render(110).map(line => plain([line]).slice(0, 59));
 const git = narrow.findIndex(line => line.startsWith("✦─ Git "));
 const activity = narrow.findIndex(line => line.includes("Exploring"));
 assert.ok(git > activity && activity >= 0);
 assert.equal(narrow.length, companionLayout("rounded").boxHeight);
 h.state.companionStyle = "original"; h.terminal.rows = 40;
 h.tree.enabled = false;
 const activityOnly = h.editor.render(120).map(line => plain([line]).slice(0, 93));
 assert.match(activityOnly.find(line => line.includes("Exploring")) ?? "", /^✦─.*Exploring.*\/synthetic.*✦$/);
 assert.doesNotMatch(activityOnly.join("\n"), /✦─ Git /);
 h.tree.enabled = true; h.working.active = false;
 const single = h.editor.render(120).map(line => plain([line]).slice(0, 93));
 assert.match(single.find(line => line.includes("✦─ Git ")) ?? "", /✦─ Git .*✦$/);
 assert.doesNotMatch(single.join("\n"), /Activity/);
 h.tree.snapshot = null;
 assert.doesNotMatch(plain(h.editor.render(120)), /✦─ Git /);
 h.store.set("main", { tasks: [], nextId: 1 }); h.emit("tool_execution_end");
 assert.doesNotMatch(plain(h.editor.render(120)), /Todos|Activity|✦─ Git /);
});

void test("style and multiline height limits restore widgets before editor render and sharing resumes", () => {
 const h = workspace(); h.model.provider = "openai-codex";
 h.state.codexUsage = { kind: "ready", snapshot: quota };
 const original = structuredClone(h.store.get("main"));
 h.editor.setText(Array.from({ length: 12 }, (_, i) => `line ${i}`).join("\n"));
 assert.match(plain(h.stacked(120)), /Todos/, "native widgets render first and must not disappear");
 assert.doesNotMatch(plain(h.editor.render(120)), /Pixel Pal/);
 const fallback = h.snapshot(120); h.state.companionEnabled = false;
 assert.deepEqual(h.snapshot(120), fallback);
 h.state.companionEnabled = true; h.editor.setText("");
 assert.deepEqual(h.stacked(120), []); assert.equal(h.editor.render(120).length, 14);
 h.state.companionStyle = "drawn";
 assert.match(plain(h.stacked(120)), /Todos/);
 assert.doesNotMatch(plain(h.editor.render(120)), /Tiny Doodle/);
 h.state.companionStyle = "rounded"; h.terminal.rows = 48;
 assert.deepEqual(h.stacked(120), []);
 assert.equal(h.editor.render(120).length, companionLayout("rounded").boxHeight);
 assert.match(plain(h.editor.render(120)), /Big Cuddle/);
 assert.deepEqual(h.store.get("main"), original);
 h.state.companionStyle = "drawn";
 h.store.set("main", { tasks: [], nextId: 1 }); h.emit("tool_execution_end");
 h.tree.enabled = false; h.working.active = false;
 const lines = h.editor.render(120);
 assert.match(plain(lines), /Tiny Doodle/);
 assert.equal(lines.length, companionLayout("drawn").boxHeight);
 const title = cardPosition(h.editor, 120, "Usage");
 assert.ok(title.y > 0, "short left block is bottom-aligned, including hit rectangles");
 let opens = 0; h.state.openUsage = () => { opens++; return Promise.resolve(); };
 assert.equal(h.mouse(title.x + 5, title.y)?.handled, true); assert.equal(opens, 1);
});

void test("expanded TODO falls back without resetting offset and its shortcut can restore sharing", () => {
 const h = workspace("aboveEditor", true, undefined, 9); h.model.provider = "openai-codex";
 h.state.codexUsage = { kind: "ready", snapshot: quota };
 const original = structuredClone(h.store.get("main"));
 const title = cardPosition(h.editor, 120, "● Todos");
 assert.equal(h.mouse(title.x + 5, title.y)?.handled, true);
 assert.match(plain(h.stacked(120)), /Task 5/);
 assert.doesNotMatch(plain(h.editor.render(120)), /Pixel Pal/);
 const native = h.widgets.get("osdy-todos")!.component;
 const event: TuiMouseEvent = { type: "wheel", button: "none", x: 2, y: 1, screenX: 12, screenY: 21,
  width: 120, height: native.render(120).length, wheelDelta: 1, shift: false, alt: false, ctrl: false };
 assert.equal(native.handleMouse?.(event)?.handled, true);
 assert.match(plain(native.render(120).slice(0, 2)), /Task 2/);
 h.shortcut(); assert.match(plain(h.editor.render(120)), /Pixel Pal/);
 assert.match(plain(h.editor.render(120)), /ctrl\+shift\+t to expand/);
 h.shortcut(); assert.match(plain(native.render(120).slice(0, 2)), /Task 2/);
 assert.equal(native.handleMouse?.({ ...event, type: "click", button: "left", y: 0 })?.handled, true);
 assert.deepEqual(h.stacked(120), []); assert.equal(h.editor.render(120).length, 14);
 assert.deepEqual(h.store.get("main"), original);
});

void test("failed narrow measurement cannot change habitual editor click/wrap metadata", () => {
 const h = workspace("belowEditor"), fallback = workspace("belowEditor", false);
 const text = "abcdefghij".repeat(90);
 for (const fixture of [h, fallback]) { fixture.editor.focused = true; fixture.editor.setText(text); fixture.editor.render(120); }
 h.stacked(120); // A below-editor widget asks for fit after the editor rendered full-width.
 assert.doesNotMatch(plain(h.editor.render(120)), /Pixel Pal/);
 h.stacked(120);
 const click: TuiMouseEvent = { type: "click", button: "left", x: 4, y: 2, screenX: 14, screenY: 22,
  width: 120, height: 12, shift: false, alt: false, ctrl: false };
 assert.equal(h.editor.handleMouse(click)?.focus, true);
 fallback.editor.handleMouse(click);
 h.editor.handleInput("X"); fallback.editor.handleInput("X");
 assert.equal(h.editor.getText(), fallback.editor.getText());
});

void test("Companion off restores exact habitual lines and the saved bottom Git placement", () => {
 const h = workspace("belowEditor");
 const habitual = workspace("belowEditor", false).snapshot(120);
 assert.deepEqual(h.stacked(120), [], "panels must first leave the habitual stack");
 h.state.companionEnabled = false;
 assert.deepEqual(h.snapshot(120), habitual);
 assert.equal(h.widgets.get("osdy-pi-working-tree")?.placement, "belowEditor");
});

void test("resize, small mode, hidden Companion, autocomplete and native editor restore the stack immediately", t => {
 const h = workspace();
 const fallback = workspace("aboveEditor", false);
 const autocomplete = t.mock.method(h.editor, "isShowingAutocomplete", () => false);
 for (const scenario of ["narrow", "short", "small", "off", "autocomplete", "native"] as const) {
  const width = scenario === "narrow" ? 73 : 120;
  h.terminal.rows = scenario === "short" ? 27 : 40;
  h.state.smallMode = scenario === "small";
  h.state.companionEnabled = scenario !== "off";
  autocomplete.mock.mockImplementation(() => scenario === "autocomplete");
  if (scenario === "native") { h.state.editorMode = "simple"; h.reconcile(); }
  // Native widgets render before the editor in Pi; no previous-frame availability cache.
  assert.deepEqual(h.stacked(width), fallback.stacked(width), scenario);
  assert.doesNotMatch(plain(h.editor.render(width)), /Todos|Git changes|Exploring/);
  if (scenario !== "native") {
   h.terminal.rows = 40; h.state.smallMode = false; h.state.companionEnabled = true;
   autocomplete.mock.mockImplementation(() => false);
   assert.deepEqual(h.stacked(120), []);
  }
 }
});

void test("inline TODO keeps mouse expansion, wheel offset and collapse shortcut without task changes", () => {
 const h = workspace(); h.state.companionStyle = "rounded"; h.terminal.rows = 48;
 const original = structuredClone(h.store.get("main"));
 const headingY = () => h.editor.render(120).findIndex(line => plain([line]).includes("Todos"));
 assert.equal(h.mouse(5, headingY())?.handled, true);
 assert.match(plain(h.editor.render(120)), /Task 5/);
 assert.equal(h.mouse(2, headingY() + 1, { type: "wheel", button: "none", wheelDelta: 1 })?.handled, true);
 assert.doesNotMatch(plain(h.editor.render(120)), /Task 1/);
 h.shortcut(); assert.match(plain(h.editor.render(120)), /ctrl\+shift\+t to expand/);
 h.shortcut(); assert.match(plain(h.editor.render(120)), /Task 2/);
 h.state.companionEnabled = false;
 assert.match(plain(h.stacked(120)), /Task 2/);
 assert.deepEqual(h.store.get("main"), original);
});

void test("editor translates clicks but preserves screen coordinates, focus, typing and native drag selection", t => {
 const h = workspace();
 h.model.provider = "openai-codex"; h.state.codexUsage = { kind: "ready", snapshot: quota };
 h.editor.focused = true;
 h.editor.setText("abcd");
 const original = CustomEditor.prototype.handleMouse.bind(h.editor);
 const forwarded: TuiMouseEvent[] = [];
 t.mock.method(CustomEditor.prototype, "handleMouse", (event: TuiMouseEvent) => {
  forwarded.push(event); return original(event);
 });
 const top = h.editor.render(120).findIndex(line => plain([line]).startsWith("╭"));
 const result = h.mouse(4, top + 1);
 assert.equal(result?.focus, true);
 assert.equal(forwarded.at(-1)?.x, 3);
 assert.equal(forwarded.at(-1)?.y, 1);
 assert.equal(forwarded.at(-1)?.screenX, 14);
 assert.equal(forwarded.at(-1)?.screenY, top + 21);
 h.editor.handleInput("X"); assert.equal(h.editor.getText(), "abXcd");
 assert.ok(h.editor.render(120).some(line => line.includes("\u001b_pi:c")), "focused hardware cursor marker survives composition");
 for (const type of ["press", "drag", "release"] as const) assert.equal(h.mouse(4, top + 1, { type }), undefined);
 const count = forwarded.length;
 assert.equal(h.mouse(110, top + 1), undefined);
 assert.equal(forwarded.length, count, "Companion click never reaches text editor");
 h.editor.handleInput("Y"); assert.equal(h.editor.getText(), "abXYcd");
});

void test("cleared and replaced panels cannot resurrect old TODO content or detach a newer instance", () => {
 const h = workspace();
 const old = h.widgets.get("osdy-todos")?.component;
 h.store.set("main", { tasks: [], nextId: 1 }); h.emit("tool_execution_end");
 assert.doesNotMatch(plain(h.editor.render(120)), /Todos/);
 h.store.set("main", { tasks: [{ id: 1, subject: "New task", status: "pending" }], nextId: 2 });
 h.emit("tool_execution_end"); old?.dispose?.();
 assert.deepEqual(old?.render(120), []);
 assert.match(plain(h.editor.render(120)), /New task/);
 h.tree.enabled = false; h.state.workingTreeEnabled = false; h.replaceGit(); h.working.active = false;
 assert.doesNotMatch(plain(h.editor.render(120)), /Git changes|Exploring/);
 h.emit("session_shutdown"); assert.doesNotMatch(plain(h.editor.render(120)), /Todos|New task/);
 const other = workspace(); assert.match(plain(other.editor.render(120)), /Task 1/);
 assert.doesNotMatch(plain(h.editor.render(120)), /Task 1/);
});

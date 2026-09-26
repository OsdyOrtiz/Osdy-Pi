import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import test from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import type { ExtensionAPI, Theme } from "@earendil-works/pi-coding-agent";
import type { TodoConfig } from "./todo-config.js";
import type { TodoI18n } from "./todo-i18n.js";

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
const { registerTodoWidget } = await import("./todo-widget.js");
const { createTodoSessionStore } = await import("./todo-session.js");
const { applyTodo } = await import("./todo-domain.js");
const { visibleWidth } = await import("@earendil-works/pi-tui");
const theme = { fg: (_color: string, text: string) => text, strikethrough: (text: string) => `~${text}~` };
function harness(config: () => TodoConfig = () => ({}), i18n?: TodoI18n) {
 type Context = { hasUI: boolean; ui: typeof ui; sessionManager: { getSessionId(): string } };
 type Factory = (tui: { requestRender(force?: boolean): void }, theme: Theme) => { render(width: number): string[] };
 const handlers = new Map<string, ((event: { toolName?: string }, ctx: Context) => void)[]>();
 const shortcuts = new Map<string, (ctx: Context) => void>();
 const widgets: Array<{ key: string; factory: Factory | undefined; options: { placement: string } | undefined }> = [];
 const renders: boolean[] = [];
 const ui = { theme, expanded: false, getToolsExpanded() { return this.expanded; }, setWidget(key: string, factory: Factory | undefined, options?: { placement: string }) { widgets.push({ key, factory, options }); } };
 const pi = { on(name: string, handler: (event: { toolName?: string }, ctx: Context) => void) { handlers.set(name, [...(handlers.get(name) ?? []), handler]); }, registerShortcut(key: string, options: { handler(ctx: Context): void }) { shortcuts.set(key, (ctx) => options.handler(ctx)); } };
 const store = createTodoSessionStore();
 registerTodoWidget(pi as unknown as ExtensionAPI, store, config, i18n);
 const ctx = (id: string, hasUI = true, panel = ui): Context => ({ hasUI, ui: panel, sessionManager: { getSessionId: () => id } });
 const emit = (name: string, context: Context, event: { toolName?: string } = {}) => { for (const handler of handlers.get(name) ?? []) handler(event, context); };
 const state = (id: string, tasks: { id: number; subject: string; status: "pending" | "in_progress" | "completed" | "deleted"; blockedBy?: number[]; activeForm?: string }[]) => store.set(id, { tasks, nextId: Math.max(1, ...tasks.map((t) => t.id + 1)) });
 const action = (id: string, kind: "create" | "clear", subject?: string) => store.set(id, applyTodo(store.get(id), kind, subject === undefined ? {} : { subject }).state);
 const lines = (width = 80): string[] => widgets.at(-1)?.factory?.({ requestRender(force?: boolean) { renders.push(force === true); } }, theme as Theme).render(width) ?? [];
 return { ui, widgets, renders, shortcuts, ctx, emit, state, action, lines };
}
const task = (id: number, status: "pending" | "in_progress" | "completed" | "deleted" = "pending", extra: { activeForm?: string; blockedBy?: number[] } = {}) => ({ id, status, subject: `Task ${id}`, ...extra });

void test("foreground widget renders glyphs, ids, metadata and truncates by terminal width", () => {
 const h = harness(); const c = h.ctx("main"); h.emit("session_start", c);
 h.state("main", [task(1), task(2, "in_progress", { activeForm: "working", blockedBy: [1] }), task(3, "completed")]);
 h.emit("tool_execution_end", c, { toolName: "todo" });
 assert.equal(h.widgets.length, 1); assert.equal(h.widgets[0]?.options?.placement, "aboveEditor");
 assert.deepEqual(h.lines().slice(0, -1), ["● Todos (1/3)", "├─ ○ #1 Task 1", "├─ ◐ #2 Task 2 (working) ⛓ #1", "└─ ✓ #3 ~Task 3~"]);
 assert.ok(h.lines(13).every((line) => visibleWidth(line) <= 13));
 h.emit("tool_execution_end", c, { toolName: "todo" }); assert.deepEqual(h.renders, [false]);
});

void test("completed rows remain struck through across turns, collapse toggles and empty unregisters", () => {
 const h = harness(); const c = h.ctx("main"); h.emit("session_start", c);
 h.state("main", [task(1, "completed")]); h.emit("tool_execution_end", c, { toolName: "todo" });
 assert.deepEqual(h.lines(), ["○ Todos (1/1)", "└─ ✓ ~Task 1~", ""]);
 h.shortcuts.get("ctrl+shift+t")?.(c); assert.match(h.lines()[1] ?? "", /ctrl\+shift\+t to expand/);
 h.shortcuts.get("ctrl+shift+t")?.(c); assert.deepEqual(h.renders, [true, true]);
 h.emit("agent_start", c); assert.deepEqual(h.lines(), ["○ Todos (1/1)", "└─ ✓ ~Task 1~", ""]);
 h.emit("agent_start", c); assert.deepEqual(h.lines(), ["○ Todos (1/1)", "└─ ✓ ~Task 1~", ""]);
 h.action("main", "clear"); h.emit("tool_execution_end", c, { toolName: "todo" });
 assert.deepEqual(h.lines(), []); assert.equal(h.widgets.at(-1)?.factory, undefined);
});

void test("clear resets allocated IDs without hiding a new pending task", () => {
 const h = harness(); const c = h.ctx("main"); h.emit("session_start", c);
 h.state("main", [task(1, "completed")]); h.emit("tool_execution_end", c, { toolName: "todo" }); h.lines();
 h.emit("agent_start", c); assert.equal(h.lines()[1], "└─ ✓ ~Task 1~");
 h.action("main", "clear"); h.emit("tool_execution_end", c, { toolName: "todo" });
 h.action("main", "create", "New task"); h.emit("tool_execution_end", c, { toolName: "todo" });
 assert.deepEqual(h.lines().slice(0, -1), ["● Todos (0/1)", "└─ ○ New task"]);
});

void test("replacement of a completed task with pending makes its reused ID visible", () => {
 const h = harness(); const c = h.ctx("main"); h.emit("session_start", c);
 h.state("main", [task(1, "completed")]); h.emit("tool_execution_end", c, { toolName: "todo" }); h.lines();
 h.emit("agent_start", c); h.state("main", [task(1)]); h.emit("tool_execution_end", c, { toolName: "todo" });
 assert.deepEqual(h.lines().slice(0, -1), ["● Todos (0/1)", "└─ ○ Task 1"]);
});

void test("replacement before the next turn displays the current pending status", () => {
 const h = harness(); const c = h.ctx("main"); h.emit("session_start", c);
 h.state("main", [task(1, "completed")]); h.emit("tool_execution_end", c, { toolName: "todo" }); h.lines();
 h.state("main", [task(1)]); h.emit("agent_start", c);
 assert.deepEqual(h.lines().slice(0, -1), ["● Todos (0/1)", "└─ ○ Task 1"]);
});

void test("deleted tasks remain excluded while completed and pending tasks persist across turns", () => {
 const h = harness(); const c = h.ctx("main"); h.emit("session_start", c);
 h.state("main", [task(1, "deleted"), task(2, "completed"), task(3)]);
 h.emit("tool_execution_end", c, { toolName: "todo" });
 h.emit("agent_start", c); h.emit("agent_start", c);
 assert.deepEqual(h.lines(), ["● Todos (1/2)", "├─ ✓ ~Task 2~", "└─ ○ Task 3", ""]);
 h.state("main", [task(1, "deleted")]); h.emit("tool_execution_end", c, { toolName: "todo" });
 assert.deepEqual(h.lines(), []);
});

void test("default widget shows five task rows at the six-task boundary, with a truthful hint", () => {
 const h = harness(); const c = h.ctx("main"); h.emit("session_start", c);
 h.state("main", Array.from({ length: 6 }, (_, i) => task(i + 1)));
 h.emit("tool_execution_end", c, { toolName: "todo" });
 assert.deepEqual(h.lines(), ["● Todos (0/6)", ...Array.from({ length: 5 }, (_, i) => `├─ ○ Task ${i + 1}`), "└─ +1 more (1 pending)", ""]);
 h.ui.expanded = true;
 assert.equal(h.lines().length, 8);
 assert.equal(h.lines()[6], "└─ ○ Task 6");
});

void test("five or fewer default task rows keep completed subjects struck through without overflow", () => {
 const h = harness(); const c = h.ctx("main"); h.emit("session_start", c);
 h.state("main", [task(1, "completed"), ...Array.from({ length: 4 }, (_, i) => task(i + 2))]);
 h.emit("tool_execution_end", c, { toolName: "todo" });
 assert.deepEqual(h.lines(), ["● Todos (1/5)", "├─ ✓ ~Task 1~", "├─ ○ Task 2", "├─ ○ Task 3", "├─ ○ Task 4", "└─ ○ Task 5", ""]);
 h.state("main", [task(1, "completed"), ...Array.from({ length: 5 }, (_, i) => task(i + 2, "completed"))]);
 assert.equal(h.lines().length, 8);
 assert.equal(h.lines().at(-2), "└─ +1 more (1 completed)");
 assert.match(h.lines()[1] ?? "", /~Task 1~/);
});

void test("default widget retains completed strikethrough when overflow contains completed and pending tasks", () => {
 const h = harness(); const c = h.ctx("main"); h.emit("session_start", c);
 h.state("main", [task(1, "completed"), ...Array.from({ length: 14 }, (_, i) => task(i + 2))]);
 h.emit("tool_execution_end", c, { toolName: "todo" });
 assert.deepEqual(h.lines(), ["● Todos (1/15)", ...Array.from({ length: 5 }, (_, i) => `├─ ○ Task ${i + 2}`), "└─ +10 more (1 completed, 9 pending)", ""]);
 h.ui.expanded = true;
 assert.equal(h.lines().length, 17);
 assert.equal(h.lines()[1], "├─ ✓ ~Task 1~");
});

void test("configured widget budget preserves small and boundary lists without hiding overflow", () => {
 for (const maxWidgetLines of [3, 7.5, 8]) {
  const slots = Math.floor(maxWidgetLines - 2);
  const h = harness(() => ({ maxWidgetLines })); const c = h.ctx("main"); h.emit("session_start", c);
  h.state("main", Array.from({ length: slots }, (_, i) => task(i + 1)));
  h.emit("tool_execution_end", c, { toolName: "todo" });
  assert.equal(h.lines().length, slots + 2);
  assert.doesNotMatch(h.lines().join(" "), /more/);
  h.state("main", Array.from({ length: slots + 1 }, (_, i) => task(i + 1)));
  assert.equal(h.lines().length, slots + 3);
  assert.equal(h.lines().at(-2), "└─ +1 more (1 pending)");
 }
});

void test("overflow drops completed first and expands on Pi tool expansion", () => {
 const h = harness(); const c = h.ctx("main"); h.emit("session_start", c);
 h.state("main", Array.from({ length: 15 }, (_, i) => task(i + 1, i % 3 === 0 ? "completed" : "pending")));
 h.emit("tool_execution_end", c, { toolName: "todo" });
 assert.equal(h.lines().length, 8); assert.match(h.lines()[6] ?? "", /\+10 more \(5 completed, 5 pending\)/);
 h.ui.expanded = true; assert.equal(h.lines().length, 17);
});

void test("branch lifecycle retains completed rows and rebinds replacement UI safely", () => {
 const h = harness(); const main = h.ctx("main"); h.emit("session_start", main);
 h.state("main", [task(1, "completed")]); h.emit("tool_execution_end", main, { toolName: "todo" }); h.lines();
 h.emit("agent_start", main); assert.equal(h.lines()[1], "└─ ✓ ~Task 1~");
 h.emit("session_tree", main); assert.equal(h.widgets.at(-1)?.options?.placement, "aboveEditor");
 h.emit("agent_start", main); h.emit("session_compact", main);
 assert.equal(h.lines()[1], "└─ ✓ ~Task 1~");
 const replacement = h.ctx("main", true, { ...h.ui });
 h.emit("session_start", replacement);
 assert.equal(h.widgets.at(-2)?.factory, undefined);
 assert.equal(h.widgets.at(-1)?.options?.placement, "aboveEditor");
 h.emit("session_shutdown", main); assert.equal(h.widgets.at(-1)?.factory !== undefined, true);
 h.emit("session_shutdown", replacement); assert.equal(h.widgets.at(-1)?.factory, undefined);
});

void test("overflow unfinished tail reports pending and hides completed first", () => {
 const h = harness(); const c = h.ctx("main"); h.emit("session_start", c);
 h.state("main", [task(1, "completed"), ...Array.from({ length: 14 }, (_, i) => task(i + 2))]);
 h.emit("tool_execution_end", c, { toolName: "todo" });
 assert.match(h.lines()[6] ?? "", /\+10 more \(1 completed, 9 pending\)/);
 assert.doesNotMatch(h.lines().join(" "), /Task 1(?!\d)/);
});

void test("configured budget changes each render while key binds once and hint follows config", () => {
 let config: TodoConfig = { maxWidgetLines: 3, collapseKey: "alt+f5" };
 const h = harness(() => config); const c = h.ctx("main"); h.emit("session_start", c);
 h.state("main", Array.from({ length: 5 }, (_, i) => task(i + 1)));
 h.emit("tool_execution_end", c, { toolName: "todo" });
 assert.equal(h.lines().length, 4);
 config = { maxWidgetLines: 8, collapseKey: "ctrl+g" };
 assert.equal(h.lines().length, 7);
 assert.equal(h.shortcuts.has("ctrl+g"), false);
 h.shortcuts.get("alt+f5")?.(c);
 assert.match(h.lines()[1] ?? "", /ctrl\+g to expand/);
});

void test("switching collapseKey off mid-session shows collapsed without unbinding the shortcut", () => {
 let config: TodoConfig = { collapseKey: "alt+f5" };
 const h = harness(() => config); const c = h.ctx("main"); h.emit("session_start", c);
 h.state("main", [task(1)]); h.emit("tool_execution_end", c, { toolName: "todo" }); h.lines();
 config = { collapseKey: "off" };
 assert.equal(h.shortcuts.has("alt+f5"), true);
 h.shortcuts.get("alt+f5")?.(c);
 assert.deepEqual(h.lines(), ["● Todos (0/1)", "└─ collapsed", ""]);
 h.shortcuts.get("alt+f5")?.(c);
 assert.equal(h.lines()[1], "└─ ○ Task 1");
});

void test("off disables the collapse shortcut", () => {
 const h = harness(() => ({ collapseKey: "off" }));
 assert.equal(h.shortcuts.size, 0);
});

void test("widget reads live translations for heading, overflow, statuses and collapse hint", () => {
 let language = "es";
 const translations: Record<string, string> = { "overlay.heading": "Tareas", "overlay.more": "más", "overlay.expandHint": "{key} para expandir", "overlay.collapsed": "contraído", "status.completed": "completadas", "status.pending": "pendientes" };
 const i18n: TodoI18n = { t: (key, fallback) => language === "es" ? translations[key] ?? fallback : fallback, status: (status) => language === "es" ? translations[`status.${status}`] ?? status : status };
 const h = harness(() => ({ maxWidgetLines: 3 }), i18n); const c = h.ctx("main"); h.emit("session_start", c);
 h.state("main", [task(1, "completed"), task(2), task(3), task(4)]); h.emit("tool_execution_end", c, { toolName: "todo" });
 assert.match(h.lines()[0] ?? "", /Tareas/);
 assert.match(h.lines()[2] ?? "", /1 completadas, 2 pendientes/);
 assert.match(h.lines()[2] ?? "", /más/);
 h.shortcuts.get("ctrl+shift+t")?.(c);
 assert.equal(h.lines()[1], "└─ ctrl+shift+t para expandir");
 language = "en";
 assert.equal(h.lines()[0], "● Todos (1/4)");
 assert.equal(h.lines()[1], "└─ ctrl+shift+t to expand");
});

void test("headless and child sessions do not bind, refresh, collapse or dispose foreground", () => {
 const h = harness(); const main = h.ctx("main"), child = h.ctx("child", true, { ...h.ui });
 h.emit("session_start", h.ctx("headless", false)); h.state("headless", [task(1)]); h.emit("tool_execution_end", h.ctx("headless", false), { toolName: "todo" }); assert.equal(h.widgets.length, 0);
 h.emit("session_start", main); h.state("main", [task(1)]); h.emit("tool_execution_end", main, { toolName: "todo" }); h.lines();
 h.emit("session_start", child); h.state("child", [task(1)]); h.emit("tool_execution_end", child, { toolName: "todo" });
 h.emit("session_shutdown", child); h.shortcuts.get("ctrl+shift+t")?.(child);
 assert.equal(h.widgets.length, 1); assert.deepEqual(h.renders, []);
 h.emit("session_shutdown", main); assert.equal(h.widgets.at(-1)?.factory, undefined);
});

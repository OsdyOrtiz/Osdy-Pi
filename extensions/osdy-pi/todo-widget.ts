// Widget behavior adapted independently from @juicesharp/rpiv-todo@2.11.0 (MIT); see root LICENSE.
import type { ExtensionAPI, ExtensionContext, ExtensionUIContext, Theme } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, type TUI } from "@earendil-works/pi-tui";
import { COLLAPSE_KEY_OFF, getMaxWidgetLines, loadTodoConfig, resolveCollapseKey, type TodoConfig } from "./todo-config.js";
import type { TodoTask } from "./todo-domain.js";
import { todoI18n, type TodoI18n } from "./todo-i18n.js";
import { todoSessionId, type createTodoSessionStore } from "./todo-session.js";
import { safe } from "./todo-tool.js";

const KEY = "osdy-todos";
type Store = ReturnType<typeof createTodoSessionStore>;

function layout(tasks: TodoTask[], budget: number) {
 const slots = Math.max(0, Math.floor(budget - 1));
 if (tasks.length <= slots) return { rows: tasks, completed: 0, pending: 0 };
 const unfinished = tasks.filter((task) => task.status !== "completed");
 if (unfinished.length > slots) return { rows: unfinished.slice(0, slots), completed: tasks.length - unfinished.length, pending: unfinished.length - slots };
 const kept = new Set(unfinished);
 for (const task of tasks) {
  if (kept.size >= slots) break;
  if (task.status === "completed") kept.add(task);
 }
 return { rows: tasks.filter((task) => kept.has(task)), completed: tasks.length - kept.size, pending: 0 };
}

function row(task: TodoTask, theme: Theme, ids: boolean): string {
 const glyph = task.status === "completed" ? theme.fg("success", "✓") :
  task.status === "in_progress" ? theme.fg("warning", "◐") : theme.fg("dim", "○");
 const color = task.status === "completed" ? "muted" : task.status === "in_progress" ? "accent" : "text";
 let subject = theme.fg(color, safe(task.subject));
 if (task.status === "completed") subject = theme.strikethrough(subject);
 const id = ids ? ` ${theme.fg("dim", `#${task.id}`)}` : "";
 const form = task.status === "in_progress" && task.activeForm ? ` ${theme.fg("muted", `(${safe(task.activeForm)})`)}` : "";
 const dependencies = task.blockedBy?.length ? ` ${theme.fg("muted", `⛓ ${task.blockedBy.map((id) => `#${id}`).join(",")}`)}` : "";
 return `${glyph}${id} ${subject}${form}${dependencies}`;
}

export function registerTodoWidget(pi: ExtensionAPI, store: Store, config: () => TodoConfig = loadTodoConfig, i18n: TodoI18n = todoI18n): void {
 const shortcut = resolveCollapseKey(config());
 let foreground: string | undefined;
 let ui: ExtensionUIContext | undefined;
 let mounted = false;
 let tui: TUI | undefined;
 let collapsed = false;
 const visible = () => store.get(foreground ?? "").tasks.filter((task) => task.status !== "deleted");
 const render = (theme: Theme, width: number): string[] => {
  const tasks = visible();
  if (!tasks.length) return [];
  const trunc = (line: string) => truncateToWidth(line, width, "…");
  const done = tasks.filter((task) => task.status === "completed").length;
  const active = tasks.length !== done;
  const heading = trunc(`${theme.fg(active ? "accent" : "dim", active ? "●" : "○")} ${theme.fg(active ? "accent" : "dim", `${i18n.t("overlay.heading", "Todos")} (${done}/${tasks.length})`)}`);
  if (collapsed) {
   const key = resolveCollapseKey(config());
   const hint = key === COLLAPSE_KEY_OFF ? i18n.t("overlay.collapsed", "collapsed") : i18n.t("overlay.expandHint", "{key} to expand").replace("{key}", key);
   return [heading, trunc(`${theme.fg("dim", "└─")} ${theme.fg("dim", hint)}`), ""];
  }
  const expanded = ui?.getToolsExpanded?.() === true;
  const { rows, completed, pending } = layout(tasks, expanded ? tasks.length + 1 : getMaxWidgetLines(config()) - 1);
  const ids = tasks.some((task) => (task.blockedBy?.length ?? 0) > 0);
  const lines = [heading];
  for (const task of rows) {
   lines.push(trunc(`${theme.fg("dim", "├─")} ${row(task, theme, ids)}`));
  }
  if (completed + pending > 0) {
   const parts = [completed ? `${completed} ${i18n.status("completed")}` : "", pending ? `${pending} ${i18n.status("pending")}` : ""].filter(Boolean);
   lines.push(trunc(`${theme.fg("dim", "└─")} ${theme.fg("dim", `+${completed + pending} ${i18n.t("overlay.more", "more")} (${parts.join(", ")})`)}`));
  } else {
   const last = lines.length - 1;
   lines[last] = lines[last]?.replace("├─", "└─") ?? "";
  }
  lines.push("");
  return lines;
 };
 const refresh = () => {
  if (!ui) return;
  if (!visible().length) {
   if (mounted) { ui.setWidget(KEY, undefined); mounted = false; tui = undefined; }
  } else if (!mounted) {
   ui.setWidget(KEY, (host, theme) => {
    tui = host;
    return { render: (width: number) => render(ui?.theme ?? theme, width), invalidate() {} };
   }, { placement: "aboveEditor" });
   mounted = true;
  } else tui?.requestRender();
 };
 const id = (ctx: ExtensionContext) => todoSessionId(ctx.sessionManager.getSessionId());
 const foregroundEvent = (ctx: ExtensionContext) => ctx.hasUI && id(ctx) === foreground && ctx.ui === ui;
 pi.on("session_start", (_event, ctx) => {
  if (!ctx.hasUI) return;
  const session = id(ctx);
  if (foreground !== undefined && foreground !== session) return;
  if (ui && ui !== ctx.ui && mounted) ui.setWidget(KEY, undefined);
  if (ui !== ctx.ui) { mounted = false; tui = undefined; }
  foreground = session; ui = ctx.ui; refresh();
 });
 pi.on("session_compact", (_event, ctx) => { if (foregroundEvent(ctx)) refresh(); });
 pi.on("session_tree", (_event, ctx) => { if (foregroundEvent(ctx)) refresh(); });
 pi.on("session_shutdown", (_event, ctx) => {
  if (!foregroundEvent(ctx)) return;
  if (mounted) ui?.setWidget(KEY, undefined);
  mounted = false; tui = undefined; ui = undefined; foreground = undefined; collapsed = false;
 });
 pi.on("tool_execution_end", (event, ctx) => {
  if (event.toolName === "todo" && event.isError !== true && foregroundEvent(ctx)) refresh();
 });
 if (shortcut !== COLLAPSE_KEY_OFF) pi.registerShortcut(shortcut as Parameters<ExtensionAPI["registerShortcut"]>[0], { description: "Collapse or expand the todo widget", handler: (ctx) => {
  if (!foregroundEvent(ctx) || !mounted) return;
  collapsed = !collapsed; tui?.requestRender(true);
 } });
}

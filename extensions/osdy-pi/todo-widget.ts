// Widget behavior adapted independently from @juicesharp/rpiv-todo@2.11.0 (MIT); see root LICENSE.
import type { ExtensionAPI, ExtensionContext, ExtensionUIContext, Theme } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, type TUI } from "@earendil-works/pi-tui";
import type { TodoTask } from "./todo-domain.js";
import { todoSessionId, type createTodoSessionStore } from "./todo-session.js";
import { safe } from "./todo-tool.js";

const KEY = "osdy-todos";
const SHORTCUT = "ctrl+shift+t";
type Store = ReturnType<typeof createTodoSessionStore>;

function layout(tasks: TodoTask[], budget: number) {
 if (tasks.length <= budget) return { rows: tasks, completed: 0, pending: 0 };
 const unfinished = tasks.filter((task) => task.status !== "completed");
 const slots = Math.max(0, budget - 1);
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

export function registerTodoWidget(pi: ExtensionAPI, store: Store): void {
 let foreground: string | undefined;
 let ui: ExtensionUIContext | undefined;
 let mounted = false;
 let tui: TUI | undefined;
 let collapsed = false;
 const pendingHide = new Set<number>();
 const hidden = new Set<number>();
 let lastNextId: number | undefined;
 const reset = () => { pendingHide.clear(); hidden.clear(); lastNextId = undefined; };
 const visible = () => {
  const state = store.get(foreground ?? "");
  if (lastNextId !== undefined && state.nextId < lastNextId) { pendingHide.clear(); hidden.clear(); }
  lastNextId = state.nextId;
  const completed = new Set(state.tasks.filter((task) => task.status === "completed").map((task) => task.id));
  for (const id of pendingHide) if (!completed.has(id)) pendingHide.delete(id);
  for (const id of hidden) if (!completed.has(id)) hidden.delete(id);
  return state.tasks.filter((task) => task.status !== "deleted" && !hidden.has(task.id));
 };
 const render = (theme: Theme, width: number): string[] => {
  const tasks = visible();
  if (!tasks.length) return [];
  const trunc = (line: string) => truncateToWidth(line, width, "…");
  const done = tasks.filter((task) => task.status === "completed").length;
  const active = tasks.length !== done;
  const heading = trunc(`${theme.fg(active ? "accent" : "dim", active ? "●" : "○")} ${theme.fg(active ? "accent" : "dim", `Todos (${done}/${tasks.length})`)}`);
  if (collapsed) return [heading, trunc(`${theme.fg("dim", "└─")} ${theme.fg("dim", `${SHORTCUT} to expand`)}`), ""];
  const expanded = ui?.getToolsExpanded?.() === true;
  const { rows, completed, pending } = layout(tasks, expanded ? tasks.length : 11);
  const ids = tasks.some((task) => (task.blockedBy?.length ?? 0) > 0);
  const lines = [heading];
  for (const task of rows) {
   lines.push(trunc(`${theme.fg("dim", "├─")} ${row(task, theme, ids)}`));
   if (task.status === "completed" && !hidden.has(task.id)) pendingHide.add(task.id);
  }
  if (completed + pending > 0) {
   const parts = [completed ? `${completed} completed` : "", pending ? `${pending} pending` : ""].filter(Boolean);
   lines.push(trunc(`${theme.fg("dim", "└─")} ${theme.fg("dim", `+${completed + pending} more (${parts.join(", ")})`)}`));
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
  foreground = session; ui = ctx.ui; reset(); refresh();
 });
 pi.on("session_compact", (_event, ctx) => { if (foregroundEvent(ctx)) { reset(); refresh(); } });
 pi.on("session_tree", (_event, ctx) => { if (foregroundEvent(ctx)) { reset(); refresh(); } });
 pi.on("session_shutdown", (_event, ctx) => {
  if (!foregroundEvent(ctx)) return;
  if (mounted) ui?.setWidget(KEY, undefined);
  mounted = false; tui = undefined; ui = undefined; foreground = undefined; collapsed = false; reset();
 });
 pi.on("tool_execution_end", (event, ctx) => {
  if (event.toolName === "todo" && event.isError !== true && foregroundEvent(ctx)) refresh();
 });
 pi.on("agent_start", (_event, ctx) => {
  if (!foregroundEvent(ctx)) return;
  visible(); // Reconcile snapshots before carrying completed rows into the next turn.
  if (pendingHide.size === 0) return;
  for (const task of pendingHide) hidden.add(task);
  pendingHide.clear(); refresh();
 });
 pi.registerShortcut(SHORTCUT, { description: "Collapse or expand the todo widget", handler: (ctx) => {
  if (!foregroundEvent(ctx) || !mounted) return;
  collapsed = !collapsed; tui?.requestRender(true);
 } });
}

// /todos display adapted from @juicesharp/rpiv-todo@2.11.0 (MIT); see root LICENSE.
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { listTasks, type TodoStatus, type TodoTask } from "./todo-domain.js";
import { todoSessionId, type createTodoSessionStore } from "./todo-session.js";
import { todoI18n, type TodoI18n } from "./todo-i18n.js";
import { safe } from "./todo-tool.js";
import { showTodoPanel, type TodoPanelRow } from "./todo-panel.js";

const sections: readonly { status: TodoStatus; heading: string; glyph: string }[] = [
 { status: "pending", heading: "── Pending ──", glyph: "○" },
 { status: "in_progress", heading: "── In Progress ──", glyph: "◐" },
 { status: "completed", heading: "── Completed ──", glyph: "✓" },
];

function line(task: TodoTask, glyph: string): string {
 const form = task.status === "in_progress" && task.activeForm ? ` (${safe(task.activeForm)})` : "";
 const block = task.blockedBy?.length ? `    ⛓ ${task.blockedBy.map((id) => `#${id}`).join(",")}` : "";
 return `  ${glyph} #${task.id} ${safe(task.subject)}${form}${block}`;
}

export function registerTodosCommand(pi: ExtensionAPI, store: ReturnType<typeof createTodoSessionStore>, i18n: TodoI18n = todoI18n): void {
 pi.registerCommand("todos", {
  description: "Show all todos on the current branch, grouped by status",
  handler: (_args, ctx) => {
   if (!ctx.hasUI) {
    ctx.ui.notify(i18n.t("command.requires_interactive", "/todos requires interactive mode"), "error");
    return Promise.resolve();
   }
   const tasks = listTasks(store.get(todoSessionId(ctx.sessionManager.getSessionId())));
   if (!tasks.length) {
    const empty = i18n.t("command.no_todos", "No todos yet. Ask the agent to add some!");
    if (ctx.mode === "tui") return showTodoPanel(ctx, () => [empty], i18n.t("overlay.heading", "Todos"));
    ctx.ui.notify(empty, "info");
    return Promise.resolve();
   }
   const pending = tasks.filter((task) => task.status === "pending").length;
   const inProgress = tasks.filter((task) => task.status === "in_progress").length;
   const completed = tasks.filter((task) => task.status === "completed").length;
   const counts = [
    completed ? `${completed}/${tasks.length} ${i18n.status("completed")}` : "",
    inProgress ? `${inProgress} ${i18n.status("in_progress")}` : "",
    pending ? `${pending} ${i18n.status("pending")}` : "",
   ].filter(Boolean);
   const summary = counts.join(" · ");
   const lines = [summary];
   const rows: TodoPanelRow[] = [{ text: summary, kind: "summary", done: completed, total: tasks.length }];
   for (const section of sections) {
    const group = tasks.filter((task) => task.status === section.status);
    if (!group.length) continue;
    const heading = i18n.t(`command.section.${section.status}`, section.heading);
    lines.push(heading, ...group.map((task) => line(task, section.glyph)));
    rows.push({ text: "", kind: "space" }, { text: heading, kind: "section", status: section.status },
     ...group.map((task): TodoPanelRow => ({ text: line(task, section.glyph), kind: "task", status: section.status })));
   }
   if (ctx.mode === "tui") return showTodoPanel(ctx, () => rows, i18n.t("overlay.heading", "Todos"));
   ctx.ui.notify(lines.join("\n"), "info");
   return Promise.resolve();
  },
 });
}

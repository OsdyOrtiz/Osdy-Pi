// /todos display adapted from @juicesharp/rpiv-todo@2.11.0 (MIT); see root LICENSE.
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { listTasks, type TodoStatus, type TodoTask } from "./todo-domain.js";
import { todoSessionId, type createTodoSessionStore } from "./todo-session.js";
import { todoI18n, type TodoI18n } from "./todo-i18n.js";
import { safe } from "./todo-tool.js";

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
    ctx.ui.notify(i18n.t("command.no_todos", "No todos yet. Ask the agent to add some!"), "info");
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
   const lines = [counts.join(" · ")];
   for (const section of sections) {
    const group = tasks.filter((task) => task.status === section.status);
    if (group.length) lines.push(i18n.t(`command.section.${section.status}`, section.heading), ...group.map((task) => line(task, section.glyph)));
   }
   ctx.ui.notify(lines.join("\n"), "info");
   return Promise.resolve();
  },
 });
}

// Tool presentation adapted from @juicesharp/rpiv-todo@2.11.0 (MIT); see root LICENSE.
import type { Theme } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import type { TodoAction, TodoParams, TodoState, TodoStatus } from "./todo-domain.js";
import { todoI18n, type TodoI18n } from "./todo-i18n.js";
import { safe } from "./todo-tool.js";

const actionGlyph: Record<TodoAction, string> = {
 create: "+", update: "→", delete: "×", get: "›", list: "☰", clear: "∅",
};
const statusStyle: Record<TodoStatus, { glyph: string; color: "dim" | "warning" | "success" | "muted" }> = {
 pending: { glyph: "○", color: "dim" },
 in_progress: { glyph: "◐", color: "warning" },
 completed: { glyph: "●", color: "success" },
 deleted: { glyph: "⊘", color: "muted" },
};
const isRecord = (value: unknown): value is Record<string, unknown> =>
 value !== null && typeof value === "object" && !Array.isArray(value);
const isStatus = (value: unknown): value is TodoStatus =>
 typeof value === "string" && Object.hasOwn(statusStyle, value);

/** A render hook has no caller session; never resolve an id against sibling slots. */
export function renderTodoCall(args: TodoParams & { action: TodoAction }, theme: Theme, foreground: TodoState, i18n: TodoI18n = todoI18n): Text {
 const glyph = actionGlyph[args.action] ?? args.action;
 let text = theme.fg("toolTitle", theme.bold("todo ")) + theme.fg("muted", glyph);
 if (args.action === "create" && args.subject) {
  text += ` ${theme.fg("dim", safe(args.subject))}`;
 } else if ((args.action === "update" || args.action === "get" || args.action === "delete") && args.id !== undefined) {
  const subject = foreground.tasks.find((task) => task.id === args.id)?.subject;
  text += ` ${theme.fg("accent", subject ? safe(subject) : `#${args.id}`)}`;
 } else if (args.action === "list" && args.status && isStatus(args.status)) {
  text += ` ${theme.fg("muted", safe(i18n.status(args.status)))}`;
 }
 return new Text(text, 0, 0);
}

/** Invalid or incomplete historic envelopes simply display the neutral success mark. */
export function renderTodoResult(result: { details?: unknown }, theme: Theme, i18n: TodoI18n = todoI18n): Text {
 const details = result.details;
 let status: unknown;
 if (isRecord(details) && Array.isArray(details.tasks) && isRecord(details.params)) {
  const tasks: unknown[] = details.tasks;
  const params = details.params;
  if (details.action === "create") {
   const last = tasks.at(-1);
   if (isRecord(last)) status = last.status;
  } else if (details.action === "update") {
   const task = tasks.find((candidate) => isRecord(candidate) && candidate.id === params.id);
   status = params.status ?? (isRecord(task) ? task.status : undefined);
  } else if (details.action === "delete") {
   const task = tasks.find((candidate) => isRecord(candidate) && candidate.id === params.id);
   if (isRecord(task)) status = task.status;
  }
 }
 if (isStatus(status)) {
  const { color, glyph } = statusStyle[status];
  return new Text(theme.fg(color, `${glyph} ${safe(i18n.status(status))}`), 0, 0);
 }
 return new Text(theme.fg("success", "✓"), 0, 0);
}

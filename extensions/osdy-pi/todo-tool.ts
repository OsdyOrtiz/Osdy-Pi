// TODO tool contract adapted from @juicesharp/rpiv-todo@2.11.0 (MIT); see root LICENSE.
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { loadTodoConfig, validateGuidance, type TodoConfig } from "./todo-config.js";
import { applyTodo, getTaskWithBlocks, listTasks, type TodoOp, type TodoState } from "./todo-domain.js";
import { todoSessionId, type createTodoSessionStore } from "./todo-session.js";
import { renderTodoCall, renderTodoResult } from "./todo-tool-render.js";

const parameters = Type.Object({
 action: Type.Union(["create", "update", "list", "get", "delete", "clear"].map((value) => Type.Literal(value))),
 subject: Type.Optional(Type.String({ description: "Task subject line (required for create)" })),
 description: Type.Optional(Type.String({ description: "Long-form task description" })),
 activeForm: Type.Optional(Type.String({ description: "Present-continuous spinner label shown while status is in_progress (e.g. 'writing tests')" })),
 status: Type.Optional(Type.Union([Type.Literal("pending"), Type.Literal("in_progress"), Type.Literal("completed"), Type.Literal("deleted")], { description: "Set this task's status (update): one of pending, in_progress, completed, deleted. When action is list, filters returned tasks by this status." })),
 blockedBy: Type.Optional(Type.Array(Type.Number(), { description: "Initial blockedBy ids (create only)" })),
 addBlockedBy: Type.Optional(Type.Array(Type.Number(), { description: "Task ids to add to blockedBy (update only, additive merge)" })),
 removeBlockedBy: Type.Optional(Type.Array(Type.Number(), { description: "Task ids to remove from blockedBy (update only, additive merge)" })),
 owner: Type.Optional(Type.String({ description: "Agent/owner assigned to this task" })),
 metadata: Type.Optional(Type.Record(Type.String(), Type.Unknown(), { description: "Arbitrary metadata; pass null value for a key to delete that key on update" })),
 id: Type.Optional(Type.Number({ description: "Task id (required for update, get, delete)" })),
 includeDeleted: Type.Optional(Type.Boolean({ description: "If true, list action returns deleted (tombstoned) tasks as well. Default: false." })),
}, { additionalProperties: false });

const promptGuidelines = [
 "Use `todo` for complex work with 3+ steps, when the user gives you a list of tasks, or immediately after receiving new instructions to capture requirements. Skip it for single trivial tasks and purely conversational requests.",
 "When starting a task from the todo list, mark it in_progress BEFORE beginning work. Mark it completed IMMEDIATELY when done — never batch completions. Exactly one task in_progress at a time.",
 "Never mark a task completed if tests are failing, the implementation is partial, or you hit unresolved errors — keep it in_progress and create a new task for the blocker instead.",
 "Task status is a 4-state machine: pending → in_progress → completed, plus deleted as a tombstone. Pass activeForm (present-continuous label, e.g. 'researching existing tool') when marking in_progress.",
 'To change a task\'s status, call update with the task id and the target status, e.g. {"action":"update","id":3,"status":"completed"} or {"action":"update","id":3,"status":"in_progress","activeForm":"writing tests"}. status is the field that changes the task; an update without a mutable field (status or another) is rejected.',
 "Use blockedBy to express dependencies (A is blocked by B). On create, pass blockedBy as the initial set. On update, use addBlockedBy / removeBlockedBy (additive merge — do not resend the full array). Cycles are rejected.",
 "list hides tombstoned (deleted) tasks by default; pass includeDeleted:true to see them. Pass status to filter by a single status.",
 "Subject must be short and imperative (e.g. 'Research existing tool'); description is for long-form detail. activeForm is a present-continuous label shown while in_progress.",
];

/* eslint-disable no-control-regex -- terminal escape sequences must be removed before rendering */
export function safe(value: string): string {
 return value.replace(/(?:\u001b\[|\u009b)[0-?]*[ -/]*[@-~]/g, "")
  .replace(/(?:\u001b\]|\u009d)[^\u0007\u009c\u001b]*(?:\u0007|\u009c|\u001b\\)?/g, "")
  .replace(/\u001b./g, "").replace(/[\u2028\u2029]/g, " ")
  .replace(/[\u0000-\u001f\u007f-\u009f]/g, (char) => "\n\r\t".includes(char) ? " " : "")
  .replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, "");
}
/* eslint-enable no-control-regex */

function content(op: TodoOp, state: TodoState): string {
 switch (op.kind) {
  case "error": return `Error: ${op.message}`;
  case "create": {
   const task = state.tasks.find((item) => item.id === op.taskId);
   return task ? `Created #${task.id}: ${safe(task.subject)} (pending)` : `Created #${op.taskId}`;
  }
  case "update": return !op.changed ? `No change: #${op.id} already matches the requested values (status: ${op.toStatus})` : `Updated #${op.id}${op.fromStatus === op.toStatus ? "" : ` (${op.fromStatus} → ${op.toStatus})`}`;
  case "delete": return `Deleted #${op.id}: ${safe(op.subject)}`;
  case "clear": return `Cleared ${op.count} tasks`;
  case "list": {
   const tasks = listTasks(state, { includeDeleted: op.includeDeleted, ...(op.statusFilter ? { status: op.statusFilter } : {}) });
   return tasks.length ? tasks.map((task) => `[${task.status}] #${task.id} ${safe(task.subject)}${task.status === "in_progress" && task.activeForm ? ` (${safe(task.activeForm)})` : ""}${task.blockedBy?.length ? ` ⛓ ${task.blockedBy.map((id) => `#${id}`).join(",")}` : ""}`).join("\n") : "No tasks";
  }
  case "get": {
   const task = op.task;
   const blocks = getTaskWithBlocks(state, task.id)?.blocks ?? [];
   const lines = [`#${task.id} [${task.status}] ${safe(task.subject)}`];
   if (task.description) lines.push(`  description: ${safe(task.description)}`);
   if (task.activeForm) lines.push(`  activeForm: ${safe(task.activeForm)}`);
   if (task.blockedBy?.length) lines.push(`  blockedBy: ${task.blockedBy.map((id) => `#${id}`).join(", ")}`);
   if (blocks.length) lines.push(`  blocks: ${blocks.map((id) => `#${id}`).join(", ")}`);
   if (task.owner) lines.push(`  owner: ${safe(task.owner)}`);
   return lines.join("\n");
  }
 }
}

export function registerTodoTool(pi: ExtensionAPI, store: ReturnType<typeof createTodoSessionStore>, config: () => TodoConfig = loadTodoConfig): void {
 const guidance = validateGuidance(config().guidance);
 let foreground: string | undefined;
 const id = (ctx: { sessionManager: { getSessionId(): string | undefined } }) => todoSessionId(ctx.sessionManager.getSessionId());
 const replay = (ctx: { sessionManager: { getSessionId(): string | undefined; getBranch(): ReturnType<Parameters<Parameters<ExtensionAPI["on"]>[1]>[1]["sessionManager"]["getBranch"]> } }) => {
  store.replaceFromBranch(id(ctx), ctx.sessionManager.getBranch());
 };
 pi.on("session_start", (_event, ctx) => { if (ctx.hasUI && foreground === undefined) foreground = id(ctx); replay(ctx); });
 pi.on("session_compact", (_event, ctx) => { replay(ctx); });
 pi.on("session_tree", (_event, ctx) => { replay(ctx); });
 pi.on("session_shutdown", (_event, ctx) => { store.evict(id(ctx)); if (foreground === id(ctx)) foreground = undefined; });
 pi.registerTool({
  name: "todo", label: "Todo",
  description: "Manage a task list for tracking multi-step progress. Actions: create (new task), update (change status/fields/dependencies), list (all tasks, optionally filtered by status), get (single task details), delete (tombstone), clear (reset all). Status: pending → in_progress → completed, plus deleted tombstone. Use this to plan and track multi-step work like research, design, and implementation.",
  promptSnippet: guidance.promptSnippet ?? "Manage a task list to track multi-step progress", promptGuidelines: guidance.promptGuidelines ?? promptGuidelines,
  parameters,
  execute(_toolCallId, params, _signal, _onUpdate, ctx) {
   const session = id(ctx);
   const result = applyTodo(store.get(session), params.action, params);
   store.set(session, result.state);
   return Promise.resolve({ content: [{ type: "text" as const, text: content(result.op, result.state) }],
    details: { action: params.action, params, tasks: result.state.tasks, nextId: result.state.nextId,
     ...(result.op.kind === "error" ? { error: result.op.message } : {}) } });
  },
  renderCall(args, theme) {
   return renderTodoCall(args, theme, store.get(foreground ?? ""));
  },
  renderResult(result, _opts, theme) {
   return renderTodoResult(result, theme);
  },
 });
}

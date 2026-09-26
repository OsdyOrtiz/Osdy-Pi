import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import test from "node:test";
import { fileURLToPath } from "node:url";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Compile } from "typebox/compile";
import type { TodoConfig } from "./todo-config.js";

registerHooks({
 resolve(specifier, context, next) {
  if (specifier.startsWith(".") && specifier.endsWith(".js") && context.parentURL?.endsWith(".ts")) {
   const url = new URL(`${specifier.slice(0, -3)}.ts`, context.parentURL);
   if (existsSync(fileURLToPath(url))) return { shortCircuit: true, url: url.href };
  }
  return next(specifier, context);
 },
});

const { registerTodoTool } = await import("./todo-tool.js");
const { createTodoSessionStore } = await import("./todo-session.js");

type Context = { sessionManager: { getSessionId: () => string; getBranch: () => unknown[] }; hasUI: boolean };
function context(id: string, branch: unknown[] = [], hasUI = true): Context {
 return { sessionManager: { getSessionId: () => id, getBranch: () => branch }, hasUI };
}
function harness(config: () => TodoConfig = () => ({})) {
 type Result = { content: [{ text: string }]; details: { tasks: unknown[]; error?: string } };
 type Tool = { name: string; label: string; parameters: { properties: Record<string, unknown> }; promptGuidelines: string[]; promptSnippet: string; execute: (...args: unknown[]) => Promise<Result> };
 const tools: Tool[] = [];
 const events = new Map<string, (event: unknown, ctx: Context) => Promise<void> | void>();
 const commands: string[] = [];
 registerTodoTool({ registerTool: (tool: Tool) => { tools.push(tool); }, on: (name: string, handler: (event: unknown, ctx: Context) => void) => { events.set(name, handler); }, registerCommand: (name: string) => { commands.push(name); } } as unknown as ExtensionAPI, createTodoSessionStore(), config);
 const run = (ctx: Context, params: Record<string, unknown>): Promise<Result> => { assert.ok(tools[0]); return tools[0].execute("call", params, undefined, undefined, ctx); };
 const emit = async (name: string, ctx: Context) => { const handler = events.get(name); assert.ok(handler); await handler({}, ctx); };
 return { tools, events, commands, run, emit };
}

void test("registers one rpiv-compatible tool without a command", () => {
 const { tools, commands } = harness();
 assert.equal(tools.length, 1);
 assert.ok(tools[0]);
 assert.equal(tools[0].name, "todo");
 assert.equal(tools[0].label, "Todo");
 assert.deepEqual(Object.keys(tools[0].parameters.properties), ["action", "subject", "description", "activeForm", "status", "blockedBy", "addBlockedBy", "removeBlockedBy", "owner", "metadata", "id", "includeDeleted"]);
 assert.equal(tools[0].promptGuidelines.length, 8);
 assert.deepEqual(commands, []);
});

void test("valid guidance is captured at registration, invalid fields retain defaults", () => {
 let config: TodoConfig = { guidance: { promptSnippet: "Custom", promptGuidelines: ["first"] } };
 const h = harness(() => config);
 assert.equal(h.tools[0]?.promptSnippet, "Custom");
 assert.deepEqual(h.tools[0]?.promptGuidelines, ["first"]);
 config = { guidance: { promptSnippet: "Later", promptGuidelines: ["later"] } };
 assert.equal(h.tools[0]?.promptSnippet, "Custom");
 const fallback = harness(() => ({ guidance: { promptSnippet: "", promptGuidelines: ["valid", ""] } }));
 assert.equal(fallback.tools[0]?.promptSnippet, "Manage a task list to track multi-step progress");
 assert.equal(fallback.tools[0]?.promptGuidelines.length, 8);
});

void test("registered tool parameters compile and validate actions and fields", () => {
 const { tools } = harness();
 const validator = Compile(tools[0]!.parameters);
 assert.equal(validator.Check({ action: "create", subject: "Write tests", blockedBy: [1] }), true);
 assert.equal(validator.Check({ action: "list", includeDeleted: true, status: "completed" }), true);
 assert.equal(validator.Check({ action: "update", id: 1, status: "in_progress", activeForm: "writing tests" }), true);
 assert.equal(validator.Check({ action: "unknown" }), false);
 assert.equal(validator.Check({ action: "list", extra: true }), false);
});

void test("tool returns full snapshots, sanitized content, and rejection envelopes", async () => {
 const h = harness();
 const ctx = context("a");
 const created = await h.run(ctx, { action: "create", subject: "Write\u001b[31m tests", metadata: { label: "a" } });
 assert.deepEqual(created.details, { action: "create", params: { action: "create", subject: "Write\u001b[31m tests", metadata: { label: "a" } }, tasks: [{ id: 1, subject: "Write\u001b[31m tests", status: "pending", metadata: { label: "a" } }], nextId: 2 });
 assert.ok(!created.content[0].text.includes("\u001b"));
 const rejected = await h.run(ctx, { action: "get", id: 99 });
 assert.equal(rejected.content[0].text, "Error: #99 not found");
 assert.equal(rejected.details.error, "#99 not found");
 assert.deepEqual(rejected.details.tasks, created.details.tasks);
 const updated = await h.run(ctx, { action: "update", id: 1, status: "in_progress", activeForm: "writing" });
 assert.equal(updated.content[0].text, "Updated #1 (pending → in_progress)");
 assert.equal((await h.run(ctx, { action: "list" })).content[0].text, "[in_progress] #1 Write tests (writing)");
 assert.equal((await h.run(ctx, { action: "update", id: 1, status: "in_progress" })).content[0].text, "No change: #1 already matches the requested values (status: in_progress)");
 const second = await h.run(ctx, { action: "create", subject: "Ship", blockedBy: [1] });
 assert.equal(second.content[0].text, "Created #2: Ship (pending)");
 assert.equal((await h.run(ctx, { action: "get", id: 1 })).content[0].text, "#1 [in_progress] Write tests\n  activeForm: writing\n  blocks: #2");
 assert.equal((await h.run(ctx, { action: "delete", id: 1 })).content[0].text, "Deleted #1: Write tests");
 assert.equal((await h.run(ctx, { action: "list" })).content[0].text, "[pending] #2 Ship ⛓ #1");
 assert.equal((await h.run(ctx, { action: "list", includeDeleted: true, status: "deleted" })).content[0].text, "[deleted] #1 Write tests");
 assert.equal((await h.run(ctx, { action: "clear" })).content[0].text, "Cleared 2 tasks");
});

void test("session lifecycle replays same-session branch replacements and isolates child", async () => {
 const h = harness();
 const parent = context("parent");
 const child = context("child", [], false);
 await h.emit("session_start", parent);
 await h.run(parent, { action: "create", subject: "live" });
 await h.emit("session_start", child);
 assert.equal((await h.run(child, { action: "list" })).content[0].text, "No tasks");
 const branch = [{ type: "message", message: { role: "toolResult", toolName: "todo", details: { tasks: [{ id: 1, subject: "replayed", status: "pending" }], nextId: 2 } } }];
 await h.emit("session_tree", context("parent", branch));
 assert.equal((await h.run(parent, { action: "list" })).content[0].text, "[pending] #1 replayed");
 await h.emit("session_compact", context("parent", []));
 assert.equal((await h.run(parent, { action: "list" })).content[0].text, "No tasks");
 await h.run(child, { action: "create", subject: "child task" });
 await h.emit("session_shutdown", parent);
 assert.equal((await h.run(child, { action: "list" })).content[0].text, "[pending] #1 child task");
 assert.equal((await h.run(parent, { action: "list" })).content[0].text, "No tasks");
});

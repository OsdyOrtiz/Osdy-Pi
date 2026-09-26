import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import test from "node:test";
import { fileURLToPath } from "node:url";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

registerHooks({ resolve(specifier, context, next) {
 if (specifier.startsWith(".") && specifier.endsWith(".js") && context.parentURL?.endsWith(".ts")) {
  const url = new URL(`${specifier.slice(0, -3)}.ts`, context.parentURL);
  if (existsSync(fileURLToPath(url))) return { shortCircuit: true, url: url.href };
 }
 return next(specifier, context);
} });

const { registerTodoTool } = await import("./todo-tool.js");
const { registerTodosCommand } = await import("./todo-command.js");
const { createTodoSessionStore } = await import("./todo-session.js");

type Context = { sessionManager: { getSessionId: () => string; getBranch: () => unknown[] }; hasUI: boolean; ui: { notify: (text: string, level: string) => void } };
function harness() {
 const notices: Array<[string, string]> = [];
 const commands = new Map<string, { handler: (args: string, ctx: Context) => Promise<void> }>();
 let execute: ((...args: unknown[]) => Promise<unknown>) | undefined;
 const events = new Map<string, (event: unknown, ctx: Context) => void>();
 const pi = {
  registerTool: (tool: { execute: (...args: unknown[]) => Promise<unknown> }) => { execute = tool.execute; },
  registerCommand: (name: string, command: { handler: (args: string, ctx: Context) => Promise<void> }) => { commands.set(name, command); },
  on: (name: string, handler: (event: unknown, ctx: Context) => void) => { events.set(name, handler); },
 } as unknown as ExtensionAPI;
 const store = createTodoSessionStore();
 registerTodoTool(pi, store);
 registerTodosCommand(pi, store);
 const context = (id: string, hasUI = true): Context => ({ sessionManager: { getSessionId: () => id, getBranch: () => [] }, hasUI, ui: { notify: (text, level) => { notices.push([text, level]); } } });
 const run = async (ctx: Context, params: Record<string, unknown>) => { assert.ok(execute); await execute("call", params, undefined, undefined, ctx); };
 const show = async (ctx: Context, args = "") => { const command = commands.get("todos"); assert.ok(command); await command.handler(args, ctx); return notices.at(-1); };
 return { commands, notices, context, run, show, events };
}

void test("/todos reads the same store after tool create, without interpreting arguments", async () => {
 const h = harness();
 assert.deepEqual([...h.commands.keys()], ["todos"]);
 const parent = h.context("parent");
 await h.run(parent, { action: "create", subject: "Write tests" });
 assert.deepEqual(await h.show(parent, "clear all"), ["1 pending\n── Pending ──\n  ○ #1 Write tests", "info"]);
 assert.deepEqual(await h.show(parent), ["1 pending\n── Pending ──\n  ○ #1 Write tests", "info"]);
 const child = h.context("child");
 assert.deepEqual(await h.show(child), ["No todos yet. Ask the agent to add some!", "info"]);
 await h.run(child, { action: "create", subject: "Child only" });
 assert.deepEqual(await h.show(child), ["1 pending\n── Pending ──\n  ○ #1 Child only", "info"]);
 assert.deepEqual(await h.show(parent), ["1 pending\n── Pending ──\n  ○ #1 Write tests", "info"]);
 assert.deepEqual(await h.show(h.context("parent", false)), ["/todos requires interactive mode", "error"]);
});

void test("/todos groups visible statuses and treats deleted-only as empty", async () => {
 const h = harness();
 const ctx = h.context("parent");
 await h.run(ctx, { action: "create", subject: "First" });
 await h.run(ctx, { action: "create", subject: "Build", blockedBy: [1] });
 await h.run(ctx, { action: "update", id: 2, status: "in_progress", activeForm: "building" });
 await h.run(ctx, { action: "update", id: 1, status: "completed" });
 await h.run(ctx, { action: "create", subject: "Next", blockedBy: [2] });
 assert.deepEqual(await h.show(ctx), ["1/3 completed · 1 in progress · 1 pending\n── Pending ──\n  ○ #3 Next    ⛓ #2\n── In Progress ──\n  ◐ #2 Build (building)    ⛓ #1\n── Completed ──\n  ✓ #1 First", "info"]);
 await h.run(ctx, { action: "delete", id: 1 });
 await h.run(ctx, { action: "delete", id: 2 });
 await h.run(ctx, { action: "delete", id: 3 });
 assert.deepEqual(await h.show(ctx), ["No todos yet. Ask the agent to add some!", "info"]);
});

void test("command reflects lifecycle replay and shutdown eviction via shared tool store", async () => {
 const h = harness();
 const parent = h.context("parent");
 await h.run(parent, { action: "create", subject: "Live" });
 h.events.get("session_tree")?.({}, parent);
 assert.deepEqual(await h.show(parent), ["No todos yet. Ask the agent to add some!", "info"]);
 await h.run(parent, { action: "create", subject: "New" });
 h.events.get("session_shutdown")?.({}, parent);
 assert.deepEqual(await h.show(parent), ["No todos yet. Ask the agent to add some!", "info"]);
});

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import test from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { Type } from "typebox";
import { Compile } from "typebox/compile";
import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { visibleWidth } from "@earendil-works/pi-tui";

registerHooks({
 resolve(specifier, context, next) {
  if (specifier.startsWith(".") && specifier.endsWith(".js") && context.parentURL?.endsWith(".ts")) {
   const url = new URL(`${specifier.slice(0, -3)}.ts`, context.parentURL);
   if (existsSync(fileURLToPath(url))) return { shortCircuit: true, url: url.href };
  }
  return next(specifier, context);
 },
 load(url, context, next) {
  if (url.endsWith(".ts")) return { format: "module", shortCircuit: true, source: ts.transpileModule(readFileSync(fileURLToPath(url), "utf8"), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText };
  return next(url, context);
 },
});

const { registerOddTodo, createTodoPanel } = await import("./odd-todo-ui.js");
const revision = "a".repeat(64);
const id = "b".repeat(64);
const document = (name: string, checked = false) => ({ name, revision, items: [{ id, text: "Do something", checked }] });

function harness(names = ["one.md", "two.md"]) {
 const calls: string[] = [];
 const tools: Record<string, unknown>[] = [];
 const commands: Record<string, unknown>[] = [];
 let current = document("one.md");
 const store = {
  listDocuments: () => Promise.resolve(names),
  readDocument: (_root: string, name: string) => { calls.push(`read:${name}`); return Promise.resolve({ ...current, name }); },
  appendItem: (_root: string, name: string, expected: string, text: string) => {
   calls.push(`add:${name}:${expected}:${text}`); current = { ...current, items: [...current.items, { id: "c".repeat(64), text, checked: false }] }; return Promise.resolve(current);
  },
  setItemChecked: (_root: string, name: string, expected: string, reference: string, checked: boolean) => {
   calls.push(`set:${name}:${expected}:${reference}:${checked}`); current = document(name, checked); return Promise.resolve(current);
  },
 };
 registerOddTodo({ registerTool: (tool: unknown) => tools.push(tool as Record<string, unknown>), registerCommand: (_name: string, command: unknown) => commands.push(command as Record<string, unknown>) } as unknown as ExtensionAPI, store);
 const tool = tools[0] as { execute: (id: string, params: object, signal: undefined, update: undefined, ctx: { cwd: string }) => Promise<{ content: { text: string }[] }> };
 const command = commands[0] as { handler: (args: string, ctx: ExtensionCommandContext) => Promise<void> };
 const execute = (params: object) => tool.execute("call", params, undefined, undefined, { cwd: "/project" });
 return { calls, tools, commands, execute, command, store };
}

void test("tool exposes a TypeBox object schema with optional action parameters", async () => {
 const h = harness(["one.md"]);
 const expected = Type.Object({
  action: Type.Union([Type.Literal("list"), Type.Literal("read"), Type.Literal("add"), Type.Literal("set")]),
  document: Type.Optional(Type.String({ description: "Task document filename from list" })),
  revision: Type.Optional(Type.String({ description: "Revision from read; required for add/set" })),
  text: Type.Optional(Type.String({ description: "Checklist text for add" })),
  id: Type.Optional(Type.String({ description: "Stable item id from read for set" })),
  checked: Type.Optional(Type.Boolean({ description: "Desired checkbox state for set" })),
 }, { additionalProperties: false });
 assert.deepEqual(h.tools[0]?.parameters, expected);
 // Pi compiles tool schemas with typebox/compile during argument validation.
 const validator = Compile(h.tools[0]?.parameters);
 assert.equal(validator.Check({ action: "list" }), true);
 assert.equal(validator.Check({ action: "set", document: "one.md", revision, id, checked: true }), true);
 assert.equal(validator.Check({ action: "unknown" }), false);
 assert.equal(validator.Check({ action: "set", checked: "true" }), false);
 assert.equal(validator.Check({ action: "list", extra: true }), false);
 assert.deepEqual(JSON.parse((await h.execute({ action: "list" })).content[0]!.text), ["one.md"]);
 const read = JSON.parse((await h.execute({ action: "read" })).content[0]!.text) as { name: string };
 assert.equal(read.name, "one.md");
});

void test("tool lists documents but requires explicit selection when ambiguous; rejects unknown and stale writes", async () => {
 const h = harness();
 assert.deepEqual(JSON.parse((await h.execute({ action: "list" })).content[0]!.text), ["one.md", "two.md"]);
 await assert.rejects(h.execute({ action: "read" }), /Select a task document/);
 await assert.rejects(h.execute({ action: "read", document: "../escape.md" }), /not found/);
 assert.equal(h.calls.length, 0);
 const shown = JSON.parse((await h.execute({ action: "read", document: "one.md" })).content[0]!.text) as { revision: string; items: { id: string }[] };
 assert.equal(shown.revision, revision);
 assert.equal(shown.items[0]?.id, id);
 await assert.rejects(h.execute({ action: "add", document: "one.md", revision: "stale", text: "New" }), /Invalid revision/);
 await h.execute({ action: "set", document: "one.md", revision, id, checked: true });
 assert.ok(h.calls.includes(`set:one.md:${revision}:${id}:true`));
});

void test("panel selects documents explicitly, toggles from snapshot and surfaces conflicts without retry", async () => {
 const h = harness();
 const renders: string[][] = [];
 let close = 0;
 const theme = { fg: (_color: string, text: string) => text };
 const panel = createTodoPanel("/project", h.store, theme, () => renders.push(panel.render(80)), () => { close++; }, () => Promise.resolve("New item"));
 await panel.refresh();
 assert.equal(h.calls.length, 0);
 panel.handleInput("\x1b[B");
 panel.handleInput("\r");
 await panel.pending();
 assert.ok(h.calls.includes("read:two.md"));
 assert.match(panel.render(80).join(" "), /Revision: a+/);
 panel.handleInput(" ");
 await panel.pending();
 assert.ok(h.calls.includes(`set:two.md:${revision}:${id}:true`));
 h.store.setItemChecked = () => Promise.reject(new Error("Task document changed: conflict"));
 panel.handleInput(" ");
 await panel.pending();
 assert.match(panel.render(80).join(" "), /conflict/);
 assert.equal(h.calls.filter((call) => call.startsWith("read:two.md")).length, 1);
 panel.handleInput("\x1b");
 assert.equal(close, 1);
 assert.ok(renders.length > 0);
});

void test("single-document panel adds through the store and refreshes from the ledger", async () => {
 const h = harness(["one.md"]);
 const theme = { fg: (_color: string, text: string) => text };
 const panel = createTodoPanel("/project", h.store, theme, () => {}, () => {}, () => Promise.resolve("Another item"));
 await panel.refresh();
 assert.match(panel.render(70).join(" "), /Document: one.md/);
 panel.handleInput("a");
 await panel.pending();
 assert.ok(h.calls.includes(`add:one.md:${revision}:Another item`));
 assert.match(panel.render(70).join(" "), /Another item/);
 panel.handleInput("r");
 await panel.pending();
 assert.equal(h.calls.filter((call) => call === "read:one.md").length, 2);
 assert.ok(panel.render(12).every((line) => visibleWidth(line) <= 12));
});

void test("command guards noninteractive mode and rejects arguments", async () => {
 const h = harness();
 const notices: string[] = [];
 const ctx = { mode: "print", hasUI: false, cwd: "/project", ui: { notify: (text: string) => notices.push(text) } } as unknown as ExtensionCommandContext;
 await h.command.handler("extra", ctx);
 await h.command.handler("", ctx);
 assert.equal(h.calls.length, 0);
 assert.ok(notices.some((text) => text.includes("Usage:")));
 assert.ok(notices.some((text) => text.includes("interactive")));
});

import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import test from "node:test";
import { fileURLToPath } from "node:url";
import type { Theme } from "@earendil-works/pi-coding-agent";

registerHooks({ resolve(specifier, context, next) {
 if (specifier.startsWith(".") && specifier.endsWith(".js") && context.parentURL?.endsWith(".ts")) {
  const url = new URL(`${specifier.slice(0, -3)}.ts`, context.parentURL);
  if (existsSync(fileURLToPath(url))) return { shortCircuit: true, url: url.href };
 }
 return next(specifier, context);
} });

const { renderTodoCall, renderTodoResult } = await import("./todo-tool-render.js");
const { createTodoI18n } = await import("./todo-i18n.js");
const theme = { fg: (color: string, text: string) => `<${color}>${text}</${color}>`, bold: (text: string) => `<b>${text}</b>` } as Theme;
const text = (value: { render(width: number): string[] }) => value.render(200).join("\n").trimEnd();
const state = { tasks: [{ id: 1, subject: "Foreground\u001b[31m only", status: "pending" as const }], nextId: 2 };

void test("call glyphs, colors and subjects use only foreground state", () => {
 assert.equal(text(renderTodoCall({ action: "create", subject: "New\u001b[31m task" }, theme, state)), "<toolTitle><b>todo </b></toolTitle><muted>+</muted> <dim>New task</dim>");
 for (const [action, glyph] of [["update", "→"], ["get", "›"], ["delete", "×"]] as const) {
  assert.equal(text(renderTodoCall({ action, id: 1 }, theme, state)), `<toolTitle><b>todo </b></toolTitle><muted>${glyph}</muted> <accent>Foreground only</accent>`);
  assert.equal(text(renderTodoCall({ action, id: 2 }, theme, state)), `<toolTitle><b>todo </b></toolTitle><muted>${glyph}</muted> <accent>#2</accent>`);
 }
 assert.equal(text(renderTodoCall({ action: "clear" }, theme, state)), "<toolTitle><b>todo </b></toolTitle><muted>∅</muted>");
 assert.equal(text(renderTodoCall({ action: "list" }, theme, state)), "<toolTitle><b>todo </b></toolTitle><muted>☰</muted>");
});

void test("result echoes status for mutations, check for reads and malformed details", () => {
 const tasks = [{ id: 1, subject: "Task", status: "pending" }];
 assert.equal(text(renderTodoResult({ details: { action: "create", params: { action: "create" }, tasks } }, theme)), "<dim>○ pending</dim>");
 assert.equal(text(renderTodoResult({ details: { action: "update", params: { id: 1, status: "in_progress" }, tasks } }, theme)), "<warning>◐ in progress</warning>");
 assert.equal(text(renderTodoResult({ details: { action: "update", params: { id: 1 }, tasks: [{ ...tasks[0], status: "completed" }] } }, theme)), "<success>● completed</success>");
 assert.equal(text(renderTodoResult({ details: { action: "delete", params: { id: 1 }, tasks: [{ ...tasks[0], status: "deleted" }] } }, theme)), "<muted>⊘ deleted</muted>");
 for (const details of [undefined, null, {}, { action: "update", params: null, tasks: {} }, { action: "create", tasks: [] }, { action: "delete", params: { id: 1 }, tasks: [null] }, { action: "update", params: { status: "bogus" }, tasks: [] }, { action: "list", params: {}, tasks }]) {
  assert.equal(text(renderTodoResult({ details }, theme)), "<success>✓</success>");
 }
});

void test("upstream compatibility: rejected update echoes requested status while retaining envelope error", () => {
 const details = {
  action: "update", params: { id: 1, status: "completed" },
  tasks: [{ id: 1, subject: "Task", status: "pending" }], nextId: 2,
  error: "Cannot complete blocked task",
 };
 const original = structuredClone(details);
 // Upstream renderResult echoes params.status even for an error op; this is not a success verdict.
 assert.equal(text(renderTodoResult({ details }, theme)), "<success>● completed</success>");
 assert.deepEqual(details, original);
 assert.equal(details.error, "Cannot complete blocked task");
});

void test("list filter and result status labels use live localized scope with English fallback", () => {
 let translated = "en attente\u001b[31m";
 const i18n = createTodoI18n((key, fallback) => key === "status.pending" ? translated : fallback);
 assert.equal(text(renderTodoCall({ action: "list", status: "pending" }, theme, state, i18n)), "<toolTitle><b>todo </b></toolTitle><muted>☰</muted> <muted>en attente</muted>");
 translated = "nouveau";
 assert.equal(text(renderTodoResult({ details: { action: "create", params: {}, tasks: state.tasks } }, theme, i18n)), "<dim>○ nouveau</dim>");
 assert.equal(text(renderTodoCall({ action: "list", status: "completed" }, theme, state, i18n)), "<toolTitle><b>todo </b></toolTitle><muted>☰</muted> <muted>completed</muted>");
});

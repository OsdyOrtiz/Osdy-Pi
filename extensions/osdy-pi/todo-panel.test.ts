import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import test from "node:test";
import { fileURLToPath } from "node:url";

registerHooks({ resolve(specifier, context, next) {
 if (specifier.startsWith(".") && specifier.endsWith(".js") && context.parentURL?.endsWith(".ts")) {
  const url = new URL(`${specifier.slice(0, -3)}.ts`, context.parentURL);
  if (existsSync(fileURLToPath(url))) return { shortCircuit: true, url: url.href };
 }
 return next(specifier, context);
} });

const { showTodoPanel } = await import("./todo-panel.js");
const theme = { fg: (_color: string, text: string) => text };

async function openPanel(rows: number, lines: () => string[]) {
 let panel: { render(width: number): string[]; handleInput(data: string): void } | undefined;
 let done = 0; let renders = 0;
 const terminal = { rows };
 const ctx = { ui: { custom: (factory: (...args: unknown[]) => unknown, options: unknown) => {
  assert.deepEqual(options, { overlay: true, overlayOptions: { anchor: "center", width: 96, minWidth: 48, maxHeight: "92%", margin: 1 } });
  panel = factory({ terminal, requestRender: () => { renders++; } }, theme, null, () => { done++; }) as typeof panel;
  return Promise.resolve();
 } } };
 await showTodoPanel(ctx as unknown as Parameters<typeof showTodoPanel>[0], lines, "Todos");
 assert.ok(panel);
 return { panel, terminal, get done() { return done; }, get renders() { return renders; } };
}

function assertFullFrame(panel: { render(width: number): string[] }, rows: number, width = 48): string[] {
 const frame = panel.render(width);
 const cap = Math.min(Math.max(1, Math.floor(rows * 0.92)), Math.max(1, rows - 2));
 assert.ok(frame.length <= cap, `frame of ${frame.length} rows exceeds overlay cap ${cap}`);
 assert.match(frame[0] ?? "", /^╔.*╗$/);
 assert.match(frame.at(-1) ?? "", /^╚.*╝$/, "lower border must survive Pi overlay clipping");
 assert.ok(frame.every((line) => line.length === width));
 assert.match(frame.at(-2) ?? "", /esc\/q close/, "controls remain inside the lower border");
 return frame;
}

void test("todo panel fits margin and percentage height caps with a visible footer", async () => {
 for (const rows of [12, 20, 30]) {
  const { panel } = await openPanel(rows, () => Array.from({ length: 60 }, (_, i) => `row ${i}`));
  const frame = assertFullFrame(panel, rows);
  assert.equal(frame.length, Math.min(Math.floor(rows * 0.92), rows - 2));
  assert.match(frame.join("\n"), /row 0/);
  assert.doesNotMatch(frame.join("\n"), /row 59/);
 }
});

void test("todo panel keeps every task reachable in both directions, even across resize", async () => {
 const state = await openPanel(12, () => Array.from({ length: 30 }, (_, i) => `row ${i}`));
 const { panel, terminal } = state;
 const view = () => assertFullFrame(panel, terminal.rows).join("\n");
 assert.match(view(), /row 0/);
 panel.handleInput("\x1b[B");
 assert.match(view(), /row 1/);
 panel.handleInput("\x1b[6~");
 assert.doesNotMatch(view(), /row 1\s+║/);
 for (let i = 0; i < 30; i++) panel.handleInput("\x1b[6~");
 assert.match(view(), /row 29/);
 panel.handleInput("\x1b[B");
 assert.match(view(), /row 29/);
 terminal.rows = 30;
 assert.match(view(), /row 29/);
 terminal.rows = 12;
 assertFullFrame(panel, terminal.rows);
 for (let i = 0; i < 30; i++) panel.handleInput("\x1b[6~");
 assert.match(view(), /row 29/);
 panel.handleInput("\x1b[5~");
 assert.doesNotMatch(view(), /row 29/);
 for (let i = 0; i < 30; i++) panel.handleInput("\x1b[5~");
 assert.match(view(), /row 0/);
 panel.handleInput("\x1b[A");
 assert.match(view(), /row 0/);
 for (let i = 0; i < 30; i++) {
  assert.match(view(), new RegExp(`row ${i}(?:\\s|$)`));
  panel.handleInput("\x1b[B");
 }
 for (let i = 29; i >= 0; i--) {
  assert.match(view(), new RegExp(`row ${i}(?:\\s|$)`));
  panel.handleInput("\x1b[A");
 }
 assert.ok(state.renders > 0);
 panel.handleInput("q");
 assert.equal(state.done, 1);
});

void test("todo panel truncates colored controls inside a narrow frame", async () => {
 let panel: { render(width: number): string[] } | undefined;
 const ctx = { ui: { custom: (factory: (...args: unknown[]) => unknown) => {
  panel = factory({ terminal: { rows: 12 }, requestRender: () => {} },
   { fg: (_color: string, text: string) => `\x1b[35m${text}\x1b[0m` }, null, () => {}) as typeof panel;
  return Promise.resolve();
 } } };
 await showTodoPanel(ctx as unknown as Parameters<typeof showTodoPanel>[0], () => ["a task"], "Todos");
 assert.ok(panel);
 const ansi = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, "g");
 const frame = panel.render(24).map((line) => line.replace(ansi, ""));
 assert.ok(frame.every((line) => line.length === 24));
 assert.match(frame.at(-2) ?? "", /↑\/↓ scroll/);
 assert.match(frame.at(-1) ?? "", /^╚.*╝$/);
});

void test("todo panel shows a complete frame for short and empty lists and closes with Esc", async () => {
 for (const items of [[], ["only task"]]) {
  const state = await openPanel(12, () => items);
  assertFullFrame(state.panel, 12);
  if (items.length) assert.match(state.panel.render(48).join("\n"), /only task/);
  state.panel.handleInput("\x1b");
  assert.equal(state.done, 1);
 }
});

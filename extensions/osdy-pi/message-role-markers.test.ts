import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import test from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

registerHooks({
 resolve(specifier, context, nextResolve) {
  if (specifier.startsWith(".") && specifier.endsWith(".js") && context.parentURL?.endsWith(".ts")) {
   const url = new URL(`${specifier.slice(0, -3)}.ts`, context.parentURL);
   if (existsSync(fileURLToPath(url))) return { shortCircuit: true, url: url.href };
  }
  return nextResolve(specifier, context);
 },
 load(url, context, nextLoad) {
  if (url.endsWith(".ts")) return { format: "module", shortCircuit: true, source: ts.transpileModule(readFileSync(fileURLToPath(url), "utf8"), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText };
  return nextLoad(url, context);
 },
});
const { registerMessageRoleMarkers } = await import("./message-role-markers.js");

type Handler = (event: { message?: { role: string } }, ctx: ExtensionContext) => void;
type TestRenderer = (entry: { data?: { role?: unknown } }, options: { expanded: boolean }, theme: { fg: (color: string, text: string) => string }) => { render(width: number): string[] } | undefined;
function harness(mode = "tui", enabled = true) {
 const handlers = new Map<string, Handler>();
 const entries: Array<{ type: "custom"; customType: string; data: { role: string } }> = [];
 const timeline: string[] = [];
 let renderer: TestRenderer | undefined;
 let customType = "";
 const ctx = { mode, hasUI: true, sessionManager: { getBranch: () => entries } } as unknown as ExtensionContext;
 const pi = {
  on: (name: string, handler: Handler) => { handlers.set(name, handler); },
  appendEntry: (type: string, data: { role: string }) => { entries.push({ type: "custom", customType: type, data }); timeline.push(`marker:${data.role}`); },
  registerEntryRenderer: (type: string, render: unknown) => { customType = type; renderer = render as TestRenderer; },
 } as unknown as ExtensionAPI;
 registerMessageRoleMarkers(pi, () => enabled);
 const emit = (name: string, message?: { role: string }) => { handlers.get(name)?.(message ? { message } : {}, ctx); if (name === "message_start" && message) timeline.push(`native:${message.role}`); };
 return { emit, entries, timeline, ctx, get renderer() { return renderer; }, get customType() { return customType; }, setEnabled: (value: boolean) => { enabled = value; } };
}
const message = (role: string, timestamp: number, content: unknown[] = []) => ({ role, timestamp, content });

void test("user marker precedes native card and does not modify its message", () => {
 const h = harness();
 const user = message("user", 1, [{ type: "text", text: "original" }]);
 const original = structuredClone(user);
 h.emit("message_start", user);
 h.emit("message_end", user);
 assert.deepEqual(h.timeline, ["marker:user", "native:user"]);
 assert.deepEqual(user, original);
 assert.equal(h.entries.length, 1);
});

void test("assistant waits for visible text, then marks once across updates and end", () => {
 const h = harness();
 const assistant = message("assistant", 2);
 h.emit("message_start", assistant);
 h.emit("message_update", message("assistant", 2, [{ type: "thinking", thinking: "secret" }, { type: "toolCall", id: "t" }]));
 assert.equal(h.entries.length, 0);
 const text = message("assistant", 2, [{ type: "text", text: "answer" }]);
 const original = structuredClone(text);
 h.emit("message_update", text);
 h.emit("message_update", text);
 h.emit("message_end", text);
 assert.deepEqual(h.timeline, ["native:assistant", "marker:assistant"]);
 assert.equal(h.entries.length, 1);
 assert.deepEqual(text, original);
 h.emit("message_start", message("assistant", 3));
 h.emit("message_end", message("assistant", 3, [{ type: "text", text: "final" }]));
 assert.equal(h.entries.length, 2);
});

void test("empty, thinking-only, tool-only and tool results have no assistant marker", () => {
 const h = harness();
 for (const [index, content] of [[], [{ type: "thinking", thinking: "x" }], [{ type: "toolCall", id: "t" }], [{ type: "text", text: "   " }]].entries()) {
  h.emit("message_start", message("assistant", index));
  h.emit("message_end", message("assistant", index, content));
 }
 h.emit("message_start", message("toolResult", 5, [{ type: "text", text: "output" }]));
 assert.deepEqual(h.entries, []);
});

void test("disabled and noninteractive modes do not persist markers", () => {
 const disabled = harness("tui", false);
 disabled.emit("message_start", message("user", 1));
 disabled.emit("message_end", message("assistant", 2, [{ type: "text", text: "a" }]));
 assert.equal(disabled.entries.length, 0);
 const json = harness("json");
 json.emit("message_start", message("user", 1));
 json.emit("message_end", message("assistant", 2, [{ type: "text", text: "a" }]));
 assert.equal(json.entries.length, 0);
});

void test("same-timestamp messages each get their own marker without duplicate lifecycle events", () => {
 const h = harness();
 const firstUser = message("user", 1);
 const secondUser = message("user", 1);
 h.emit("message_start", firstUser);
 h.emit("message_start", firstUser);
 h.emit("message_start", secondUser);
 for (let i = 0; i < 2; i++) {
  h.emit("message_start", message("assistant", 2));
  h.emit("message_update", message("assistant", 2, [{ type: "text", text: `answer ${i}` }]));
  h.emit("message_end", message("assistant", 2, [{ type: "text", text: `answer ${i}` }]));
 }
 assert.deepEqual(h.entries.map(({ data }) => data), [{ role: "user" }, { role: "user" }, { role: "assistant" }, { role: "assistant" }]);
});

void test("session change clears active assistant and user identity state", () => {
 const h = harness();
 const user = message("user", 1);
 h.emit("message_start", user);
 h.emit("message_start", message("assistant", 2));
 h.emit("session_start");
 h.emit("message_end", message("assistant", 2, [{ type: "text", text: "orphan" }]));
 assert.equal(h.entries.length, 1);
 h.emit("message_start", user);
 h.emit("message_start", message("assistant", 2));
 h.emit("message_end", message("assistant", 2, [{ type: "text", text: "new" }]));
 assert.deepEqual(h.entries.map(({ data }) => data.role), ["user", "user", "assistant"]);
});

void test("malformed assistant content fails closed without throwing", () => {
 const h = harness();
 h.emit("message_start", message("assistant", 1));
 for (const content of [null, {}, [null], [{ type: "text", text: {} }]])
  h.emit("message_update", { role: "assistant", timestamp: 1, content } as never);
 assert.equal(h.entries.length, 0);
 h.emit("message_end", message("assistant", 1, [{ type: "text", text: "valid" }]));
 assert.deepEqual(h.entries.map(({ data }) => data), [{ role: "assistant" }]);
});

void test("registered renderer selects role glyph without including message text", () => {
 const h = harness();
 h.emit("message_start", message("user", 1));
 h.emit("message_start", message("assistant", 2));
 h.emit("message_update", message("assistant", 2, [{ type: "text", text: "secret body" }]));
 const theme = { fg: (_color: string, text: string) => text };
 const userLines = h.renderer?.(h.entries[0]!, { expanded: false }, theme)?.render(40) ?? [];
 const assistantLines = h.renderer?.(h.entries[1]!, { expanded: false }, theme)?.render(40) ?? [];
 assert.match(userLines.join(""), /👤/);
 assert.match(assistantLines.join(""), /🦝/);
 assert.doesNotMatch(assistantLines.join(""), /secret body/);
 assert.equal(h.entries[0]?.customType, h.customType);
 assert.equal(h.renderer?.({ data: { role: "invalid" } }, { expanded: false }, theme), undefined);
 assert.equal(h.renderer?.({ data: {} }, { expanded: false }, theme), undefined);
 assert.equal(h.renderer?.({ data: { role: "assistant" } }, { expanded: false }, theme)?.render(1).join(""), "");
});

void test("renderer returns an empty line for invalid or narrow widths", () => {
 const h = harness();
 const renderer = h.renderer?.({ data: { role: "user" } }, { expanded: false }, { fg: (_color: string, text: string) => text });
 assert.ok(renderer);
 for (const width of [0, 1, -1, NaN, Infinity, -Infinity, 2.5])
  assert.deepEqual(renderer.render(width), [""], `width ${width}`);
 assert.match(renderer.render(2).join(""), /👤/);
});

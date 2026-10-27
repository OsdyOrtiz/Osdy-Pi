import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import test from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { Text, setCapabilities } from "@earendil-works/pi-tui";
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
function harness(mode = "tui", enabled = true, settingsAvailable = true, isVisible?: () => boolean) {
 const handlers = new Map<string, Handler>();
 const entries: Array<{ type: "custom"; customType: string; data: { role: string } }> = [];
 const timeline: string[] = [];
 let renderer: TestRenderer | undefined;
 let customType = "";
 let showImages = true;
 const ctx = { mode, hasUI: true, sessionManager: { getBranch: () => entries } } as unknown as ExtensionContext;
 const pi = {
  ...(settingsAvailable ? { getSettings: () => ({ terminal: { showImages } }) } : {}),
  on: (name: string, handler: Handler) => { handlers.set(name, handler); },
  appendEntry: (type: string, data: { role: string }) => { entries.push({ type: "custom", customType: type, data }); timeline.push(`marker:${data.role}`); },
  registerEntryRenderer: (type: string, render: unknown) => { customType = type; renderer = render as TestRenderer; },
 } as unknown as ExtensionAPI;
 registerMessageRoleMarkers(pi, () => enabled, isVisible);
 const emit = (name: string, message?: { role: string }) => { handlers.get(name)?.(message ? { message } : {}, ctx); if (name === "message_start" && message) timeline.push(`native:${message.role}`); };
 return { setShowImages: (value: boolean) => { showImages = value; }, emit, entries, timeline, ctx, get renderer() { return renderer; }, get customType() { return customType; }, setEnabled: (value: boolean) => { enabled = value; } };
}
const message = (role: string, timestamp: number, content: unknown[] = []) => ({ role, timestamp, content });

void test("supported images replace only the standalone marker and settings are read at render time", () => {
 setCapabilities({ images: "kitty", trueColor: true, hyperlinks: false });
 try {
  const h = harness();
  const marker = h.renderer?.({ data: { role: "assistant" } }, { expanded: false }, { fg: (_color: string, text: string) => text });
  assert.ok(marker);
  assert.ok(marker.render(40).join("").includes("\x1b_G"));
  h.setShowImages(false);
  assert.deepEqual(marker.render(40), new Text("🦝", 0, 0).render(40));
  h.setShowImages(true);
  setCapabilities({ images: null, trueColor: true, hyperlinks: false });
  assert.deepEqual(marker.render(40), new Text("🦝", 0, 0).render(40));
 } finally {
  setCapabilities({ images: null, trueColor: true, hyperlinks: false });
 }
});

void test("historical and already-mounted markers honor dedicated visual visibility without deleting entries", () => {
 let visualsVisible = true;
 const h = harness("tui", true, true, () => visualsVisible); const theme = { fg: (_color: string, text: string) => text };
 h.emit("message_start", message("assistant", 1));
 h.emit("message_end", message("assistant", 1, [{ type: "text", text: "answer" }]));
 const marker = h.renderer?.(h.entries[0]!, { expanded: false }, theme);
 assert.ok(marker?.render(40).length);
 visualsVisible = false; h.setEnabled(false);
 assert.deepEqual(marker?.render(40), []);
 assert.deepEqual(h.renderer?.(h.entries[0]!, { expanded: false }, theme)?.render(40), []);
 h.emit("message_start", message("assistant", 2));
 h.emit("message_end", message("assistant", 2, [{ type: "text", text: "hidden" }]));
 assert.equal(h.entries.length, 1);
 visualsVisible = true; assert.ok(marker?.render(40).length); assert.equal(h.entries.length, 1);
});

void test("legacy disabled creation gate leaves historical and already-created marker rows visible by default", () => {
 const h = harness(); const theme = { fg: (_color: string, text: string) => text };
 const entry = { data: { role: "assistant" } };
 const marker = h.renderer?.(entry, { expanded: false }, theme);
 h.setEnabled(false);
 assert.ok(marker?.render(40).length);
 assert.ok(h.renderer?.(entry, { expanded: false }, theme)?.render(40).length);
 h.emit("message_start", message("assistant", 1));
 h.emit("message_end", message("assistant", 1, [{ type: "text", text: "answer" }]));
 assert.equal(h.entries.length, 0, "legacy off still suppresses creation");
});

void test("older hosts without getSettings remain compatible", () => {
 setCapabilities({ images: "iterm2", trueColor: true, hyperlinks: false });
 try {
  const h = harness("tui", true, false);
  const marker = h.renderer?.({ data: { role: "assistant" } }, { expanded: false }, { fg: (_color: string, text: string) => text });
  assert.ok(marker?.render(40).join("").includes("\x1b]1337;File="));
 } finally { setCapabilities({ images: null, trueColor: true, hyperlinks: false }); }
});

void test("user starts preserve the native card without appending an emoji or changing content", () => {
 const h = harness();
 const user = message("user", 1, [{ type: "text", text: "original" }]);
 const original = structuredClone(user);
 h.emit("message_start", user);
 h.emit("message_start", user);
 h.emit("message_end", user);
 assert.deepEqual(h.timeline, ["native:user", "native:user"]);
 assert.deepEqual(user, original);
 assert.deepEqual(h.entries, []);
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

void test("same-timestamp assistant answers each get one marker without user markers", () => {
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
 assert.deepEqual(h.entries.map(({ data }) => data), [{ role: "assistant" }, { role: "assistant" }]);
});

void test("user start and session change clear pending assistant state", () => {
 const h = harness();
 h.emit("message_start", message("assistant", 1));
 h.emit("message_start", message("user", 2));
 h.emit("message_end", message("assistant", 1, [{ type: "text", text: "orphan" }]));
 assert.equal(h.entries.length, 0);
 h.emit("message_start", message("assistant", 3));
 h.emit("session_start");
 h.emit("message_end", message("assistant", 3, [{ type: "text", text: "orphan" }]));
 assert.equal(h.entries.length, 0);
 h.emit("message_start", message("assistant", 4));
 h.emit("message_end", message("assistant", 4, [{ type: "text", text: "new" }]));
 assert.deepEqual(h.entries.map(({ data }) => data.role), ["assistant"]);
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

void test("legacy user entries render no row, while assistant glyph stays copy-isolated", () => {
 const h = harness();
 h.emit("message_start", message("assistant", 2));
 h.emit("message_update", message("assistant", 2, [{ type: "text", text: "secret body" }]));
 const theme = { fg: (_color: string, text: string) => text };
 const legacy = { type: "custom", customType: h.customType, data: { role: "user" } };
 // Pi's addCustomEntryToChat skips the whole row when this renderer returns undefined.
 assert.equal(legacy.customType, h.entries[0]?.customType);
 assert.equal(h.renderer?.(legacy, { expanded: false }, theme), undefined);
 const assistantLines = h.renderer?.(h.entries[0]!, { expanded: false }, theme)?.render(40) ?? [];
 assert.match(assistantLines.join(""), /🦝/);
 assert.doesNotMatch(assistantLines.join(""), /secret body/);
 assert.equal(h.entries[0]?.customType, h.customType);
 assert.equal(h.renderer?.({ data: { role: "invalid" } }, { expanded: false }, theme), undefined);
 assert.equal(h.renderer?.({ data: {} }, { expanded: false }, theme), undefined);
 assert.equal(h.renderer?.({ data: { role: "assistant" } }, { expanded: false }, theme)?.render(1).join(""), "");
});

void test("renderer returns an empty line for invalid or narrow widths", () => {
 const h = harness();
 const renderer = h.renderer?.({ data: { role: "assistant" } }, { expanded: false }, { fg: (_color: string, text: string) => text });
 assert.ok(renderer);
 for (const width of [0, 1, -1, NaN, Infinity, -Infinity, 2.5])
  assert.deepEqual(renderer.render(width), [""], `width ${width}`);
 assert.match(renderer.render(2).join(""), /🦝/);
});

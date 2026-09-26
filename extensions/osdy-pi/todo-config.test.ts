import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

registerHooks({ resolve(specifier, context, next) {
 if (specifier.startsWith(".") && specifier.endsWith(".js") && context.parentURL?.endsWith(".ts")) {
  const url = new URL(`${specifier.slice(0, -3)}.ts`, context.parentURL);
  if (existsSync(fileURLToPath(url))) return { shortCircuit: true, url: url.href };
 }
 return next(specifier, context);
} });

const { loadTodoConfig, getMaxWidgetLines, resolveCollapseKey, validateGuidance } = await import("./todo-config.js");

function fixture(files: Record<string, string>, xdg?: string) {
 const home = join(tmpdir(), "osdy-todo-config-test-home");
 return { home, env: xdg === undefined ? {} : { XDG_CONFIG_HOME: xdg }, readFile(path: string) {
  if (!(path in files)) throw Object.assign(new Error("missing"), { code: "ENOENT" });
  return files[path]!;
 } };
}
const legacy = join(tmpdir(), "osdy-todo-config-test-home", ".config", "rpiv-todo", "config.json");
const xdg = join(tmpdir(), "osdy-todo-config-test-xdg");
const primary = join(xdg, "rpiv-todo", "config.json");

void test("XDG wins, legacy is used only when XDG is missing; relative XDG uses legacy", () => {
 assert.equal(loadTodoConfig(fixture({ [legacy]: '{"maxWidgetLines":5}', [primary]: '{"maxWidgetLines":7}' }, xdg)).maxWidgetLines, 7);
 assert.equal(loadTodoConfig(fixture({ [legacy]: '{"maxWidgetLines":5}' }, xdg)).maxWidgetLines, 5);
 assert.equal(loadTodoConfig(fixture({ [legacy]: '{"maxWidgetLines":5}' }, "relative/path")).maxWidgetLines, 5);
 assert.equal(loadTodoConfig(fixture({ [legacy]: '{"maxWidgetLines":5}' }, "~other/.config")).maxWidgetLines, 5);
 assert.equal(loadTodoConfig(fixture({ [legacy]: '{"maxWidgetLines":5}' }, "   ")).maxWidgetLines, 5);
 assert.equal(loadTodoConfig(fixture({ [legacy]: '{"maxWidgetLines":5}' }, "~/not-installed")).maxWidgetLines, 5);
 assert.deepEqual(loadTodoConfig(fixture({}, xdg)), {});
});

void test("invalid JSON warns and defaults without falling back; non-object JSON silently defaults", () => {
 const warnings: string[] = [];
 const bad = fixture({ [primary]: "{", [legacy]: '{"maxWidgetLines":5}' }, xdg);
 assert.equal(getMaxWidgetLines(loadTodoConfig({ ...bad, warn: (message: string) => warnings.push(message) })), 12);
 assert.match(warnings[0] ?? "", /rpiv-config: invalid JSON at .*config.json/);
 for (const value of ["null", "[]", '"hello"', "42"]) {
  assert.equal(getMaxWidgetLines(loadTodoConfig(fixture({ [primary]: value }, xdg))), 12);
 }
});

void test("widget budget and collapse key validate independently", () => {
 for (const value of [undefined, null, "3", 2, -1]) assert.equal(getMaxWidgetLines({ maxWidgetLines: value }), 12);
 assert.equal(getMaxWidgetLines({ maxWidgetLines: 3 }), 3);
 assert.equal(getMaxWidgetLines({ maxWidgetLines: 100 }), 100);
 for (const value of [undefined, null, "", "  ", "ctr+]", "ctrl+ctrl+t", "ctrl+f13", "ctrl++t", "ctrl+unknown+t", "~user"]) {
  assert.equal(resolveCollapseKey({ collapseKey: value }), "ctrl+shift+t");
 }
 assert.equal(resolveCollapseKey({ collapseKey: " ALT+F5 " }), "alt+f5");
 assert.equal(resolveCollapseKey({ collapseKey: "off" }), "off");
 assert.equal(resolveCollapseKey({ collapseKey: "ctrl+]" }), "ctrl+]");
});

void test("guidance requires non-empty strings and all-or-nothing guideline arrays", () => {
 assert.deepEqual(validateGuidance({ promptSnippet: "custom", promptGuidelines: ["one", "two"] }), { promptSnippet: "custom", promptGuidelines: ["one", "two"] });
 assert.deepEqual(validateGuidance({ promptSnippet: "", promptGuidelines: ["one", ""] }), {});
 assert.deepEqual(validateGuidance({ promptSnippet: " ", promptGuidelines: [" "] }), { promptSnippet: " ", promptGuidelines: [" "] });
 assert.deepEqual(validateGuidance(null), {});
});

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
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

const { createTodoI18n, initTodoI18n, I18N_NAMESPACE } = await import("./todo-i18n.js");

void test("missing optional SDK retains canonical English at every call", async () => {
 const bridge = await initTodoI18n(() => Promise.reject(new Error("not installed")), () => Promise.reject(new Error("not installed")));
 assert.equal(bridge.t("overlay.heading", "Todos"), "Todos");
 assert.equal(bridge.status("in_progress"), "in progress");
});

void test("all nine bundled locales cover the English UI key set", () => {
 const directory = new URL("./locales/", import.meta.url);
 const english = JSON.parse(readFileSync(new URL("en.json", directory), "utf8")) as Record<string, string>;
 for (const code of ["de", "en", "es", "fr", "pt", "pt-BR", "ru", "uk", "zh"]) {
  const locale = JSON.parse(readFileSync(new URL(`${code}.json`, directory), "utf8")) as Record<string, string>;
  assert.deepEqual(Object.keys(locale).filter((key) => !key.startsWith("_meta.")).sort(), Object.keys(english).sort(), code);
  assert.ok(Object.values(locale).every((value) => typeof value === "string"));
 }
});

void test("registers own locale directory and reads scoped strings live", async () => {
 let language = "es";
 const registered: string[] = [];
 const bridge = await initTodoI18n(
  () => Promise.resolve({ registerLocalesFromDir(namespace: string, url: string, options?: { label?: string }) {
   registered.push(namespace, url, options?.label ?? "");
  } }),
  () => Promise.resolve({ scope(namespace: string) {
   assert.equal(namespace, I18N_NAMESPACE);
   return (key: string, fallback: string) => language === "es" ? ({ "overlay.heading": "Tareas", "status.completed": "completadas" } as Record<string, string>)[key] ?? fallback : fallback;
  } }),
 );
 assert.deepEqual(registered, [I18N_NAMESPACE, new URL("./todo-i18n.ts", import.meta.url).href, "osdy-todo"]);
 assert.equal(bridge.t("overlay.heading", "Todos"), "Tareas");
 assert.equal(bridge.status("completed"), "completadas");
 language = "en";
 assert.equal(bridge.t("overlay.heading", "Todos"), "Todos");
 assert.equal(bridge.status("completed"), "completed");
 assert.equal(createTodoI18n().status("deleted"), "deleted");
});

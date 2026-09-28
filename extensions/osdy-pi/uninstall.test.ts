import assert from "node:assert/strict";
import { test } from "node:test";
import { existsSync, readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { fileURLToPath } from "node:url";
import ts from "typescript";

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
const { runOsdyUninstall, identifyLocalPackage } = await import("./uninstall.js");

const listing = "User packages:\n  npm:osdy-pi@1.5.0\n  npm:other\n";
function harness(output = listing) {
 const calls: Array<{ command: string; args: string[] }> = [];
 const notices: string[] = [];
 let confirmed = true;
 const api = {
  list: () => Promise.resolve(output),
  remove: (source: string, local: boolean) => { calls.push({ command: source, args: local ? ["--local"] : [] }); return Promise.resolve(); },
  confirm: () => Promise.resolve(confirmed),
  notify: (message: string) => notices.push(message),
 };
 return { api, calls, notices, cancel: () => { confirmed = false; } };
}

void test("removes exactly one confirmed registration without touching unrelated packages", async () => {
 const h = harness();
 await runOsdyUninstall(h.api);
 assert.deepEqual(h.calls, [{ command: "npm:osdy-pi@1.5.0", args: [] }]);
 assert.match(h.notices.at(-1) ?? "", /restart Pi/i);
});

void test("cancellation and ambiguous scopes never remove", async () => {
 const cancelled = harness(); cancelled.cancel();
 await runOsdyUninstall(cancelled.api);
 assert.equal(cancelled.calls.length, 0);
 const ambiguous = harness("User packages:\n  npm:osdy-pi\nProject packages:\n  npm:osdy-pi\n");
 await runOsdyUninstall(ambiguous.api);
 assert.equal(ambiguous.calls.length, 0);
});

void test("unrecognized list output fails closed", async () => {
 const h = harness("User packages:\n  npm:osdy-pi\nmalformed\n");
 await runOsdyUninstall(h.api);
 assert.equal(h.calls.length, 0);
});

void test("git project registration uses local scope and exact ref", async () => {
 const h = harness("Project packages:\n  git:github.com/OsdyOrtiz/Osdy-Pi@v1\n  npm:unrelated\n");
 await runOsdyUninstall(h.api);
 assert.deepEqual(h.calls, [{ command: "git:github.com/OsdyOrtiz/Osdy-Pi@v1", args: ["--local"] }]);
});

void test("Pi-prefixed HTTPS Git source is removable when unique", async () => {
 const h = harness("User packages:\n  git:https://github.com/OsdyOrtiz/Osdy-Pi@main\n");
 await runOsdyUninstall(h.api);
 assert.deepEqual(h.calls, [{ command: "git:https://github.com/OsdyOrtiz/Osdy-Pi@main", args: [] }]);
});

void test("equivalent Git URLs in one scope are ambiguous", async () => {
 for (const duplicate of [
  "https://github.com/OsdyOrtiz/Osdy-Pi.git",
  "git:https://github.com/OsdyOrtiz/Osdy-Pi@main",
  "git:ssh://git@github.com/OsdyOrtiz/Osdy-Pi",
  "git:git@github.com:OsdyOrtiz/Osdy-Pi.git",
  "git:git+https://github.com/OsdyOrtiz/Osdy-Pi",
  "git:github.com/OsdyOrtiz/Osdy-Pi",
 ]) {
  const h = harness(`User packages:\n  git:github.com/OsdyOrtiz/Osdy-Pi\n  ${duplicate}\n`);
  await runOsdyUninstall(h.api);
  assert.equal(h.calls.length, 0, duplicate);
 }
});

void test("unsupported Git spelling is never selected", async () => {
 const h = harness("User packages:\n  git@github.com:OsdyOrtiz/Osdy-Pi\n");
 await runOsdyUninstall(h.api);
 assert.equal(h.calls.length, 0);
});

void test("confirmation rechecks source, scope, and duplicate identities", async () => {
 for (const changed of [
  "User packages:\n  npm:osdy-pi@2.0.0\n",
  "Project packages:\n  npm:osdy-pi@1.5.0\n",
  "User packages:\n  npm:osdy-pi@1.5.0\n  npm:osdy-pi@2.0.0\n",
  "User packages:\n  git:github.com/OsdyOrtiz/Osdy-Pi\n",
  "User packages:\n  npm:osdy-pi@1.5.0\n  npm:other\nProject packages:\n  npm:unrelated\n",
 ]) {
  const h = harness();
  let current = listing;
  await runOsdyUninstall({ ...h.api, list: () => Promise.resolve(current), confirm: () => { current = changed; return Promise.resolve(true); } });
  assert.equal(h.calls.length, 0, changed);
 }
});

void test("local provenance requires the executing package root, not only a matching manifest", async () => {
 const manifest = JSON.stringify({ name: "osdy-pi", pi: { extensions: ["./extensions/osdy-pi.ts"] } });
 const io = {
  readFile: () => Promise.resolve(manifest),
  realpath: (path: string) => Promise.resolve(path === "/installed/copy" ? "/installed/copy" : "/running/package"),
 };
 assert.equal(await identifyLocalPackage("/installed/copy", import.meta.url, io), false);
 assert.equal(await identifyLocalPackage("/running/package", import.meta.url, io), true);
 assert.equal(await identifyLocalPackage("/running/package", import.meta.url, { ...io, readFile: () => Promise.resolve("{}") }), false);
});

void test("local provenance is rechecked after confirmation", async () => {
 const h = harness("User packages:\n  ./Osdy-Pi\n    /running/package\n");
 let trusted = true;
 await runOsdyUninstall({
  ...h.api,
  identifyLocal: () => Promise.resolve(trusted),
  confirm: () => { trusted = false; return Promise.resolve(true); },
 });
 assert.equal(h.calls.length, 0);
});

void test("local registrations require identified package path and do not remove other local packages", async () => {
 const h = harness("User packages:\n  ../Osdy-Pi\n    /home/user/Osdy-Pi\n  ./other\n    /home/user/other\n");
 await runOsdyUninstall({ ...h.api, identifyLocal: (path) => Promise.resolve(path === "/home/user/Osdy-Pi") });
 assert.deepEqual(h.calls, [{ command: "/home/user/Osdy-Pi", args: [] }]);
 const unknown = harness("User packages:\n  ../Osdy-Pi\n    /home/user/Osdy-Pi\n");
 await runOsdyUninstall(unknown.api);
 assert.equal(unknown.calls.length, 0);
});

void test("remove errors do not report success", async () => {
 const h = harness();
 await runOsdyUninstall({ ...h.api, remove: () => Promise.reject(new Error("remove failed")) });
 assert.equal(h.notices.some((message) => message.startsWith("Removed")), false);
});

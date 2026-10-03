import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile, symlink, lstat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { configureGentleCoexistence, reconcileGentlePackages } from "./osdy-pi-gentle-coexistence.mjs";
const TODO = "-extensions/gentle-todo.ts";
const OTHER = ["-extensions/ask-user-question.ts", "-extensions/gentle-agents.ts"];
async function fixture() {
 const root = await mkdtemp(join(tmpdir(), "osdy-gentle-"));
 const source = join(root, "gentle-pi"); await mkdir(join(source, "extensions"), { recursive: true });
 await writeFile(join(source, "package.json"), '{"name":"gentle-pi"}');
 for (const name of ["gentle-todo.ts", "ask-user-question.ts", "gentle-agents.ts"])
  await writeFile(join(source, "extensions", name), "export {};\n");
 return { root, source, settingsPath: join(root, "settings.json") };
}
test("new setup defaults off, leaves Gentle TODO eligible and is idempotent", async () => {
 const f = await fixture(); await configureGentleCoexistence(f.source, f);
 const settings = JSON.parse(await readFile(f.settingsPath, "utf8"));
 assert.deepEqual(settings.packages[0], { source: f.source, extensions: OTHER, themes: [] });
 assert.equal(settings.osdyPiTodoProvider, undefined);
 assert.equal((await configureGentleCoexistence(f.source, f)).status, "already configured");
});
test("preserves duplicate Gentle sources, deliberate filters, resources and other package entries", () => {
 const source = "/absolute/gentle-pi";
 const settings = { theme: "mine", packages: [
  { source: "npm:gentle-pi@2", extensions: ["extensions/gentle-shell.ts", TODO], skills: [], themes: ["mine.json"] },
  { source, extensions: [], prompts: [] },
  { source: "npm:pi-subagents-j0k3r", extensions: ["-./index.ts"], skills: [] }, "npm:osdy-pi",
 ] };
 const result = reconcileGentlePackages(settings, source);
 assert.deepEqual(result.settings.packages.slice(0, 4), [
  { ...settings.packages[0], extensions: [...settings.packages[0].extensions, ...OTHER] },
  settings.packages[1], settings.packages[2], "npm:osdy-pi",
 ]);
 assert.equal(reconcileGentlePackages(result.settings, source).changed, false);
 assert.equal(result.settings.osdyPiTodoProvider, undefined);
});
test("explicit opt-in adds only new TODO ownership and keeps preexisting unowned exclusion", () => {
 const source = "/absolute/gentle-pi";
 const settings = { osdyPiTodoProvider: { version: 1, enabled: true, ownedExclusions: [] }, packages: [
  "npm:gentle-pi", { source, extensions: [TODO] },
 ] };
 const next = reconcileGentlePackages(settings, source).settings;
 assert.ok(next.packages.every((entry) => typeof entry === "string" || entry.source !== "npm:gentle-pi" || entry.extensions.includes(TODO)));
 assert.deepEqual(next.osdyPiTodoProvider.ownedExclusions, [{ index: 0, source: "npm:gentle-pi", wasString: true, hadExtensions: false }]);
 assert.equal(reconcileGentlePackages(next, source).changed, false);
 assert.throws(() => reconcileGentlePackages({ ...settings, packages: [{ source, extensions: [] }] }, source), /\[\]/);
});
test("mixed same-source duplicates refuse ambiguous TODO ownership without reconstruction", () => {
 const settings = { osdyPiTodoProvider: { version: 1, enabled: true, ownedExclusions: [] },
  packages: ["npm:gentle-pi", { source: "npm:gentle-pi", extensions: [TODO] }] };
 assert.throws(() => reconcileGentlePackages(settings, "/absolute/gentle-pi"), /duplicate|ambiguous/i);
});

test("local aliases are identified through manifests, not just the chosen source spelling", async () => {
 const f = await fixture();
 await writeFile(f.settingsPath, JSON.stringify({ packages: [{ source: "./gentle-pi", skills: [], extensions: ["extensions/*.ts"] }] }));
 await configureGentleCoexistence(f.source, f);
 const next = JSON.parse(await readFile(f.settingsPath, "utf8"));
 assert.deepEqual(next.packages[0], { source: "./gentle-pi", skills: [], extensions: ["extensions/*.ts", ...OTHER] });
 assert.equal(next.packages.some((entry) => entry.source === f.source), false);
});
test("unreadable required extension refuses before settings writes with deterministic filesystem injection", async () => {
 const f = await fixture();
 const original = JSON.stringify({ theme: "retained", packages: ["npm:gentle-pi"] });
 await writeFile(f.settingsPath, original);
 let writes = 0;
 await assert.rejects(configureGentleCoexistence(f.source, { ...f, fileSystem: {
  access: (path) => path === join(f.source, "extensions", "gentle-todo.ts")
   ? Promise.reject(Object.assign(new Error("unreadable fixture"), { code: "EACCES" })) : Promise.resolve(),
  writeFile: () => { writes++; return Promise.resolve(); },
 } }), /not readable: extensions\/gentle-todo\.ts/);
 assert.equal(writes, 0);
 assert.equal(await readFile(f.settingsPath, "utf8"), original);
});

test("ownership position reorder fails closed without reconstructing filters", () => {
 const settings = { packages: ["npm:other", { source: "npm:gentle-pi", extensions: [TODO] }],
  osdyPiTodoProvider: { version: 1, enabled: true, ownedExclusions: [{ index: 0, source: "npm:gentle-pi", wasString: true, hadExtensions: false }] } };
 const original = JSON.stringify(settings);
 assert.throws(() => reconcileGentlePackages(settings, "/absolute/gentle-pi"), /ownership/i);
 assert.equal(JSON.stringify(settings), original);
});

test("invalid settings, source and symlink fail without mutation", async () => {
 const f = await fixture();
 for (const text of ["{bad", "[]", '{"packages":{}}', '{"osdyPiTodoProvider":{"enabled":true}}']) {
  await writeFile(f.settingsPath, text); await assert.rejects(configureGentleCoexistence(f.source, f));
  assert.equal(await readFile(f.settingsPath, "utf8"), text);
 }
 const linked = join(f.root, "linked.json"); await symlink(f.settingsPath, linked);
 await assert.rejects(configureGentleCoexistence(f.source, { settingsPath: linked }), /regular|symlink/);
 assert.equal((await lstat(linked)).isSymbolicLink(), true);
 await assert.rejects(configureGentleCoexistence(join(f.root, "missing"), f), /existing directory/);
});

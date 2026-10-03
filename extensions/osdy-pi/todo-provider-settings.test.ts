import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, symlinkSync, lstatSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { registerHooks } from "node:module";
registerHooks({ resolve(specifier, context, nextResolve) {
 if (specifier === "./todo-provider-settings.js" && context.parentURL?.endsWith(".test.ts"))
  return { shortCircuit: true, url: new URL("./todo-provider-settings.ts", context.parentURL).href };
 return nextResolve(specifier, context);
} });
const { inspectTodoProvider, selectTodoProvider, todoAgentDir } = await import("./todo-provider-settings.js");

const FILTER = "-extensions/gentle-todo.ts";
function fixture(settings?: unknown) {
 const root = mkdtempSync(join(tmpdir(), "osdy-selector-"));
 const agentDir = join(root, "agent");
 const cwd = join(root, "project");
 mkdirSync(agentDir); mkdirSync(cwd);
 const path = join(agentDir, "settings.json");
 if (settings !== undefined) writeFileSync(path, JSON.stringify(settings));
 return { root, agentDir, cwd, home: root, path };
}
type Saved = { theme?: string; packages: (string | { source: string; extensions?: string[]; prompts?: string[] })[]; osdyPiTodoProvider: { enabled: boolean; ownedExclusions: unknown[] } };
function saved(f: ReturnType<typeof fixture>): Saved { return JSON.parse(readFileSync(f.path, "utf8")) as Saved; }

void test("missing, malformed and invalid opt-ins fail closed without startup writes", () => {
 const f = fixture();
 assert.equal(inspectTodoProvider(f).active, false);
 assert.throws(() => lstatSync(f.path), /ENOENT/);
 for (const text of ["{bad", "[]", '{"osdyPiTodoProvider":{"enabled":true}}', '{"packages":{}}']) {
  writeFileSync(f.path, text);
  assert.equal(inspectTodoProvider(f).active, false);
  assert.equal(readFileSync(f.path, "utf8"), text);
 }
 assert.equal(todoAgentDir({ PI_CODING_AGENT_DIR: f.agentDir }, f.root), f.agentDir);
 assert.equal(todoAgentDir({}, f.root), join(f.root, ".pi", "agent"));
});

void test("on filters every npm/local duplicate, preserves resources, and off restores only owned filters", () => {
 const f = fixture({ theme: "mine", packages: ["npm:gentle-pi", { source: "npm:gentle-pi@2", extensions: [FILTER, "extensions/gentle-shell.ts"], skills: [] }] });
 const local = join(f.root, "checkout"); mkdirSync(local);
 writeFileSync(join(local, "package.json"), '{"name":"gentle-pi"}');
 const initial = saved(f); initial.packages.push({ source: local, prompts: [], extensions: ["extensions/*.ts"] });
 writeFileSync(f.path, JSON.stringify(initial));
 selectTodoProvider({ ...f, mode: "on" });
 assert.equal(inspectTodoProvider(f).active, true);
 assert.equal(saved(f).osdyPiTodoProvider.ownedExclusions.length, 2);
 const bytes = readFileSync(f.path, "utf8");
 selectTodoProvider({ ...f, mode: "on" }); assert.equal(readFileSync(f.path, "utf8"), bytes);
 selectTodoProvider({ ...f, mode: "off" });
 assert.deepEqual(saved(f).packages, initial.packages);
 assert.equal(saved(f).theme, "mine");
 assert.equal(inspectTodoProvider(f).active, false);
 const off = readFileSync(f.path, "utf8"); selectTodoProvider({ ...f, mode: "off" });
 assert.equal(readFileSync(f.path, "utf8"), off);
});

void test("off works without Gentle; legacy exclusion never opts in and warns", () => {
 const f = fixture({ packages: [{ source: "npm:gentle-pi", extensions: [FILTER] }] });
 const status = inspectTodoProvider(f);
 assert.equal(status.active, false); assert.match(status.reason, /no-provider|legacy/i);
 selectTodoProvider({ ...f, mode: "off" });
 assert.deepEqual((saved(f).packages[0] as { extensions: string[] }).extensions, [FILTER]);
 const absent = fixture(); selectTodoProvider({ ...absent, mode: "off" });
 assert.equal(saved(absent).osdyPiTodoProvider.enabled, false);
});

void test("unsafe settings, empty arrays, uncertain globs, remote and direct identities refuse without writes", () => {
 for (const entry of [
  { source: "npm:gentle-pi", extensions: [] },
  { source: "npm:gentle-pi", extensions: ["extensions/*shell*.ts"] },
  "git:github.com/Gentleman-Programming/gentle-pi",
  "/missing/gentle-pi",
 ]) {
  const f = fixture({ packages: [entry] }); const bytes = readFileSync(f.path, "utf8");
  assert.throws(() => selectTodoProvider({ ...f, mode: "on" }));
  assert.equal(readFileSync(f.path, "utf8"), bytes);
 }
 const f = fixture({ extensions: ["./gentle-todo.ts"] });
 assert.throws(() => selectTodoProvider({ ...f, mode: "on" }), /direct/i);
});

void test("project Gentle overrides and malformed projects refuse; later unfiltered Gentle disables startup", () => {
 const f = fixture({ packages: ["npm:gentle-pi"] });
 selectTodoProvider({ ...f, mode: "on" });
 const settings = saved(f); settings.packages.push("npm:gentle-pi@3"); writeFileSync(f.path, JSON.stringify(settings));
 assert.equal(inspectTodoProvider(f).active, false);
 mkdirSync(join(f.cwd, ".pi"));
 for (const text of ['{"packages":["npm:gentle-pi"]}', "{bad"]) {
  writeFileSync(join(f.cwd, ".pi", "settings.json"), text);
  const before = readFileSync(f.path, "utf8");
  assert.throws(() => selectTodoProvider({ ...f, mode: "on" }), /Project/i);
  assert.equal(readFileSync(f.path, "utf8"), before);
 }
 selectTodoProvider({ ...f, mode: "off" }); assert.equal(saved(f).osdyPiTodoProvider.enabled, false);
});

void test("same-source duplicates with mixed user exclusions refuse ambiguous ownership", () => {
 const f = fixture({ packages: ["npm:gentle-pi", { source: "npm:gentle-pi", extensions: [FILTER] }] });
 const before = readFileSync(f.path, "utf8");
 assert.throws(() => selectTodoProvider({ ...f, mode: "on" }), /duplicate|ambiguous/i);
 assert.equal(readFileSync(f.path, "utf8"), before);
 const both = fixture({ packages: ["npm:gentle-pi", "npm:gentle-pi"] });
 selectTodoProvider({ ...both, mode: "on" });
 selectTodoProvider({ ...both, mode: "off" });
 assert.deepEqual(saved(both).packages, ["npm:gentle-pi", "npm:gentle-pi"]);
});

void test("local file URLs, relative and tilde identities are all filtered without changing spelling", () => {
 const f = fixture();
 const local = join(f.root, "gentle");
 mkdirSync(local);
 writeFileSync(join(local, "package.json"), '{"name":"gentle-pi"}');
 const packages = ["../gentle", "~/gentle", `file://${local}`];
 writeFileSync(f.path, JSON.stringify({ packages }));
 selectTodoProvider({ ...f, mode: "on" });
 assert.equal(inspectTodoProvider(f).active, true);
 selectTodoProvider({ ...f, mode: "off" });
 assert.deepEqual(saved(f).packages, packages);
});

void test("removing Gentle after opt-in still permits off without recreating a package", () => {
 const f = fixture({ packages: ["npm:gentle-pi"] });
 selectTodoProvider({ ...f, mode: "on" });
 const settings = saved(f);
 settings.packages = [];
 writeFileSync(f.path, JSON.stringify(settings));
 selectTodoProvider({ ...f, mode: "off" });
 assert.equal(saved(f).osdyPiTodoProvider.enabled, false);
 assert.deepEqual(saved(f).packages, []);
});

void test("reordered owned packages fail closed and off preserves settings bytes", () => {
 const f = fixture({ packages: ["npm:gentle-pi", "npm:other"] });
 selectTodoProvider({ ...f, mode: "on" });
 const settings = saved(f); settings.packages.reverse();
 writeFileSync(f.path, JSON.stringify(settings));
 const before = readFileSync(f.path, "utf8");
 assert.equal(inspectTodoProvider(f).active, false);
 assert.throws(() => selectTodoProvider({ ...f, mode: "off" }), /positions|ownership/i);
 assert.equal(readFileSync(f.path, "utf8"), before);
});

void test("symlink settings are not followed or overwritten", () => {
 const f = fixture(); const other = join(f.root, "other.json"); writeFileSync(other, "{}"); symlinkSync(other, f.path);
 assert.equal(inspectTodoProvider(f).active, false);
 assert.throws(() => selectTodoProvider({ ...f, mode: "on" }), /regular|symlink/i);
 assert.equal(readFileSync(other, "utf8"), "{}"); assert.equal(lstatSync(f.path).isSymbolicLink(), true);
});

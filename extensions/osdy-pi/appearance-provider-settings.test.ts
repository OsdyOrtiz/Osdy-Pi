import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, symlinkSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { registerHooks } from "node:module";
import test from "node:test";
registerHooks({ resolve(specifier, context, nextResolve) {
 if (/^\.\/(appearance-provider-settings|todo-provider-settings|agent-coexistence-setup)\.js$/.test(specifier))
  return { shortCircuit: true, url: new URL(specifier.replace(/\.js$/, ".ts"), context.parentURL).href };
 return nextResolve(specifier, context);
} });
const { setAppearanceProviders, inspectAppearanceSettings } = await import("./appearance-provider-settings.js");
const { selectTodoProvider, inspectTodoProvider } = await import("./todo-provider-settings.js");
const { inspectJokerAgents } = await import("./agent-coexistence-setup.js");
function fixture(settings: unknown = {}) {
 const home = mkdtempSync(join(tmpdir(), "appearance-"));
 const agentDir = join(home, ".pi", "agent"); mkdirSync(agentDir, { recursive: true });
 const path = join(agentDir, "settings.json"); writeFileSync(path, JSON.stringify(settings));
 return { home, agentDir, cwd: home, env: {}, path, isCurrent: () => true };
}
function saved(f: ReturnType<typeof fixture>): Record<string, unknown> {
 return JSON.parse(readFileSync(f.path, "utf8")) as Record<string, unknown>;
}
void test("OFF suspends only Osdy, repeats safely, and ON restores exact prior selections", async () => {
 const f = fixture({ accounts: { keep: true }, audio: { enabled: true }, packages: [
  { source: "npm:gentle-pi", extensions: ["-extensions/gentle-agents.ts"], skills: [] },
  "npm:pi-subagents-j0k3r",
 ] });
 selectTodoProvider({ ...f, mode: "on" }); const before = saved(f);
 assert.equal(inspectAppearanceSettings(f.agentDir), undefined);
 await setAppearanceProviders({ ...f, visualsEnabled: false });
 assert.equal(inspectAppearanceSettings(f.agentDir), false);
 assert.equal(inspectTodoProvider(f).configured, false);
 assert.equal((await inspectJokerAgents(f)).mode, "gentle");
 const off = readFileSync(f.path, "utf8");
 assert.equal((await setAppearanceProviders({ ...f, visualsEnabled: false })).changed, false);
 assert.equal(readFileSync(f.path, "utf8"), off);
 writeFileSync(f.path, JSON.stringify({ ...saved(f), theme: "changed" }));
 await setAppearanceProviders({ ...f, visualsEnabled: true });
 const after = saved(f); delete after.osdyPiAppearance;
 assert.deepEqual(after, { ...before, theme: "changed" });
 assert.equal(inspectTodoProvider(f).active, true);
 assert.equal((await inspectJokerAgents(f)).mode, "joker");
});
void test("absent/explicit false selections and absent Gentle never install or force providers on", async () => {
 for (const settings of [{}, { osdyPiTodoProvider: { version: 1, enabled: false, ownedExclusions: [] } },
  { packages: ["npm:pi-subagents-j0k3r"] }]) {
  const f = fixture(settings);
  await setAppearanceProviders({ ...f, visualsEnabled: false });
  await setAppearanceProviders({ ...f, visualsEnabled: true });
  const after = saved(f); delete after.osdyPiAppearance; assert.deepEqual(after, settings);
 }
});
void test("first-run appearance switching creates only its namespace in an existing agent directory", async () => {
 const f = fixture();
 unlinkSync(f.path);
 assert.equal(inspectAppearanceSettings(f.agentDir), undefined);
 await setAppearanceProviders({ ...f, visualsEnabled: false });
 assert.equal(inspectAppearanceSettings(f.agentDir), false);
 assert.equal(inspectTodoProvider(f).configured, false);
 assert.deepEqual(saved(f), { osdyPiAppearance: { version: 1, visualsEnabled: false,
  suspended: { edits: [], jokerSuspended: false } } });
 await setAppearanceProviders({ ...f, visualsEnabled: true });
 assert.deepEqual(saved(f), { osdyPiAppearance: { version: 1, visualsEnabled: true } });
});
void test("conflicting owned fields and invalid undo metadata fail without writes", async () => {
 for (const corrupt of [
  (value: Record<string, unknown>) => { value.packages = ["npm:pi-subagents-j0k3r@changed"]; },
  (value: Record<string, unknown>) => { value.osdyPiTodoProvider = { version: 1, enabled: true, ownedExclusions: [] }; },
  (value: Record<string, unknown>) => { value.osdyPiAppearance = { version: 1, visualsEnabled: false, suspended: {} }; },
 ]) {
  const f = fixture({ packages: ["npm:pi-subagents-j0k3r"], osdyPiTodoProvider: { version: 1, enabled: true, ownedExclusions: [] } });
  await setAppearanceProviders({ ...f, visualsEnabled: false });
  const value = saved(f); corrupt(value); writeFileSync(f.path, JSON.stringify(value));
  const before = readFileSync(f.path, "utf8");
  await assert.rejects(setAppearanceProviders({ ...f, visualsEnabled: true }));
  assert.equal(readFileSync(f.path, "utf8"), before);
 }
});
void test("failed saves and concurrent changes never replace the root snapshot", async () => {
 const f = fixture({ packages: ["npm:pi-subagents-j0k3r"] });
 for (const failed of ["write", "rename"]) {
  const before = readFileSync(f.path, "utf8");
  await assert.rejects(setAppearanceProviders({ ...f, visualsEnabled: false }, {
   writeFile(path, content) { if (failed === "write") throw new Error("write failed"); writeFileSync(path, content); },
   rename() { throw new Error("rename failed"); },
  }), /failed/);
  assert.equal(readFileSync(f.path, "utf8"), before);
 }
 let currentChecks = 0;
 await assert.rejects(setAppearanceProviders({ ...f, visualsEnabled: false, isCurrent: () => ++currentChecks === 1 }), /Stale/);
 assert.deepEqual(saved(f), { packages: ["npm:pi-subagents-j0k3r"] });
 await assert.rejects(setAppearanceProviders({ ...f, visualsEnabled: false, isCurrent: () => {
  writeFileSync(f.path, JSON.stringify({ packages: [], theme: "external" })); return true;
 } }), /Settings changed/);
 assert.deepEqual(saved(f), { packages: [], theme: "external" });
});
void test("restoration preserves new unrelated package metadata and inactive custom profiles", async () => {
 const f = fixture({ packages: [{ source: "npm:gentle-pi", extensions: ["-extensions/gentle-agents.ts"] }, "npm:pi-subagents-j0k3r"] });
 selectTodoProvider({ ...f, mode: "on" });
 await setAppearanceProviders({ ...f, visualsEnabled: false });
 const off = saved(f);
 const packages = off.packages as (string | Record<string, unknown>)[];
 off.packages = packages.map((entry) => ({ ...(typeof entry === "string" ? { source: entry } : entry), skills: ["new"] }));
 writeFileSync(f.path, JSON.stringify(off));
 await setAppearanceProviders({ ...f, visualsEnabled: true });
 assert.equal(inspectTodoProvider(f).active, true);
 assert.equal((await inspectJokerAgents(f)).mode, "joker");
 assert.ok((saved(f).packages as Record<string, unknown>[]).every((entry) => Array.isArray(entry.skills)));
 const inactive = fixture({ packages: [{ source: "npm:pi-subagents-j0k3r", extensions: [] }] });
 await setAppearanceProviders({ ...inactive, env: { PI_CODING_AGENT_DIR: inactive.agentDir }, visualsEnabled: false });
 await setAppearanceProviders({ ...inactive, visualsEnabled: true });
 assert.deepEqual(saved(inactive).packages, [{ source: "npm:pi-subagents-j0k3r", extensions: [] }]);
});
void test("project overrides, unfiltered TODO and forged ownership refuse atomically", async () => {
 const f = fixture({ packages: ["npm:gentle-pi", "npm:pi-subagents-j0k3r"] });
 mkdirSync(join(f.cwd, ".pi"), { recursive: true });
 // This is the fixture home, not a real profile; its project declaration must be refused.
 const before = readFileSync(f.path, "utf8");
 for (const provider of ["npm:gentle-pi", "npm:pi-subagents-j0k3r"]) {
  writeFileSync(join(f.cwd, ".pi", "settings.json"), JSON.stringify({ packages: [provider] }));
  await assert.rejects(setAppearanceProviders({ ...f, visualsEnabled: false }), /Project/i);
  assert.equal(readFileSync(f.path, "utf8"), before);
 }
 for (const packages of [["npm:gentle-pi"], [{ source: "npm:other", extensions: ["-extensions/gentle-todo.ts"] }]]) {
  const g = fixture({ packages, osdyPiTodoProvider: { version: 1, enabled: true,
   ownedExclusions: typeof packages[0] === "string" ? [] : [{ index: 0, source: "npm:other", wasString: true, hadExtensions: false }] } });
  const bytes = readFileSync(g.path, "utf8");
  await assert.rejects(setAppearanceProviders({ ...g, visualsEnabled: false }), /unsafe/i);
  assert.equal(readFileSync(g.path, "utf8"), bytes);
 }
});
void test("invalid settings, unsafe active profiles and stale operations cannot commit", async () => {
 const f = fixture({ packages: ["npm:pi-subagents-j0k3r"] });
 for (const options of [{ env: { PI_CODING_AGENT_DIR: f.agentDir } }, { isCurrent: () => false }]) {
  const before = readFileSync(f.path, "utf8");
  await assert.rejects(setAppearanceProviders({ ...f, ...options, visualsEnabled: false }));
  assert.equal(readFileSync(f.path, "utf8"), before);
 }
 for (const text of ["{bad", "[]", '{"packages":[{"source":"npm:pi-subagents-j0k3r","extensions":["uncertain*.ts"]}]}',
  '{"packages":["npm:pi-subagents-j0k3r"],"extensions":["./custom-agents.ts"]}']) {
  writeFileSync(f.path, text);
  await assert.rejects(setAppearanceProviders({ ...f, visualsEnabled: false }));
  assert.equal(readFileSync(f.path, "utf8"), text);
 }
 const missing = { ...f, agentDir: join(f.home, "missing") };
 assert.equal(inspectAppearanceSettings(missing.agentDir), undefined);
 await assert.rejects(setAppearanceProviders({ ...missing, visualsEnabled: false }));
 const linked = join(f.home, "linked"); mkdirSync(linked); symlinkSync(f.path, join(linked, "settings.json"));
 await assert.rejects(setAppearanceProviders({ ...f, agentDir: linked, visualsEnabled: false }));
 const direct = fixture({ packages: ["npm:pi-subagents-j0k3r"] });
 mkdirSync(join(direct.agentDir, "extensions"));
 writeFileSync(join(direct.agentDir, "extensions", "joker.ts"), "");
 const bytes = readFileSync(direct.path, "utf8");
 await assert.rejects(setAppearanceProviders({ ...direct, visualsEnabled: false }), /Direct agents/);
 assert.equal(readFileSync(direct.path, "utf8"), bytes);
});

import { randomUUID } from "node:crypto";
import { lstatSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { loadTodoSettings, prepareAppearanceTodo, TODO_PROVIDER_KEY } from "./todo-provider-settings.js";
import { prepareAppearanceAgents } from "./agent-coexistence-setup.js";

const KEY = "osdyPiAppearance";
const OWNED = "osdyPiJokerExclusionOwned";
type Settings = Record<string, unknown> & { packages?: unknown[] };
type Shape = { wasString: boolean; extensions?: string[] };
type Edit = { index: number; source: string; before: Shape; after: Shape };
type Undo = { edits: Edit[]; todo?: unknown; jokerSuspended: boolean };
type Appearance = { version: 1; visualsEnabled: boolean; suspended?: Undo };
export interface AppearanceProviderOptions {
 agentDir: string;
 cwd: string;
 home?: string;
 env?: NodeJS.ProcessEnv;
 isCurrent: () => boolean;
}
export interface AppearanceSettingsWriter {
 writeFile(path: string, content: string): void;
 rename(source: string, destination: string): void;
}
const writer: AppearanceSettingsWriter = {
 writeFile: (path, content) => writeFileSync(path, content, { flag: "wx", mode: 0o600 }),
 rename: renameSync,
};
function record(value: unknown): value is Record<string, unknown> {
 return value !== null && typeof value === "object" && !Array.isArray(value);
}
function equal(left: unknown, right: unknown): boolean { return isDeepStrictEqual(left, right); }
function fail(): never { throw new Error("Invalid or conflicting appearance restoration metadata; nothing changed."); }
function source(value: unknown): string { return typeof value === "string" ? value : record(value) && typeof value.source === "string" ? value.source : fail(); }
function shape(value: unknown): Shape {
 return { wasString: typeof value === "string", ...(record(value) && value.extensions !== undefined ? { extensions: value.extensions as string[] } : {}) };
}
function validShape(value: unknown): value is Shape {
 return record(value) && Object.keys(value).every((key) => ["wasString", "extensions"].includes(key)) &&
  typeof value.wasString === "boolean" && (value.extensions === undefined ||
   (!value.wasString && Array.isArray(value.extensions) && value.extensions.every((item: unknown) => typeof item === "string")));
}
function appearance(settings: Settings): Appearance | undefined {
 const value = settings[KEY]; if (value === undefined) return undefined;
 if (!record(value) || value.version !== 1 || typeof value.visualsEnabled !== "boolean" ||
  Object.keys(value).some((key) => !["version", "visualsEnabled", "suspended"].includes(key))) fail();
 if (value.visualsEnabled ? value.suspended !== undefined : !record(value.suspended)) fail();
 if (record(value.suspended)) {
  const undo = value.suspended;
  if (!Array.isArray(undo.edits) || typeof undo.jokerSuspended !== "boolean" ||
   Object.keys(undo).some((key) => !["edits", "todo", "jokerSuspended"].includes(key))) fail();
  const seen = new Set<number>();
  for (const edit of undo.edits as unknown[]) {
   if (!record(edit) || !Number.isSafeInteger(edit.index) || (edit.index as number) < 0 ||
    typeof edit.source !== "string" || !validShape(edit.before) || !validShape(edit.after) ||
    Object.keys(edit).some((key) => !["index", "source", "before", "after"].includes(key)) || seen.has(edit.index as number)) fail();
   seen.add(edit.index as number);
  }
 }
 return value as Appearance;
}
function load(agentDir: string): Settings {
 const path = join(agentDir, "settings.json");
 if (!lstatSync(path).isFile()) throw new Error("Appearance requires regular settings.json, not a symlink.");
 return loadTodoSettings(path);
}
/** Undefined means T2 must fall back to editor v1 visualsEnabled. Invalid data throws. */
export function inspectAppearanceSettings(agentDir: string): boolean | undefined {
 return appearance(loadTodoSettings(join(agentDir, "settings.json")))?.visualsEnabled;
}
async function suspend(settings: Settings, options: AppearanceProviderOptions): Promise<Settings> {
 return prepareAppearanceAgents(prepareAppearanceTodo(settings, options), options);
}
function capture(before: Settings, after: Settings): Undo {
 const edits: Edit[] = [];
 for (const [index, entry] of (before.packages ?? []).entries()) {
  const prior = shape(entry); const next = shape(after.packages![index]);
  if (!equal(prior, next)) edits.push({ index, source: source(entry), before: prior, after: next });
 }
 return { edits, ...(!equal(before[TODO_PROVIDER_KEY], after[TODO_PROVIDER_KEY]) ? { todo: before[TODO_PROVIDER_KEY] } : {}),
  jokerSuspended: before[OWNED] !== after[OWNED] };
}
async function restore(settings: Settings, undo: Undo, options: AppearanceProviderOptions): Promise<Settings> {
 const restored: Settings = { ...settings };
 if (undo.todo !== undefined) {
  if (!equal(settings[TODO_PROVIDER_KEY], { version: 1, enabled: false, ownedExclusions: [] })) fail();
  restored[TODO_PROVIDER_KEY] = undo.todo;
 }
 if (undo.jokerSuspended) {
  if (settings[OWNED] !== true) fail();
  delete restored[OWNED];
 }
 if (undo.edits.length) restored.packages = [...(settings.packages ?? [])];
 for (const edit of undo.edits) {
  const entry = restored.packages?.[edit.index];
  if (source(entry) !== edit.source || !equal(shape(entry).extensions, edit.after.extensions)) fail();
  const item: Record<string, unknown> = typeof entry === "string" ? { source: entry } : { ...entry as Record<string, unknown> };
  if (edit.before.extensions === undefined) delete item.extensions;
  else item.extensions = edit.before.extensions;
  restored.packages![edit.index] = edit.before.wasString && Object.keys(item).length === 1 ? edit.source : item;
 }
 // Re-derive the suspension using owner guards: persisted metadata cannot authorize arbitrary edits.
 const suspended = await suspend(restored, options);
 const replay = capture(restored, suspended);
 for (const [index, edit] of replay.edits.entries()) {
  const original = undo.edits[index]; if (!original) fail();
  // New unrelated package fields can require an object where the original was a string.
  if (original.before.wasString && edit.before.extensions === undefined) edit.before.wasString = true;
  if (original.after.wasString && edit.after.extensions === undefined) edit.after.wasString = true;
 }
 if (!equal(replay, undo) || !equal(suspended, settings)) fail();
 return restored;
}
/** One root snapshot and guarded replacement; no editor settings, installs, UI or reloads. */
export async function setAppearanceProviders(
 options: AppearanceProviderOptions & { visualsEnabled: boolean },
 fileSystem: AppearanceSettingsWriter = writer,
): Promise<{ changed: boolean }> {
 const before = load(options.agentDir); const prior = appearance(before);
 let next: Settings;
 if (prior?.suspended) {
  const restored = await restore(before, prior.suspended, options);
  if (!options.visualsEnabled) return { changed: false };
  next = restored;
 } else next = options.visualsEnabled ? before : await suspend(before, options);
 next = { ...next, [KEY]: { version: 1, visualsEnabled: options.visualsEnabled,
  ...(!options.visualsEnabled ? { suspended: capture(before, next) } : {}) } };
 if (equal(next, before)) return { changed: false };
 const path = join(options.agentDir, "settings.json");
 const temporary = join(options.agentDir, `.settings.${randomUUID()}.tmp`);
 const guard = (): void => {
  if (!options.isCurrent()) throw new Error("Stale appearance operation; nothing changed.");
  if (!equal(load(options.agentDir), before)) throw new Error("Settings changed during appearance selection; retry.");
 };
 guard();
 try {
  fileSystem.writeFile(temporary, `${JSON.stringify(next, null, 2)}\n`);
  guard();
  fileSystem.rename(temporary, path);
 } finally { try { unlinkSync(temporary); } catch { /* A successful rename consumes the temporary. */ } }
 return { changed: true };
}

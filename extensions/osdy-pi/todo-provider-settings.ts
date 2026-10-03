import { randomUUID } from "node:crypto";
import { lstatSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const TODO_PROVIDER_KEY = "osdyPiTodoProvider";
export const GENTLE_TODO_EXCLUSION = "-extensions/gentle-todo.ts";
type Settings = Record<string, unknown> & { packages?: unknown[] };
type OwnedExclusion = { index: number; source: string; wasString: boolean; hadExtensions: boolean };
type Selection = { version: 1; enabled: boolean; ownedExclusions: OwnedExclusion[] };
export type TodoProviderOptions = { agentDir: string; cwd: string; home?: string };
export type TodoProviderStatus = { configured: boolean; active: boolean; reason: string; target: string };

function record(value: unknown): value is Record<string, unknown> {
 return value !== null && typeof value === "object" && !Array.isArray(value);
}
function missing(error: unknown): boolean { return record(error) && error.code === "ENOENT"; }
function source(entry: unknown): string {
 return typeof entry === "string" ? entry : record(entry) && typeof entry.source === "string" ? entry.source : "";
}
export function todoAgentDir(env: NodeJS.ProcessEnv = process.env, home = homedir()): string {
 const path = env.PI_CODING_AGENT_DIR?.trim() || join(home, ".pi", "agent");
 return resolve(path.startsWith("~/") ? join(home, path.slice(2)) : path);
}
function load(path: string): Settings {
 try {
  if (!lstatSync(path).isFile()) throw new Error("settings.json must be a regular file, not a symlink.");
 } catch (error) { if (missing(error)) return {}; throw error; }
 let settings: unknown;
 try { settings = JSON.parse(readFileSync(path, "utf8")); }
 catch { throw new Error("settings.json must contain valid JSON."); }
 if (!record(settings) || (settings.packages !== undefined && !Array.isArray(settings.packages)))
  throw new Error("settings.json must contain an object with array packages.");
 for (const entry of settings.packages ?? []) {
  if (!source(entry)) throw new Error("Invalid package source in settings.json.");
  if (record(entry) && entry.extensions !== undefined &&
   (!Array.isArray(entry.extensions) || !entry.extensions.every((item: unknown) => typeof item === "string")))
   throw new Error("Package extensions must be arrays of strings.");
 }
 return settings;
}
function selection(settings: Settings, allowRemoved = false): Selection | undefined {
 const value = settings[TODO_PROVIDER_KEY];
 if (value === undefined) return undefined;
 if (!record(value) || value.version !== 1 || typeof value.enabled !== "boolean" || !Array.isArray(value.ownedExclusions))
  throw new Error("Invalid Osdy TODO selection.");
 const seen = new Set<number>();
 for (const owned of value.ownedExclusions as unknown[]) {
  if (!record(owned) || !Number.isSafeInteger(owned.index) || (owned.index as number) < 0 || typeof owned.source !== "string" ||
   typeof owned.wasString !== "boolean" || typeof owned.hadExtensions !== "boolean" || seen.has(owned.index as number))
   throw new Error("Invalid TODO exclusion ownership.");
  seen.add(owned.index as number);
  const entry = settings.packages?.[owned.index as number];
  if (allowRemoved && !(settings.packages ?? []).some((item) => source(item) === owned.source)) continue;
  if (source(entry) !== owned.source || !hasExclusion(entry))
   throw new Error("TODO exclusion ownership no longer matches package positions; nothing changed.");
 }
 return value as Selection;
}
function localPath(value: string, directory: string, home: string): string {
 if (value.startsWith("file:")) return fileURLToPath(value);
 if (value === "~" || value.startsWith("~/")) return resolve(home, value.slice(value === "~" ? 1 : 2));
 return resolve(directory, value);
}
function gentle(entry: unknown, directory: string, home: string): boolean {
 const value = source(entry);
 if (/^npm:gentle-pi(?:@[^\s]+)?$/i.test(value)) return true;
 if (/^npm:/i.test(value)) return false;
 if (/^(?:git:|https?:\/\/)/i.test(value)) {
  if (/gentle(?:-pi)?(?:\.git)?(?:[@#?].*)?$/i.test(value)) throw new Error("Remote Gentle identity unsupported; use npm or a validated local package.");
  return false;
 }
 if (value.includes(":") && !value.startsWith("file:")) throw new Error("Unsupported package identity.");
 const path = localPath(value, directory, home);
 try {
  if (lstatSync(path).isFile()) throw new Error("Direct-extension package sources are unsupported.");
 } catch (error) { if (!missing(error)) throw error; }
 try {
  const manifest: unknown = JSON.parse(readFileSync(join(path, "package.json"), "utf8"));
  if (!record(manifest) || typeof manifest.name !== "string") throw new Error("Invalid local package manifest.");
  return manifest.name === "gentle-pi";
 } catch { throw new Error(`Local package identity cannot be validated: ${value}`); }
}
function hasExclusion(entry: unknown): boolean {
 return record(entry) && Array.isArray(entry.extensions) && entry.extensions.includes(GENTLE_TODO_EXCLUSION);
}
function assertDirect(settings: Settings, directory: string): void {
 if (settings.extensions !== undefined && (!Array.isArray(settings.extensions) ||
  !settings.extensions.every((item: unknown) => typeof item === "string" && item.startsWith("-"))))
  throw new Error("Direct-extension settings are unsupported for TODO selection.");
 try {
  if (readdirSync(join(directory, "extensions")).some((name) => /gentle.*todo/i.test(name)))
   throw new Error("Direct Gentle TODO extension is unsupported.");
 } catch (error) { if (!missing(error)) throw error; }
}
function assertProjects(cwd: string, home: string): void {
 let directory = resolve(cwd);
 while (true) {
  const pi = join(directory, ".pi");
  try {
   const settings = load(join(pi, "settings.json"));
   assertDirect(settings, pi);
   if (settings[TODO_PROVIDER_KEY] !== undefined || (settings.packages ?? []).some((entry) => gentle(entry, pi, home)))
    throw new Error("Project TODO/Gentle declarations can override profile filtering.");
  } catch (error) { throw new Error(`Project settings unsafe at ${pi}: ${error instanceof Error ? error.message : "unknown error"}`); }
  const parent = dirname(directory); if (parent === directory) return; directory = parent;
 }
}
// Avoid changing Pi's [] (load none) into a negative-only list (load everything else).
// Uncertain allowlist globs are refused, rather than broadening a user's selection.
function assertFilterable(entry: unknown): void {
 if (!record(entry) || entry.extensions === undefined || hasExclusion(entry)) return;
 const filters = entry.extensions as string[];
 if (!filters.length) throw new Error("Cannot add a negative filter to disabled extensions [].");
 const positives = filters.filter((value) => !/^[!+-]/.test(value));
 if (positives.some((value) => /[*?[{}]/.test(value) && !["extensions/*.ts", "extensions/**", "**/*.ts"].includes(value)))
  throw new Error("Uncertain Gentle extension allowlist glob; nothing changed.");
}
function flagsFor(settings: Settings, options: TodoProviderOptions): boolean[] {
 const home = options.home ?? homedir();
 assertDirect(settings, options.agentDir);
 assertProjects(options.cwd, home);
 return (settings.packages ?? []).map((entry) => gentle(entry, options.agentDir, home));
}
/** Read only the profile opt-in before requesting the SDK-bound working directory. */
export function todoProviderConfigured(agentDir: string): boolean {
 try { return selection(load(join(agentDir, "settings.json")))?.enabled === true; }
 catch { return false; }
}
export function inspectTodoProvider(options: TodoProviderOptions): TodoProviderStatus {
 const target = join(options.agentDir, "settings.json");
 let configured = false;
 try {
  const settings = load(target); const selected = selection(settings);
  configured = selected?.enabled === true;
  if (!configured) {
   const legacy = (settings.packages ?? []).some(hasExclusion);
   return { target, configured, active: false, reason: legacy ? "Disabled; legacy Gentle TODO exclusions remain (possible no-provider state)." : "Disabled by default or explicit selection." };
  }
  const flags = flagsFor(settings, options);
  if (flags.some((flag, index) => flag && !hasExclusion(settings.packages![index])))
   throw new Error("Unfiltered Gentle package appeared; Osdy TODO fails closed.");
  return { target, configured, active: true, reason: "Explicit opt-in with supported profile filtering." };
 } catch (error) { return { target, configured, active: false, reason: error instanceof Error ? error.message : "Invalid settings." }; }
}
export function selectTodoProvider(options: TodoProviderOptions & { mode: "on" | "off" }): { changed: boolean } {
 const path = join(options.agentDir, "settings.json");
 const settings = load(path); const prior = selection(settings, options.mode === "off");
 const packages = [...(settings.packages ?? [])];
 const ownedExclusions = [...(prior?.ownedExclusions ?? [])];
 if (options.mode === "on") {
  const flags = flagsFor(settings, options);
  for (const [index, entry] of packages.entries()) {
   if (!flags[index]) continue;
   const sameSource = packages.filter((item) => source(item) === source(entry));
   if (sameSource.length > 1 && sameSource.some(hasExclusion) && !sameSource.every(hasExclusion))
    throw new Error("Same-source duplicates have ambiguous TODO exclusion ownership; nothing changed.");
  }
  for (const [index, entry] of packages.entries()) {
   if (!flags[index] || hasExclusion(entry)) continue;
   assertFilterable(entry);
   const item = typeof entry === "string" ? { source: entry } : entry as Record<string, unknown>;
   ownedExclusions.push({ index, source: source(entry), wasString: typeof entry === "string", hadExtensions: item.extensions !== undefined });
   packages[index] = { ...item, extensions: [...(item.extensions as string[] ?? []), GENTLE_TODO_EXCLUSION] };
  }
 } else {
  for (const owned of ownedExclusions) {
   if (!packages.some((entry) => source(entry) === owned.source)) continue;
   const item = packages[owned.index] as Record<string, unknown>;
   const next = { ...item, extensions: (item.extensions as string[]).filter((filter) => filter !== GENTLE_TODO_EXCLUSION) };
   if (owned.wasString && Object.keys(next).every((key) => ["source", "extensions"].includes(key)) && next.extensions.length === 0)
    packages[owned.index] = owned.source;
   else {
    if (!owned.hadExtensions && !next.extensions.length) delete (next as Record<string, unknown>).extensions;
    packages[owned.index] = next;
   }
  }
  ownedExclusions.length = 0;
 }
 const next = { ...settings, ...(settings.packages !== undefined || packages.length ? { packages } : {}),
  [TODO_PROVIDER_KEY]: { version: 1, enabled: options.mode === "on", ownedExclusions } };
 if (JSON.stringify(next) === JSON.stringify(settings)) return { changed: false };
 // Recheck immediately before replacement. No startup defaults, migrations, or history writes.
 const latest = load(path);
 if (JSON.stringify(latest) !== JSON.stringify(settings)) throw new Error("Settings changed during selection; retry.");
 mkdirSync(options.agentDir, { recursive: true });
 const temporary = join(options.agentDir, `.settings.${randomUUID()}.tmp`);
 writeFileSync(temporary, `${JSON.stringify(next, null, 2)}\n`, { flag: "wx", mode: 0o600 });
 renameSync(temporary, path);
 return { changed: true };
}

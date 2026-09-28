import { readFile, realpath } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";

export interface UninstallPort {
 list(): Promise<string>;
 remove(source: string, local: boolean): Promise<void>;
 confirm(source: string, scope: "user" | "project"): Promise<boolean>;
 notify(message: string, level?: "info" | "warning"): void;
 identifyLocal?(path: string): Promise<boolean>;
}

type Registration = { source: string; scope: "user" | "project"; path?: string };
type GitSource = { type: "git"; host: string; path: string };
type GitParser = { parseGitUrl(source: string): GitSource | null };

// Use the parser shipped with the installed Pi CLI: its host/path pair is
// also the key Pi uses when removing declarations from a scope's settings.
async function gitParser(): Promise<GitParser> {
 const packageEntry = import.meta.resolve("@earendil-works/pi-coding-agent");
 const parserUrl = new URL("./utils/git.js", packageEntry);
 const module: unknown = await import(parserUrl.href);
 if (typeof module !== "object" || module === null || !("parseGitUrl" in module) || typeof module.parseGitUrl !== "function") {
  throw new Error("Pi Git parser unavailable");
 }
 return module as GitParser;
}

// `pi list` has no machine-readable mode. Reject unknown output instead of guessing
// which section owns a source or passing a display label to `pi remove`.
function parseList(output: string): Registration[] {
 const entries: Registration[] = [];
 let scope: Registration["scope"] | undefined;
 let last: Registration | undefined;
 for (const line of output.trimEnd().split("\n")) {
  if (line === "No packages installed.") return [];
  if (line === "User packages:") { scope = "user"; last = undefined; continue; }
  if (line === "Project packages:") { scope = "project"; last = undefined; continue; }
  if (line === "") continue;
  if (line.startsWith("    ") && last && isAbsolute(line.trim())) {
   last.path = line.trim(); continue;
  }
  const match = /^ {2}(\S+?)(?: \(filtered\))?$/.exec(line);
  if (!match?.[1] || !scope) throw new Error("Unrecognized pi list output");
  last = { source: match[1], scope };
  entries.push(last);
 }
 return entries;
}

// Limit the source we submit to remove to protocol forms Pi actually parses.
// The installed parser, rather than this allowlist, decides identity.
function supportedGitSource(source: string): boolean {
 return /^(?:git:(?:github\.com\/|https?:\/\/|ssh:\/\/|git:\/\/|git@github\.com:)|https?:\/\/|ssh:\/\/|git:\/\/)/.test(source);
}

function isLocalSource(source: string): boolean {
 return source.startsWith("/") || source.startsWith(".") || source.startsWith("~");
}

/** Only a registration pointing to the package executing this code is trusted. */
export async function identifyLocalPackage(
 path: string,
 extensionUrl: string,
 io: { realpath(path: string): Promise<string>; readFile(path: string, encoding: "utf8"): Promise<string> } = { realpath, readFile },
): Promise<boolean> {
 try {
  if (!isAbsolute(path)) return false;
  const root = fileURLToPath(new URL("../../", extensionUrl));
  if (await io.realpath(path) !== await io.realpath(root)) return false;
  const manifest: unknown = JSON.parse(await io.readFile(join(path, "package.json"), "utf8"));
  return typeof manifest === "object" && manifest !== null && "name" in manifest && manifest.name === "osdy-pi" &&
   "pi" in manifest && typeof manifest.pi === "object" && manifest.pi !== null && "extensions" in manifest.pi &&
   Array.isArray(manifest.pi.extensions) && manifest.pi.extensions.includes("./extensions/osdy-pi.ts");
 } catch { return false; }
}

async function select(entries: Registration[], port: UninstallPort, parseGit: GitParser["parseGitUrl"]): Promise<(Registration & { removeSource: string }) | undefined> {
 const candidates: Array<Registration & { removeSource: string }> = [];
 for (const entry of entries) {
  if (/^npm:osdy-pi(?:@[^\s]+)?$/.test(entry.source)) {
   candidates.push({ ...entry, removeSource: entry.source });
  } else if (supportedGitSource(entry.source)) {
   const git = parseGit(entry.source);
   if (git?.type === "git" && git.host === "github.com" && git.path === "OsdyOrtiz/Osdy-Pi") {
    candidates.push({ ...entry, removeSource: entry.source });
   }
  } else if (isLocalSource(entry.source) && entry.path && port.identifyLocal && await port.identifyLocal(entry.path)) {
   candidates.push({ ...entry, removeSource: entry.path });
  }
 }
 if (candidates.length !== 1) {
  port.notify(candidates.length ? "Multiple Osdy Pi registrations found; remove one manually with pi remove <source> [-l]." : "No unique Osdy Pi package registration found; nothing was removed.", "warning");
  return undefined;
 }
 const selected = candidates[0];
 if (!selected) return undefined;
 const selectedGit = parseGit(selected.source);
 const selectedEntry = entries.find((entry) => entry.scope === selected.scope && entry.source === selected.source && entry.path === selected.path);
 const duplicates = entries.filter((entry) => entry.scope === selected.scope && entry !== selectedEntry);
 for (const entry of duplicates) {
  if (selected.source.startsWith("npm:")) {
   if (/^npm:osdy-pi(?:@|$)/.test(entry.source)) {
    port.notify("Ambiguous package identity; nothing was removed.", "warning"); return undefined;
   }
  } else if (selectedGit?.type === "git") {
   const git = parseGit(entry.source);
   if (git?.type === "git" && git.host === selectedGit.host && git.path === selectedGit.path) {
    port.notify("Ambiguous package identity; nothing was removed.", "warning"); return undefined;
   }
  } else if (entry.path === selected.path) {
   port.notify("Ambiguous package identity; nothing was removed.", "warning"); return undefined;
  }
 }
 return selected;
}

export async function runOsdyUninstall(port: UninstallPort): Promise<void> {
 try {
  const parser = await gitParser();
  const parseGit = (source: string) => parser.parseGitUrl(source);
  const entries = parseList(await port.list());
  const selected = await select(entries, port, parseGit);
  if (!selected) return;
  if (!await port.confirm(selected.source, selected.scope)) {
   port.notify("Uninstall cancelled; nothing was removed.", "info"); return;
  }
  // The confirmation applies only to the exact observed registration set.
  // Re-list and re-identify local paths before invoking the separate Pi process.
  const current = parseList(await port.list());
  if (JSON.stringify(current) !== JSON.stringify(entries)) {
   port.notify("Pi registrations changed after confirmation; nothing was removed.", "warning"); return;
  }
  const verified = await select(current, port, parseGit);
  if (!verified || JSON.stringify(verified) !== JSON.stringify(selected)) return;
  await port.remove(selected.removeSource, selected.scope === "project");
  port.notify(`Removed ${selected.source} (${selected.scope}) from Pi. Restart Pi to unload the extension. Profiles, accounts, global CLI and other packages were left untouched.`, "info");
 } catch {
  port.notify("Could not safely identify or remove the Osdy Pi registration. Check pi list before retrying; no other packages were requested for removal.", "warning");
 }
}

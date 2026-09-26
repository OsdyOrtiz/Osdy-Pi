// Configuration behavior implemented against @juicesharp/rpiv-todo@2.11.0 (MIT); see root LICENSE.
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join } from "node:path";

export const DEFAULT_MAX_WIDGET_LINES = 12;
export const DEFAULT_COLLAPSE_KEY = "ctrl+shift+t";
export const COLLAPSE_KEY_OFF = "off";

export interface TodoConfig {
 maxWidgetLines?: unknown;
 collapseKey?: unknown;
 guidance?: unknown;
}

// The optional sources let tests exercise path selection without touching real home files.
interface ConfigSources {
 home?: string;
 env?: { XDG_CONFIG_HOME?: string };
 readFile?: (path: string) => string;
 warn?: (message: string) => void;
}

export function loadTodoConfig(sources: ConfigSources = {}): TodoConfig {
 const home = sources.home ?? homedir();
 const xdg = (sources.env ?? process.env).XDG_CONFIG_HOME?.trim();
 const expanded = xdg === "~" ? home : xdg?.startsWith("~/") ? join(home, xdg.slice(2)) : xdg;
 const directory = expanded && isAbsolute(expanded) ? expanded : join(home, ".config");
 const primary = join(directory, "rpiv-todo", "config.json");
 const legacy = join(home, ".config", "rpiv-todo", "config.json");
 const read = sources.readFile ?? ((path: string) => readFileSync(path, "utf8"));
 const warn = sources.warn ?? console.warn;
 for (const path of new Set([primary, legacy])) {
  let text: string;
  try { text = read(path); }
  catch (error) {
   if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
   warn(`rpiv-config: invalid JSON at ${path}, using default ({}) — ${String(error)}`);
   return {};
  }
  try {
   const parsed: unknown = JSON.parse(text);
   return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch (error) {
   warn(`rpiv-config: invalid JSON at ${path}, using default ({}) — ${String(error)}`);
   return {};
  }
 }
 return {};
}

export function getMaxWidgetLines(config: TodoConfig = loadTodoConfig()): number {
 const lines = config.maxWidgetLines;
 return typeof lines === "number" && lines >= 3 ? lines : DEFAULT_MAX_WIDGET_LINES;
}

const namedKeys = new Set(["escape", "esc", "enter", "return", "tab", "space", "backspace", "delete", "insert", "clear", "home", "end", "pageup", "pagedown", "up", "down", "left", "right", ...Array.from({ length: 12 }, (_, i) => `f${i + 1}`)]);
const modifiers = new Set(["ctrl", "shift", "alt", "super"]);

export function resolveCollapseKey(config: TodoConfig = loadTodoConfig()): string {
 const spec = typeof config.collapseKey === "string" ? config.collapseKey.trim().toLowerCase() : "";
 if (!spec) return DEFAULT_COLLAPSE_KEY;
 if (spec === COLLAPSE_KEY_OFF) return COLLAPSE_KEY_OFF;
 const parts = spec.split("+");
 const base = parts.pop() ?? "";
 const mods = new Set(parts);
 const printable = base.length === 1 && base.charCodeAt(0) >= 33 && base.charCodeAt(0) <= 126;
 return mods.size === parts.length && parts.every((part) => modifiers.has(part)) && (printable || namedKeys.has(base)) ? spec : DEFAULT_COLLAPSE_KEY;
}

export function validateGuidance(value: unknown): { promptSnippet?: string; promptGuidelines?: string[] } {
 if (value === null || typeof value !== "object" || Array.isArray(value)) return {};
 const fields = value as Record<string, unknown>;
 const result: { promptSnippet?: string; promptGuidelines?: string[] } = {};
 if (typeof fields.promptSnippet === "string" && fields.promptSnippet.length > 0) result.promptSnippet = fields.promptSnippet;
 if (Array.isArray(fields.promptGuidelines) && fields.promptGuidelines.length > 0 && fields.promptGuidelines.every((item: unknown) => typeof item === "string" && item.length > 0)) result.promptGuidelines = fields.promptGuidelines as string[];
 return result;
}

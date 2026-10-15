import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { SpeechSettings } from "./speech-types.js";

export interface SpeechSettingsStore {
 load(): Promise<unknown>;
 save(settings: SpeechSettings): Promise<void>;
}

/** Narrow filesystem seam keeps tests completely independent of personal state. */
export interface SpeechSettingsFileSystem {
 readFile(path: string): Promise<string>;
 mkdir(path: string): Promise<void>;
 writeFile(path: string, content: string): Promise<void>;
 rename(from: string, to: string): Promise<void>;
}

export function defaultSpeechSettings(): SpeechSettings {
 return { version: 1, enabled: false, voice: "Paulina", rate: 180 };
}

export function validateSpeechSettings(value: unknown): SpeechSettings {
 if (typeof value !== "object" || value === null || Array.isArray(value)) {
  throw new Error("Invalid speech settings");
 }
 const record = value as Record<string, unknown>;
 if (Object.keys(record).some((key) => !["version", "enabled", "voice", "rate"].includes(key)) ||
  record.version !== 1 || typeof record.enabled !== "boolean" ||
  typeof record.voice !== "string" || !/^[\p{L}\p{N}][\p{L}\p{N} ()_.-]{0,119}$/u.test(record.voice) ||
  typeof record.rate !== "number" || !Number.isInteger(record.rate) || record.rate < 80 || record.rate > 350) {
  throw new Error("Invalid speech settings: expected v1, boolean enabled, a voice name and rate 80–350");
 }
 return { version: 1, enabled: record.enabled, voice: record.voice, rate: record.rate };
}

const nativeFileSystem: SpeechSettingsFileSystem = {
 readFile: (name) => readFile(name, "utf8"),
 mkdir: async (name) => { await mkdir(name, { recursive: true, mode: 0o700 }); },
 writeFile: (name, content) => writeFile(name, content, { encoding: "utf8", mode: 0o600, flag: "wx" }),
 rename,
};

export function createSpeechSettingsStore(
 agentDir = process.env.PI_CODING_AGENT_DIR?.trim() || path.join(os.homedir(), ".pi", "agent"),
 fs: SpeechSettingsFileSystem = nativeFileSystem,
): SpeechSettingsStore {
 const file = path.join(agentDir, "extensions", "osdy-pi", "speech.json");
 return {
  async load() {
   let content: string;
   try { content = await fs.readFile(file); }
   catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") return defaultSpeechSettings();
    throw error;
   }
   return validateSpeechSettings(JSON.parse(content) as unknown);
  },
  async save(settings) {
   const valid = validateSpeechSettings(settings);
   await fs.mkdir(path.dirname(file));
   const temporary = `${file}.${randomUUID()}.tmp`;
   await fs.writeFile(temporary, `${JSON.stringify(valid, null, 2)}\n`);
   await fs.rename(temporary, file);
  },
 };
}

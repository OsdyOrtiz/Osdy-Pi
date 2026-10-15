import type { SpeechResult, SpeechService, SpeechSettings } from "./speech-types.js";
import type { SpeechAdapter } from "./speech-adapter.js";
import type { SpeechSettingsStore } from "./speech-settings.js";
// @ts-expect-error Native Node tests import TypeScript sources.
import { createLocalSpeechAdapter } from "./kokoro-speech-adapter.ts";
// @ts-expect-error Native Node tests import TypeScript sources.
import { createSpeechSettingsStore, defaultSpeechSettings, validateSpeechSettings } from "./speech-settings.ts";
// @ts-expect-error Native Node tests import TypeScript sources.
import { normalizeSpeechText } from "./speech-text.ts";

export interface SpeechServiceOptions {
 agentDir?: string;
 adapter?: SpeechAdapter;
 store?: SpeechSettingsStore;
 onError?: (error: Error) => void;
}

function asError(value: unknown): Error {
 return value instanceof Error ? value : new Error(String(value));
}

function resolveVoice(installed: readonly string[], requested: string): string | undefined {
 return installed.find((voice) => voice === requested) ??
  installed.find((voice) => voice.startsWith(`${requested} (`) && voice.endsWith(")"));
}

export function createSpeechService(options: SpeechServiceOptions = {}): SpeechService {
 const adapter = options.adapter ?? createLocalSpeechAdapter();
 const store = options.store ?? createSpeechSettingsStore(options.agentDir);
 let generation = 0;
 let active: AbortController | undefined;
 let activeKind: "narration" | "preview" | undefined;
 const catalogs = new Set<AbortController>();
 let configureQueue = Promise.resolve();
 const load = async (): Promise<SpeechSettings> => validateSpeechSettings(await store.load());
 const stop = (): void => {
  generation++;
  active?.abort();
  active = undefined;
  activeKind = undefined;
  for (const catalog of catalogs) catalog.abort();
  catalogs.clear();
 };
 const report = (error: unknown): void => {
  // A notification callback must not create an unhandled playback rejection.
  try { options.onError?.(asError(error)); } catch { /* Consumer reporting is best effort. */ }
 };

 const launch = async (text: string, request: { voice?: string; automatic?: boolean } = {}): Promise<SpeechResult> => {
  stop();
  const current = generation;
  const controller = new AbortController();
  active = controller;
  activeKind = request.voice === undefined ? "narration" : "preview";
  const stale = (): boolean => generation !== current || controller.signal.aborted;
  try {
   if (!adapter.available()) return { kind: "unavailable" };
   if (request.voice !== undefined) validateSpeechSettings({ ...defaultSpeechSettings(), voice: request.voice });
   const prose = normalizeSpeechText(text);
   if (!prose) return { kind: "empty" };
   await configureQueue;
   if (stale()) return { kind: "cancelled" };
   const settings = await load();
   if (stale()) return { kind: "cancelled" };
   if (request.automatic && !settings.enabled) return { kind: "disabled" };
   const installed = await adapter.voices(controller.signal);
   if (stale()) return { kind: "cancelled" };
   // Draft previews require an exact catalog choice; narration retains the Paulina alias.
   const requested = request.voice ?? settings.voice;
   const voice = request.voice === undefined ? resolveVoice(installed, requested) : installed.find(voice => voice === requested);
   if (!voice) return { kind: "error", message: `Speech voice ${requested} is not installed; no substitute was used` };
   const playback = await adapter.speak(prose, voice, settings.rate, controller.signal);
   void playback.done.catch((error: unknown) => { if (!stale()) report(error); });
   return { kind: stale() ? "cancelled" : "started" };
  } catch (error) {
   return stale() ? { kind: "cancelled" } : { kind: "error", message: asError(error).message };
  }
 };

 return {
  available: () => adapter.available(),
  async voices() {
   if (!adapter.available()) return [];
   const controller = new AbortController();
   catalogs.add(controller);
   try {
    const installed = await adapter.voices(controller.signal);
    if (controller.signal.aborted) throw new Error("Voice discovery cancelled");
    const supported = installed.filter(voice => {
     try { validateSpeechSettings({ ...defaultSpeechSettings(), voice }); return true; }
     catch { return false; }
    });
    return [...new Set(supported)].sort((left, right) => left.localeCompare(right));
   } finally { catalogs.delete(controller); }
  },
  async settings() {
   await configureQueue;
   return load();
  },
  async configure(patch) {
   if (typeof patch !== "object" || patch === null || Array.isArray(patch) ||
    Object.keys(patch).some((key) => !["enabled", "voice", "rate"].includes(key))) {
    throw new Error("Invalid speech settings patch");
   }
   // Validate and snapshot before waiting so callers cannot mutate a queued patch.
   const snapshot = { ...patch };
   validateSpeechSettings({ ...defaultSpeechSettings(), ...snapshot });
   if (snapshot.enabled === false) stop();
   const update = configureQueue.then(async () => {
    const settings = validateSpeechSettings({ ...await load(), ...snapshot });
    await store.save(settings);
    return settings;
   });
   configureQueue = update.then(() => {}, () => {});
   return update;
  },
  preview: voice => launch(["Kokoro Dora", "Kokoro Alex", "Kokoro Santa"].includes(voice)
   ? "¡Hola! Esta es una muestra de mi voz en Osdy Pi. Puedo leer tus respuestas en español, con claridad y naturalidad."
   : "Hello! This is a preview of my voice in Osdy Pi.", { voice }),
  stopPreview() {
   if (activeKind !== "preview") return;
   generation++;
   active?.abort();
   active = undefined;
   activeKind = undefined;
  },
  stop,
  speak: (text, speakOptions) => launch(text, speakOptions),
 };
}

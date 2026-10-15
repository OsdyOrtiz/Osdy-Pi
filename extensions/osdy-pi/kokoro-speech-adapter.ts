import type { SpeechAdapter } from "./speech-adapter.js";
// @ts-expect-error Native Node tests import TypeScript sources.
import { createNativeSpeechAdapter } from "./speech-adapter.ts";
// @ts-expect-error Native Node tests import TypeScript sources.
import { validateSpeechSettings } from "./speech-settings.ts";
// @ts-expect-error Native Node tests import TypeScript sources.
import { createKokoroAudioPlayer, MAX_KOKORO_WAV_BYTES, validateKokoroWav } from "./kokoro-audio-player.ts";
import type { KokoroAudioPlayer } from "./kokoro-audio-player.js";

const VOICES = new Map([
 ["Kokoro Dora", "ef_dora"],
 ["Kokoro Alex", "em_alex"],
 ["Kokoro Santa", "em_santa"],
]);
const SYNTHESIS_TIMEOUT_MS = 120_000;
export interface KokoroSpeechAdapterOptions {
 platform?: string;
 /** Base origin only. Unknown configuration is validated before sending prose. */
 url?: unknown;
 fetch?: (url: string, init: RequestInit) => Promise<Response>;
 player?: KokoroAudioPlayer;
}
export interface LocalSpeechAdapterOptions extends KokoroSpeechAdapterOptions {
 native?: SpeechAdapter;
}

function endpoint(value: unknown): string {
 const invalid = (): never => { throw new Error("Kokoro URL must be a literal HTTP loopback origin (127.0.0.1 or [::1])"); };
 if (typeof value !== "string" || !/^http:\/\/(?:127\.0\.0\.1|\[::1\])(?::[0-9]+)?\/?$/u.test(value)) return invalid();
 let url: URL;
 try { url = new URL(value); } catch { return invalid(); }
 if (url.port === "0") return invalid();
 return `${url.origin}/v1/audio/speech`;
}
function cancelled(): Error { return new Error("Speech cancelled"); }
function setupError(): Error {
 return new Error("Kokoro synthesis failed. Start the local MLX-Audio server with mlx-community/Kokoro-82M-bf16; check local Kokoro setup and OSDY_PI_KOKORO_URL.");
}

async function readWav(response: Response, signal: AbortSignal): Promise<Uint8Array> {
 if (!response.ok || response.redirected || !response.body) {
  await response.body?.cancel();
  throw setupError();
 }
 const declared = response.headers.get("content-length");
 if (declared !== null && (!/^\d+$/u.test(declared) || Number(declared) > MAX_KOKORO_WAV_BYTES)) {
  await response.body.cancel();
  throw new Error("Invalid or oversized Kokoro WAV audio");
 }
 const reader = response.body.getReader();
 const chunks: Uint8Array[] = [];
 let size = 0;
 const abort = (): void => { void reader.cancel().catch(() => {}); };
 signal.addEventListener("abort", abort, {once: true});
 try {
  if (signal.aborted) throw cancelled();
  while (true) {
   const chunk = await reader.read();
   if (signal.aborted) throw cancelled();
   if (chunk.done) break;
   size += chunk.value.byteLength;
   if (size > MAX_KOKORO_WAV_BYTES) throw new Error("Invalid or oversized Kokoro WAV audio");
   chunks.push(chunk.value);
  }
  const audio = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { audio.set(chunk, offset); offset += chunk.byteLength; }
  validateKokoroWav(audio);
  return audio;
 } finally {
  signal.removeEventListener("abort", abort);
  void reader.cancel().catch(() => {});
 }
}

export function createKokoroSpeechAdapter(options: KokoroSpeechAdapterOptions = {}): SpeechAdapter {
 const platform = options.platform ?? process.platform;
 const transport = options.fetch ?? fetch;
 const player = options.player ?? createKokoroAudioPlayer();
 // Reading configuration is inert: invalid Kokoro configuration cannot disable native speech.
 const baseUrl: unknown = options.url !== undefined ? options.url : process.env.OSDY_PI_KOKORO_URL ?? "http://127.0.0.1:8000";
 return {
  available: () => platform === "darwin",
  voices: (signal) => signal.aborted ? Promise.reject(cancelled()) : Promise.resolve(platform === "darwin" ? [...VOICES.keys()] : []),
  async speak(text, voice, rate, signal) {
   if (signal.aborted) throw cancelled();
   if (platform !== "darwin") throw new Error("Kokoro playback is only available on macOS");
   validateSpeechSettings({version: 1, enabled: false, voice, rate});
   const mapped = VOICES.get(voice);
   if (!mapped) throw new Error("Unknown Kokoro voice");
   const url = endpoint(baseUrl);
   const controller = new AbortController();
   let rejectCancelled!: (error: Error) => void;
   const interrupted = new Promise<never>((_, reject) => { rejectCancelled = reject; });
   const abort = (): void => { controller.abort(); rejectCancelled(cancelled()); };
   signal.addEventListener("abort", abort, {once: true});
   const timeout = setTimeout(() => {
    controller.abort();
    rejectCancelled(new Error("Kokoro synthesis timed out after 120 seconds. Check the local MLX-Audio setup."));
   }, SYNTHESIS_TIMEOUT_MS);
   let audio: Uint8Array;
   try {
    if (signal.aborted) abort();
    const synthesis = (async (): Promise<Uint8Array> => {
     if (controller.signal.aborted) throw cancelled();
     const response = await transport(url, {
      method: "POST", redirect: "error", signal: controller.signal,
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({model: "mlx-community/Kokoro-82M-bf16", input: text,
       voice: mapped, lang_code: "e", response_format: "wav", stream: false,
       // Existing validated 80–350 wpm maps to explicit speed bounds 4/9–35/18.
       speed: rate / 180}),
     });
     if (controller.signal.aborted) { void response.body?.cancel().catch(() => {}); throw cancelled(); }
     return readWav(response, controller.signal);
    })();
    audio = await Promise.race([synthesis, interrupted]);
   } catch {
    if (signal.aborted) throw cancelled();
    if (controller.signal.aborted) throw new Error("Kokoro synthesis timed out after 120 seconds. Check the local MLX-Audio setup.");
    throw setupError();
   } finally {
    clearTimeout(timeout);
    signal.removeEventListener("abort", abort);
   }
   if (signal.aborted) throw cancelled();
   return player.play(audio, signal);
  },
 };
}

/** Native speech remains independent: no probing, fallback, settings or lifecycle ownership. */
export function createLocalSpeechAdapter(options: LocalSpeechAdapterOptions = {}): SpeechAdapter {
 const native = options.native ?? createNativeSpeechAdapter(options);
 const kokoro = createKokoroSpeechAdapter(options);
 return {
  available: () => native.available() || kokoro.available(),
  async voices(signal) {
   const voices = await native.voices(signal);
   return [...voices, ...await kokoro.voices(signal)];
  },
  speak: (text, voice, rate, signal) => VOICES.has(voice)
   ? kokoro.speak(text, voice, rate, signal)
   : native.speak(text, voice, rate, signal),
 };
}

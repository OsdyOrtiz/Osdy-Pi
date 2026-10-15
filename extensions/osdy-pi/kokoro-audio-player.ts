import { spawn } from "node:child_process";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { SpeechPlayback } from "./speech-adapter.js";

export const MAX_KOKORO_WAV_BYTES = 25 * 1024 * 1024;
export interface KokoroAudioPlayer {
 play(audio: Uint8Array, signal: AbortSignal): Promise<SpeechPlayback>;
}
export interface KokoroAudioProcess {
 on(event: "spawn", listener: () => void): this;
 on(event: "error", listener: (error: Error) => void): this;
 on(event: "close", listener: (code: number | null) => void): this;
 kill(signal: "SIGKILL"): boolean;
}
export interface KokoroAudioFileSystem {
 createDirectory(): Promise<string>;
 write(path: string, audio: Uint8Array): Promise<void>;
 remove(directory: string): Promise<void>;
}
export interface KokoroAudioPlayerOptions {
 fs?: KokoroAudioFileSystem;
 spawn?: (command: string, args: readonly string[]) => KokoroAudioProcess;
}

/** Require a complete, nonempty PCM/IEEE-float RIFF WAVE, not a MIME claim. */
export function validateKokoroWav(audio: Uint8Array): void {
 const invalid = (): never => { throw new Error("Invalid or oversized Kokoro WAV audio"); };
 if (audio.byteLength < 44 || audio.byteLength > MAX_KOKORO_WAV_BYTES) invalid();
 const bytes = Buffer.from(audio.buffer, audio.byteOffset, audio.byteLength);
 if (bytes.toString("latin1", 0, 4) !== "RIFF" || bytes.toString("latin1", 8, 12) !== "WAVE" ||
  bytes.readUInt32LE(4) !== bytes.length - 8) invalid();
 let format = false;
 let dataSize = 0;
 let alignment = 0;
 let offset = 12;
 while (offset + 8 <= bytes.length) {
  const id = bytes.toString("latin1", offset, offset + 4);
  const size = bytes.readUInt32LE(offset + 4);
  const start = offset + 8;
  const end = start + size;
  if (end > bytes.length) invalid();
  if (id === "fmt ") {
   if (format || size < 16) invalid();
   const encoding = bytes.readUInt16LE(start);
   const channels = bytes.readUInt16LE(start + 2);
   const sampleRate = bytes.readUInt32LE(start + 4);
   const byteRate = bytes.readUInt32LE(start + 8);
   alignment = bytes.readUInt16LE(start + 12);
   const bits = bytes.readUInt16LE(start + 14);
   if (![1, 3].includes(encoding) || channels < 1 || channels > 2 || sampleRate < 8000 || sampleRate > 192000 ||
    !(encoding === 3 ? [32, 64] : [8, 16, 24, 32]).includes(bits) ||
    alignment !== channels * bits / 8 || byteRate !== sampleRate * alignment) invalid();
   format = true;
  }
  if (id === "data") {
   if (!format || dataSize !== 0 || size === 0 || size % alignment !== 0) invalid();
   dataSize = size;
  }
  offset = end + size % 2;
 }
 if (!format || dataSize === 0 || offset !== bytes.length) invalid();
}

function cancelled(): Error { return new Error("Speech cancelled"); }
function checkAbort(signal: AbortSignal): void { if (signal.aborted) throw cancelled(); }

const privateFileSystem: KokoroAudioFileSystem = {
 createDirectory: () => mkdtemp(join(tmpdir(), "osdy-kokoro-")),
 write: (path, audio) => writeFile(path, audio, {mode: 0o600, flag: "wx"}),
 remove: (directory) => rm(directory, {recursive: true, force: true}),
};

export function createKokoroAudioPlayer(options: KokoroAudioPlayerOptions = {}): KokoroAudioPlayer {
 const fs = options.fs ?? privateFileSystem;
 const spawnProcess = options.spawn ?? ((command, args) => spawn(command, [...args], {shell: false, stdio: "ignore"}));
 return {
  async play(audio, signal) {
   checkAbort(signal);
   validateKokoroWav(audio);
   let directory: string | undefined;
   const cleanup = async (): Promise<void> => {
    if (directory === undefined) return;
    try { await fs.remove(directory); }
    catch { throw new Error("Audio cleanup failed"); }
   };
   let child: KokoroAudioProcess;
   try {
    directory = await fs.createDirectory();
    checkAbort(signal);
    const file = join(directory, "speech.wav");
    await fs.write(file, audio);
    checkAbort(signal);
    child = spawnProcess("/usr/bin/afplay", [file]);
   } catch {
    await cleanup();
    throw signal.aborted ? cancelled() : new Error("Audio playback failed");
   }

   let resolveLaunch!: () => void;
   let rejectLaunch!: (error: Error) => void;
   let resolveExit!: () => void;
   let rejectExit!: (error: Error) => void;
   let failure: Error | undefined;
   let closed = false;
   let killed = false;
   const launched = new Promise<void>((resolve, reject) => { resolveLaunch = resolve; rejectLaunch = reject; });
   const exited = new Promise<void>((resolve, reject) => { resolveExit = resolve; rejectExit = reject; });
   void launched.catch(() => {});
   const abort = (): void => {
    if (closed || failure) return;
    failure = cancelled();
    rejectLaunch(failure);
    if (!killed) { killed = true; child.kill("SIGKILL"); }
   };
   child.on("spawn", () => {
    if (!failure && !signal.aborted) resolveLaunch();
   });
   child.on("error", () => {
    if (closed || failure) return;
    failure = new Error("Audio playback failed");
    rejectLaunch(failure);
    if (!killed) { killed = true; child.kill("SIGKILL"); }
   });
   child.on("close", (code) => {
    if (closed) return;
    closed = true;
    const error = signal.aborted ? cancelled() : failure ?? (code === 0 ? undefined : new Error("Audio playback failed"));
    if (error) { rejectLaunch(error); rejectExit(error); }
    else { resolveLaunch(); resolveExit(); }
   });
   signal.addEventListener("abort", abort, {once: true});
   if (signal.aborted) abort();
   // Cleanup is owned by completion, never by the launch event or kill request.
   const done = (async (): Promise<void> => {
    try { await exited; }
    finally {
     try { await cleanup(); }
     finally { signal.removeEventListener("abort", abort); }
    }
    checkAbort(signal);
   })();
   void done.catch(() => {});
   try { await launched; }
   catch (error) { await done.catch(() => {}); throw error; }
   return {done};
  },
 };
}

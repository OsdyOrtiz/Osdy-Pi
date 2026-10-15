import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
// @ts-expect-error Native Node tests import TypeScript sources.
import { normalizeSpeechText } from "./speech-text.ts";
// @ts-expect-error Native Node tests import TypeScript sources.
import { validateSpeechSettings } from "./speech-settings.ts";

export interface SpeechPlayback { done: Promise<void>; }
export interface SpeechAdapter {
 available(): boolean;
 voices(signal: AbortSignal): Promise<readonly string[]>;
 speak(text: string, voice: string, rate: number, signal: AbortSignal): Promise<SpeechPlayback>;
}
export interface SpeechProcess extends Pick<ChildProcessWithoutNullStreams, "stdin" | "stdout" | "stderr" | "kill"> {
 on(event: "spawn", listener: () => void): this;
 on(event: "error", listener: (error: Error) => void): this;
 on(event: "close", listener: (code: number | null) => void): this;
}
export interface NativeSpeechAdapterOptions {
 platform?: string;
 spawn?: (command: string, args: readonly string[]) => SpeechProcess;
}

function cancelled(): Error { return new Error("Speech cancelled"); }

export function createNativeSpeechAdapter(options: NativeSpeechAdapterOptions = {}): SpeechAdapter {
 const platform = options.platform ?? process.platform;
 const spawnProcess: (command: string, args: readonly string[]) => SpeechProcess = options.spawn ??
  ((command, args) => spawn(command, [...args], { shell: false, stdio: ["pipe", "pipe", "pipe"] }));
 const available = (): boolean => platform === "darwin";

 function start(args: readonly string[], text: string, signal: AbortSignal): {
  launched: Promise<void>; done: Promise<void>; output: () => string;
 } {
  if (!available()) throw new Error("Speech is only available on macOS");
  if (signal.aborted) throw cancelled();
  const child = spawnProcess("/usr/bin/say", args);
  let stdout = "";
  let stderr = "";
  let settled = false;
  let resolveLaunch!: () => void;
  let rejectLaunch!: (error: Error) => void;
  let resolveDone!: () => void;
  let rejectDone!: (error: Error) => void;
  const launched = new Promise<void>((resolve, reject) => { resolveLaunch = resolve; rejectLaunch = reject; });
  const done = new Promise<void>((resolve, reject) => { resolveDone = resolve; rejectDone = reject; });
  // Both promises can reject before their caller has received the playback handle.
  void launched.catch(() => {});
  void done.catch(() => {});
  const finish = (error?: Error): void => {
   if (settled) return;
   settled = true;
   signal.removeEventListener("abort", abort);
   if (error) { rejectLaunch(error); rejectDone(error); }
   else { resolveLaunch(); resolveDone(); }
  };
  const fail = (error: Error): void => {
   if (settled) return;
   finish(error);
   child.stdin.destroy();
   child.stdout.destroy();
   child.stderr.destroy();
   child.kill("SIGTERM");
  };
  const abort = (): void => { fail(cancelled()); };
  child.on("error", (error) => { fail(error); });
  child.stdin.on("error", (error: Error) => { fail(error); });
  child.stdout.on("error", (error: Error) => { fail(error); });
  child.stderr.on("error", (error: Error) => { fail(error); });
  child.stdout.on("data", (chunk: Buffer) => {
   stdout += chunk.toString("utf8").slice(0, Math.max(0, 65536 - stdout.length));
  });
  child.stderr.on("data", (chunk: Buffer) => {
   stderr += chunk.toString("utf8").slice(0, Math.max(0, 2048 - stderr.length));
  });
  child.on("spawn", () => {
   if (settled || signal.aborted) return;
   resolveLaunch();
   // Response prose never appears in process arguments or a shell command.
   child.stdin.end(text);
  });
  child.on("close", (code) => {
   finish(signal.aborted ? cancelled() : code === 0 ? undefined : new Error(`Speech process failed (${String(code)}): ${stderr.trim()}`));
  });
  signal.addEventListener("abort", abort, { once: true });
  if (signal.aborted) abort();
  return { launched, done, output: () => stdout };
 }

 return {
  available,
  async voices(signal) {
   const process = start(["-v", "?"], "", signal);
   await process.done;
   return process.output().split(/\r?\n/u).flatMap((line) => {
    const match = /^(.+?)\s+[a-z]{2,3}[_-][A-Z]{2}\s+(?:#|$)/u.exec(line);
    return match?.[1]?.trim() ? [match[1].trim()] : [];
   });
  },
  async speak(text, voice, rate, signal) {
   validateSpeechSettings({ version: 1, enabled: false, voice, rate });
   const process = start(["-v", voice, "-r", String(rate)], normalizeSpeechText(text), signal);
   await process.launched;
   return { done: process.done };
  },
 };
}

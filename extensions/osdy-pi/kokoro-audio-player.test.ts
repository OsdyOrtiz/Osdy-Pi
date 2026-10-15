import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
// @ts-expect-error Native Node tests import TypeScript sources.
import { createKokoroAudioPlayer } from "./kokoro-audio-player.ts";

export function wav(): Uint8Array {
 const bytes = Buffer.alloc(46);
 bytes.write("RIFF"); bytes.writeUInt32LE(38, 4); bytes.write("WAVEfmt ", 8);
 bytes.writeUInt32LE(16, 16); bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(1, 22);
 bytes.writeUInt32LE(24000, 24); bytes.writeUInt32LE(48000, 28);
 bytes.writeUInt16LE(2, 32); bytes.writeUInt16LE(16, 34);
 bytes.write("data", 36); bytes.writeUInt32LE(2, 40);
 return bytes;
}
class Child extends EventEmitter {
 kills: string[] = [];
 kill(signal: string): boolean { this.kills.push(signal); return true; }
}
function fixture() {
 const child = new Child();
 const calls: unknown[] = [];
 let create = (): Promise<string> => Promise.resolve("/private/test");
 let write = (): Promise<void> => Promise.resolve();
 let remove = (): Promise<void> => Promise.resolve();
 let spawnHook = (): void => {};
 const player = createKokoroAudioPlayer({
  fs: {
   createDirectory: () => { calls.push("create"); return create(); },
   write: (path, audio) => { calls.push(["write", path, audio.byteLength]); return write(); },
   remove: (directory) => { calls.push(["remove", directory]); return remove(); },
  },
  spawn: (command, args) => { calls.push([command, args]); spawnHook(); return child; },
 });
 return { player, child, calls, setSpawn: (fn: typeof spawnHook) => { spawnHook = fn; }, setCreate: (fn: typeof create) => { create = fn; },
  setWrite: (fn: typeof write) => { write = fn; }, setRemove: (fn: typeof remove) => { remove = fn; } };
}
async function tick(): Promise<void> { await new Promise<void>((resolve) => setImmediate(resolve)); }
void test("player separates launch from completion and cleans only after termination", async () => {
 const f = fixture(); let launched = false;
 const pending = f.player.play(wav(), new AbortController().signal).then((value) => { launched = true; return value; });
 await tick(); assert.equal(launched, false);
 assert.deepEqual(f.calls, ["create", ["write", "/private/test/speech.wav", 46], ["/usr/bin/afplay", ["/private/test/speech.wav"]]]);
 f.child.emit("spawn"); const playback = await pending;
 assert.equal(f.calls.length, 3);
 f.child.emit("close", 0); await playback.done;
 assert.deepEqual(f.calls[3], ["remove", "/private/test"]);
});
void test("malformed/empty/oversized WAV never creates or spawns", async () => {
 for (const audio of [new Uint8Array(), new Uint8Array(44), new Uint8Array(25 * 1024 * 1024 + 1), wav().slice(0, 45)]) {
  const f = fixture(); await assert.rejects(f.player.play(audio, new AbortController().signal), /WAV/i);
  assert.deepEqual(f.calls, []);
 }
});
void test("RIFF metadata and chunk boundaries are validated before any filesystem call", async () => {
 for (const mutate of [
  (audio: Buffer) => audio.writeUInt32LE(999, 4),
  (audio: Buffer) => audio.writeUInt32LE(999, 16),
  (audio: Buffer) => audio.writeUInt16LE(99, 20),
  (audio: Buffer) => audio.writeUInt16LE(0, 22),
  (audio: Buffer) => audio.writeUInt32LE(0, 24),
  (audio: Buffer) => audio.writeUInt32LE(0, 28),
  (audio: Buffer) => audio.writeUInt16LE(0, 32),
  (audio: Buffer) => audio.writeUInt16LE(0, 34),
  (audio: Buffer) => audio.writeUInt32LE(0, 40),
 ]) {
  const f = fixture(); const audio = Buffer.from(wav()); mutate(audio);
  await assert.rejects(f.player.play(audio, new AbortController().signal), /WAV/); assert.deepEqual(f.calls, []);
 }
});
void test("non-ASCII lookalike RIFF bytes must not pass envelope validation", async () => {
 const f = fixture(); const audio = Buffer.from(wav()); audio[0] = 0xd2;
 f.setSpawn(() => { queueMicrotask(() => { f.child.emit("spawn"); f.child.emit("close", 0); }); });
 await assert.rejects(f.player.play(audio, new AbortController().signal), /WAV/);
 assert.deepEqual(f.calls, []);
});
void test("pre-abort has no effects; synchronous spawn failure and abort inside spawn clean safely", async () => {
 const pre = fixture(); const controller = new AbortController(); controller.abort();
 await assert.rejects(pre.player.play(wav(), controller.signal), /cancel/i); assert.deepEqual(pre.calls, []);
 const failed = fixture(); failed.setSpawn(() => { throw new Error("private prose"); });
 await assert.rejects(failed.player.play(wav(), new AbortController().signal), /Audio playback failed/);
 assert.deepEqual(failed.calls.at(-1), ["remove", "/private/test"]);
 const f = fixture(); const during = new AbortController(); f.setSpawn(() => { during.abort(); });
 const pending = f.player.play(wav(), during.signal); const rejection = assert.rejects(pending, /cancel/i);
 await tick(); assert.deepEqual(f.child.kills, ["SIGKILL"]); assert.equal(f.calls.length, 3);
 f.child.emit("close", null); await rejection; assert.equal(f.calls.length, 4);
});
void test("abort while creating or writing prevents spawn and still cleans", async () => {
 for (const stage of ["create", "write"]) {
  const f = fixture(); const controller = new AbortController();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  if (stage === "create") f.setCreate(async () => { await gate; return "/private/test"; });
  else f.setWrite(() => gate);
  const pending = f.player.play(wav(), controller.signal); await tick();
  controller.abort(); controller.abort(); release();
  await assert.rejects(pending, /cancel/i);
  assert.equal(f.calls.some((call) => Array.isArray(call) && call[0] === "/usr/bin/afplay"), false);
  assert.deepEqual(f.calls.at(-1), ["remove", "/private/test"]);
 }
});
void test("abort before spawn and during playback kills once, waits for close, then cleans", async () => {
 for (const active of [false, true]) {
  const f = fixture(); const controller = new AbortController();
  const pending = f.player.play(wav(), controller.signal); await tick();
  let done: Promise<unknown> = pending;
  if (active) { f.child.emit("spawn"); done = (await pending).done; }
  const rejection = assert.rejects(done, /cancel/i);
  controller.abort(); controller.abort(); await tick();
  assert.deepEqual(f.child.kills, ["SIGKILL"]); assert.equal(f.calls.length, 3);
  f.child.emit("spawn"); f.child.emit("close", null); await rejection;
  assert.deepEqual(f.calls.at(-1), ["remove", "/private/test"]);
  f.child.emit("error", new Error("late secret"));
 }
});
void test("process and filesystem failures stay private and clean artifacts", async () => {
 const f = fixture(); const pending = f.player.play(wav(), new AbortController().signal); await tick();
 const rejection = assert.rejects(pending, /Audio playback failed/);
 f.child.emit("error", new Error("private response prose"));
 assert.equal(f.calls.length, 3); f.child.emit("close", -1); await rejection;
 assert.equal(f.calls.length, 4);
 const failed = fixture(); failed.setWrite(() => Promise.reject(new Error("private path")));
 await assert.rejects(failed.player.play(wav(), new AbortController().signal), /Audio playback failed/);
 assert.deepEqual(failed.calls.at(-1), ["remove", "/private/test"]);
});
void test("abort during cleanup rejects completion and cleanup failure is observable", async () => {
 const f = fixture(); const controller = new AbortController(); let release!: () => void;
 f.setRemove(() => new Promise<void>((resolve) => { release = resolve; }));
 const pending = f.player.play(wav(), controller.signal); await tick(); f.child.emit("spawn");
 const playback = await pending; f.child.emit("close", 0); await tick(); controller.abort(); release();
 await assert.rejects(playback.done, /cancel/i);
 const failed = fixture(); failed.setRemove(() => Promise.reject(new Error("secret path")));
 const next = failed.player.play(wav(), new AbortController().signal); await tick(); failed.child.emit("spawn");
 const handle = await next; failed.child.emit("close", 1);
 await assert.rejects(handle.done, /Audio cleanup failed/);
});

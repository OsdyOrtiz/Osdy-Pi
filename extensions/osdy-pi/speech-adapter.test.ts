import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import test from "node:test";
// @ts-expect-error Native Node tests import TypeScript sources.
import { createNativeSpeechAdapter } from "./speech-adapter.ts";

class FakeProcess extends EventEmitter {
 stdin = new PassThrough();
 stdout = new PassThrough();
 stderr = new PassThrough();
 killed = false;
 kill(): boolean { this.killed = true; return true; }
}
function fixture(platform = "darwin") {
 const children: FakeProcess[] = [];
 const calls: Array<{ command: string; args: readonly string[] }> = [];
 const adapter = createNativeSpeechAdapter({platform, spawn: (command, args) => {
  calls.push({command, args});
  const child = new FakeProcess(); children.push(child);
  queueMicrotask(() => child.emit("spawn"));
  return child;
 }});
 return { adapter, children, calls };
}
void test("native adapter uses fixed executable/arguments and stdin, never shell text", async () => {
 const f = fixture();
 const controller = new AbortController();
 const listing = f.adapter.voices(controller.signal);
 const child = f.children[0]!;
 child.stdout.write("Paulina (Enhanced) es_MX # Hola\nJorge es_ES # Hola\n");
 child.emit("close", 0);
 assert.deepEqual(await listing, ["Paulina (Enhanced)", "Jorge"]);
 const playback = await f.adapter.speak("hello; $(bad) [[rate 999]]", "Paulina", 180, controller.signal);
 assert.deepEqual(f.calls, [{command: "/usr/bin/say", args: ["-v", "?"]}, {command: "/usr/bin/say", args: ["-v", "Paulina", "-r", "180"]}]);
 const input: unknown = f.children[1]!.stdin.read();
 assert.equal(Buffer.isBuffer(input) ? input.toString() : input, "hello; $(bad)");
 f.children[1]!.emit("close", 0);
 await playback.done;
});
void test("unsupported platform never spawns and invalid arguments reject", async () => {
 const f = fixture("linux");
 assert.equal(f.adapter.available(), false);
 await assert.rejects(f.adapter.speak("hi", "Paulina", 180, new AbortController().signal));
 assert.equal(f.calls.length, 0);
 const mac = fixture();
 await assert.rejects(mac.adapter.speak("hi", "-bad", 180, new AbortController().signal));
 await assert.rejects(mac.adapter.speak("hi", "Paulina", 0, new AbortController().signal));
 assert.equal(mac.calls.length, 0);
});
void test("spawn ENOENT, EPIPE and bounded stderr failures are caught", async () => {
 const f = fixture();
 const pending = f.adapter.voices(new AbortController().signal);
 f.children[0]!.emit("error", Object.assign(new Error("missing say"), {code: "ENOENT"}));
 await assert.rejects(pending, /missing say/);
 const playback = await f.adapter.speak("hi", "Paulina", 180, new AbortController().signal);
 f.children[1]!.stdin.emit("error", Object.assign(new Error("broken pipe"), {code: "EPIPE"}));
 await assert.rejects(playback.done, /broken pipe/);
 const failed = await f.adapter.speak("hi", "Paulina", 180, new AbortController().signal);
 f.children[2]!.stderr.write("x".repeat(100000));
 f.children[2]!.emit("close", 1);
 await assert.rejects(failed.done, (error: unknown) => error instanceof Error && error.message.length < 5000);
});
void test("voice discovery cancellation and synchronous spawn failure reject safely", async () => {
 const f = fixture();
 const controller = new AbortController();
 const pending = f.adapter.voices(controller.signal);
 controller.abort();
 await assert.rejects(pending, /cancel/i);
 assert.equal(f.children[0]!.killed, true);
 const adapter = createNativeSpeechAdapter({platform: "darwin", spawn: () => { throw new Error("spawn denied"); }});
 await assert.rejects(adapter.speak("hello", "Paulina", 180, new AbortController().signal), /spawn denied/);
});
void test("abort kills process, destroys input and settles even without close", async () => {
 const f = fixture();
 const controller = new AbortController();
 const playback = await f.adapter.speak("hi", "Paulina", 180, controller.signal);
 controller.abort();
 await assert.rejects(playback.done, /cancel/i);
 assert.equal(f.children[0]!.killed, true);
 assert.equal(f.children[0]!.stdin.destroyed, true);
 // Late process/pipe errors must remain handled after cancellation.
 f.children[0]!.stdin.emit("error", new Error("late pipe"));
 f.children[0]!.emit("error", new Error("late process"));
 const pre = new AbortController(); pre.abort();
 await assert.rejects(f.adapter.voices(pre.signal), /cancel/i);
 assert.equal(f.calls.length, 1);
});

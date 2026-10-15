import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Native Node tests import TypeScript sources.
import { createKokoroSpeechAdapter, createLocalSpeechAdapter } from "./kokoro-speech-adapter.ts";
import type { SpeechAdapter } from "./speech-adapter.js";

function wav(): Uint8Array<ArrayBuffer> {
 const bytes = Buffer.alloc(46);
 bytes.write("RIFF"); bytes.writeUInt32LE(38, 4); bytes.write("WAVEfmt ", 8);
 bytes.writeUInt32LE(16, 16); bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(1, 22);
 bytes.writeUInt32LE(24000, 24); bytes.writeUInt32LE(48000, 28);
 bytes.writeUInt16LE(2, 32); bytes.writeUInt16LE(16, 34);
 bytes.write("data", 36); bytes.writeUInt32LE(2, 40); return new Uint8Array(bytes);
}
function fixture(url: unknown = "http://127.0.0.1:8000", platform = "darwin") {
 const requests: Array<{ url: string; init: RequestInit }> = [];
 const plays: Uint8Array[] = [];
 let respond: (init: RequestInit) => Promise<Response> = () => Promise.resolve(new Response(wav()));
 const adapter = createKokoroSpeechAdapter({ platform, url,
  fetch: (url, init) => { requests.push({url, init}); return respond(init); },
  player: { play: (audio) => { plays.push(audio); return Promise.resolve({ done: Promise.resolve() }); } },
 });
 return { adapter, requests, plays, setResponse: (fn: typeof respond) => { respond = fn; } };
}
void test("construction and listing never fetch; fixed Spanish voices and full prose payload", async () => {
 const f = fixture(); const signal = new AbortController().signal;
 assert.equal(f.adapter.available(), true); assert.deepEqual(f.requests, []);
 assert.deepEqual(await f.adapter.voices(signal), ["Kokoro Dora", "Kokoro Alex", "Kokoro Santa"]);
 assert.deepEqual(f.requests, []);
 for (const [voice, id] of [["Kokoro Dora", "ef_dora"], ["Kokoro Alex", "em_alex"], ["Kokoro Santa", "em_santa"]]) {
  const text = "Buenos días. ".repeat(2000);
  await (await f.adapter.speak(text, voice!, 270, signal)).done;
  const request: {url: string; init: RequestInit} = f.requests.at(-1)!;
  assert.equal(request.url, "http://127.0.0.1:8000/v1/audio/speech");
  assert.equal(request.init.redirect, "error"); assert.equal(request.init.method, "POST");
  assert.ok(typeof request.init.body === "string");
  assert.deepEqual(JSON.parse(request.init.body), { model: "mlx-community/Kokoro-82M-bf16", input: text,
   voice: id, lang_code: "e", response_format: "wav", stream: false, speed: 1.5 });
 }
 assert.equal(f.plays.length, 3);
});
void test("only explicit literal loopback HTTP origins are accepted", async () => {
 for (const url of ["http://127.0.0.1", "http://[::1]:8000/"]) {
  const f = fixture(url); await f.adapter.speak("hola", "Kokoro Dora", 180, new AbortController().signal);
  assert.equal(f.requests.length, 1);
 }
 for (const url of ["https://127.0.0.1", "http://localhost", "http://example.com", "http://127.1", "http://2130706433",
  "http://127.0.0.1/path", "http://127.0.0.1?x", "http://127.0.0.1#x", "http://user@127.0.0.1", "http://127.0.0.1:99999", {}, null, ""]) {
  const f = fixture(url);
  await assert.rejects(f.adapter.speak("private", "Kokoro Dora", 180, new AbortController().signal), /loopback/i);
  assert.deepEqual(f.requests, []); assert.deepEqual(f.plays, []);
 }
});
void test("invalid voices/rates and unsupported platforms never fetch or play", async () => {
 for (const [voice, rate] of [["Paulina", 180], ["Kokoro Dora", 79], ["Kokoro Dora", 351], ["Kokoro Dora", NaN], ["Kokoro Dora", 180.5]] as const) {
  const f = fixture(); await assert.rejects(f.adapter.speak("hola", voice, rate, new AbortController().signal));
  assert.deepEqual(f.requests, []); assert.deepEqual(f.plays, []);
 }
 const f = fixture(undefined, "linux"); assert.equal(f.adapter.available(), false);
 assert.deepEqual(await f.adapter.voices(new AbortController().signal), []);
 await assert.rejects(f.adapter.speak("hola", "Kokoro Dora", 180, new AbortController().signal), /macOS/);
 assert.deepEqual(f.requests, []);
 for (const rate of [80, 350]) {
  const mac = fixture(); await mac.adapter.speak("hola", "Kokoro Dora", rate, new AbortController().signal);
  const body = mac.requests[0]!.init.body;
  assert.ok(typeof body === "string");
  const payload: unknown = JSON.parse(body);
  assert.ok(typeof payload === "object" && payload !== null && "speed" in payload);
  assert.equal(payload.speed, rate / 180);
 }
});
void test("HTTP, redirect, unavailable server and invalid audio errors disclose no response text", async () => {
 for (const response of [new Response("secret prose", {status: 500}), new Response("secret prose", {status: 302, headers: {location: "https://example.com"}}),
  new Response("secret prose", {headers: {"content-type": "audio/wav"}}), new Response(new Uint8Array()),
  new Response(wav(), {headers: {"content-length": String(25 * 1024 * 1024 + 1)}}), new Response(new Uint8Array(25 * 1024 * 1024 + 1))]) {
  const f = fixture(); f.setResponse(() => Promise.resolve(response));
  await assert.rejects(f.adapter.speak("private", "Kokoro Dora", 180, new AbortController().signal),
   (error: unknown) => error instanceof Error && !error.message.includes("secret prose"));
  assert.deepEqual(f.plays, []);
 }
 const f = fixture(); f.setResponse(() => Promise.reject(new Error("secret prose")));
 await assert.rejects(f.adapter.speak("private", "Kokoro Dora", 180, new AbortController().signal), /local.*MLX-Audio/i);
});
void test("pending synthesis cancellation settles even if transport ignores abort and prevents late play", async () => {
 const f = fixture(); let release!: (response: Response) => void;
 f.setResponse(() => new Promise<Response>((resolve) => { release = resolve; }));
 const controller = new AbortController(); const pending = f.adapter.speak("hola", "Kokoro Dora", 180, controller.signal);
 controller.abort(); controller.abort(); await assert.rejects(pending, /cancel/i);
 assert.equal(f.requests[0]!.init.signal?.aborted, true);
 release(new Response(wav())); await new Promise<void>((resolve) => setImmediate(resolve)); assert.deepEqual(f.plays, []);
 const pre = new AbortController(); pre.abort();
 await assert.rejects(f.adapter.speak("hola", "Kokoro Dora", 180, pre.signal), /cancel/i);
 assert.equal(f.requests.length, 1);
});
void test("synthesis timeout is bounded even when transport ignores its signal", async (context) => {
 context.mock.timers.enable({apis: ["setTimeout"]});
 const f = fixture(); f.setResponse(() => new Promise<Response>(() => {}));
 const pending = f.adapter.speak("hola", "Kokoro Dora", 180, new AbortController().signal);
 const rejection = assert.rejects(pending, /timed out.*120 seconds/);
 context.mock.timers.tick(120_000); await rejection;
 assert.equal(f.requests[0]!.init.signal?.aborted, true); assert.deepEqual(f.plays, []);
});
void test("abort during response download cancels reader and prevents playback", async () => {
 const f = fixture(); let cancelled = false;
 const body = new ReadableStream<Uint8Array>({
  start(controller) { controller.enqueue(wav().slice(0, 20)); },
  cancel() { cancelled = true; },
 });
 f.setResponse(() => Promise.resolve(new Response(body)));
 const controller = new AbortController(); const pending = f.adapter.speak("hola", "Kokoro Dora", 180, controller.signal);
 await new Promise<void>((resolve) => setImmediate(resolve)); controller.abort();
 await assert.rejects(pending, /cancel/i); assert.equal(cancelled, true); assert.deepEqual(f.plays, []);
});
void test("combined adapter retains native availability/catalog/errors and native speech never fetches", async () => {
 let network = 0; const nativeCalls: unknown[] = []; const failure = new Error("native discovery failure");
 const native: SpeechAdapter = { available: () => true, voices: () => Promise.resolve(["Paulina"]),
  speak: (...args) => { nativeCalls.push(args); return Promise.resolve({done: Promise.resolve()}); } };
 const combined = createLocalSpeechAdapter({ platform: "darwin", native, url: "https://unsafe.example",
  fetch: () => { network++; return Promise.reject(new Error("must not fetch")); } });
 const signal = new AbortController().signal;
 assert.equal(combined.available(), true);
 assert.deepEqual(await combined.voices(signal), ["Paulina", "Kokoro Dora", "Kokoro Alex", "Kokoro Santa"]);
 await combined.speak("hola", "Paulina", 180, signal); assert.equal(nativeCalls.length, 1); assert.equal(network, 0);
 await assert.rejects(combined.speak("hola", "Kokoro Dora", 180, signal), /loopback/i); assert.equal(network, 0);
 native.voices = () => Promise.reject(failure); await assert.rejects(combined.voices(signal), (error: unknown) => error === failure);
 const unsupported = createLocalSpeechAdapter({platform: "linux", native});
 native.voices = () => Promise.resolve(["Paulina"]); assert.deepEqual(await unsupported.voices(signal), ["Paulina"]);
});

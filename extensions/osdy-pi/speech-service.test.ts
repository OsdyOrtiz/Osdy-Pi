import assert from "node:assert/strict";
import test from "node:test";
import type { SpeechSettings } from "./speech-types.js";
import type { SpeechAdapter } from "./speech-adapter.js";
// @ts-expect-error Native Node tests import TypeScript sources.
import { createSpeechService } from "./speech-service.ts";

function deferred<T>() {
 let resolve!: (value: T) => void;
 let reject!: (error: Error) => void;
 const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
 return { promise, resolve, reject };
}
function fixture() {
 let saves = 0;
 let stored: unknown = { version: 1, enabled: false, voice: "Paulina", rate: 180 };
 const calls: Array<{ text: string; voice: string; rate: number; signal: AbortSignal }> = [];
 const errors: Error[] = [];
 const done = deferred<void>();
 const adapter: SpeechAdapter = {
  available: () => true,
  voices: () => Promise.resolve(["Jorge", "Paulina (Enhanced)"]),
  speak: (text, voice, rate, signal) => { calls.push({text, voice, rate, signal}); return Promise.resolve({ done: done.promise }); },
 };
 const store = { load: () => Promise.resolve(stored), save: (value: SpeechSettings) => { saves++; stored = {...value}; return Promise.resolve(); } };
 const service = createSpeechService({ adapter, store, onError: (error) => { errors.push(error); } });
 return { service, adapter, store, calls, errors, done, stored: () => stored, saves: () => saves };
}
void test("off by default; manual uses installed Paulina and returns before playback ends", async () => {
 const f = fixture();
 assert.equal(f.service.available(), true);
 assert.deepEqual(await f.service.speak("hello", { automatic: true }), {kind: "disabled"});
 assert.equal(f.calls.length, 0);
 assert.deepEqual(await f.service.speak("# Hello [[rate 999]]"), {kind: "started"});
 assert.equal(f.calls[0]?.text, "Hello");
 assert.equal(f.calls[0]?.voice, "Paulina (Enhanced)");
 assert.equal(f.calls[0]?.rate, 180);
 f.service.stop();
 assert.equal(f.calls[0]?.signal.aborted, true);
 f.done.reject(new Error("late failure"));
 await new Promise<void>((resolve) => setImmediate(resolve));
 assert.equal(f.errors.length, 0);
});
void test("settings serialize patches and invalid patches preserve stored and returned values", async () => {
 const f = fixture();
 await Promise.all([f.service.configure({ enabled: true }), f.service.configure({ rate: 210 })]);
 const expected = { version: 1, enabled: true, voice: "Paulina", rate: 210 };
 assert.deepEqual(await f.service.settings(), expected);
 for (const patch of [{ rate: 0 }, { rate: Infinity }, { voice: " " }, { enabled: "yes" }, { surprise: true }]) {
  await assert.rejects(f.service.configure(patch as { rate?: number }));
  assert.deepEqual(f.stored(), expected);
  assert.deepEqual(await f.service.settings(), expected);
 }
 await f.service.configure({rate: 220});
 assert.equal((await f.service.settings()).rate, 220);
});
void test("missing Paulina never substitutes; eventual errors are reported", async () => {
 const f = fixture();
 f.adapter.voices = () => Promise.resolve(["Jorge"]);
 assert.equal((await f.service.speak("hello")).kind, "error");
 assert.equal(f.calls.length, 0);
 f.adapter.voices = () => Promise.resolve(["Paulina"]);
 assert.equal((await f.service.speak("hello")).kind, "started");
 f.done.reject(new Error("failed playback"));
 await new Promise<void>((resolve) => setImmediate(resolve));
 assert.equal(f.errors[0]?.message, "failed playback");
});
void test("stop, disable, or newer speak invalidates late settings and discovery", async () => {
 for (const phase of ["load", "voices"] as const) {
  for (const action of ["stop", "disable", "new"] as const) {
   const f = fixture();
   const gate = deferred<readonly string[]>();
   const loadGate = deferred<unknown>();
   if (phase === "voices") f.adapter.voices = () => gate.promise;
   else f.store.load = () => loadGate.promise;
   const pending = f.service.speak("stale");
   await new Promise<void>((resolve) => setImmediate(resolve));
   let newer: Promise<unknown> | undefined;
   if (action === "stop") f.service.stop();
   if (action === "disable") { newer = f.service.configure({enabled: false}); }
   if (action === "new") { newer = f.service.speak("new"); }
   loadGate.resolve({version: 1, enabled: false, voice: "Paulina", rate: 180});
   gate.resolve(["Paulina"]);
   assert.equal((await pending).kind, "cancelled");
   await newer;
   assert.equal(f.calls.some((call) => call.text === "stale"), false);
   f.service.stop();
  }
 }
});
void test("enabled automatic speech launches; disable and newer speech cancel active playback", async () => {
 const f = fixture();
 await f.service.configure({enabled: true});
 assert.equal((await f.service.speak("first", {automatic: true})).kind, "started");
 assert.equal((await f.service.speak("second", {automatic: true})).kind, "started");
 assert.equal(f.calls[0]?.signal.aborted, true);
 await f.service.configure({enabled: false});
 assert.equal(f.calls[1]?.signal.aborted, true);
 assert.equal((await f.service.speak("third", {automatic: true})).kind, "disabled");
 assert.equal(f.calls.length, 2);
 f.done.resolve();
});
void test("failed saves preserve settings and do not poison subsequent configuration", async () => {
 const f = fixture();
 const initial = await f.service.settings();
 const save = f.store.save;
 f.store.save = () => Promise.reject(new Error("disk unavailable"));
 await assert.rejects(f.service.configure({rate: 250}), /disk unavailable/);
 assert.deepEqual(await f.service.settings(), initial);
 assert.deepEqual(f.stored(), initial);
 f.store.save = save;
 await f.service.configure({rate: 200});
 assert.equal((await f.service.settings()).rate, 200);
});
void test("unsupported, empty, corrupt store and discovery errors are explicit", async () => {
 const f = fixture();
 assert.equal((await f.service.speak("```js\ncode")).kind, "empty");
 f.adapter.available = () => false;
 assert.equal((await f.service.speak("hello")).kind, "unavailable");
 f.adapter.available = () => true;
 f.adapter.voices = () => Promise.reject(new Error("ENOENT"));
 assert.deepEqual(await f.service.speak("hello"), {kind: "error", message: "ENOENT"});
 f.store.load = () => Promise.resolve({ enabled: "bad" });
 assert.equal((await f.service.speak("hello")).kind, "error");
});

void test("voice catalog is supported, unique and stable without starting or stopping playback", async () => {
 const f = fixture();
 f.adapter.voices = () => Promise.resolve(["Paulina (Enhanced)", "Jorge", "Jorge", "", "bad\nvoice"]);
 assert.deepEqual(await f.service.voices(), ["Jorge", "Paulina (Enhanced)"]);
 assert.equal(f.calls.length, 0);
 assert.equal((await f.service.speak("already playing")).kind, "started");
 const before = await f.service.settings();
 await f.service.voices();
 assert.equal(f.calls[0]?.signal.aborted, false);
 assert.deepEqual(await f.service.settings(), before);
 await f.service.configure({voice: "Jorge"});
 assert.equal((await f.service.speak("selected voice")).kind, "started");
 assert.equal(f.calls.at(-1)?.voice, "Jorge");
 f.service.stop(); f.done.resolve();
});
void test("catalog discovery reports errors, is cancelled by Stop and never probes unsupported systems", async () => {
 const f = fixture();
 f.adapter.available = () => false;
 f.adapter.voices = () => { throw new Error("must not discover"); };
 assert.deepEqual(await f.service.voices(), []);
 f.adapter.available = () => true;
 f.adapter.voices = () => Promise.reject(new Error("catalog failure"));
 await assert.rejects(f.service.voices(), /catalog failure/);
 let signal: AbortSignal | undefined;
 const gate = deferred<readonly string[]>();
 f.adapter.voices = incoming => { signal = incoming; return gate.promise; };
 const pending = f.service.voices();
 f.service.stop();
 gate.resolve(["Paulina"]);
 await assert.rejects(pending, /cancelled/i);
 assert.equal(signal?.aborted, true);
 assert.equal(f.calls.length, 0);
});

void test("preview uses the explicit installed voice and fixed sample at persisted rate without saving or enabling", async () => {
 const f = fixture();
 await f.service.configure({rate: 215});
 const before = await f.service.settings(); const saves = f.saves();
 assert.deepEqual(await f.service.preview("Jorge"), {kind: "started"});
 assert.equal(f.calls[0]?.text, "Hello! This is a preview of my voice in Osdy Pi.");
 assert.equal(f.calls[0]?.voice, "Jorge"); assert.equal(f.calls[0]?.rate, 215);
 assert.deepEqual(await f.service.settings(), before); assert.equal(f.saves(), saves);
 f.service.stop(); f.done.resolve();
});
void test("preview rejects invalid or uninstalled exact choices without fallback or settings writes", async () => {
 const f = fixture(); const before = await f.service.settings();
 for (const voice of ["", "bad\nvoice", "[[rate 999]]", "Missing", "Paulina"]) {
  const result = await f.service.preview(voice);
  assert.equal(result.kind, "error");
  assert.deepEqual(result, {kind: "error", message: voice === "Missing" || voice === "Paulina"
   ? `Speech voice ${voice} is not installed; no substitute was used`
   : "Invalid speech settings: expected v1, boolean enabled, a voice name and rate 80–350"});
  assert.deepEqual(await f.service.settings(), before); assert.equal(f.saves(), 0);
 }
 assert.equal(f.calls.length, 0);
});
void test("preview replaces narration and samples; stopPreview only cancels samples, never narration", async () => {
 const f = fixture();
 await f.service.speak("ordinary"); f.service.stopPreview();
 assert.equal(f.calls[0]?.signal.aborted, false);
 await f.service.preview("Jorge"); assert.equal(f.calls[0]?.signal.aborted, true);
 await f.service.preview("Jorge"); assert.equal(f.calls[1]?.signal.aborted, true);
 f.service.stopPreview(); assert.equal(f.calls[2]?.signal.aborted, true);
 await f.service.speak("new ordinary"); f.service.stopPreview();
 assert.equal(f.calls[3]?.signal.aborted, false);
 f.service.stop(); f.done.resolve();
});
void test("pending preview load or discovery cannot launch after stopPreview, Stop, or newer narration", async () => {
 for (const phase of ["load", "voices"]) for (const action of ["preview-stop", "stop", "narration"]) {
  const f = fixture(); const gate = deferred<readonly string[]>(); const load = deferred<unknown>();
  if (phase === "load") f.store.load = () => load.promise;
  else f.adapter.voices = () => gate.promise;
  const pending = f.service.preview("Jorge");
  await new Promise<void>(resolve => setImmediate(resolve));
  let newer: Promise<unknown> | undefined;
  if (action === "preview-stop") f.service.stopPreview();
  if (action === "stop") f.service.stop();
  if (action === "narration") newer = f.service.speak("ordinary");
  load.resolve({version: 1, enabled: false, voice: "Paulina", rate: 180});
  gate.resolve(["Jorge", "Paulina"]);
  assert.deepEqual(await pending, {kind: "cancelled"}); await newer;
  assert.equal(f.calls.some(call => call.voice === "Jorge"), false);
  f.service.stop(); f.done.resolve();
 }
});
void test("preview honestly reports unsupported platforms and discovery failures without saving", async () => {
 const f = fixture(); f.adapter.available = () => false;
 assert.deepEqual(await f.service.preview("Jorge"), {kind: "unavailable"});
 f.adapter.available = () => true;
 f.adapter.voices = () => Promise.reject(new Error("preview discovery failed"));
 assert.deepEqual(await f.service.preview("Jorge"), {kind: "error", message: "preview discovery failed"});
 assert.equal(f.saves(), 0); assert.equal(f.calls.length, 0);
});
void test("stopPreview does not invalidate ordinary narration waiting for settings or installed voices", async () => {
 for (const phase of ["load", "voices"]) {
  const f = fixture(); const gate = deferred<readonly string[]>(); const load = deferred<unknown>();
  if (phase === "load") f.store.load = () => load.promise;
  else f.adapter.voices = () => gate.promise;
  const pending = f.service.speak("ordinary pending narration");
  await new Promise<void>(resolve => setImmediate(resolve));
  f.service.stopPreview();
  load.resolve({version: 1, enabled: false, voice: "Paulina", rate: 180}); gate.resolve(["Paulina"]);
  assert.deepEqual(await pending, {kind: "started"});
  assert.equal(f.calls[0]?.text, "ordinary pending narration");
  assert.equal(f.calls[0]?.signal.aborted, false);
  f.service.stop(); f.done.resolve();
 }
});

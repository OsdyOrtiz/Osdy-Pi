import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import test from "node:test";
import { fileURLToPath } from "node:url";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { SpeechService, SpeechSettings, SpeechResult } from "./speech-types.js";

registerHooks({ resolve(specifier, context, nextResolve) {
	if (specifier.startsWith(".") && specifier.endsWith(".js") && context.parentURL?.endsWith(".ts")) {
		const url = new URL(`${specifier.slice(0, -3)}.ts`, context.parentURL);
		if (existsSync(fileURLToPath(url))) return { shortCircuit: true, url: url.href };
	}
	return nextResolve(specifier, context);
} });
const { registerResponseSpeech } = await import("./response-speech.js");
const { createSpeechService } = await import("./speech-service.js");
const prose = (text: string, stopReason = "stop") => ({ role: "assistant", stopReason, content: [{ type: "text", text }] });

function fixture(mode: ExtensionContext["mode"] = "tui") {
	const hooks = new Map<string, (event: unknown, ctx: ExtensionContext) => unknown>();
	let settings: SpeechSettings = { version: 1, enabled: false, voice: "Paulina", rate: 180 };
	let stops = 0;
	let previewStops = 0;
	let saves = 0;
	const previews: string[] = [];
	let preview: SpeechService["preview"] = () => Promise.resolve(result);
	let result: SpeechResult = { kind: "started" };
	let speak: SpeechService["speak"] = () => Promise.resolve(result);
	let read: SpeechService["settings"] = () => Promise.resolve(settings);
	let readVoices: SpeechService["voices"] = () => Promise.resolve(["Mónica", "Paulina"]);
	const calls: Array<{ text: string; automatic: boolean }> = [];
	const service: SpeechService = {
		settings: () => read(), voices: () => readVoices(), configure: patch => { saves++; settings = { ...settings, ...patch }; return Promise.resolve(settings); },
		speak: (text, options) => { calls.push({ text, automatic: options?.automatic === true }); return speak(text, options); },
		preview: voice => { previews.push(voice); return preview(voice); },
		stopPreview: () => { previewStops++; },
		stop: () => { stops++; }, available: () => true,
	};
	// Fake only the public registration/context surface consumed by the owner.
	const pi = { on: (name: string, handler: (event: unknown, ctx: ExtensionContext) => unknown) => { hooks.set(name, handler); } } as unknown as ExtensionAPI;
	const manager = { getSessionId: () => "session-one" };
	let idle = true;
	const abort = new AbortController();
	const ctx = { sessionManager: manager, hasUI: mode === "tui" || mode === "rpc", mode, isIdle: () => idle, signal: abort.signal } as unknown as ExtensionContext;
	const owner = registerResponseSpeech(pi, service);
	const emit = (name: string, event: unknown = {}, context = ctx) => hooks.get(name)?.(event, context);
	emit("session_start");
	const run = (messages: readonly unknown[]) => { emit("agent_start"); emit("agent_end", { messages }); };
	return { owner, ctx, emit, run, calls, previews, abort, stops: () => stops,
		previewStops: () => previewStops, saves: () => saves, service,
		setPreview: (value: SpeechService["preview"]) => { preview = value; },
		setIdle: (value: boolean) => { idle = value; },
		setResult: (value: SpeechResult) => { result = value; },
		setSpeak: (value: SpeechService["speak"]) => { speak = value; },
		setRead: (value: SpeechService["settings"]) => { read = value; },
		setVoices: (value: SpeechService["voices"]) => { readVoices = value; },
	};
}

void test("Only the latest settled successful prose is launched, once; intermediate ends never speak", () => {
	const f = fixture();
	f.run([prose("intermediate")]); assert.deepEqual(f.calls, []);
	f.emit("agent_start"); f.emit("agent_end", { messages: [prose("final")] });
	f.emit("agent_settled"); f.emit("agent_settled");
	assert.deepEqual(f.calls, [{ text: "final", automatic: true }]);
});

void test("New input, newest empty/tool-only/failed/aborted messages never narrate older prose", () => {
	for (const newest of [prose("", "stop"), prose("failed", "error"), prose("cancelled", "aborted"),
		{ role: "assistant", stopReason: "toolUse", content: [{ type: "toolCall", name: "read" }] }]) {
		const f = fixture(); f.run([prose("old"), newest]); f.emit("agent_settled"); assert.deepEqual(f.calls, []);
	}
	const f = fixture(); f.run([prose("old")]); f.emit("input"); f.emit("agent_settled"); assert.deepEqual(f.calls, []);
});

void test("Abort signals and failed settlement suppress even previously successful candidates", () => {
	for (const kind of ["signal", "error", "aborted"]) {
		const f = fixture(); f.run([prose("must not speak")]);
		if (kind === "signal") f.abort.abort(); else f.emit("agent_before_settle", { outcome: kind });
		f.emit("agent_settled"); assert.deepEqual(f.calls, []);
	}
});

void test("Last successful final response is session-local and explicit replay bypasses automatic preference", async () => {
	const f = fixture(); f.run([prose("retained")]); f.emit("agent_settled");
	assert.equal((await f.owner.settings()).enabled, false);
	assert.equal((await f.owner.command(["last"], f.ctx)).failed, false);
	assert.deepEqual(f.calls.at(-1), { text: "retained", automatic: false });
	// A failed new run does not erase the explicit last successful response.
	f.run([prose("failed", "error")]); f.emit("agent_settled");
	assert.equal((await f.owner.command(["last"], f.ctx)).failed, false);
	assert.equal(f.calls.at(-1)?.text, "retained");
	f.emit("session_start");
	assert.match((await f.owner.command(["last"], f.ctx)).message, /No successful/);
});

void test("Stop cancels pending starts and playback; replay refuses while busy", async () => {
	const f = fixture(); f.run([prose("retained")]);
	assert.match((await f.owner.command(["last"], f.ctx)).message, /busy/);
	const stops = f.stops();
	await f.owner.command(["stop"], f.ctx); assert.equal(f.stops(), stops + 1);
	f.emit("agent_settled"); assert.equal(f.calls.length, 0);
	f.setIdle(false); assert.match((await f.owner.command(["last"], f.ctx)).message, /busy/);
	f.setIdle(true); await f.owner.command(["last"], f.ctx); assert.equal(f.calls.at(-1)?.text, "retained");
	await f.owner.command(["off"], f.ctx); assert.equal((await f.owner.settings()).enabled, false);
});

void test("RPC, JSON and print never launch automatic or explicit speech", async () => {
	for (const mode of ["rpc", "json", "print"] as const) {
		const f = fixture(mode); f.run([prose("silent")]); f.emit("agent_settled");
		assert.equal((await f.owner.command(["last"], f.ctx)).failed, true); assert.deepEqual(f.calls, []);
	}
});

void test("Stale session events and delayed last results cannot own a new run/session", async () => {
	const f = fixture(); f.run([prose("retained")]); f.emit("agent_settled");
	let finish: (result: SpeechResult) => void = () => {};
	f.setSpeak(() => new Promise(resolve => { finish = resolve; }));
	const pending = f.owner.command(["last"], f.ctx);
	f.emit("agent_start"); finish({ kind: "started" });
	assert.match((await pending).message, /cancelled/);
	const other = { ...f.ctx, sessionManager: { getSessionId: () => "session-two" } } as unknown as ExtensionContext;
	f.emit("session_start", {}, other);
	f.emit("agent_start", {}, f.ctx); f.emit("agent_end", { messages: [prose("stale")] }, f.ctx); f.emit("agent_settled", {}, f.ctx);
	assert.match((await f.owner.command(["last"], other)).message, /No successful/);
	assert.equal(f.calls.length, 2);
	f.emit("session_shutdown", {}, other);
	assert.equal((await f.owner.command(["last"], other)).failed, true);
});

void test("Automatic failures are silent and settlement does not await playback; explicit failures are truthful", async () => {
	const f = fixture(); f.setSpeak(() => Promise.reject(new Error("unavailable Paulina")));
	f.run([prose("response")]); assert.equal(f.emit("agent_settled"), undefined);
	await Promise.resolve();
	assert.match((await f.owner.command(["last"], f.ctx)).message, /unavailable Paulina/);
	f.setSpeak(() => Promise.resolve({ kind: "unavailable" }));
	assert.match((await f.owner.command(["last"], f.ctx)).message, /unavailable.*configured voice/);
	f.setSpeak(() => new Promise(() => {}));
	f.run([prose("next")]); assert.equal(f.emit("agent_settled"), undefined);
});

void test("Aborted post-run compaction discards the candidate after the low-level signal disappears", async () => {
	const f = fixture();
	f.run([prose("cancelled post-run candidate")]);
	const idleContext = { ...f.ctx, signal: undefined } as unknown as ExtensionContext;
	const compaction = new AbortController();
	f.emit("session_before_compact", { reason: "threshold", signal: compaction.signal }, idleContext);
	compaction.abort();
	const stops = f.stops();
	f.emit("session_compact_failed", { reason: "threshold", aborted: true }, idleContext);
	f.emit("agent_settled", {}, idleContext);
	assert.deepEqual(f.calls, []);
	assert.equal(f.stops(), stops + 1);
	assert.equal(f.abort.signal.aborted, false);
	assert.deepEqual(await f.owner.command(["last"], idleContext), {
		failed: true, message: "No successful final response in this session yet.",
	});
});

void test("Queued follow-up narration re-arms without another agent_start", async () => {
	const f = fixture();
	f.emit("agent_start");
	f.emit("input", { text: "follow-up", source: "interactive" });
	f.emit("message_start", { message: { role: "user", content: "follow-up" } });
	f.emit("message_end", { message: { role: "user", content: "follow-up" } });
	f.emit("message_start", { message: prose("queued final") });
	f.emit("message_end", { message: prose("queued final") });
	f.emit("agent_end", { messages: [prose("queued final")] });
	f.emit("agent_before_settle", { outcome: "completed" });
	f.emit("agent_settled"); f.emit("agent_settled");
	assert.deepEqual(f.calls, [{ text: "queued final", automatic: true }]);
	assert.deepEqual(await f.owner.command(["last"], f.ctx), { failed: false, message: "Speech started." });
	assert.deepEqual(f.calls.at(-1), { text: "queued final", automatic: false });
});

void test("Explicit Stop remains suppressed across queued input in the same run", async () => {
	const f = fixture();
	f.emit("agent_start");
	assert.equal((await f.owner.command(["stop"], f.ctx)).failed, false);
	f.emit("input", { text: "follow-up", source: "interactive" });
	f.emit("message_start", { message: { role: "user", content: "follow-up" } });
	f.emit("message_start", { message: prose("queued after Stop") });
	f.emit("agent_end", { messages: [prose("queued after Stop")] });
	f.emit("agent_before_settle", { outcome: "completed" });
	f.emit("agent_settled");
	assert.equal(f.calls.length, 0);
	assert.equal((await f.owner.command(["last"], f.ctx)).failed, false);
	assert.deepEqual(f.calls, [{ text: "queued after Stop", automatic: false }]);
});

void test("Successful compaction, non-abort failures and stale-session aborts preserve current narration", () => {
	for (const event of ["session_compact", "session_compact_failed"]) {
		const f = fixture(); f.run([prose("completed response")]);
		f.emit(event, { reason: "threshold", aborted: false });
		const stale = { ...f.ctx, sessionManager: { getSessionId: () => "old-session" } } as unknown as ExtensionContext;
		const stops = f.stops();
		f.emit("session_compact_failed", { reason: "threshold", aborted: true }, stale);
		assert.equal(f.stops(), stops);
		f.emit("agent_before_settle", { outcome: "completed" });
		f.emit("agent_settled");
		assert.deepEqual(f.calls, [{ text: "completed response", automatic: true }]);
	}
});

void test("Commands validate exact actions and report settings without extra tuning controls", async () => {
	const f = fixture();
	for (const args of [[], ["voice"], ["on", "extra"]]) assert.match((await f.owner.command(args, f.ctx)).message, /Usage:/);
	assert.match((await f.owner.command(["on"], f.ctx)).message, /enabled.*Paulina.*180/);
	assert.match((await f.owner.command(["status"], f.ctx)).message, /enabled.*Paulina.*180/);
	assert.match((await f.owner.command(["off"], f.ctx)).message, /disabled/);
});

void test("Installed voice selection persists silently and rejects unknown names without mutation", async () => {
 const f = fixture();
 const before = await f.owner.settings();
 assert.deepEqual(await f.owner.voices(f.ctx), ["Mónica", "Paulina"]);
 const rejected = await f.owner.selectVoice("missing voice", f.ctx);
 assert.equal(rejected.failed, true);
 assert.match(rejected.message, /not installed/);
 assert.deepEqual(await f.owner.settings(), before);
 const saved = await f.owner.selectVoice("Mónica", f.ctx);
 assert.equal(saved.failed, false);
 assert.match(saved.message, /Mónica/);
 assert.deepEqual(await f.owner.settings(), {...before, voice: "Mónica"});
 assert.deepEqual(f.calls, []);
});
void test("Delayed voice selection cannot mutate after session replacement or new input", async () => {
 for (const change of ["session_start", "input"]) {
  const f = fixture(); const before = await f.owner.settings();
  let finish: (voices: readonly string[]) => void = () => {};
  f.setVoices(() => new Promise(resolve => { finish = resolve; }));
  const pending = f.owner.selectVoice("Mónica", f.ctx);
  f.emit(change);
  finish(["Mónica"]);
  assert.equal((await pending).failed, true);
  assert.deepEqual(await f.owner.settings(), before);
  assert.deepEqual(f.calls, []);
 }
 const rpc = fixture("rpc");
 assert.equal((await rpc.owner.selectVoice("Mónica", rpc.ctx)).failed, true);
 await assert.rejects(rpc.owner.voices(rpc.ctx), /terminal/i);
});

void test("explicit preview needs no previous response and leaves stored settings and saves unchanged", async () => {
 const f = fixture(); const before = await f.owner.settings();
 assert.deepEqual(await f.owner.previewVoice("Mónica", f.ctx), {failed: false, message: "Speech started."});
 assert.deepEqual(f.previews, ["Mónica"]); assert.deepEqual(f.calls, []);
 assert.deepEqual(await f.owner.settings(), before); assert.equal(f.saves(), 0);
});
void test("preview rejects uninstalled choices without saves or playback", async () => {
 const f = fixture(); const before = await f.owner.settings();
 assert.deepEqual(await f.owner.previewVoice("missing", f.ctx), {
  failed: true, message: "Speech voice is not installed; settings unchanged.",
 });
 assert.deepEqual(f.previews, []); assert.equal(f.saves(), 0);
 assert.deepEqual(await f.owner.settings(), before);
});
void test("preview rejects busy, non-TUI and stale contexts before discovery", async () => {
 const busy = "Speech preview unavailable while Pi is busy; retry when settled.";
 for (const state of ["running", "busy", "rpc", "json", "print", "stale"]) {
  const f = fixture(state === "rpc" || state === "json" || state === "print" ? state : "tui");
  let discoveries = 0; f.setVoices(() => { discoveries++; return Promise.resolve(["Mónica"]); });
  if (state === "running") f.emit("agent_start");
  if (state === "busy") f.setIdle(false);
  if (state === "stale") f.emit("session_shutdown");
  const result = await f.owner.previewVoice("Mónica", f.ctx);
  assert.equal(result.failed, true);
  if (state === "busy" || state === "running") assert.equal(result.message, busy);
  assert.equal(discoveries, 0); assert.deepEqual(f.previews, []); assert.equal(f.saves(), 0);
 }
});
void test("closing preview cancels pre-launch discovery without stopping ordinary narration or suppressing settlement", async () => {
 const f = fixture(); let finish: (voices: readonly string[]) => void = () => {};
 f.setVoices(() => new Promise(resolve => { finish = resolve; }));
 const before = f.stops(); const pending = f.owner.previewVoice("Mónica", f.ctx);
 const sampleStops = f.previewStops();
 f.owner.stopPreview(f.ctx); finish(["Mónica"]);
 assert.deepEqual(await pending, {failed: true, message: "Speech cancelled: session or run changed."});
 assert.deepEqual(f.previews, []); assert.equal(f.stops(), before); assert.equal(f.previewStops(), sampleStops + 1);
 f.run([prose("normal after close")]); f.emit("agent_settled");
 assert.deepEqual(f.calls, [{text: "normal after close", automatic: true}]);
});
void test("preview discovery cannot launch after input, Stop, new run, replacement, shutdown or becoming busy", async () => {
 for (const change of ["input", "stop", "agent_start", "session_start", "session_shutdown", "busy", "non-tui"]) {
  const f = fixture(); const before = await f.owner.settings();
  let finish: (voices: readonly string[]) => void = () => {};
  f.setVoices(() => new Promise(resolve => { finish = resolve; }));
  const pending = f.owner.previewVoice("Mónica", f.ctx);
  if (change === "stop") await f.owner.command(["stop"], f.ctx);
  else if (change === "busy") f.setIdle(false);
  else if (change === "non-tui") f.ctx.hasUI = false;
  else f.emit(change);
  finish(["Mónica"]);
  assert.deepEqual(await pending, {failed: true, message: change === "busy"
   ? "Speech preview unavailable while Pi is busy; retry when settled."
   : "Speech cancelled: session or run changed."}, change);
  assert.deepEqual(f.previews, [], change); assert.equal(f.saves(), 0);
  assert.deepEqual(await f.owner.settings(), before);
 }
});
void test("newer preview owns discovery and delayed service results cannot report stale success", async () => {
 const f = fixture(); const finishes: Array<(voices: readonly string[]) => void> = [];
 f.setVoices(() => new Promise(resolve => { finishes.push(resolve); }));
 const first = f.owner.previewVoice("Paulina", f.ctx);
 const second = f.owner.previewVoice("Mónica", f.ctx);
 finishes[0]?.(["Paulina", "Mónica"]); finishes[1]?.(["Paulina", "Mónica"]);
 assert.equal((await first).failed, true); assert.equal((await second).failed, false);
 assert.deepEqual(f.previews, ["Mónica"]);
 let finish: (result: SpeechResult) => void = () => {};
 f.setVoices(() => Promise.resolve(["Mónica"]));
 f.setPreview(() => new Promise(resolve => { finish = resolve; }));
 const pending = f.owner.previewVoice("Mónica", f.ctx);
 await new Promise<void>(resolve => setImmediate(resolve));
 f.owner.stopPreview(f.ctx); finish({kind: "started"});
 assert.deepEqual(await pending, {failed: true, message: "Speech cancelled: session or run changed."});
});
void test("active preview cancellation, failure reporting and stale close preserve narration semantics", async () => {
 const f = fixture();
 await f.owner.previewVoice("Mónica", f.ctx);
 const sampleStops = f.previewStops();
 f.owner.stopPreview(f.ctx); assert.equal(f.previewStops(), sampleStops + 1);
 f.emit("session_shutdown"); const stops = f.previewStops();
 f.owner.stopPreview(f.ctx); assert.equal(f.previewStops(), stops);
 f.emit("session_start"); f.setResult({kind: "error", message: "sample failed"});
 assert.deepEqual(await f.owner.previewVoice("Mónica", f.ctx), {failed: true, message: "Speech failed: sample failed"});
 f.setVoices(() => Promise.reject(new Error("catalog failed")));
 assert.deepEqual(await f.owner.previewVoice("Mónica", f.ctx), {failed: true, message: "Speech failed: catalog failed"});
 assert.equal(f.saves(), 0);
});
void test("new preview cancels the service-owned pending sample before starting its own discovery", async () => {
 const f = fixture();
 await f.owner.previewVoice("Mónica", f.ctx);
 const stops = f.stops(); const sampleStops = f.previewStops();
 let finish: (voices: readonly string[]) => void = () => {};
 f.setVoices(() => new Promise(resolve => { finish = resolve; }));
 const pending = f.owner.previewVoice("Paulina", f.ctx);
 assert.equal(f.previewStops(), sampleStops + 1);
 assert.equal(f.stops(), stops);
 finish(["Paulina"]); assert.equal((await pending).failed, false);
});
void test("explicit replay invalidates pending preview discovery and still uses normal narration", async () => {
 const f = fixture(); f.run([prose("retained")]); f.emit("agent_settled");
 let finish: (voices: readonly string[]) => void = () => {};
 f.setVoices(() => new Promise(resolve => { finish = resolve; }));
 const pending = f.owner.previewVoice("Mónica", f.ctx);
 assert.equal((await f.owner.command(["last"], f.ctx)).failed, false);
 finish(["Mónica"]);
 assert.deepEqual(await pending, {failed: true, message: "Speech cancelled: session or run changed."});
 assert.deepEqual(f.previews, []); assert.deepEqual(f.calls.at(-1), {text: "retained", automatic: false});
});
void test("input, Stop, new runs, replacement and shutdown abort active samples through the real service boundary", async () => {
 for (const change of ["input", "stop", "agent_start", "session_start", "session_shutdown"]) {
  const f = fixture(); const signals: AbortSignal[] = []; let saves = 0;
  const real = createSpeechService({
   adapter: {available: () => true, voices: () => Promise.resolve(["Mónica"]),
    speak: (_text, _voice, _rate, signal) => { signals.push(signal); return Promise.resolve({done: Promise.resolve()}); }},
   store: {load: () => Promise.resolve({version: 1, enabled: false, voice: "Paulina", rate: 180}),
    save: () => { saves++; return Promise.resolve(); }},
  });
  f.service.preview = voice => real.preview(voice);
  f.service.stop = () => real.stop(); f.service.stopPreview = () => real.stopPreview();
  f.setVoices(() => real.voices());
  assert.deepEqual(await f.owner.previewVoice("Mónica", f.ctx), {failed: false, message: "Speech started."});
  assert.equal(signals.length, 1); assert.equal(signals[0]?.aborted, false);
  if (change === "stop") await f.owner.command(["stop"], f.ctx); else f.emit(change);
  assert.equal(signals[0]?.aborted, true, change); assert.equal(saves, 0);
 }
});

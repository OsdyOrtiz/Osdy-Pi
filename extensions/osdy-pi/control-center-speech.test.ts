import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import test from "node:test";
import { fileURLToPath } from "node:url";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { SpeechSettings } from "./speech-types.js";
import { visibleWidth } from "@earendil-works/pi-tui";

registerHooks({ resolve(specifier, context, nextResolve) {
	if (specifier.startsWith(".") && specifier.endsWith(".js") && context.parentURL?.endsWith(".ts")) {
		const url = new URL(`${specifier.slice(0, -3)}.ts`, context.parentURL);
		if (existsSync(fileURLToPath(url))) return { shortCircuit: true, url: url.href };
	}
	return nextResolve(specifier, context);
} });
const { CONTROL_CENTER_CATEGORIES, ControlCenter } = await import("./control-center.js");
const { createControlCenterSpeech } = await import("./control-center-speech.js");

void test("Speech appends after all existing categories without changing their indices", () => {
	assert.deepEqual([...CONTROL_CENTER_CATEGORIES], ["Theme", "Header", "Mascot", "Editor", "Git", "Sounds", "Account", "Usage", "TODO", "Agents", "Speech"]);
});

void test("Speech displays enabled/voice/rate and routes only Enable/Disable, Read last response and Stop", async () => {
	let settings: SpeechSettings = { version: 1, enabled: false, voice: "Paulina", rate: 180 };
	const actions: string[] = [];
	const speech = createControlCenterSpeech({ settings: () => Promise.resolve(settings),
		voices: () => Promise.resolve([]),
		selectVoice: () => Promise.resolve({ failed: false, message: "Voice saved" }),
		previewVoice: () => Promise.resolve({ failed: false, message: "Preview started" }), stopPreview: () => {},
		command: args => {
			actions.push(args.join(" "));
			if (args[0] === "on" || args[0] === "off") settings = { ...settings, enabled: args[0] === "on" };
			return Promise.resolve({ failed: args[0] === "last", message: args[0] === "last" ? "No successful final response" : "Speech applied" });
		} }, {} as ExtensionContext);
	const initial = await speech.read();
	assert.match(initial.summary, /disabled.*Paulina.*180 wpm/);
	assert.deepEqual(initial.rows.map(row => row.label), ["Enable", "Read last response", "Stop"]);
	const panel = new ControlCenter({ speech,
		theme: () => ({ name: "dark", appearance: "dark", fg: (_color, text) => text }),
		readThemes: () => [], applyTheme: () => ({ success: true }), requestRender: () => {}, height: () => 30, close: () => {},
	});
	panel.handleInput("\x1b[F"); await settle();
	assert.deepEqual(actions, [], "opening and rendering never play");
	assert.match(panel.render(120).join("\n"), /Paulina.*180/);
	panel.handleInput("\x1b[C"); panel.handleInput("\r"); await settle();
	assert.deepEqual(actions, ["on"]); assert.match(panel.render(120).join("\n"), /Disable/);
	panel.handleInput("\r"); await settle(); assert.deepEqual(actions, ["on", "off"]);
	panel.handleInput("\x1b[B"); panel.handleInput("\r"); await settle();
	assert.match(panel.render(120).join("\n"), /No successful final response/);
	panel.handleInput("\x1b[B"); panel.handleInput("\r"); await settle();
	assert.deepEqual(actions, ["on", "off", "last", "stop"]);
	panel.dispose();
});
void test("Stale Control Center speech actions cannot launch in a replaced session", async () => {
	let calls = 0;
	const speech = createControlCenterSpeech({
		settings: () => Promise.resolve({ version: 1, enabled: false, voice: "Paulina", rate: 180 }),
		voices: () => Promise.resolve([]),
		previewVoice: () => { calls++; return Promise.resolve({ failed: false, message: "Preview started" }); }, stopPreview: () => {},
		selectVoice: () => { calls++; return Promise.resolve({ failed: false, message: "saved" }); },
		command: () => { calls++; return Promise.resolve({ failed: false, message: "started" }); },
	}, {} as ExtensionContext, () => false);
	for (const action of [{ kind: "speech-last" }, { kind: "speech-preview", voice: "Paulina" }, { kind: "speech-voice", voice: "Paulina" }] as const) {
		const result = await speech.apply(action);
		assert.equal(result.failed, true); assert.match(result.message, /session changed/);
	}
	assert.equal(calls, 0);
});
void test("One horizontal Voice selector wraps silently and Enter alone saves among many voices", async () => {
	let settings: SpeechSettings = { version: 1, enabled: true, voice: "Voice 050", rate: 180 };
	const names = Array.from({ length: 120 }, (_, i) => `Voice ${String(i).padStart(3, "0")}`);
	const selected: string[] = [];
	const playback: string[] = [];
	const speech = createControlCenterSpeech({
		settings: () => Promise.resolve(settings), voices: () => Promise.resolve(names),
		previewVoice: voice => { playback.push(voice); return Promise.resolve({ failed: false, message: "Preview started" }); }, stopPreview: () => {},
		selectVoice: (voice: string) => {
			selected.push(voice); settings = { ...settings, voice };
			return Promise.resolve({ failed: false, message: `Voice saved globally: ${voice}` });
		},
		command: args => { playback.push(args.join(" ")); return Promise.resolve({ failed: false, message: "Speech applied" }); },
	}, {} as ExtensionContext);
	const view = await speech.read();
	assert.equal(view.rows.length, 5);
	assert.match(view.rows[3]!.label, /Voice: ‹ Voice 050 ›/);
	const panel = new ControlCenter({ speech,
		theme: () => ({ name: "dark", appearance: "dark", fg: (_color, text) => text }),
		readThemes: () => [], applyTheme: () => ({ success: true }), requestRender: () => {}, height: () => 18, close: () => {},
	});
	panel.handleInput("\x1b[F"); await settle(); panel.handleInput("\x1b[C");
	assert.match(panel.render(100).join("\n"), /> Disable/);
	for (let i = 0; i < 3; i++) panel.handleInput("\x1b[B");
	for (let i = 0; i < 70; i++) panel.handleInput("\x1b[C");
	assert.match(panel.render(100).join("\n"), /> Voice: ‹ Voice 000 ›.*unsaved/);
	panel.handleInput("\x1b[D");
	assert.match(panel.render(100).join("\n"), /> Voice: ‹ Voice 119 ›.*unsaved/);
	assert.deepEqual(selected, []); assert.deepEqual(playback, []);
	panel.handleInput("\r"); await settle();
	assert.deepEqual(selected, ["Voice 119"]); assert.deepEqual(playback, []);
	assert.match(panel.render(100).join("\n"), /Voice saved globally: Voice 119/);
	assert.match((await speech.read()).rows[3]!.label, /Voice: ‹ Voice 119 ›.*saved/);
	panel.handleInput("\x1b[H"); panel.handleInput("\x1b[B"); panel.handleInput("\r"); await settle();
	assert.deepEqual(playback, ["last"]);
	panel.dispose();
});

void test("Default voice aliases mark one installed entry; failed discovery keeps narration controls", async () => {
	const owner = {
		settings: () => Promise.resolve<SpeechSettings>({ version: 1, enabled: false, voice: "Paulina", rate: 180 }),
		voices: () => Promise.resolve<readonly string[]>(["Paulina (Enhanced)", "Paulina (Español (México))"]),
		previewVoice: () => Promise.resolve({ failed: false, message: "Preview started" }), stopPreview: () => {},
		selectVoice: () => Promise.resolve({ failed: false, message: "saved" }),
		command: () => Promise.resolve({ failed: false, message: "applied" }),
	};
	const speech = createControlCenterSpeech(owner, {} as ExtensionContext);
	const initial = await speech.read();
	assert.equal(initial.rows.filter(row => row.current).length, 1);
	assert.deepEqual(initial.rows[3]?.action, { kind: "speech-voice", voice: "Paulina (Enhanced)" });
	owner.voices = () => Promise.reject(new Error("voice catalog unavailable"));
	const unavailable = await speech.read();
	assert.deepEqual(unavailable.rows.map(row => row.label), ["Enable", "Read last response", "Stop"]);
	assert.match(unavailable.note, /voice catalog unavailable/);
});
void test("Explicit preview uses the unsaved draft, preserves it through failed saves and cleans up only previews", async () => {
	const previews: string[] = [];
	const saves: string[] = [];
	const commands: string[] = [];
	let stops = 0;
	let finishPreview: ((result: { failed: boolean; message: string }) => void) | undefined;
	const speech = createControlCenterSpeech({
		settings: () => Promise.resolve({ version: 1, enabled: false, voice: "Paulina", rate: 180 }),
		voices: () => Promise.resolve(["Paulina", "Samantha"]),
		selectVoice: voice => { saves.push(voice); return Promise.resolve({ failed: true, message: "Save refused" }); },
		previewVoice: voice => { previews.push(voice); return new Promise(resolve => { finishPreview = resolve; }); },
		stopPreview: () => { stops++; },
		command: args => { commands.push(args.join(" ")); return Promise.resolve({ failed: false, message: "Applied" }); },
	}, {} as ExtensionContext);
	const panel = new ControlCenter({ speech,
		theme: () => ({ name: "dark", appearance: "dark", fg: (_color, text) => text }),
		readThemes: () => [], applyTheme: () => ({ success: true }), requestRender: () => {}, height: () => 30, close: () => {},
	});
	panel.handleInput("\x1b[F"); await settle(); panel.handleInput("\x1b[C");
	for (let i = 0; i < 3; i++) panel.handleInput("\x1b[B");
	panel.handleInput("\x1b[C");
	assert.deepEqual(saves, []); assert.deepEqual(previews, []);
	panel.handleInput("\x1b[B"); panel.handleInput("\r");
	assert.deepEqual(previews, ["Samantha"]);
	assert.doesNotMatch(panel.render(100).join("\n"), /Saving globally/);
	finishPreview?.({ failed: false, message: "Preview started" }); await settle();
	assert.match(panel.render(100).join("\n"), /Voice: ‹ Samantha ›.*unsaved/);
	panel.handleInput("\x1b[A"); panel.handleInput("\r"); await settle();
	assert.deepEqual(saves, ["Samantha"]);
	assert.match(panel.render(100).join("\n"), /Voice: ‹ Samantha ›.*unsaved/);
	panel.handleInput("\x1b[H"); panel.handleInput("\x1b[B"); panel.handleInput("\r"); await settle();
	assert.deepEqual(commands, ["last"]);
	assert.match(panel.render(100).join("\n"), /Voice: ‹ Samantha ›.*unsaved/);
	panel.handleInput("\t"); panel.handleInput("\x1b[A"); await settle();
	assert.equal(stops, 1, "leaving Speech stops only preview");
	panel.dispose(); panel.dispose();
	assert.equal(stops, 2, "disposal is idempotent");
	assert.deepEqual(commands, ["last"], "cleanup never issues narration Stop");
	panel.handleInput("\r"); assert.deepEqual(previews, ["Samantha"]);
});
void test("Empty and single catalogs retain controls; only the ready selector owns arrows and narrow rendering fits", async () => {
	for (const names of [[], ["Paulina"]]) {
		const actions: string[] = [];
		let resolveVoices: ((voices: readonly string[]) => void) | undefined;
		let loading = true;
		const speech = createControlCenterSpeech({
			settings: () => Promise.resolve({ version: 1, enabled: false, voice: "Paulina", rate: 180 }),
			voices: () => loading ? new Promise(resolve => { resolveVoices = resolve; }) : Promise.resolve(names),
			selectVoice: voice => { actions.push(`save:${voice}`); return Promise.resolve({ failed: false, message: "Saved" }); },
			previewVoice: voice => { actions.push(`preview:${voice}`); return Promise.resolve({ failed: false, message: "Preview" }); },
			stopPreview: () => {}, command: args => { actions.push(args.join(" ")); return Promise.resolve({ failed: false, message: "Applied" }); },
		}, {} as ExtensionContext);
		const panel = new ControlCenter({ speech,
			theme: () => ({ name: "dark", appearance: "dark", fg: (_color, text) => text }),
			readThemes: () => [], applyTheme: () => ({ success: true }), requestRender: () => {}, height: () => 18, close: () => {},
		});
		panel.handleInput("\x1b[F"); await settle();
		panel.handleInput("\x1b[C"); panel.handleInput("\r"); assert.deepEqual(actions, [], "loading blocks activation");
		panel.handleInput("\x1b[D");
		assert.match(panel.render(100).join("\n"), /> Speech/, "loading arrows still change pane focus");
		loading = false; resolveVoices?.(names); await settle();
		panel.handleInput("\x1b[C");
		assert.match(panel.render(100).join("\n"), /> Enable/);
		panel.handleInput("\x1b[D");
		assert.match(panel.render(100).join("\n"), /> Speech/, "controls do not capture arrows");
		panel.handleInput("\x1b[C"); panel.handleInput("\x1b[F");
		if (names.length) {
			panel.handleInput("\x1b[A");
			for (const key of ["\x1b[D", "\x1b[C"]) {
				panel.handleInput(key);
				assert.match(panel.render(100).join("\n"), /> Voice: ‹ Paulina ›.*saved/);
			}
			for (const width of [1, 12, 29, 57, 58, 100]) {
				const lines = panel.render(width);
				assert.ok(lines.length <= 18);
				assert.ok(lines.every(line => visibleWidth(line) <= width));
			}
			panel.handleInput("\t"); assert.match(panel.render(100).join("\n"), /> Speech/);
		} else {
			assert.equal((await speech.read()).rows.length, 3);
			assert.match(panel.render(100).join("\n"), /> Stop/);
		}
		assert.deepEqual(actions, []); panel.dispose();
	}
});

void test("Closing a pending preview cancels its sample only and ignores all late completion and input", async () => {
	let finish: ((result: { failed: boolean; message: string }) => void) | undefined;
	let stops = 0;
	let previews = 0;
	let commands = 0;
	let closed = 0;
	const speech = createControlCenterSpeech({
		settings: () => Promise.resolve({ version: 1, enabled: false, voice: "Paulina", rate: 180 }),
		voices: () => Promise.resolve(["Paulina", "Samantha"]),
		selectVoice: () => Promise.resolve({ failed: false, message: "Saved" }),
		previewVoice: () => { previews++; return new Promise(resolve => { finish = resolve; }); },
		stopPreview: () => { stops++; },
		command: () => { commands++; return Promise.resolve({ failed: false, message: "Applied" }); },
	}, {} as ExtensionContext);
	const panel = new ControlCenter({ speech,
		theme: () => ({ name: "dark", appearance: "dark", fg: (_color, text) => text }),
		readThemes: () => [], applyTheme: () => ({ success: true }), requestRender: () => {}, height: () => 30, close: () => { closed++; },
	});
	panel.handleInput("\x1b[F"); await settle(); panel.handleInput("\x1b[C"); panel.handleInput("\x1b[F");
	panel.handleInput("\r"); panel.handleInput("\r"); assert.equal(previews, 1, "busy blocks duplicates");
	panel.handleInput("\x1b[A"); panel.handleInput("\x1b[C");
	assert.match(panel.render(100).join("\n"), /Voice: ‹ Paulina ›.*saved/, "busy cannot browse draft");
	panel.handleInput("\x1b"); panel.dispose();
	assert.equal(stops, 1); assert.equal(closed, 1); assert.equal(commands, 0);
	finish?.({ failed: false, message: "Late preview" }); await settle();
	panel.handleInput("\r"); assert.equal(previews, 1); assert.deepEqual(panel.render(100), []);
});

void test("Clean drafts follow saved aliases but dirty drafts survive external changes and catalog errors", async () => {
	let voice = "Paulina";
	let unavailable = false;
	const speech = createControlCenterSpeech({
		settings: () => Promise.resolve({ version: 1, enabled: false, voice, rate: 180 }),
		voices: () => unavailable ? Promise.reject(new Error("catalog failed")) : Promise.resolve(["Paulina (Enhanced)", "Samantha", "Victoria"]),
		selectVoice: () => Promise.resolve({ failed: true, message: "Save failed" }),
		previewVoice: () => Promise.resolve({ failed: false, message: "Preview" }), stopPreview: () => {},
		command: () => Promise.resolve({ failed: false, message: "Applied" }),
	}, {} as ExtensionContext);
	assert.match((await speech.read()).rows[3]!.label, /Paulina \(Enhanced\).*saved/);
	voice = "Samantha";
	assert.match((await speech.read()).rows[3]!.label, /Samantha.*saved/);
	assert.match(speech.moveVoice(1)!.rows[3]!.label, /Victoria.*unsaved/);
	voice = "Paulina";
	assert.match((await speech.read()).rows[3]!.label, /Victoria.*unsaved/);
	unavailable = true; assert.equal((await speech.read()).rows.length, 3);
	unavailable = false; assert.match((await speech.read()).rows[3]!.label, /Victoria.*unsaved/);
});
const settle = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };

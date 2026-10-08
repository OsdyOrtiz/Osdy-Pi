import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { GlobalAudioNotificationSettings } from "./audio-notification-types.js";
registerHooks({
	resolve(specifier, context, next) {
		if (specifier.startsWith(".") && specifier.endsWith(".js") && context.parentURL?.endsWith(".ts")) {
			const url = new URL(`${specifier.slice(0, -3)}.ts`, context.parentURL);
			if (existsSync(fileURLToPath(url))) return { shortCircuit: true, url: url.href };
		}
		return next(specifier, context);
	},
	load(url, context, next) {
		if (url.endsWith(".ts")) return { format: "module", shortCircuit: true,
			source: ts.transpileModule(readFileSync(fileURLToPath(url), "utf8"), {
				compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
			}).outputText };
		return next(url, context);
	},
});
const { createAudioSoundSettingsStore } = await import("./audio-sound-settings.js");
const { createAudioNotificationService } = await import("./audio-notification-service.js");
const { bindControlCenterSounds } = await import("./control-center-sounds.js");
const { AUDIO_NOTIFICATION_EVENTS, AUDIO_NOTIFICATION_FLAG_NAMES } = await import("./audio-notification-types.js");

void test("v1 defaults/old files enable automatic audio; only boolean false mutes and roundtrips", async () => {
	const previous = process.env.PI_CODING_AGENT_DIR;
	process.env.PI_CODING_AGENT_DIR = mkdtempSync(join(tmpdir(), "osdy-master-settings-"));
	try {
		const store = createAudioSoundSettingsStore();
		assert.deepEqual(await store.load(), { version: 1, enabled: true, sounds: {} });
		await store.save({ version: 1, enabled: false, sounds: { completion: "/saved.wav" } });
		assert.deepEqual(await store.load(), { version: 1, enabled: false, sounds: { completion: "/saved.wav" } });
		for (const enabled of [undefined, true, "false", 0, null]) {
			writeFileSync(store.path, JSON.stringify({ version: 1, enabled, sounds: { completion: "/old.wav" } }));
			assert.deepEqual(await store.load(), { version: 1, enabled: true, sounds: { completion: "/old.wav" } });
		}
		for (const content of ["invalid json", JSON.stringify({ version: 2, enabled: false })]) {
			writeFileSync(store.path, content);
			assert.deepEqual(await store.load(), { version: 1, enabled: true, sounds: {} });
		}
	} finally {
		if (previous === undefined) delete process.env.PI_CODING_AGENT_DIR;
		else process.env.PI_CODING_AGENT_DIR = previous;
	}
});

void test("automatic master gate covers every global/startup sound and refreshes next event; explicit tests bypass", { timeout: 5000 }, async () => {
	const root = mkdtempSync(join(tmpdir(), "osdy-master-playback-"));
	const sound = join(root, "sound.wav");
	writeFileSync(sound, "mock wave bytes");
	const ctx = { cwd: root } as ExtensionContext;
	for (const source of ["global", "startup-flag"] as const) {
		let settings: GlobalAudioNotificationSettings = { version: 1, enabled: false,
			sounds: Object.fromEntries(AUDIO_NOTIFICATION_EVENTS.map(event => [event, sound])) };
		let loads = 0;
		const played: string[] = [];
		const store = { path: "/unused", load: () => { loads++; return Promise.resolve(settings); },
			save: (value: GlobalAudioNotificationSettings) => { settings = value; return Promise.resolve(); } };
		let flagReads = 0;
		const pi = { getFlag: (name: string) => {
			flagReads++;
			return source === "startup-flag" && Object.values(AUDIO_NOTIFICATION_FLAG_NAMES).includes(name) ? "sound.wav" : "";
		} } as ExtensionAPI;
		let playbackComplete = () => {};
		const playback = { platform: "darwin" as const, play: (path: string) => {
			played.push(path);
			if (played.length === 4) playbackComplete();
			return Promise.resolve();
		} };
		const service = createAudioNotificationService(pi, playback, store);
		const sounds = bindControlCenterSounds(pi, ctx, store, playback);
		const notify = async (expectPlayback = false) => {
			const completed = expectPlayback ? new Promise<void>(resolve => { playbackComplete = resolve; }) : Promise.resolve();
			for (const event of AUDIO_NOTIFICATION_EVENTS) service.notify(event, ctx);
			await completed;
			// A turn drains the resolved store/gate and releases the per-event in-flight guard.
			await new Promise<void>(resolve => setImmediate(resolve));
		};
		await notify();
		assert.deepEqual(played, [], `${source} must be muted`);
		assert.equal(loads, 4, "one fresh snapshot per notification");
		assert.equal(flagReads, 0, "muted notifications never resolve even startup paths");
		assert.equal((await sounds.apply({ kind: "sound-test", event: "completion" })).failed, false);
		assert.deepEqual(played, [sound]);
		played.length = 0;
		settings = { ...settings, enabled: true };
		loads = 0;
		await notify(true);
		assert.deepEqual(played, Array<string>(4).fill(sound));
		assert.equal(loads, 4);
		settings = { ...settings, enabled: false };
		played.length = 0;
		await notify();
		assert.deepEqual(played, [], "same service observes re-mute without reload");
	}
});

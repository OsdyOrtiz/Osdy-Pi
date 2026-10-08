import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { registerHooks } from "node:module";
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
const { resolveAudioNotificationSoundFromSettings, getEffectiveAudioNotificationPath } = await import("./audio-notification-config.js");
const { createAudioNotificationService } = await import("./audio-notification-service.js");
const { bindControlCenterSounds } = await import("./control-center-sounds.js");
const { AUDIO_NOTIFICATION_EVENTS } = await import("./audio-notification-types.js");
const bundled = fileURLToPath(new URL("./assets/notification-default.wav", import.meta.url));
const pi = { getFlag: () => "" } as unknown as ExtensionAPI;
const ctx = { cwd: "/unrelated-project" } as ExtensionContext;

void test("every absent event selects the same readable module-relative bundled default", async () => {
	const settings: GlobalAudioNotificationSettings = { version: 1, enabled: true, sounds: {} };
	for (const event of AUDIO_NOTIFICATION_EVENTS) {
		assert.deepEqual(getEffectiveAudioNotificationPath(pi, settings, event), { source: "bundled-default", path: bundled });
		assert.deepEqual(await resolveAudioNotificationSoundFromSettings(pi, ctx, event, settings),
			{ ok: true, event, path: bundled, source: "bundled-default" });
		const blank = { ...settings, sounds: { [event]: "  " } };
		assert.deepEqual(getEffectiveAudioNotificationPath(pi, blank, event), { source: "bundled-default", path: bundled });
	}
});

void test("saved and flag paths outrank default; invalid explicit paths never fall back", async () => {
	for (const event of AUDIO_NOTIFICATION_EVENTS) {
		const settings: GlobalAudioNotificationSettings = { version: 1, enabled: true, sounds: { [event]: bundled } };
		assert.deepEqual(await resolveAudioNotificationSoundFromSettings(pi, ctx, event, settings),
			{ ok: true, event, path: bundled, source: "global" });
		const flagged = { getFlag: () => bundled } as unknown as ExtensionAPI;
		assert.deepEqual(await resolveAudioNotificationSoundFromSettings(flagged, ctx, event, settings),
			{ ok: true, event, path: bundled, source: "startup-flag" });
		for (const invalid of ["/missing-notification.wav", "/unsupported.txt", "relative.wav"]) {
			const saved = { ...settings, sounds: { [event]: invalid } };
			const invalidSaved = await resolveAudioNotificationSoundFromSettings(pi, ctx, event, saved);
			assert.equal(invalidSaved.ok, false);
			assert.equal(invalidSaved.source, "global");
			const badFlag = { getFlag: () => invalid } as unknown as ExtensionAPI;
			const result = await resolveAudioNotificationSoundFromSettings(badFlag, ctx, event, settings);
			assert.equal(result.ok, false);
			assert.equal(result.source, "startup-flag");
		}
	}
});

void test("bundled WAV is short PCM16 mono with a nonzero low-peak smoothly bounded waveform", () => {
	const wav = readFileSync(bundled);
	assert.equal(wav.toString("ascii", 0, 4), "RIFF");
	assert.equal(wav.readUInt32LE(4), wav.length - 8);
	assert.equal(wav.toString("ascii", 8, 16), "WAVEfmt ");
	assert.equal(wav.readUInt32LE(16), 16);
	assert.equal(wav.readUInt16LE(20), 1);
	assert.equal(wav.readUInt16LE(22), 1);
	assert.equal(wav.readUInt32LE(24), 24000);
	assert.equal(wav.readUInt32LE(28), 48000);
	assert.equal(wav.readUInt16LE(32), 2);
	assert.equal(wav.readUInt16LE(34), 16);
	assert.equal(wav.toString("ascii", 36, 40), "data");
	assert.equal(wav.readUInt32LE(40), wav.length - 44);
	const count = (wav.length - 44) / 2;
	assert.equal(count / 24000, 0.18);
	let peak = 0;
	let maxStep = 0;
	let previous = 0;
	for (let i = 0; i < count; i++) {
		const sample = wav.readInt16LE(44 + i * 2);
		peak = Math.max(peak, Math.abs(sample));
		maxStep = Math.max(maxStep, Math.abs(sample - previous));
		previous = sample;
	}
	assert.ok(peak > 500 && peak <= 3000);
	assert.ok(maxStep < 600);
	assert.equal(wav.readInt16LE(44), 0);
	assert.equal(previous, 0);
});

void test("default automatic playback obeys mute; explicit Test and clear restore default without changing mute", { timeout: 5000 }, async () => {
	let settings: GlobalAudioNotificationSettings = { version: 1, enabled: false, sounds: {} };
	const store = { path: "/unused", load: () => Promise.resolve(settings),
		save: (value: GlobalAudioNotificationSettings) => { settings = value; return Promise.resolve(); } };
	const played: string[] = [];
	let complete = () => {};
	const playback = { platform: "darwin" as const, play: (path: string) => {
		played.push(path);
		if (played.length === 4) complete();
		return Promise.resolve();
	} };
	const service = createAudioNotificationService(pi, playback, store);
	const sounds = bindControlCenterSounds(pi, ctx, store, playback);
	for (const event of AUDIO_NOTIFICATION_EVENTS) service.notify(event, ctx);
	await new Promise<void>(resolve => setImmediate(resolve));
	assert.deepEqual(played, []);
	assert.equal((await sounds.apply({ kind: "sound-test", event: "completion" })).failed, false);
	assert.deepEqual(played, [bundled]);
	const view = await sounds.read();
	assert.match(view.note, /bundled default/i);
	assert.match(view.rows[1]?.details?.join(" | ") ?? "", /Effective \(bundled-default\)/);
	settings = { ...settings, sounds: { completion: bundled } };
	assert.equal((await sounds.apply({ kind: "sound-clear", event: "completion" })).failed, false);
	assert.equal(settings.enabled, false);
	assert.deepEqual(settings.sounds, {});
	const flagged = { getFlag: () => bundled } as unknown as ExtensionAPI;
	assert.equal(getEffectiveAudioNotificationPath(flagged, settings, "completion").source, "startup-flag", "clearing never removes flag precedence");
	assert.equal((await sounds.apply({ kind: "sound-test", event: "completion" })).failed, false);
	played.length = 0;
	assert.equal((await sounds.apply({ kind: "sound-enabled", value: true })).failed, false);
	const completed = new Promise<void>(resolve => { complete = resolve; });
	for (const event of AUDIO_NOTIFICATION_EVENTS) service.notify(event, ctx);
	await completed;
	assert.deepEqual(played, Array<string>(4).fill(bundled));
});

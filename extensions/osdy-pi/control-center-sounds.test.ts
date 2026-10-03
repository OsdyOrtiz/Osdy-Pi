import assert from "node:assert/strict";
import { existsSync, mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { registerHooks } from "node:module";
import test from "node:test";
import { fileURLToPath } from "node:url";
import type { GlobalAudioNotificationSettings } from "./audio-notification-types.js";
registerHooks({ resolve(specifier, context, nextResolve) {
	if (specifier.startsWith(".") && specifier.endsWith(".js") && context.parentURL?.endsWith(".ts")) {
		const url = new URL(`${specifier.slice(0, -3)}.ts`, context.parentURL);
		if (existsSync(fileURLToPath(url))) return { shortCircuit: true, url: url.href };
	}
	return nextResolve(specifier, context);
} });
const { createControlCenterSounds } = await import("./control-center-sounds.js");

function fixture(platform: "darwin" | "unsupported" = "darwin") {
	let settings: GlobalAudioNotificationSettings = { version: 1, sounds: { completion: "/saved.wav" } };
	let saveFails = false;
	let loadFails = false;
	let playFails = false;
	let failAfterSave = false;
	const played: string[] = [];
	const writes: GlobalAudioNotificationSettings[] = [];
	const service = createControlCenterSounds({
		cwd: process.cwd(),
		store: { path: "/unused", load: () => {
			if (loadFails) throw new Error("refresh failed");
			return Promise.resolve(settings);
		}, save: (value) => {
			if (saveFails) throw new Error("disk full");
			writes.push(value); settings = value;
			if (failAfterSave) loadFails = true;
			return Promise.resolve();
		} },
		effective: (_settings, event) => event === "completion"
			? { source: "startup-flag", path: "/flag.wav" } : { source: "unconfigured" },
		resolve: (event) => Promise.resolve({ ok: true, event, path: "/flag.wav", source: "startup-flag" }),
		playback: { platform, play: (path) => {
			if (playFails) throw new Error("player failed");
			played.push(path);
			return Promise.resolve();
		} },
		validate: (value) => Promise.resolve(value === "valid.wav"
			? { ok: true, inputPath: value, resolvedPath: "/valid.wav", persistedPath: "/valid.wav" }
			: { ok: false, reason: "missing" }),
	});
	return { service, played, writes, settings: () => settings,
		failSave: () => { saveFails = true; }, failLoad: () => { loadFails = true; }, failPlay: () => { playFails = true; }, failRefresh: () => { failAfterSave = true; } };
}

void test("Sounds shows saved/effective paths and flag precedence without playing or saving", async () => {
	const f = fixture();
	const view = await f.service.read();
	assert.match(view.summary, /Master.*unavailable/);
	assert.match(view.rows[0]?.details?.join(" | ") ?? "", /saved: \/saved.wav.*Effective \(startup-flag\): \/flag.wav/);
	assert.match(view.note, /clearing.*does not disable/i);
	assert.equal(view.rows.length, 12);
	assert.deepEqual(f.played, []); assert.deepEqual(f.writes, []);
});

void test("configure validates before saving and refreshes; clear keeps v1 and other paths", async () => {
	const f = fixture();
	assert.equal((await f.service.apply({ kind: "sound-set", event: "completion", path: "missing.wav" })).failed, true);
	assert.equal(f.writes.length, 0);
	assert.equal((await f.service.apply({ kind: "sound-set", event: "question", path: "valid.wav" })).failed, false);
	assert.deepEqual(f.settings(), { version: 1, sounds: { completion: "/saved.wav", question: "/valid.wav" } });
	const clear = await f.service.apply({ kind: "sound-clear", event: "completion" });
	assert.equal(clear.failed, false);
	assert.deepEqual(f.settings(), { version: 1, sounds: { question: "/valid.wav" } });
	assert.match((await f.service.read()).rows[0]?.details?.join(" | ") ?? "", /saved: none.*Effective \(startup-flag\): \/flag.wav/);
	assert.deepEqual(f.played, []);
});

void test("test playback is explicit, reports unavailable platforms and player failures", async () => {
	const f = fixture();
	assert.equal((await f.service.apply({ kind: "sound-test", event: "completion" })).failed, false);
	assert.deepEqual(f.played, ["/flag.wav"]); assert.deepEqual(f.writes, []);
	f.failPlay();
	assert.match((await f.service.apply({ kind: "sound-test", event: "completion" })).message, /player failed/);
	const unsupported = fixture("unsupported");
	assert.match((await unsupported.service.apply({ kind: "sound-test", event: "completion" })).message, /unavailable/);
	assert.deepEqual(unsupported.played, []);
});

void test("save errors and refresh errors never falsely report success", async () => {
	const f = fixture(); f.failSave();
	assert.match((await f.service.apply({ kind: "sound-clear", event: "completion" })).message, /Not saved.*disk full/);
	const g = fixture();
	g.failLoad();
	assert.equal((await g.service.apply({ kind: "sound-clear", event: "completion" })).failed, true);
	assert.deepEqual(g.writes, []);
	const h = fixture(); h.failRefresh();
	const result = await h.service.apply({ kind: "sound-clear", event: "completion" });
	assert.equal(result.failed, true);
	assert.match(result.message, /Saved globally, but runtime refresh failed/);
	assert.deepEqual(h.writes, [{ version: 1, sounds: {} }]);
});

void test("default validator rejects missing, unsupported and directory paths without saving", async () => {
	const root = mkdtempSync(join(tmpdir(), "osdy-sound-validation-"));
	mkdirSync(join(root, "directory.wav"));
	writeFileSync(join(root, "sound.wav"), "mock wave bytes");
	const f = fixture();
	const writes: GlobalAudioNotificationSettings[] = [];
	const service = createControlCenterSounds({ cwd: root,
		store: { path: "/unused", load: () => Promise.resolve(f.settings()), save: (value) => { writes.push(value); return Promise.resolve(); } },
		effective: () => ({ source: "unconfigured" }),
		resolve: (event) => Promise.resolve({ ok: false, event, source: "unconfigured", reason: "unconfigured" }),
		playback: { platform: "unsupported", play: () => Promise.reject(new Error("must not play")) },
	});
	for (const path of ["README.md", "absent-file.wav", "directory.wav", ""]) {
		const result = await service.apply({ kind: "sound-set", event: "error", path });
		assert.equal(result.failed, true); assert.match(result.message, /Invalid/);
	}
	assert.equal(writes.length, 0);
	assert.equal((await service.apply({ kind: "sound-set", event: "error", path: "sound.wav" })).failed, false);
	assert.equal(writes[0]?.sounds.error, join(root, "sound.wav"));
});

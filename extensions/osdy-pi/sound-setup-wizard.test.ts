import assert from "node:assert/strict";
import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { GlobalAudioNotificationSettings } from "./audio-notification-types.js";
registerHooks({ resolve(specifier, context, next) {
	if (specifier.startsWith(".") && specifier.endsWith(".js") && context.parentURL?.endsWith(".ts")) {
		const url = new URL(`${specifier.slice(0, -3)}.ts`, context.parentURL);
		if (existsSync(fileURLToPath(url))) return { shortCircuit: true, url: url.href };
	}
	return next(specifier, context);
} });
const { runSoundSetupWizard } = await import("./sound-setup-wizard.js");

void test("legacy wizard preserves mute when setting/clearing paths; cancellation never saves", async () => {
	const root = mkdtempSync(join(tmpdir(), "osdy-master-wizard-"));
	const sound = join(root, "sound.wav");
	writeFileSync(sound, "mock wave bytes");
	for (const confirmed of [true, false]) {
		const settings: GlobalAudioNotificationSettings = { version: 1, enabled: false, sounds: { completion: sound, permission: sound } };
		const writes: GlobalAudioNotificationSettings[] = [];
		const actions = ["Clear saved sound", "Set or replace", "Skip", "Use bundled default (startup flags still override)"];
		const ctx = { cwd: root, ui: { select: () => Promise.resolve(actions.shift()), input: () => Promise.resolve(sound),
			confirm: () => Promise.resolve(confirmed), notify: () => {} } } as unknown as ExtensionContext;
		await runSoundSetupWizard(ctx, { path: "/unused", load: () => Promise.resolve(settings),
			save: value => { writes.push(value); return Promise.resolve(); } });
		assert.deepEqual(writes, confirmed ? [{ version: 1, enabled: false, sounds: { error: sound, permission: sound } }] : []);
	}
});

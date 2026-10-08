import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
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

void test("wizard offers bundled default, explains flag precedence, and saves no asset paths while preserving mute", async () => {
	const writes: GlobalAudioNotificationSettings[] = [];
	const notices: string[] = [];
	let summary = "";
	const ctx = { cwd: "/unrelated-project", ui: {
		select: (_title: string, options: string[]) => {
			const choice = "Use bundled default (startup flags still override)";
			assert.ok(options.includes(choice));
			return Promise.resolve(choice);
		},
		confirm: (_title: string, value: string) => { summary = value; return Promise.resolve(true); },
		notify: (value: string) => { notices.push(value); },
	} } as unknown as ExtensionContext;
	await runSoundSetupWizard(ctx, { path: "/unused", load: () => Promise.resolve({ version: 1, enabled: false, sounds: {} }),
		save: value => { writes.push(value); return Promise.resolve(); } });
	assert.deepEqual(writes, [{ version: 1, enabled: false, sounds: {} }]);
	assert.match(summary, /completion: \(bundled default; startup flags still override\)/);
	assert.match(notices.join(" | "), /bundled default/i);
});

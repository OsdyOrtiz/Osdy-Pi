import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import test from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import type { ExtensionAPI, ExtensionCommandContext, ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { SpeechService, SpeechSettings } from "./speech-types.js";

registerHooks({
	resolve(specifier, context, nextResolve) {
		if (specifier.startsWith(".") && specifier.endsWith(".js") && context.parentURL?.endsWith(".ts")) {
			const url = new URL(`${specifier.slice(0, -3)}.ts`, context.parentURL);
			if (existsSync(fileURLToPath(url))) return { shortCircuit: true, url: url.href };
		}
		return nextResolve(specifier, context);
	},
	load(url, context, nextLoad) {
		if (url.endsWith(".ts")) return { format: "module", shortCircuit: true,
			source: ts.transpileModule(readFileSync(fileURLToPath(url), "utf8"), {
				compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
			}).outputText };
		return nextLoad(url, context);
	},
});
const { registerOsdyPi, getOsdyCommandCompletions } = await import("./runtime.js");

void test("Speech completions coexist with all legacy command paths", () => {
	for (const value of ["speech", "sound", "header", "mascot", "editor", "todo", "agents", "uninstall"]) {
		assert.ok(getOsdyCommandCompletions("")?.some(item => item.value === value), value);
	}
	assert.deepEqual(getOsdyCommandCompletions("speech")?.map(item => item.value), ["speech on", "speech off", "speech status", "speech stop", "speech last"]);
	assert.deepEqual(getOsdyCommandCompletions("speech st")?.map(item => item.value), ["speech status", "speech stop"]);
	assert.deepEqual(getOsdyCommandCompletions("sp")?.map(item => item.value), ["speech"]);
	assert.deepEqual(getOsdyCommandCompletions("sound")?.map(item => item.value), ["sound setup"]);
	assert.deepEqual(getOsdyCommandCompletions("todo")?.map(item => item.value), ["todo on", "todo off", "todo status"]);
});

void test("Registered runtime command uses injected speech service, keeps header and Sounds commands independent", async (t) => {
	const root = fileURLToPath(new URL("./", import.meta.url));
	const previous = process.env.PI_CODING_AGENT_DIR;
	process.env.PI_CODING_AGENT_DIR = root;
	const commands = new Map<string, { handler(args: string, ctx: ExtensionCommandContext): Promise<void> }>();
	const shortcuts = new Map<string, Parameters<ExtensionAPI["registerShortcut"]>[1]>();
	const hooks = new Map<string, Array<(event: unknown, ctx: ExtensionContext) => unknown>>();
	const notices: string[] = [];
	let settings: SpeechSettings = { version: 1, enabled: false, voice: "Paulina", rate: 180 };
	let stops = 0;
	const calls: string[] = [];
	const service: SpeechService = { settings: () => Promise.resolve(settings), voices: () => Promise.resolve(["Paulina"]),
		configure: patch => { settings = { ...settings, ...patch }; return Promise.resolve(settings); },
		speak: text => { calls.push(text); return Promise.resolve({ kind: "started" }); },
		preview: () => Promise.resolve({ kind: "started" }), stopPreview: () => {},
		available: () => true, stop: () => { stops++; },
	};
	const pi = { registerCommand: (name: string, command: { handler(args: string, ctx: ExtensionCommandContext): Promise<void> }) => { commands.set(name, command); },
		on: (name: string, handler: (event: unknown, ctx: ExtensionContext) => unknown) => { hooks.set(name, [...hooks.get(name) ?? [], handler]); },
		registerShortcut: (key: string, shortcut: Parameters<ExtensionAPI["registerShortcut"]>[1]) => { shortcuts.set(key, shortcut); },
		registerFlag: () => {}, registerMessageRenderer: () => {}, registerEntryRenderer: () => {},
		events: { on: () => () => {} }, exec: () => { throw new Error("No external execution"); },
	} as unknown as ExtensionAPI;
	const ctx = { cwd: root, hasUI: true, mode: "tui", isIdle: () => true,
		sessionManager: { getSessionId: () => "runtime-speech", getEntries: () => [] },
		ui: { notify: (text: string) => { notices.push(text); }, getEditorComponent: () => undefined },
	} as unknown as ExtensionCommandContext;
	const emit = async (name: string, event: unknown = {}) => { for (const hook of hooks.get(name) ?? []) await hook(event, ctx); };
	try {
		await registerOsdyPi(pi, { speechService: service, agentDir: () => root, readActiveProfile: () => Promise.resolve(undefined),
			editorSettingsStore: { path: `${root}/unused-speech-test-settings.json`, load: () => Promise.resolve({ version: 1, enabled: false, editorMode: "auto", workingTreeEnabled: false, headerVariant: "osdy-theme", mascot: "current" }), save: () => Promise.resolve() },
		});
		await emit("session_start");
		const command = commands.get("osdy-pi"); assert.ok(command);
		await command.handler("speech on", ctx); assert.equal(settings.enabled, true);
		await command.handler("speech status", ctx); assert.match(notices.at(-1) ?? "", /enabled.*Paulina.*180/);
		await command.handler("header status", ctx); assert.match(notices.at(-1) ?? "", /header: osdy-theme/);
		await command.handler("sound invalid", ctx); assert.match(notices.at(-1) ?? "", /sound setup/);
		const before = stops; await command.handler("speech stop", ctx); assert.equal(stops, before + 1);
		await command.handler("speech last", ctx); assert.match(notices.at(-1) ?? "", /No successful/);
		await command.handler("speech voice male", ctx); assert.match(notices.at(-1) ?? "", /Usage:.*speech/);
		await command.handler("unknown", ctx); assert.match(notices.at(-1) ?? "", /speech on\|off\|status\|stop\|last/);
		assert.deepEqual(calls, []);
		await t.test("Ctrl+Alt+S stops speech from busy chat without changing settings or calling command-only APIs", async () => {
			const shortcut = shortcuts.get("ctrl+alt+s");
			assert.ok(shortcut, "chat speech Stop shortcut must be registered");
			assert.match(shortcut.description ?? "", /stop.*speech/i);
			const beforeSettings = { ...settings };
			const beforeStops = stops;
			const shortcutContext: ExtensionContext = { ...ctx, isIdle: () => false };
			await shortcut.handler(shortcutContext);
			assert.equal(stops, beforeStops + 1);
			assert.deepEqual(settings, beforeSettings, "Stop never changes enabled, voice or rate");
			assert.equal(notices.at(-1), "Speech stopped (including pending starts).");
			assert.deepEqual(calls, [], "Stop never starts speech");
		});
	} finally {
		await emit("session_shutdown");
		if (previous === undefined) delete process.env.PI_CODING_AGENT_DIR; else process.env.PI_CODING_AGENT_DIR = previous;
	}
});

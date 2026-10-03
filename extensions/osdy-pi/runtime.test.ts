import assert from "node:assert/strict";
import { existsSync, readFileSync, mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI, Theme } from "@earendil-works/pi-coding-agent";
import { registerHooks } from "node:module";
import test from "node:test";
import { fileURLToPath } from "node:url";
import type { ExtensionCommandContext, ExtensionContext } from "@earendil-works/pi-coding-agent";
import ts from "typescript";

registerHooks({
	resolve(specifier, context, nextResolve) {
		if (
			specifier.startsWith(".") &&
			specifier.endsWith(".js") &&
			context.parentURL?.endsWith(".ts")
		) {
			const sourceUrl = new URL(`${specifier.slice(0, -3)}.ts`, context.parentURL);
			if (existsSync(fileURLToPath(sourceUrl))) {
				return { shortCircuit: true, url: sourceUrl.href };
			}
		}
		return nextResolve(specifier, context);
	},
	load(url, context, nextLoad) {
		if (url.endsWith(".ts")) {
			const source = readFileSync(fileURLToPath(url), "utf8");
			return {
				format: "module",
				shortCircuit: true,
				source: ts.transpileModule(source, {
					compilerOptions: {
						module: ts.ModuleKind.ESNext,
						target: ts.ScriptTarget.ES2022,
					},
				}).outputText,
			};
		}
		return nextLoad(url, context);
	},
});

const profileLabels = await import("./profile-label.js");
const { showControlCenter } = await import("./control-center.js");

void test("Control Center refuses RPC, print, JSON and missing UI without custom or mutation", async () => {
 for (const mode of ["rpc", "print", "json", "tui"] as const) {
  const notices: string[] = [];
  await showControlCenter({
   mode, hasUI: mode === "rpc",
   ui: {
    notify: (message) => { notices.push(message); },
    custom: () => { throw new Error("custom must not run"); },
    get theme(): Theme { throw new Error("theme must not be read"); },
    getAllThemes: () => { throw new Error("themes must not be read"); },
    setTheme: () => { throw new Error("settings must not mutate"); },
   },
  });
  assert.match(notices.join("\n"), /interactive terminal UI/);
 }
});

void test("Control Center reports custom UI startup errors", async () => {
 const notices: string[] = [];
 await showControlCenter({
  mode: "tui", hasUI: true,
  ui: {
   notify: (message) => { notices.push(message); },
   custom: () => Promise.reject(new Error("overlay failed")),
   get theme(): Theme { throw new Error("factory not invoked"); },
   getAllThemes: () => [], setTheme: () => ({ success: false }),
  },
 });
 assert.match(notices.join("\n"), /overlay failed/);
});

const { PLUGIN_EVENTS, subscribeQuestionPromptAudioNotification } =
	await import("./plugin-events.js");
const {
	createActiveSessionRefresh,
	getOsdyCommandCompletions,
	handleAgentsSetupCommand,
	refreshCodexUsage,
 registerOsdyPi,
 handleTodoProviderCommand,
} = await import("./runtime.js");

void test("actual factory registers no TODO surfaces by default, and all three only with opt-in", async () => {
 const root = mkdtempSync(join(tmpdir(), "osdy-runtime-todo-"));
 const agentDir = join(root, "agent"); mkdirSync(agentDir);
 mkdirSync(join(root, "rpiv-todo"));
 writeFileSync(join(root, "rpiv-todo", "config.json"), "{}");
 const previous = process.env.PI_CODING_AGENT_DIR;
 const previousConfig = process.env.XDG_CONFIG_HOME;
 const previousCwd = process.cwd();
 process.chdir(root);
 process.env.PI_CODING_AGENT_DIR = agentDir;
 process.env.XDG_CONFIG_HOME = root;
 try {
  for (const [settings, enabled, probes] of [
   ["{}", false, 0],
   ["{bad", false, 0],
   [JSON.stringify({ osdyPiTodoProvider: { enabled: true } }), false, 0],
   [JSON.stringify({ osdyPiTodoProvider: { version: 1, enabled: false, ownedExclusions: [] } }), false, 0],
   [JSON.stringify({ osdyPiTodoProvider: { version: 1, enabled: true, ownedExclusions: [] } }), true, 1],
   [JSON.stringify({ osdyPiTodoProvider: { version: 1, enabled: true, ownedExclusions: [] }, packages: ["npm:gentle-pi"] }), false, 1],
  ] as const) {
   writeFileSync(join(agentDir, "settings.json"), settings);
   const commands: string[] = []; const tools: string[] = []; const shortcuts: string[] = [];
   let execCalls = 0;
   const pi = { registerCommand: (name: string) => commands.push(name), registerTool: (tool: { name: string }) => tools.push(tool.name),
    registerShortcut: (key: string) => shortcuts.push(key), exec: (command: string, args: string[], options: { timeout: number; cwd?: string }) => {
     execCalls++;
     assert.equal(command, process.execPath);
     assert.deepEqual(args, ["--input-type=commonjs", "--eval", "process.stdout.write(JSON.stringify(process.cwd()))"]);
     assert.equal(options.cwd, undefined); assert.equal(options.timeout, 2000);
     return Promise.resolve({ stdout: JSON.stringify(root), stderr: "", code: 0, killed: false });
    }, registerFlag: () => {}, registerMessageRenderer: () => {}, registerEntryRenderer: () => {}, on: () => {}, events: { on: () => () => {} } } as unknown as ExtensionAPI;
   await registerOsdyPi(pi);
   assert.ok(commands.includes("osdy-pi"));
   assert.ok(commands.includes("osdy"));
   assert.equal(commands.includes("todos"), enabled); assert.equal(tools.includes("todo"), enabled);
   assert.equal(shortcuts.length > 0, enabled);
   assert.equal(execCalls, probes);
  }
 } finally {
  process.chdir(previousCwd);
  if (previous === undefined) delete process.env.PI_CODING_AGENT_DIR; else process.env.PI_CODING_AGENT_DIR = previous;
  if (previousConfig === undefined) delete process.env.XDG_CONFIG_HOME; else process.env.XDG_CONFIG_HOME = previousConfig;
 }
});

void test("official SDK factory uses SDK cwd, not the safe process cwd, before TODO registration", async () => {
 const { loadExtensionFromFactory, createExtensionRuntime } = await import("../../node_modules/@earendil-works/pi-coding-agent/dist/core/extensions/loader.js");
 const { default: factory } = await import("../osdy-pi.js");
 const root = mkdtempSync(join(tmpdir(), "osdy-sdk-cwd-"));
 const agentDir = join(root, "agent"); const safe = join(root, "safe"); const unsafe = join(root, "unsafe");
 mkdirSync(agentDir); mkdirSync(safe); mkdirSync(join(unsafe, ".pi"), { recursive: true });
 writeFileSync(join(unsafe, ".pi", "settings.json"), JSON.stringify({ packages: ["npm:gentle-pi"] }));
 mkdirSync(join(root, "rpiv-todo"));
 writeFileSync(join(root, "rpiv-todo", "config.json"), "{}");
 const previous = process.env.PI_CODING_AGENT_DIR; const previousCwd = process.cwd();
 const previousConfig = process.env.XDG_CONFIG_HOME;
 process.env.PI_CODING_AGENT_DIR = agentDir; process.env.XDG_CONFIG_HOME = root; process.chdir(safe);
 const eventBus = { on: () => () => {}, emit: () => {} };
 try {
  writeFileSync(join(agentDir, "settings.json"), JSON.stringify({ osdyPiTodoProvider: { version: 1, enabled: true, ownedExclusions: [] } }));
  for (const [cwd, active] of [[unsafe, false], [safe, true], [join(root, "missing"), false]] as const) {
   const runtime = createExtensionRuntime();
   try {
    const extension = await loadExtensionFromFactory(factory, cwd, eventBus, runtime);
    assert.ok(extension.commands.has("osdy-pi"));
    assert.ok(extension.commands.has("osdy"));
    assert.equal(extension.tools.has("todo"), active, cwd);
    assert.equal(extension.commands.has("todos"), active, cwd);
    assert.equal(extension.shortcuts.size > 0, active, cwd);
   } finally { runtime.invalidate(); }
  }
 } finally {
  process.chdir(previousCwd);
  if (previous === undefined) delete process.env.PI_CODING_AGENT_DIR; else process.env.PI_CODING_AGENT_DIR = previous;
  if (previousConfig === undefined) delete process.env.XDG_CONFIG_HOME; else process.env.XDG_CONFIG_HOME = previousConfig;
 }
});

void test("unavailable, failed and invalid SDK cwd probes fail closed", async () => {
 const root = mkdtempSync(join(tmpdir(), "osdy-sdk-probe-"));
 const previous = process.env.PI_CODING_AGENT_DIR;
 process.env.PI_CODING_AGENT_DIR = root;
 writeFileSync(join(root, "settings.json"), JSON.stringify({ osdyPiTodoProvider: { version: 1, enabled: true, ownedExclusions: [] } }));
 const ok = { stdout: JSON.stringify(root), stderr: "", code: 0, killed: false };
 try {
  for (const result of [undefined, new Error("exec unavailable"), { ...ok, code: 1 }, { ...ok, killed: true },
   { ...ok, stderr: "warning" }, { ...ok, stdout: "not json" }, { ...ok, stdout: '"relative"' },
   { ...ok, stdout: JSON.stringify(`${root}\u0000`) }, { ...ok, stdout: "{}" }, { ...ok, stdout: "x".repeat(16385) }]) {
   const commands: string[] = []; const tools: string[] = []; const shortcuts: string[] = [];
   const pi = { registerCommand: (name: string) => commands.push(name), registerTool: (tool: { name: string }) => tools.push(tool.name),
    registerShortcut: (key: string) => shortcuts.push(key),
    exec: result === undefined ? undefined : () => result instanceof Error ? Promise.reject(result) : Promise.resolve(result),
    registerFlag: () => {}, registerMessageRenderer: () => {}, registerEntryRenderer: () => {}, on: () => {}, events: { on: () => () => {} },
   } as unknown as ExtensionAPI;
   await registerOsdyPi(pi);
   assert.ok(commands.includes("osdy-pi")); assert.equal(commands.includes("todos"), false);
   assert.equal(tools.includes("todo"), false); assert.equal(shortcuts.length, 0);
  }
 } finally {
  if (previous === undefined) delete process.env.PI_CODING_AGENT_DIR; else process.env.PI_CODING_AGENT_DIR = previous;
 }
});

void test("TODO command confirms, cancels, reports activation and never touches stale context after reload", async () => {
 const root = mkdtempSync(join(tmpdir(), "osdy-command-todo-"));
 const previous = process.env.PI_CODING_AGENT_DIR; process.env.PI_CODING_AGENT_DIR = root;
 let stale = false; let accepted = false; let writes = 0; const notices: string[] = [];
 const ctx = { hasUI: true, cwd: root, ui: {
  confirm: (_title: string, message: string) => { assert.match(message, new RegExp(root)); return Promise.resolve(accepted); },
  notify: (message: string) => { assert.equal(stale, false); notices.push(message); },
 }, reload: () => { stale = true; return Promise.reject(new Error("reload failed")); } } as unknown as ExtensionCommandContext;
 try {
  const select = () => { writes++; return { changed: true }; };
  await handleTodoProviderCommand("on", ctx, false, select); assert.equal(writes, 0);
  accepted = true; await handleTodoProviderCommand("on", ctx, false, select); assert.equal(writes, 1);
  assert.ok(notices.some((text) => /restart|reload/i.test(text)));
  stale = false; await handleTodoProviderCommand("status", ctx, false); assert.ok(notices.some((text) => /configured.*actual/i.test(text)));
  await handleTodoProviderCommand("off", ctx, false, () => { throw new Error("write denied"); });
  assert.ok(notices.some((text) => /write denied/.test(text)));
  assert.deepEqual(getOsdyCommandCompletions("todo"), ["on", "off", "status"].map((action) => ({ value: `todo ${action}`, label: `todo ${action}` })));
 } finally { if (previous === undefined) delete process.env.PI_CODING_AGENT_DIR; else process.env.PI_CODING_AGENT_DIR = previous; }
});

void test("TODO command persists on/off in a disposable custom profile before successful reload", async () => {
 const root = mkdtempSync(join(tmpdir(), "osdy-command-switch-"));
 const previous = process.env.PI_CODING_AGENT_DIR;
 process.env.PI_CODING_AGENT_DIR = root;
 writeFileSync(join(root, "settings.json"), JSON.stringify({ packages: ["npm:gentle-pi"], theme: "retained" }));
 let reloaded = false;
 let reloads = 0;
 const ctx = {
  hasUI: true,
  cwd: root,
  ui: {
   confirm: () => Promise.resolve(true),
   notify: () => { assert.equal(reloaded, false); },
  },
  reload: () => { reloaded = true; reloads++; return Promise.resolve(); },
 } as unknown as ExtensionCommandContext;
 try {
  await handleTodoProviderCommand("on", ctx, false);
  let settings = JSON.parse(readFileSync(join(root, "settings.json"), "utf8")) as {
   theme: string; packages: unknown[]; osdyPiTodoProvider: { enabled: boolean };
  };
  assert.equal(settings.osdyPiTodoProvider.enabled, true);
  assert.equal(settings.theme, "retained");
  reloaded = false;
  await handleTodoProviderCommand("off", ctx, true);
  settings = JSON.parse(readFileSync(join(root, "settings.json"), "utf8")) as typeof settings;
  assert.equal(settings.osdyPiTodoProvider.enabled, false);
  assert.deepEqual(settings.packages, ["npm:gentle-pi"]);
  assert.equal(reloads, 2);
  reloaded = false;
  await handleTodoProviderCommand("bad", ctx, false);
  assert.equal(reloads, 2);
 } finally {
  if (previous === undefined) delete process.env.PI_CODING_AGENT_DIR;
  else process.env.PI_CODING_AGENT_DIR = previous;
 }
});

void test("startup label reader validates the dynamic module and active metadata only", async () => {
	const env = { OSDY_PI_SHARED_AGENT_DIR: "/unused/shared" };
	let reads = 0;
	for (const [record, expected] of [
		[{ status: "valid", profile: "work" }, "work"],
		[{ status: "unset" }, undefined],
		[{ status: "invalid" }, undefined],
		[{ status: "valid", profile: "default" }, undefined],
		[{ status: "valid", profile: "../bad" }, undefined],
		[null, undefined],
	] as const) {
		assert.equal(await profileLabels.readLastActiveProfileLabel(env, () => Promise.resolve({
			getSharedAgentDir: (received: NodeJS.ProcessEnv) => {
				assert.equal(received, env);
				return "/unused/shared";
			},
			readActiveAccount: (directory: string) => {
				assert.equal(directory, "/unused/shared");
				reads++;
				return Promise.resolve(record);
			},
		})), expected);
	}
	assert.equal(reads, 6);
	for (const module of [null, {}, { getSharedAgentDir: "bad" }, {
		getSharedAgentDir: () => 42, readActiveAccount: () => { throw new Error("unexpected read"); },
	}, {
		getSharedAgentDir: () => "/unused/shared", readActiveAccount: () => { throw new Error("read denied"); },
	}]) assert.equal(await profileLabels.readLastActiveProfileLabel(env, () => Promise.resolve(module)), undefined);
	assert.equal(await profileLabels.readLastActiveProfileLabel(env, () => Promise.reject(new Error("import failed"))), undefined);
});

void test("real session_start restores labels before editor mounting and rejects stale results", async () => {
	const previousDir = process.env.PI_CODING_AGENT_DIR;
	const previousName = process.env.OSDY_PI_PROFILE_NAME;
	// This nonexistent package-local directory prevents reads of personal settings.
	process.env.PI_CODING_AGENT_DIR = fileURLToPath(new URL("./.startup-test-missing", import.meta.url));
	try {
		for (const scenario of ["restore", "invalid-env", "explicit", "unset", "invalid", "deleted", "failure", "replace", "shutdown", "switch"] as const) {
			delete process.env.OSDY_PI_PROFILE_NAME;
			if (scenario === "explicit") process.env.OSDY_PI_PROFILE_NAME = "launcher";
			if (scenario === "invalid-env") process.env.OSDY_PI_PROFILE_NAME = "../invalid";
			const handlers = new Map<string, Array<(event: unknown, ctx: ExtensionContext) => Promise<void> | void>>();
			const mounted: string[] = [];
			let reads = 0;
			let complete: (value: string | undefined) => void = () => {};
			let entered: () => void = () => {};
			const started = new Promise<void>((resolve) => { entered = resolve; });
			const pending = new Promise<string | undefined>((resolve) => { complete = resolve; });
			const pi = {
				on: (name: string, handler: (event: unknown, ctx: ExtensionContext) => Promise<void> | void) => {
					const registered = handlers.get(name) ?? [];
					registered.push(handler);
					handlers.set(name, registered);
				},
				registerCommand: () => {}, registerFlag: () => {}, registerMessageRenderer: () => {}, registerEntryRenderer: () => {},
				events: { on: () => () => {} },
				exec: () => Promise.resolve({ code: 1, stdout: "", stderr: "unavailable" }),
			} as unknown as ExtensionAPI;
			const ctx = {
				hasUI: true, cwd: process.env.PI_CODING_AGENT_DIR,
				modelRegistry: { getProviderAuth: () => Promise.resolve(undefined) },
				ui: {
					getEditorComponent: () => undefined,
					setEditorComponent: () => {
						const label = profileLabels.resolveActiveProfileLabel();
						mounted.push(`${profileLabels.resolveEditorTitleLabel(label)}|${profileLabels.formatModelMetadata("test-model", "high", label)}`);
					},
					setHeader: () => {}, setFooter: () => {}, setWidget: () => {}, setWorkingVisible: () => {},
				},
			} as unknown as ExtensionContext;
			await registerOsdyPi(pi, { readActiveProfile: () => {
				reads++; entered();
				return scenario === "failure" ? Promise.reject(new Error("read failed")) : pending;
			} });
			// Role-marker resets register first; the runtime lifecycle registers second.
			const start = handlers.get("session_start")?.[1];
			const shutdown = handlers.get("session_shutdown")?.[1];
			assert.ok(start); assert.ok(shutdown);
			try {
				const startup = start({}, ctx);
				if (scenario !== "explicit") {
					await Promise.race([started, Promise.resolve(startup)]);
					assert.equal(reads, 1, "session_start must read the last active identity");
				}
				if (scenario === "switch") process.env.OSDY_PI_PROFILE_NAME = "new-selection";
				if (scenario === "shutdown") await shutdown({}, ctx);
				let replacement: Promise<void> | void = undefined;
				if (scenario === "replace") {
					process.env.OSDY_PI_PROFILE_NAME = "new-session";
					replacement = start({}, { ...ctx });
				}
				complete(["unset", "invalid", "deleted"].includes(scenario) ? undefined : "last-active");
				await startup;
				await replacement;
				const expected = scenario === "explicit" ? "launcher" : scenario === "switch" ? "new-selection" : scenario === "replace" ? "new-session" :
					["unset", "invalid", "deleted", "failure", "shutdown"].includes(scenario) ? undefined : "last-active";
				assert.equal(process.env.OSDY_PI_PROFILE_NAME, expected, scenario);
				assert.equal(reads, scenario === "explicit" ? 0 : 1, scenario);
				assert.equal(mounted.length, scenario === "shutdown" ? 0 : 1, scenario);
				if (mounted.length) assert.equal(mounted[0], `${expected ?? "Osdy-Pi"}|test-model · ${expected ? `${expected} · ` : ""}think high`, scenario);
			} finally { await shutdown({}, ctx); }
		}
	} finally {
		if (previousDir === undefined) delete process.env.PI_CODING_AGENT_DIR; else process.env.PI_CODING_AGENT_DIR = previousDir;
		if (previousName === undefined) delete process.env.OSDY_PI_PROFILE_NAME; else process.env.OSDY_PI_PROFILE_NAME = previousName;
	}
});

class TestEventBus {
	event: string | undefined;
	handler: ((data: unknown) => void) | undefined;

	on(event: string, handler: (data: unknown) => void): () => void {
		this.event = event;
		this.handler = handler;
		return () => {
			this.handler = undefined;
		};
	}

	emit(event: string, data: unknown): void {
		if (event === this.event) this.handler?.(data);
	}
}

class TestExtensionApi {
	readonly events = new TestEventBus();
	lifecycleOnCallCount = 0;

	on(): void {
		this.lifecycleOnCallCount += 1;
	}
}

class TestSessionContextProvider {
	context: ExtensionContext | undefined;

	getCurrentSessionContext(): ExtensionContext | undefined {
		return this.context;
	}
}

void test("runtime wires standalone role markers to the existing enabled state", () => {
 const source = readFileSync(new URL("./runtime.ts", import.meta.url), "utf8");
 assert.match(source, /registerMessageRoleMarkers\(pi, \(\) => state\.enabled\)/);
 assert.equal(source.match(/registerMessageRoleMarkers\(pi, /g)?.length, 1);
});

void test("runtime passes one session store to exactly one todo tool and command", () => {
 const source = readFileSync(new URL("./runtime.ts", import.meta.url), "utf8");
 assert.equal(source.match(/createTodoSessionStore\(\)/g)?.length, 1);
 assert.equal(source.match(/registerTodoTool\(pi, todoStore\)/g)?.length, 1);
 assert.equal(source.match(/registerTodosCommand\(pi, todoStore\)/g)?.length, 1);
 assert.equal(source.match(/registerTodoWidget\(pi, todoStore\)/g)?.length, 1);
});

void test("agents setup requires interactive confirmation and reloads only after success", async () => {
	const notices: string[] = [];
	let installs = 0;
	let reloads = 0;
	let accepted = false;
	const ui = {
		confirm: (_title: string, message: string) => {
			assert.match(message, /pi-subagents-j0k3r/);
			assert.match(message, /gentle-agents\.ts/);
			assert.match(message, /settings\.json/);
			return Promise.resolve(accepted);
		},
		notify: (message: string) => { notices.push(message); },
	};
	const ctx = { mode: "tui", hasUI: true, cwd: "/tmp", ui, reload: () => { reloads++; return Promise.resolve(); } } as unknown as ExtensionCommandContext;
	const setup = () => { installs++; return Promise.resolve({ installed: true, changed: true, gentleCount: 1 }); };
	await handleAgentsSetupCommand("setup", ctx, setup);
	assert.equal(installs, 0);
	accepted = true;
	await handleAgentsSetupCommand("setup", ctx, setup);
	assert.equal(installs, 1);
	assert.equal(reloads, 1);
	await handleAgentsSetupCommand("status", ctx, setup, () => Promise.resolve({ jokerInstalled: true, gentleCount: 1, filtered: true, mode: "joker" as const }));
	assert.ok(notices.some((notice) => notice.includes("agent exclusion complete")));
	await handleAgentsSetupCommand("invalid", ctx, setup);
	assert.equal(installs, 1);
	assert.ok(notices.some((notice) => notice.includes("Usage:")));
	assert.deepEqual(getOsdyCommandCompletions("agents"), ["setup", "on", "off", "status"].map((action) => ({ value: `agents ${action}`, label: `agents ${action}` })));
});

void test("agents off confirms and switches, reports actual mode, and guides restart on failed reload", async () => {
	const notices: string[] = [];
	const confirmations: string[] = [];
	const modes: string[] = [];
	const ctx = { hasUI: true, cwd: "/tmp", ui: {
		confirm: (_title: string, message: string) => { confirmations.push(message); return Promise.resolve(true); },
		notify: (message: string) => { notices.push(message); },
	}, reload: () => Promise.reject(new Error("reload failed")) } as unknown as ExtensionCommandContext;
	await handleAgentsSetupCommand("off", ctx, undefined, () => Promise.resolve({ jokerInstalled: true, gentleCount: 1, filtered: false, mode: "gentle" }),
		(options) => { modes.push(options.mode); return Promise.resolve({ installed: false, changed: true, gentleCount: 1 }); });
	assert.deepEqual(modes, ["off"]);
	assert.match(confirmations[0] ?? "", /Joker.*Gentle|Gentle.*Joker/i);
	assert.ok(notices.some((notice) => /restart Pi/i.test(notice)));
	await handleAgentsSetupCommand("status", ctx, undefined, () => Promise.resolve({ jokerInstalled: true, gentleCount: 1, filtered: false, mode: "gentle" }));
	assert.ok(notices.some((notice) => /Gentle/.test(notice)));
	assert.deepEqual(getOsdyCommandCompletions("agents"), ["setup", "on", "off", "status"].map((action) => ({ value: `agents ${action}`, label: `agents ${action}` })));
});

void test("header command completes only catalog choices and is persisted through session wiring", () => {
	assert.deepEqual(getOsdyCommandCompletions("header"), [
		{ value: "header osdy-theme", label: "header osdy-theme" },
		{ value: "header neon", label: "header neon" },
		{ value: "header status", label: "header status" },
	]);
	assert.deepEqual(getOsdyCommandCompletions("header n"), [
		{ value: "header neon", label: "header neon" },
	]);
	assert.deepEqual(getOsdyCommandCompletions("classic"), []);

	const source = readFileSync(new URL("./runtime.ts", import.meta.url), "utf8");
	assert.match(
		source,
		/async function handleHeaderCommand[\s\S]*?state\.headerVariant = action;[\s\S]*?applyOsdyPi\([\s\S]*?saveVisualSettings\(state, settingsStore\)/,
	);
	assert.match(source, /headerVariant: state\.headerVariant/);
	assert.match(source, /state\.headerVariant = editorSettings\.headerVariant;/);
	assert.doesNotMatch(source, /registerCommand\(`osdy-pi-\$\{variant\}`/);
	assert.doesNotMatch(source, /\["osdy-theme", "classic"\]/);
	assert.doesNotMatch(source, /if \(isHeaderVariant\(action\)\)/);
});

void test("uninstall command is offered and wired through guarded Pi CLI removal", () => {
 assert.deepEqual(getOsdyCommandCompletions("uninstall"), [
  { value: "uninstall", label: "uninstall" },
 ]);
 const source = readFileSync(new URL("./runtime.ts", import.meta.url), "utf8");
 assert.match(source, /action === "uninstall"/);
 assert.match(source, /!ctx\.hasUI \|\| !ctx\.isProjectTrusted\(\)/);
 assert.match(source, /runOsdyUninstall\(/);
 assert.match(source, /pi\.exec\("pi", \["remove", source/);
});

void test("mascot command completes current, Bts, and status while persisting with immediate refresh", () => {
	assert.deepEqual(getOsdyCommandCompletions("mascot"), [
		{ value: "mascot current", label: "mascot current" },
		{ value: "mascot bts", label: "mascot bts" },
		{ value: "mascot status", label: "mascot status" },
	]);
	assert.deepEqual(getOsdyCommandCompletions("mascot b"), [
		{ value: "mascot bts", label: "mascot bts" },
	]);
	assert.deepEqual(getOsdyCommandCompletions("mascot d"), []);

	const source = readFileSync(new URL("./runtime.ts", import.meta.url), "utf8");
	assert.match(
		source,
		/state\.mascot = action;[\s\S]*?applyOsdyPi\([\s\S]*?saveVisualSettings\(state, settingsStore\)/,
	);
	assert.match(source, /state\.mascot = editorSettings\.mascot;/);
	assert.match(source, /function mascotLabel\(mascot: MascotChoice\): string/);
	assert.match(source, /osdy-pi mascot: \$\{mascotLabel\(state\.mascot\)\}/);
});

void test("account switching requests an editor render independently of usage refresh", () => {
	const source = readFileSync(new URL("./runtime.ts", import.meta.url), "utf8");

	assert.match(
		source,
		/registerAccountProfilesCommand\(pi, \{[\s\S]*?requestRender: \(\) => \{[\s\S]*?state\.tui\?\.requestRender\(\);[\s\S]*?\},[\s\S]*?refreshUsage: async \(\) => \{[\s\S]*?const activeSessionContext = sessionContext;[\s\S]*?await refreshCurrentCodexUsage\(activeSessionContext\)/,
	);
});

void test("usage refresh resolves the active session instead of a distinct command context", async () => {
	const activeSessionContext = { id: "active-session" };
	const commandContext = { id: "command-context" };
	const refreshedContexts: Array<{ id: string }> = [];
	const refreshActiveSessionUsage = createActiveSessionRefresh(
		() => activeSessionContext,
		(context) => {
			refreshedContexts.push(context);
			return Promise.resolve();
		},
	);

	assert.notEqual(commandContext, activeSessionContext);
	await refreshActiveSessionUsage();
	assert.deepEqual(refreshedContexts, [activeSessionContext]);
});

void test("agent settlement refreshes enabled active Codex sessions without comparing event context identity", () => {
	const source = readFileSync(new URL("./runtime.ts", import.meta.url), "utf8");
	const agentSettledHandler = source.match(
		/pi\.on\("agent_settled", \(\) => \{([\s\S]*?)\n\t\}\);/,
	)?.[1];
	const agentEndHandler = source.match(
		/pi\.on\("agent_end", \(_event, ctx\) => \{([\s\S]*?)\n\t\}\);/,
	)?.[1];

	assert.ok(agentSettledHandler);
	assert.match(
		agentSettledHandler,
		/const activeSessionContext = sessionContext;[\s\S]*?state\.enabled[\s\S]*?activeSessionContext &&[\s\S]*?activeSessionContext\.model\?\.provider === "openai-codex"[\s\S]*?void refreshCurrentCodexUsage\(activeSessionContext\)/,
	);
	assert.doesNotMatch(agentSettledHandler, /activeSessionContext\s*===\s*ctx/);
	assert.ok(agentEndHandler);
	assert.doesNotMatch(agentEndHandler, /refreshCurrentCodexUsage/);
});

void test("Codex usage state refresh repaints the shared TUI after loading and error", async () => {
	const renderedStates: string[] = [];
	const state = {
		codexUsage: { kind: "idle" } as const,
		tui: {
			requestRender: () => renderedStates.push(state.codexUsage.kind),
		},
	};

	await refreshCodexUsage(
		{
			modelRegistry: {
				getProviderAuth: () => Promise.resolve(undefined),
			},
		},
		state,
		new AbortController(),
	);

	assert.deepEqual(renderedStates, ["loading", "error"]);
	assert.equal(state.codexUsage.kind, "error");
});

void test("Codex usage refresh repaints the shared TUI with its ready quota snapshot", async () => {
	const snapshot = {
		planType: "plus",
		ordinaryUsageAllowed: true,
		buckets: [
			{
				id: "codex",
				label: undefined,
				primary: { usedPercent: 37, windowMinutes: 300, resetsAt: undefined },
				secondary: undefined,
			},
		],
		credits: undefined,
		fetchedAt: 1_900_000_000_000,
	};
	const renderedStates: string[] = [];
	const state = {
		codexUsage: { kind: "idle" } as const,
		tui: {
			requestRender: () => renderedStates.push(state.codexUsage.kind),
		},
	};
	const accessToken = `header.${Buffer.from(
		JSON.stringify({
			"https://api.openai.com/auth": { chatgpt_account_id: "account-id" },
		}),
	).toString("base64url")}.signature`;

	await refreshCodexUsage(
		{
			modelRegistry: {
				getProviderAuth: () => Promise.resolve({ auth: { apiKey: accessToken } }),
			},
		},
		state,
		new AbortController(),
		() => Promise.resolve(snapshot),
	);

	assert.deepEqual(renderedStates, ["loading", "ready"]);
	assert.deepEqual(state.codexUsage, { kind: "ready", snapshot });
});

void test("Codex refresh discards prior usage snapshots and shutdown resets usage state", () => {
	const source = readFileSync(new URL("./runtime.ts", import.meta.url), "utf8");
	assert.match(
		source,
		/state\.codexUsage = \{ kind: "loading", snapshot: undefined \}/,
	);
	assert.match(source, /kind: "error",[\s\S]*?snapshot: undefined,/);
	assert.match(
		source,
		/pi\.on\("session_shutdown", \(\) => \{[\s\S]*?codexUsageAbort\?\.abort\(\);[\s\S]*?state\.codexUsage = \{ kind: "idle" \}/,
	);
});

void test("agent and tool completion reclaim the Gentle changed-files widget", () => {
	const source = readFileSync(new URL("./runtime.ts", import.meta.url), "utf8");
	const agentEndHandler = source.match(
		/pi\.on\("agent_end", \(_event, ctx\) => \{([\s\S]*?)\n\t\}\);/,
	)?.[1];
	const toolExecutionEndHandler = source.match(
		/pi\.on\("tool_execution_end", \(event, ctx\) => \{([\s\S]*?)\n\t\}\);/,
	)?.[1];

	assert.ok(agentEndHandler);
	assert.ok(toolExecutionEndHandler);
	assert.match(
		agentEndHandler,
		/if \(state\.enabled\) clearGentleShellChangesWidget\(ctx\)/,
	);
	assert.match(
		toolExecutionEndHandler,
		/if \(state\.enabled\) clearGentleShellChangesWidget\(ctx\)/,
	);
});

void test("session shutdown does not restore the captured fallback editor", () => {
	const source = readFileSync(new URL("./runtime.ts", import.meta.url), "utf8");
	const shutdownHandler = source.match(
		/pi\.on\("session_shutdown", \(\) => \{([\s\S]*?)\n\t\}\);/,
	)?.[1];

	assert.ok(shutdownHandler);
	assert.doesNotMatch(shutdownHandler, /disableOsdyPi|setEditorComponent/);
});

void test("persisted disabled startup leaves Gentle UI unclaimed and simple startup stays native", () => {
	const source = readFileSync(new URL("./runtime.ts", import.meta.url), "utf8");
	const sessionStartHandler = source.match(
		/pi\.on\("session_start", async \(_event, ctx\) => \{([\s\S]*?)\n\t\}\);/,
	)?.[1];

	assert.ok(sessionStartHandler);
	assert.match(
		sessionStartHandler,
		/state\.fallbackEditorFactory = ctx\.ui\.getEditorComponent\(\);[\s\S]*?state\.enabled = editorSettings\.enabled;[\s\S]*?if \(!state\.enabled\) return;/,
	);
	assert.match(
		sessionStartHandler,
		/state\.editorMode = editorSettings\.editorMode;[\s\S]*?claimOsdyVisualLayer\(/,
	);
	assert.match(
		sessionStartHandler,
		/if \(!state\.enabled\) return;[\s\S]*?startResponsive\(\)/,
	);
	assert.match(
		source,
		/const startResponsive = \(\): void => \{[\s\S]*?responsiveCoordinator = createResponsiveCoordinator\(/,
	);
});

void test("enable, disable, and their on/off aliases persist the complete visual settings", () => {
	const source = readFileSync(new URL("./runtime.ts", import.meta.url), "utf8");

	assert.match(source, /\["enable", "on"\]\.includes\(action\)/);
	assert.match(source, /\["disable", "off"\]\.includes\(action\)/);
	assert.match(
		source,
		/settingsStore\.save\(\{[\s\S]*?enabled: state\.enabled,[\s\S]*?editorMode: state\.editorMode,[\s\S]*?workingTreeEnabled: state\.workingTreeEnabled,[\s\S]*?\}\)/,
	);
});

void test("registers session-backed todo surfaces without the old ODD tool", () => {
 const source = readFileSync(new URL("./runtime.ts", import.meta.url), "utf8");
 assert.match(source, /import \{ registerTodoTool \} from "\.\/todo-tool\.js"/);
 assert.match(source, /import \{ registerTodosCommand \} from "\.\/todo-command\.js"/);
 assert.doesNotMatch(source, /registerOddTodo|odd-todo-ui/);
});

void test("does not import or register the response-card Markdown transformer", () => {
	const source = readFileSync(new URL("./runtime.ts", import.meta.url), "utf8");

	assert.doesNotMatch(source, /response-card/);
	assert.doesNotMatch(source, /pi\.registerMarkdownTransformer\(/);
});

void test("every registered theme defines native user message colors", () => {
	const manifest = JSON.parse(
		readFileSync(new URL("../../package.json", import.meta.url), "utf8"),
	) as { pi: { themes: string[] } };

	assert.equal(manifest.pi.themes.length, 23);
	assert.equal(new Set(manifest.pi.themes).size, 23, "theme registrations must be unique");
	for (const themePath of manifest.pi.themes) {
		const theme = JSON.parse(
			readFileSync(
				new URL(`../../${themePath.replace(/^\.\//, "")}`, import.meta.url),
				"utf8",
			),
		) as { colors: Record<string, unknown> };
		for (const token of ["userMessageBg", "userMessageText"]) {
			const value = theme.colors[token];
			assert.equal(
				typeof value === "string" && value.trim() !== "",
				true,
				`${themePath} must define a non-empty ${token}`,
			);
		}
	}
});

void test("new dark themes are explicitly registered with unique matching names", () => {
	const manifest = JSON.parse(
		readFileSync(new URL("../../package.json", import.meta.url), "utf8"),
	) as { pi: { themes: string[] } };
	const names = manifest.pi.themes.map((path) => {
		const theme = JSON.parse(readFileSync(new URL(`../../${path}`, import.meta.url), "utf8")) as { name: string };
		assert.equal(path, `./themes/${theme.name}.json`);
		return theme.name;
	});
	assert.equal(new Set(names).size, names.length, "theme names must be unique");
	for (const name of ["osdy-pi-gruvbox-dark", "osdy-pi-nord", "osdy-pi-rose-pine", "osdy-pi-daniela-cute", "osdy-pi-halloween", "osdy-pi-halloween-killer", "osdy-pi-spider-man-classic", "osdy-pi-miles-morales", "osdy-pi-spider-verse"]) {
		assert.equal(manifest.pi.themes.filter((path) => path === `./themes/${name}.json`).length, 1);
		assert.equal(names.filter((registered) => registered === name).length, 1);
	}
});

void test("README documents all 23 themes including three Spider-Man-inspired palettes", () => {
	const readme = readFileSync(new URL("../../README.md", import.meta.url), "utf8");
	assert.match(readme, /\*\*23 themes\*\*/);
	assert.match(readme, /23 built-in themes/);
	assert.doesNotMatch(readme, /\b(?:18|20) (?:built-in )?themes\b/);
	assert.equal(readme.match(/^\| `osdy-pi-[^`]+` \|/gm)?.length, 23);
	for (const name of ["osdy-pi-spider-man-classic", "osdy-pi-miles-morales", "osdy-pi-spider-verse"]) {
		assert.ok(readme.includes(`| \`${name}\` |`), `${name}: documented theme row`);
	}
	assert.match(readme, /\| `osdy-pi-daniela-cute` \| Daniela Cute/);
	assert.match(readme, /\| `osdy-pi-halloween` \|.*[Pp]umpkin.*violet.*lime/);
	assert.match(readme, /\| `osdy-pi-halloween-killer` \|.*[Gg]othic.*blood.red.*violet/);
});

void test("Tokyo Night retains its approved native user card colors", () => {
	const theme = JSON.parse(
		readFileSync(
			new URL("../../themes/osdy-pi-tokyo-night.json", import.meta.url),
			"utf8",
		),
	) as { colors: Record<string, unknown> };

	assert.deepEqual(
		{
			userMessageBg: theme.colors.userMessageBg,
			userMessageText: theme.colors.userMessageText,
		},
		{
			userMessageBg: "#283b59",
			userMessageText: "text",
		},
	);
});

void test("question prompts subscribe through the plugin event bus", () => {
	const api = new TestExtensionApi();
	const sessionContextProvider = new TestSessionContextProvider();
	const notifiedContexts: ExtensionContext[] = [];

	subscribeQuestionPromptAudioNotification(api, sessionContextProvider, {
		onQuestionRequested: (ctx) => notifiedContexts.push(ctx),
	});

	assert.equal(api.events.event, PLUGIN_EVENTS.QUESTION_PROMPT);
	assert.equal(api.lifecycleOnCallCount, 0);
	api.events.emit(PLUGIN_EVENTS.QUESTION_PROMPT, undefined);
	assert.deepEqual(notifiedContexts, []);

	// SAFETY: The notification contract only passes this context through unchanged.
	const sessionContext = {} as ExtensionContext;
	sessionContextProvider.context = sessionContext;
	api.events.emit(PLUGIN_EVENTS.QUESTION_PROMPT, { question: "Continue?" });
	assert.deepEqual(notifiedContexts, [sessionContext]);
});

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
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

const { PLUGIN_EVENTS, subscribeQuestionPromptAudioNotification } =
	await import("./plugin-events.js");
const {
	createActiveSessionRefresh,
	getOsdyCommandCompletions,
	handleAgentsSetupCommand,
	refreshCodexUsage,
} = await import("./runtime.js");

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

	assert.equal(manifest.pi.themes.length, 18);
	assert.equal(new Set(manifest.pi.themes).size, 18, "theme registrations must be unique");
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
	for (const name of ["osdy-pi-gruvbox-dark", "osdy-pi-nord", "osdy-pi-rose-pine", "osdy-pi-daniela-cute"]) {
		assert.equal(manifest.pi.themes.filter((path) => path === `./themes/${name}.json`).length, 1);
		assert.equal(names.filter((registered) => registered === name).length, 1);
	}
});

void test("README documents all 18 themes including Daniela Cute", () => {
	const readme = readFileSync(new URL("../../README.md", import.meta.url), "utf8");
	assert.match(readme, /\*\*18 themes\*\*/);
	assert.match(readme, /18 built-in themes/);
	assert.match(readme, /\| `osdy-pi-daniela-cute` \| Daniela Cute/);
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

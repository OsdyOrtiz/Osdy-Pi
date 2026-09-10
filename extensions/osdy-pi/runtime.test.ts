import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import test from "node:test";
import { fileURLToPath } from "node:url";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
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
const { createActiveSessionRefresh, refreshCodexUsage } =
	await import("./runtime.js");

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

void test("registers one enabled-aware response-card Markdown transformer", () => {
	const source = readFileSync(new URL("./runtime.ts", import.meta.url), "utf8");

	assert.match(
		source,
		/import \{ createResponseCardMarkdownTransformer \} from "\.\/response-card\.js";/,
	);
	assert.equal(
		(source.match(/pi\.registerMarkdownTransformer\(/g) ?? []).length,
		1,
	);
	assert.match(
		source,
		/pi\.registerMarkdownTransformer\(\s*createResponseCardMarkdownTransformer\(\(\) => state\.enabled\),\s*\);/,
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

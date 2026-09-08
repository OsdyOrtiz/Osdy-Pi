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

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import test from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import type { ContextUsageSource } from "./metrics.ts";

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
			return {
				format: "module",
				shortCircuit: true,
				source: ts.transpileModule(readFileSync(fileURLToPath(url), "utf8"), {
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

const { contextUsageData } = await import("./metrics.js");

function createContext(percent: number | undefined): ContextUsageSource {
	return {
		getContextUsage: () =>
			percent === undefined ? undefined : { percent, contextWindow: 200_000 },
		sessionManager: {
			getEntries: () => [
				{
					type: "message",
					message: {
						role: "assistant",
						usage: {
							input: 1_500,
							output: 2_500_000,
							cacheRead: 12,
							cacheWrite: 34,
							cost: { total: 1.23456 },
						},
					},
				},
			],
		},
	};
}

void test("returns presentation-neutral usage totals and context data", () => {
	assert.deepEqual(contextUsageData(createContext(30)), {
		input: 1_500,
		output: 2_500_000,
		cacheRead: 12,
		cacheWrite: 34,
		cost: 1.23456,
		percent: 30,
		contextWindow: 200_000,
	});
});

void test("uses the model window when context usage omits it", () => {
	const context = createContext(30);
	context.getContextUsage = () => ({ percent: 30 });
	context.model = { contextWindow: 272_000 };
	assert.equal(contextUsageData(context).contextWindow, 272_000);
});

void test("represents unavailable context usage and window without formatting", () => {
	assert.deepEqual(contextUsageData(createContext(undefined)), {
		input: 1_500,
		output: 2_500_000,
		cacheRead: 12,
		cacheWrite: 34,
		cost: 1.23456,
		percent: undefined,
		contextWindow: undefined,
	});
});

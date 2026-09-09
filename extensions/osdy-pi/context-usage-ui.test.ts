import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import test from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { visibleWidth } from "@earendil-works/pi-tui";

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

const { formatContextUsage } = await import("./context-usage-ui.js");

const theme = {
	fg(token: string, text: string): string {
		return `<${token}>${text}</${token}>`;
	},
};

void test("formats the selected single-line usage shape", () => {
	assert.equal(
		formatContextUsage(theme, {
			input: 0,
			output: 0,
			cacheRead: 0,
			cacheWrite: 0,
			cost: 0,
			percent: 60,
			contextWindow: 272_000,
		}),
		"tok ↑0 ↓0 · $0.0000 · ctx <warning>[██████░░░░]</warning> 60%/272.0k",
	);
});

void test("selects the full or compact usage line at the ANSI-aware width boundary", () => {
	const ansiTheme = {
		fg(_token: string, text: string): string {
			return `\u001B[33m${text}\u001B[39m`;
		},
	};
	const usage = {
		input: 0,
		output: 0,
		cacheRead: 0,
		cacheWrite: 0,
		cost: 0,
		percent: 60,
		contextWindow: 272_000,
	};
	const full =
		"tok ↑0 ↓0 · $0.0000 · ctx \u001B[33m[██████░░░░]\u001B[39m 60%/272.0k";

	assert.equal(visibleWidth(full), 49);
	assert.equal(formatContextUsage(ansiTheme, usage, 49), full);
	assert.equal(
		formatContextUsage(ansiTheme, usage, 48),
		"$0.0000 · ctx \u001B[33m[██████░░░░]\u001B[39m 60%",
	);
});

void test("formats a ten-cell green context bar at the inclusive 30% threshold", () => {
	assert.equal(
		formatContextUsage(theme, {
			input: 0,
			output: 0,
			cacheRead: 0,
			cacheWrite: 0,
			cost: 0,
			percent: 30,
			contextWindow: 272_000,
		}),
		"tok ↑0 ↓0 · $0.0000 · ctx <success>[███░░░░░░░]</success> 30%/272.0k",
	);
});

void test("uses warning and error colors for higher rounded usage", () => {
	assert.equal(
		formatContextUsage(theme, {
			input: 1_500,
			output: 2_500_000,
			cacheRead: 12,
			cacheWrite: 34,
			cost: 1.2,
			percent: 30.5,
			contextWindow: 200_000,
		}),
		"tok ↑1.5k ↓2.5m R12 W34 · $1.2000 · ctx <warning>[███░░░░░░░]</warning> 31%/200.0k",
	);
	assert.equal(
		formatContextUsage(theme, {
			input: 0,
			output: 0,
			cacheRead: 0,
			cacheWrite: 0,
			cost: 1.2,
			percent: 80.5,
			contextWindow: 200_000,
		}),
		"tok ↑0 ↓0 · $1.2000 · ctx <error>[████████░░]</error> 81%/200.0k",
	);
});

void test("clamps usage and safely represents missing context usage", () => {
	assert.equal(
		formatContextUsage(theme, {
			input: 0,
			output: 0,
			cacheRead: 0,
			cacheWrite: 0,
			cost: 0,
			percent: -10,
			contextWindow: 200_000,
		}),
		"tok ↑0 ↓0 · $0.0000 · ctx <success>[░░░░░░░░░░]</success> 0%/200.0k",
	);
	assert.equal(
		formatContextUsage(theme, {
			input: 0,
			output: 0,
			cacheRead: 0,
			cacheWrite: 0,
			cost: 0,
			percent: undefined,
			contextWindow: 272_000,
		}),
		"tok ↑0 ↓0 · $0.0000 · ctx <success>[░░░░░░░░░░]</success> ?%/272.0k",
	);
	assert.equal(
		formatContextUsage(theme, {
			input: 0,
			output: 0,
			cacheRead: 0,
			cacheWrite: 0,
			cost: 0,
			percent: undefined,
			contextWindow: undefined,
		}),
		"tok ↑0 ↓0 · $0.0000 · ctx <success>[░░░░░░░░░░]</success> ?%/?",
	);
});

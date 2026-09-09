import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import test from "node:test";
import { fileURLToPath } from "node:url";
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

const { createResponseCardMarkdownTransformer } = await import(
	"./response-card.js"
);

void test("wraps every assistant Markdown line, including blank lines, in one quote card", () => {
	const transform = createResponseCardMarkdownTransformer(() => true);

	assert.equal(
		transform("First line\n\nLast line", { messageType: "assistant" }),
		"> First line\n> \n> Last line",
	);
});

void test("marks every user source Markdown line without quote syntax or a role label", () => {
	const transform = createResponseCardMarkdownTransformer(() => true);
	const markdown = "# Heading\n\n- item\n\n```ts\nconst value = 1;\n```";
	const output = transform(markdown, { messageType: "user" });

	assert.equal(
		output,
		"▌ # Heading\n▌ \n▌ - item\n▌ \n▌ ```ts\n▌ const value = 1;\n▌ ```",
	);
	assert.equal(output.startsWith("▌\n"), false);
	assert.equal(output.includes("> "), false);
	assert.equal(
		transform("First\n\nThird", { messageType: "user" }),
		"▌ First\n▌ \n▌ Third",
	);
	assert.equal(transform(markdown, { messageType: "user" }), output);
	// Terminal soft wraps are not source Markdown lines, so they cannot be marked here.
});

void test("leaves assistant-thinking, disabled, and empty Markdown unchanged", () => {
	const enabledTransform = createResponseCardMarkdownTransformer(() => true);
	const disabledTransform = createResponseCardMarkdownTransformer(() => false);
	assert.equal(
		enabledTransform("Thinking", { messageType: "assistant-thinking" }),
		"Thinking",
	);
	assert.equal(
		disabledTransform("Assistant message", { messageType: "assistant" }),
		"Assistant message",
	);
	assert.equal(enabledTransform("", { messageType: "assistant" }), "");
	assert.equal(enabledTransform("", { messageType: "user" }), "");
});

void test("stays prefix-stable across streaming and finalized renders of original Markdown", () => {
	const transform = createResponseCardMarkdownTransformer(() => true);

	assert.equal(
		transform("Streaming", { messageType: "assistant" }),
		"> Streaming",
	);
	// Pi supplies original Markdown rather than prior transformed output on each render.
	assert.equal(
		transform("Streaming response", { messageType: "assistant" }),
		"> Streaming response",
	);
	assert.equal(
		transform("Streaming response", { messageType: "assistant" }),
		"> Streaming response",
	);
});

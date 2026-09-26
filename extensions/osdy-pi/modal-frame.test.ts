import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { visibleWidth } from "@earendil-works/pi-tui";
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

const { doubleBorderBox, MODAL_OVERLAY_OPTIONS } = await import("./modal-frame.js");

void test("shares the centered usage overlay dimensions", () => {
	assert.deepEqual(MODAL_OVERLAY_OPTIONS, {
		anchor: "center",
		width: 96,
		minWidth: 48,
		maxHeight: "92%",
		margin: 1,
	});
});

void test("preserves the themed usage heading and pads ANSI content by visible width", () => {
	const theme = {
		fg: (name: string, text: string): string =>
			`\u001B[${name === "border" ? 34 : 36}m${text}\u001B[0m`,
	};
	const lines = doubleBorderBox(theme, 12, "Hi", ["\u001B[31m界\u001B[0m!"]);
	const strip = (line: string): string =>
		line.replace(new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, "g"), "");
	assert.deepEqual(lines.map(strip), [
		"╔ Hi       ╗",
		"║界!       ║",
		"╚══════════╝",
	]);
	assert.ok(lines[0]?.includes("\u001B[36m Hi       \u001B[0m"));
	assert.ok(lines[1]?.startsWith("\u001B[34m║\u001B[0m"));
	assert.ok(lines.every((line) => visibleWidth(line) === 12));
});

void test("truncates long titles and content in narrow frames", () => {
	const theme = { fg: (_name: string, text: string): string => text };
	const lines = doubleBorderBox(theme, 6, "Long title", ["long content"]);
	const strip = (line: string): string =>
		line.replace(new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, "g"), "");
	assert.deepEqual(lines.map(strip), ["╔ ...╗", "║l...║", "╚════╝"]);
	assert.ok(lines.every((line) => visibleWidth(line) === 6));
});

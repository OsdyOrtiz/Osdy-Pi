import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";
// @ts-expect-error Node's native TypeScript runner resolves test-only TypeScript source imports.
import { HEADER_VARIANTS } from "./constants.ts";
import type { SimpleTheme } from "./types.js";

registerHooks({
	resolve(specifier, context, nextResolve) {
		if (
			context.parentURL?.includes("/extensions/osdy-pi/") &&
			specifier.startsWith("./") &&
			specifier.endsWith(".js")
		) {
			return nextResolve(`${specifier.slice(0, -3)}.ts`, context);
		}
		return nextResolve(specifier, context);
	},
});

// @ts-expect-error Node's native TypeScript runner resolves test-only TypeScript source imports.
const { colorAsciiCharacter } = await import("./animation.ts");

class RecordingTheme implements SimpleTheme {
	readonly calls: Array<{ name: string; text: string }> = [];

	fg(name: string, text: string): string {
		this.calls.push({ name, text });
		return `<${name}:${text}>`;
	}
}

function neonPalette() {
	const palette = HEADER_VARIANTS.neon.headerTonePalette;
	assert.ok(palette);
	return palette;
}

void test("Neon renders fixed white and near-black as foreground RGB", () => {
	const palette = neonPalette();
	const theme = new RecordingTheme();

	assert.equal(
		colorAsciiCharacter(theme, palette.c, "W"),
		"\u001B[38;2;255;255;255mW\u001B[39m",
	);
	assert.equal(
		colorAsciiCharacter(theme, palette.d, "B"),
		"\u001B[38;2;18;1;27mB\u001B[39m",
	);
	assert.deepEqual(theme.calls, []);
});

void test("Neon renders main and dark pink through bounded accent styling", () => {
	const palette = neonPalette();
	const theme = new RecordingTheme();

	const main = colorAsciiCharacter(theme, palette.h, "H");
	const dark = [palette.l, palette.m, palette.p].map((color, index) =>
		colorAsciiCharacter(theme, color, `D${index}`),
	);
	assert.equal(main, "<accent:H>");
	assert.deepEqual(dark, [
		"\u001B[2m<accent:D0>\u001B[22m",
		"\u001B[2m<accent:D1>\u001B[22m",
		"\u001B[2m<accent:D2>\u001B[22m",
	]);
	assert.deepEqual(theme.calls, [
		{ name: "accent", text: "H" },
		{ name: "accent", text: "D0" },
		{ name: "accent", text: "D1" },
		{ name: "accent", text: "D2" },
	]);
	assert.equal(`${main}${dark.join("")}`.includes("\u001B[48;"), false);
});

void test("Neon never maps a tone to mdHeading or mdLink", () => {
	for (const color of Object.values(neonPalette())) {
		if (typeof color === "string") {
			assert.notEqual(color, "mdHeading");
			assert.notEqual(color, "mdLink");
		}
	}
});

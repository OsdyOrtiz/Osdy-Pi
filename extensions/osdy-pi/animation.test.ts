import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";
// @ts-expect-error Node's native TypeScript runner resolves test-only TypeScript source imports.
import { HEADER_VARIANTS, mascotForChoice } from "./constants.ts";
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
const { colorAsciiCharacter, animateAsciiLineWithToneMap } = await import("./animation.ts");

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

void test("Osdy-Halloween resolves edge glow against the live theme in static and animated frames", () => {
	const { art, tonePalette } = mascotForChoice("osdy-halloween");
	assert.deepEqual([tonePalette.p, tonePalette.c, tonePalette.v], ["accent", "mdHeading", "mdLink"]);
	let themeId = "first";
	const calls: string[] = [];
	const theme: SimpleTheme = { fg(name, text) { calls.push(name); return `<${themeId}:${name}:${text}>`; } };
	for (const style of ["static", "animated"] as const) {
		for (const frame of [0, 7, 28]) {
			const render = () => art.mascot.map((line, row) =>
				animateAsciiLineWithToneMap(line, art.toneMap[row] ?? "", row, frame, theme, tonePalette, style)).join("\n");
			themeId = "first";
			const first = render();
			themeId = "second";
			const second = render();
			assert.notEqual(first, second);
			assert.equal(first.replaceAll("first:", "second:"), second, "only theme-resolved colors change");
			assert.ok(second.includes("\u001B[38;2;"), "fixed body/costume foreground colors remain");
			assert.ok(!second.includes("\u001B[48;"), "transparent background");
		}
	}
	assert.deepEqual([...new Set(calls)].sort(), ["accent", "mdHeading", "mdLink"].sort());
	for (let row = 0; row < art.mascot.length; row++) {
		const occupied = Array.from(art.mascot[row] ?? "").flatMap((glyph, column) => glyph === " " ? [] : [column]);
		assert.deepEqual(occupied.slice(-3).reverse().map((column) => art.toneMap[row]?.[column]), ["p", "c", "v"].slice(0, occupied.length));
	}
});

void test("Neon never maps a tone to mdHeading or mdLink", () => {
	for (const color of Object.values(neonPalette())) {
		if (typeof color === "string") {
			assert.notEqual(color, "mdHeading");
			assert.notEqual(color, "mdLink");
		}
	}
});

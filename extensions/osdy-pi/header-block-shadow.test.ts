import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import test from "node:test";
import { fileURLToPath } from "node:url";
// @ts-expect-error Node's native TypeScript runner resolves test-only TypeScript source imports.
import { HEADER_VARIANTS, headerWidth } from "./constants.ts";
import type * as AnimationModule from "./animation.js";
import type { HeaderVariant } from "./types.js";

registerHooks({
	resolve(specifier, context, nextResolve) {
		if (specifier.startsWith(".") && specifier.endsWith(".js") && context.parentURL?.endsWith(".ts")) {
			const url = new URL(`${specifier.slice(0, -3)}.ts`, context.parentURL);
			if (existsSync(fileURLToPath(url))) return { shortCircuit: true, url: url.href };
		}
		return nextResolve(specifier, context);
	},
});

// @ts-expect-error Node's native TypeScript runner resolves test-only TypeScript source imports.
const animation: typeof AnimationModule = await import("./animation.ts");
const { animateAsciiLine, animateAsciiLineWithToneMap } = animation;

type Style = "static" | "animated";

const ESC = String.fromCharCode(27);
const ANSI_STYLE = new RegExp(`${String.fromCharCode(27)}\\[\\d+m`, "g");
const DIM_ON = `${ESC}[2m`;
const DIM_OFF = `${ESC}[22m`;

// Wraps each token so assertions stay readable: <accent>█</accent>.
const taggedTheme = { fg: (color: string, text: string) => `<${color}>${text}</${color}>` };
const alternateTheme = { fg: (color: string, text: string) => `{${color.toUpperCase()}:${text}}` };

function renderHeader(
	variant: HeaderVariant,
	theme: { fg(color: string, text: string): string },
	style: Style,
	frames: readonly number[] = [0],
): string[] {
	const config = HEADER_VARIANTS[variant];
	return frames.flatMap((frame) =>
		config.header.map((line, index) => {
			const toneLine = config.headerMap?.[index];
			if (toneLine && config.headerTonePalette) {
				return animateAsciiLineWithToneMap(line, toneLine, index, frame, theme, config.headerTonePalette, style);
			}
			const palette = config.linePalette(index);
			return animateAsciiLine(line, index, frame, theme, palette.baseColor, palette.highlightColor, palette.trailColor, style);
		}),
	);
}

function visibleGlyphs(lines: readonly string[]): string[] {
	return lines.map((line) =>
		line.replaceAll(/<\/?[A-Za-z]+>/g, "").replaceAll(/\{[A-Z]+:(.)\}/g, "$1").replaceAll(ANSI_STYLE, ""),
	);
}

function fingerprint(lines: readonly string[]): string {
	return createHash("sha256").update(lines.join("\n")).digest("hex");
}

void test("block-shadow is a registered 11 row, 76 column header", () => {
	const variant = HEADER_VARIANTS["block-shadow"];
	assert.equal(variant.label, "Block Shadow");
	assert.equal(variant.header.length, 11);
	assert.ok(variant.header.every((row) => Array.from(row).length === 76));
	assert.equal(headerWidth("block-shadow"), 76);
	assert.ok(variant.header.every((row) => /^[█░ ]*$/.test(row)));
});

void test("block-shadow tone map is derived from glyphs and row bands", () => {
	const variant = HEADER_VARIANTS["block-shadow"];
	const faceByBand = ["p", "v", "c"];
	const shadowByBand = ["l", "m", "d"];
	assert.deepEqual(variant.headerMap?.length, 11);
	variant.header.forEach((row, rowIndex) => {
		const band = rowIndex < 3 ? 0 : rowIndex < 6 ? 1 : 2;
		const expected = Array.from(row)
			.map((glyph) => (glyph === "█" ? faceByBand[band] : glyph === "░" ? shadowByBand[band] : " "))
			.join("");
		assert.equal(variant.headerMap?.[rowIndex], expected, `row ${rowIndex}`);
	});
});

void test("block-shadow palette uses theme tokens only", () => {
	assert.deepEqual(HEADER_VARIANTS["block-shadow"].headerTonePalette, {
		p: { kind: "theme", token: "accent" },
		v: { kind: "theme", token: "mdLink" },
		c: { kind: "theme", token: "mdHeading" },
		l: { kind: "theme", token: "accent", dimmed: true },
		m: { kind: "theme", token: "mdLink", dimmed: true },
		d: { kind: "theme", token: "mdHeading", dimmed: true },
		h: { kind: "theme", token: "accent" },
		b: { kind: "theme", token: "mdLink", dimmed: true },
	});
});

void test("static block-shadow colors faces and dimmed shadows by band", () => {
	const lines = renderHeader("block-shadow", taggedTheme, "static");
	assert.equal(lines.length, 11);
	const face = (token: string) => `<${token}>█</${token}>`;
	const shadow = (token: string) => `${DIM_ON}<${token}>░</${token}>${DIM_OFF}`;
	assert.ok(lines[0]?.includes(face("accent")));
	assert.ok(lines[1]?.includes(shadow("accent")));
	assert.ok(lines[3]?.includes(face("mdLink")));
	assert.ok(lines[4]?.includes(shadow("mdLink")));
	assert.ok(lines[6]?.includes(face("mdHeading")));
	assert.ok(lines[7]?.includes(shadow("mdHeading")));
	assert.ok(!lines[0]?.includes("mdLink") && !lines[0]?.includes("mdHeading"));
	assert.ok(!lines[10]?.includes("accent") && !lines[10]?.includes("mdLink"));
});

void test("animated block-shadow differs from static and cycles across frames", () => {
	const staticLines = renderHeader("block-shadow", taggedTheme, "static");
	const frame0 = renderHeader("block-shadow", taggedTheme, "animated", [0]);
	const frame3 = renderHeader("block-shadow", taggedTheme, "animated", [3]);
	assert.notDeepEqual(frame0, staticLines);
	assert.notDeepEqual(frame0, frame3);
	assert.deepEqual(visibleGlyphs(frame0), visibleGlyphs(staticLines));
});

void test("block-shadow adapts to the theme without changing visible glyphs", () => {
	for (const style of ["static", "animated"] as const) {
		const first = renderHeader("block-shadow", taggedTheme, style);
		const second = renderHeader("block-shadow", alternateTheme, style);
		assert.notDeepEqual(first, second);
		assert.deepEqual(visibleGlyphs(first), visibleGlyphs(second));
		assert.deepEqual(visibleGlyphs(first), [...HEADER_VARIANTS["block-shadow"].header]);
	}
});

void test("osdy-theme and neon headers render byte-identically to the pre-block-shadow baseline", () => {
	const baselines = {
		"osdy-theme": {
			static: "7f3d246add55e2bb1fc9e16295d309d0578d961dcd9feae95d813b77f8538780",
			animated: "1931cdc4d763eb4d32dd6347b0e36dacf773a7d3eaef7484dc8cdfc273aeb03d",
		},
		neon: {
			static: "7a10bfbd670b4785763fabb893ae45e0ab7e28eeac70e53906c7580b661f2d97",
			animated: "c96f366056e5b776d200f744cf794c73e0a720b7a31ecf6d4de69ce6c9db483c",
		},
	} as const;
	for (const variant of ["osdy-theme", "neon"] as const) {
		for (const style of ["static", "animated"] as const) {
			assert.equal(fingerprint(renderHeader(variant, taggedTheme, style, [0, 7])), baselines[variant][style], `${variant} ${style}`);
		}
	}
});

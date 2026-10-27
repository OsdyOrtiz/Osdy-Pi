import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import test from "node:test";
import { visibleWidth } from "@earendil-works/pi-tui";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import type { OsdyState } from "./types.js";

registerHooks({
	resolve(specifier, context, nextResolve) {
		if (specifier.startsWith(".") && specifier.endsWith(".js") && context.parentURL?.endsWith(".ts")) {
			const url = new URL(`${specifier.slice(0, -3)}.ts`, context.parentURL);
			if (existsSync(fileURLToPath(url))) return { shortCircuit: true, url: url.href };
		}
		return nextResolve(specifier, context);
	},
	load(url, context, nextLoad) {
		if (url.endsWith(".ts")) return {
			format: "module",
			shortCircuit: true,
			source: ts.transpileModule(readFileSync(fileURLToPath(url), "utf8"), {
				compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
			}).outputText,
		};
		return nextLoad(url, context);
	},
});

// @ts-expect-error Node's native TypeScript runner resolves test-only TypeScript source imports.
import { HEADER_VARIANTS, headerWidth } from "./constants.ts";

const ui = await import("./ui.js");
const slanted = await import("./header-slanted.js");
const { foregroundToBackground, renderPixelHeader } = slanted;

type Theme = { fg(color: string, text: string): string };
type HeaderVariantName = "osdy-theme" | "neon" | "block-shadow" | "slanted";
type Style = "static" | "animated";

const ESC = String.fromCharCode(27);
const ANSI = new RegExp(`${ESC}\\[[0-9;]*m`, "g");
const TAGS = /<\/?[A-Za-z0-9]+>/g;

const taggedTheme: Theme = { fg: (color, text) => `<${color}>${text}</${color}>` };

// Goldens were captured with this version label; its length fixes the right-alignment padding.
const REFERENCE_VERSION = "1.11.0";
const VERSION_LABEL = /( *)((?:<[A-Za-z0-9]+>)?)osdy-pi v([0-9A-Za-z.+-]+)/;

/** Neutralises the version text and the padding derived from its length; other columns stay intact. */
function normalizeVersionRow(line: string): string {
	return line.replace(VERSION_LABEL, (_match, padding: string, open: string, version: string) => {
		const referencePadding = Math.max(0, padding.length + version.length - REFERENCE_VERSION.length);
		return `${" ".repeat(referencePadding)}${open}osdy-pi vX`;
	});
}

/** Renders the real header component the way the TUI does, with the version row neutralised. */
function renderFullHeader(
	variant: HeaderVariantName,
	theme: Theme,
	animation: "off" | "continuous",
	width = 140,
	rows = 40,
): string[] {
	const previous = process.env.OSDY_PI_ANIMATION;
	process.env.OSDY_PI_ANIMATION = animation;
	try {
		type Factory = ReturnType<typeof ui.createHeaderComponent>;
		const state = { headerVariant: variant, mascot: "current" } as unknown as OsdyState;
		const component = ui.createHeaderComponent(
			{} as Parameters<typeof ui.createHeaderComponent>[0],
			{} as Parameters<typeof ui.createHeaderComponent>[1],
			state,
		)({ terminal: { columns: width, rows }, requestRender() {} } as unknown as Parameters<Factory>[0], theme);
		try {
			return component.render(width).map((line) => normalizeVersionRow(line));
		} finally {
			component.dispose();
		}
	} finally {
		if (previous === undefined) delete process.env.OSDY_PI_ANIMATION;
		else process.env.OSDY_PI_ANIMATION = previous;
	}
}

function fingerprint(lines: readonly string[]): string {
	return createHash("sha256").update(lines.join("\n")).digest("hex");
}

const slantedVariant = HEADER_VARIANTS.slanted;
const pixelRows: readonly string[] = slantedVariant.pixelHeader ?? [];

const rgb = (red: number, green: number, blue: number): string => `${ESC}[38;2;${red};${green};${blue}m`;
const makeTheme = (colors: Readonly<Record<string, string>>): Theme => ({
	fg: (color, text) => `${colors[color] ?? ""}${text}${ESC}[39m`,
});
const cyanSilverViolet = makeTheme({ accent: rgb(103, 232, 249), mdLink: rgb(233, 237, 244), mdHeading: rgb(167, 139, 250) });
const sunset = makeTheme({ accent: rgb(255, 120, 80), mdLink: rgb(250, 230, 120), mdHeading: rgb(200, 60, 160) });
const palette256 = makeTheme({ accent: `${ESC}[38;5;45m`, mdLink: `${ESC}[38;5;255m`, mdHeading: `${ESC}[38;5;141m` });

const strip = (lines: readonly string[]): string[] => lines.map((line) => line.replaceAll(ANSI, "").replaceAll(TAGS, ""));
const occupancy = (lines: readonly string[]): boolean[][] => lines.map((line) => Array.from(line, (glyph) => glyph !== " "));
const count = (text: string, needle: string): number => text.split(needle).length - 1;

void test("slanted is a registered 11 row, 78 column pixel header after block-shadow", () => {
	assert.equal(slantedVariant.label, "Slanted");
	assert.equal(pixelRows.length, 22);
	assert.ok(pixelRows.every((row) => row.length === 78 && /^[.CSV]*$/.test(row)));
	assert.equal(slantedVariant.header.length, 11);
	assert.ok(slantedVariant.header.every((row) => Array.from(row).length === 78 && /^[ ▀▄█]*$/.test(row)));
	assert.equal(headerWidth("slanted"), 78);
	assert.deepEqual(Object.keys(HEADER_VARIANTS), ["osdy-theme", "neon", "block-shadow", "slanted"]);
});

void test("slanted silhouette glyphs match the pixel pairs of each terminal cell", () => {
	slantedVariant.header.forEach((row, cellRow) => {
		const expected = Array.from(row, (_glyph, column) => {
			const top = pixelRows[cellRow * 2]?.[column] !== ".";
			const bottom = pixelRows[cellRow * 2 + 1]?.[column] !== ".";
			return top && bottom ? "█" : top ? "▀" : bottom ? "▄" : " ";
		}).join("");
		assert.equal(row, expected, `row ${cellRow}`);
	});
});

void test("static slanted maps bevel, face and depth to accent, mdLink and mdHeading", () => {
	const lines = renderPixelHeader(pixelRows, 0, cyanSilverViolet, "static");
	assert.equal(lines.length, 11);
	for (const line of lines) assert.equal(visibleWidth(line), 78);
	const all = lines.join("\n");
	assert.ok(all.includes("38;2;103;232;249"), "accent");
	assert.ok(all.includes("38;2;233;237;244"), "mdLink");
	assert.ok(all.includes("38;2;167;139;250"), "mdHeading");
	assert.deepEqual(occupancy(strip(lines)), occupancy(slantedVariant.header));
	// The first row holds cyan bevel pixels over transparent pixels: upper half block in accent.
	assert.ok(lines[0]?.includes(`${rgb(103, 232, 249)}▀${ESC}[39m`));
});

void test("mixed cells paint the lower pixel as a background and always reset it", () => {
	const lines = renderPixelHeader(pixelRows, 0, cyanSilverViolet, "static");
	const all = lines.join("\n");
	assert.ok(count(all, `${ESC}[48;2;`) > 0);
	assert.equal(count(all, `${ESC}[48;2;`), count(all, `${ESC}[49m`), "every background is reset in its own cell");
	// Locate a cell with a cyan bevel pixel above a silver face pixel in the source art.
	const cellRow = pixelRows.findIndex((row, index) => index % 2 === 0 && Array.from(row).some((pixel, column) => pixel === "C" && pixelRows[index + 1]?.[column] === "S"));
	assert.ok(cellRow >= 0, "the art has a bevel over face cell");
	assert.ok(all.includes(`${ESC}[48;2;233;237;244m${rgb(103, 232, 249)}▀${ESC}[39m${ESC}[49m`));
});

void test("256-color themes derive a 48;5 background", () => {
	const all = renderPixelHeader(pixelRows, 0, palette256, "static").join("\n");
	assert.ok(all.includes(`${ESC}[48;5;255m`));
	assert.ok(!all.includes("48;2;"));
});

void test("an unparseable theme falls back to valid output with the same glyph width", () => {
	const tagged: Theme = { fg: (color, text) => `<${color}>${text}</${color}>` };
	const lines = renderPixelHeader(pixelRows, 0, tagged, "static");
	assert.equal(lines.length, 11);
	const all = lines.join("\n");
	assert.ok(!all.includes(`${ESC}[48`), "no background escape without a parsed foreground");
	assert.ok(!all.includes(ESC), "only theme output, no extra escapes");
	for (const line of strip(lines)) {
		assert.equal(visibleWidth(line), 78);
		assert.match(line, /^[ ▀▄█]*$/);
	}
	// Mixed cells degrade to a full block in the top pixel color.
	assert.ok(all.includes("<accent>█</accent>"));
	const silhouette = strip(lines);
	slantedVariant.header.forEach((row, index) => {
		const solid = (glyph: string): boolean => glyph !== " ";
		assert.deepEqual(Array.from(silhouette[index] ?? "", solid), Array.from(row, solid), `row ${index} keeps its occupied cells`);
	});
});

void test("a theme with out of range or truncated colors never yields malformed escapes", () => {
	for (const prefix of [`${ESC}[38;2;300;0;0m`, `${ESC}[38;2;1;2m`, `${ESC}[38;5;999m`, `${ESC}[38;2;1;2;3`, "oops"]) {
		const odd: Theme = { fg: (_color, text) => `${prefix}${text}${ESC}[39m` };
		const all = renderPixelHeader(pixelRows, 0, odd, "static").join("\n");
		assert.ok(!all.includes(`${ESC}[48`), prefix);
	}
});

void test("foregroundToBackground converts truecolor, 256 and basic colors only", () => {
	assert.equal(foregroundToBackground(`${ESC}[38;2;1;2;3m`), `${ESC}[48;2;1;2;3m`);
	assert.equal(foregroundToBackground(`${ESC}[38;5;45m`), `${ESC}[48;5;45m`);
	assert.equal(foregroundToBackground(`${ESC}[31m`), `${ESC}[41m`);
	assert.equal(foregroundToBackground(`${ESC}[92m`), `${ESC}[102m`);
	assert.equal(foregroundToBackground(`${ESC}[1m${ESC}[38;2;9;8;7m`), `${ESC}[48;2;9;8;7m`);
	assert.equal(foregroundToBackground(`${ESC}[1;38;2;9;8;7m`), `${ESC}[48;2;9;8;7m`);
	for (const bad of ["", "<accent>", `${ESC}[1m`, `${ESC}[38;2;256;0;0m`, `${ESC}[38;5;256m`, `${ESC}[38;2;1;2;3;999m`, `${ESC}[38;9;1m`]) {
		assert.equal(foregroundToBackground(bad), undefined, JSON.stringify(bad));
	}
});

void test("slanted adapts to the theme without changing glyphs", () => {
	for (const style of ["static", "animated"] as const satisfies readonly Style[]) {
		const first = renderPixelHeader(pixelRows, 0, cyanSilverViolet, style);
		const second = renderPixelHeader(pixelRows, 0, sunset, style);
		assert.notDeepEqual(first, second);
		assert.deepEqual(strip(first), strip(second));
		assert.ok(second.join("").includes("38;2;255;120;80"));
	}
});

void test("version row normalization ignores version length but not other geometry", () => {
	const row = (version: string, width: number): string =>
		`${" ".repeat(width - `osdy-pi v${version}`.length)}<accent>osdy-pi v${version}</accent>`;
	assert.equal(normalizeVersionRow(row("2.0.0", 140)), normalizeVersionRow(row("1.11.22", 140)));
	assert.notEqual(normalizeVersionRow(row("2.0.0", 140)), normalizeVersionRow(row("2.0.0", 141)));
});

void test("animated slanted shifts the three roles over time and differs from static", () => {
	const staticLines = renderPixelHeader(pixelRows, 0, cyanSilverViolet, "static");
	const frame0 = renderPixelHeader(pixelRows, 0, cyanSilverViolet, "animated");
	const frame3 = renderPixelHeader(pixelRows, 3, cyanSilverViolet, "animated");
	assert.notDeepEqual(frame0, staticLines);
	assert.notDeepEqual(frame0, frame3);
	assert.deepEqual(strip(frame0), strip(staticLines));
	assert.deepEqual(strip(frame3), strip(staticLines));
	for (const line of frame0) assert.equal(visibleWidth(line), 78);
});

void test("osdy-theme, neon and block-shadow headers render beside the mascot at 170 by 20", () => {
	for (const variant of ["osdy-theme", "neon", "block-shadow"] as const) {
		const lines = strip(renderFullHeader(variant, taggedTheme, "off", 170, 20));
		const firstArtRow = HEADER_VARIANTS[variant].header.find((row) => row.trim().length > 0)?.trim().slice(0, 12) ?? "";
		assert.ok(lines.some((line) => line.includes(firstArtRow)), `${variant} header art is drawn`);
	}
});

void test("osdy-theme, neon and block-shadow full headers keep their side-by-side render", () => {
	const sideBySide = {
		"osdy-theme": { off: "112ba74f765c1bf1dcbccbb4b41acd38ef7419c52b811b8e680c2ee91613f1ce", continuous: "4328288678d7560283ef156fa7eaf49ce863595eff6e37d25ae3c54155433293" },
		neon: { off: "ed7c4d68f4483d86537fc0497c3d1b1c05dff57cdd7474d7c1e872b671046323", continuous: "e2900a8dd3b7ee8d4769b1dadaaf25590d5c2e67dff6398cd5fe54d389d53327" },
		"block-shadow": { off: "8be43fa7093fc87b8114651471176bad05c7451c09344689e525111973ae83b9", continuous: "be9415d616e226566448248c5214f19f3bed2b29975c5eb907ef30173959662f" },
	} as const;
	for (const variant of ["osdy-theme", "neon", "block-shadow"] as const) {
		for (const animation of ["off", "continuous"] as const) {
			assert.equal(fingerprint(renderFullHeader(variant, taggedTheme, animation, 170, 20)), sideBySide[variant][animation], `${variant} ${animation} side by side`);
		}
	}
});

void test("osdy-theme, neon and block-shadow full headers are unchanged by the slanted variant", () => {
	const baselines = {
		"osdy-theme": { off: "f48a019759221701383abcb0b7b859765b20ab4b0cb7e4f432d5fcd69e56a6a9", continuous: "f85ee1768fb18661392a3075116b90ce50ea4237962e0069e605b36b62b842a5" },
		neon: { off: "f48a019759221701383abcb0b7b859765b20ab4b0cb7e4f432d5fcd69e56a6a9", continuous: "f85ee1768fb18661392a3075116b90ce50ea4237962e0069e605b36b62b842a5" },
		"block-shadow": { off: "59db9e2ee6c42b918796348d4649ef906a103e5886601691cb0569a62febbfb5", continuous: "206d244f2986906eec9b6accdd5694a4a31e86be82d32f900026f482b0260f2e" },
	} as const;
	const compactBaselines = {
		off: "7fac5f1343becb05b5866fef8e7340f43cda94f84a04d6b741b58fd707846dba",
		continuous: "5a08c9922350ef6fe2a3c4479da61cea759bda64d78bc09503f715b6609a10d8",
	} as const;
	for (const variant of ["osdy-theme", "neon", "block-shadow"] as const) {
		for (const animation of ["off", "continuous"] as const) {
			assert.equal(fingerprint(renderFullHeader(variant, taggedTheme, animation)), baselines[variant][animation], `${variant} ${animation} wide`);
			assert.equal(fingerprint(renderFullHeader(variant, taggedTheme, animation, 90, 12)), compactBaselines[animation], `${variant} ${animation} compact`);
		}
	}
});

void test("the responsive header shows slanted beside the mascot only when it fits", () => {
	const wide = strip(renderFullHeader("slanted", cyanSilverViolet, "off", 200, 40));
	const expectedRows = strip(renderPixelHeader(pixelRows, 0, cyanSilverViolet, "static"));
	for (const row of expectedRows) assert.ok(wide.some((line) => line.includes(row)), "slanted rows are present at full size");
	const wideColors = renderFullHeader("slanted", cyanSilverViolet, "off", 200, 40).join("\n");
	assert.ok(wideColors.includes("38;2;233;237;244"));

	for (const [width, rows] of [[100, 40], [90, 12], [200, 10], [1, 1]] as const) {
		const narrow = renderFullHeader("slanted", cyanSilverViolet, "off", width, rows);
		assert.ok(narrow.every((line) => visibleWidth(line) <= width), `${width}x${rows} stays in bounds`);
		const text = strip(narrow);
		for (const row of expectedRows.slice(0, 4)) {
			assert.ok(!text.some((line) => line.includes(row.trim())), `${width}x${rows} never draws a partial slanted header`);
		}
	}
	assert.deepEqual(
		renderFullHeader("slanted", cyanSilverViolet, "off", 100, 40),
		renderFullHeader("osdy-theme", cyanSilverViolet, "off", 100, 40),
		"mascot-only fallback matches the other headers",
	);
});

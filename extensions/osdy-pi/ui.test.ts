import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
// @ts-expect-error Node's native TypeScript runner resolves test-only TypeScript source imports.
import * as profileLabel from "./profile-label.ts";
// @ts-expect-error Node's native TypeScript runner resolves test-only TypeScript source imports.
import { HEADER_VARIANTS, MASCOTS, mascotForChoice, scaleHeader } from "./constants.ts";
// @ts-expect-error Node's native TypeScript runner resolves test-only TypeScript source imports.
import { shouldShowFooterMetadata } from "./types.ts";

void test("footer metadata is shown only when the native editor is effective", () => {
	assert.equal(shouldShowFooterMetadata(false), true);
	assert.equal(shouldShowFooterMetadata(true), false);
});

void test("neon header keeps the parsed 129 by 13 transparent tone structure", () => {
	assert.deepEqual(Object.keys(HEADER_VARIANTS), ["osdy-theme", "neon"]);
	const neon = scaleHeader("neon", 1_000, 100);
	assert.equal(neon.header.length, 13);
	const toneMap = neon.toneMap;
	assert.ok(toneMap);
	assert.equal(toneMap.length, 13);
	assert.equal(Array.from(neon.header[0] ?? "").length, 129);
	assert.equal(
		neon.header.reduce(
			(count, row) =>
				count + Array.from(row).filter((character) => character !== " ").length,
			0,
		),
		1121,
	);
	for (let row = 0; row < neon.header.length; row += 1) {
		const glyphs = Array.from(neon.header[row] ?? "");
		const tones: string[] = Array.from(toneMap[row] ?? "");
		assert.equal(glyphs.length, tones.length);
		for (let column = 0; column < glyphs.length; column += 1)
			if (glyphs[column] === " ") assert.equal(tones[column], " ");
	}
});

void test("neon header keeps white and black fixed while pink follows accent", () => {
	assert.deepEqual(HEADER_VARIANTS.neon.headerTonePalette, {
		b: "#FFFFFF",
		h: { kind: "theme", token: "accent" },
		l: { kind: "theme", token: "accent", dimmed: true },
		m: { kind: "theme", token: "accent", dimmed: true },
		d: "#12011B",
		p: { kind: "theme", token: "accent", dimmed: true },
		c: "#FFFFFF",
		v: "#FFFFFF",
	});
});

void test("selected headers render through foreground-only tone-map animation", () => {
	const ui = readFileSync(new URL("./ui.ts", import.meta.url), "utf8");
	const animation = readFileSync(new URL("./animation.ts", import.meta.url), "utf8");
	assert.match(ui, /const variant = HEADER_VARIANTS\[state\.headerVariant\];/);
	assert.match(ui, /variant\.headerMap,/);
	assert.match(ui, /variant\.headerTonePalette/);
	assert.match(animation, /return `\\u001B\[38;2;/);
	assert.doesNotMatch(animation, /\[48;/);
});

void test("mascot selection wires Bts art through the responsive renderer", () => {
	const ui = readFileSync(new URL("./ui.ts", import.meta.url), "utf8");

	assert.deepEqual(Object.keys(MASCOTS), ["current", "bts"]);
	assert.ok(mascotForChoice("bts"));
	assert.match(ui, /const mascot = mascotForChoice\(state\.mascot\);/);
	assert.match(ui, /scaleMascot\(\s*mascot\.art,/);
});

void test("Bts retains the 60 by 26 raccoon glyph structure and transparent tone cells", () => {
	const art = MASCOTS.bts.art;
	assert.equal(art.mascot.length, 26);
	assert.equal(Array.from(art.mascot[0] ?? "").length, 60);
	assert.equal(
		art.mascot.reduce(
			(count, row) =>
				count + Array.from(row).filter((character) => character !== " ").length,
			0,
		),
		682,
	);
	for (let row = 0; row < art.mascot.length; row += 1)
		for (
			let column = 0;
			column < Array.from(art.mascot[row] ?? "").length;
			column += 1
		)
			if (Array.from(art.mascot[row] ?? "")[column] === " ")
				assert.equal(Array.from(art.toneMap[row] ?? "")[column], " ");
});

void test("Bts receives the original right-edge glow", () => {
	const art = MASCOTS.bts.art;
	for (let row = 0; row < art.mascot.length; row += 1) {
		const glyphs = Array.from(art.mascot[row] ?? "");
		const tones = Array.from(art.toneMap[row] ?? "");
		const rightmost = glyphs
			.map((glyph, column) => ({ glyph, column }))
			.filter(({ glyph }) => glyph !== " ")
			.slice(-3)
			.reverse();
		assert.deepEqual(
			rightmost.map(({ column }) => tones[column]),
			["p", "c", "v"].slice(0, rightmost.length),
		);
	}
});

void test("mascot tone rendering never emits terminal background sequences", () => {
	const animation = readFileSync(
		new URL("./animation.ts", import.meta.url),
		"utf8",
	);

	assert.match(animation, /return `\\u001B\[38;2;/);
	assert.doesNotMatch(animation, /\[48;/);
});

void test("maximum thinking uses the existing extra-high theme color", () => {
	const source = readFileSync(new URL("./ui.ts", import.meta.url), "utf8");
	assert.match(source, /max:\s*"thinkingXhigh"/);
});

void test("renders the extended editor thinking level in bold", () => {
	const source = readFileSync(new URL("./ui.ts", import.meta.url), "utf8");
	assert.match(source, /theme\.bold\(thinkingLevel\)/);
});

void test("places a managed profile beside the model in simple mode and preserves its fallback", () => {
	assert.equal(
		profileLabel.resolveActiveProfileLabel({ OSDY_PI_PROFILE_NAME: "work" }),
		"work",
	);
	assert.equal(
		profileLabel.resolveActiveProfileLabel({ OSDY_PI_PROFILE_NAME: "WORK" }),
		"WORK",
	);
	assert.equal(
		profileLabel.resolveActiveProfileLabel({ OSDY_PI_PROFILE_NAME: "DEFAULT" }),
		undefined,
	);
	assert.equal(profileLabel.resolveActiveProfileLabel({}), undefined);
	assert.equal(
		profileLabel.formatModelMetadata("gpt-5", "high", "work"),
		"gpt-5 · work · think high",
	);
	assert.equal(
		profileLabel.formatModelMetadata(
			"gpt-5",
			"high",
			profileLabel.resolveActiveProfileLabel({
				OSDY_PI_PROFILE_NAME: "untrusted/profile",
			}),
		),
		"gpt-5 · think high",
	);
});

void test("wires themed Codex quota bars below both native footer and extended editor", () => {
	const source = readFileSync(new URL("./ui.ts", import.meta.url), "utf8");
	assert.match(source, /renderCompactCodexQuotaBars/);
	assert.equal((source.match(/renderCompactCodexQuotaBars\(/g) ?? []).length, 2);
	assert.doesNotMatch(source, /formatCodexUsageMetadata/);
});

void test("replaces the extended editor Osdy-Pi title with a managed profile or preserves its fallback", () => {
	assert.equal(profileLabel.resolveEditorTitleLabel("work"), "work");
	assert.equal(
		profileLabel.resolveEditorTitleLabel(
			profileLabel.resolveActiveProfileLabel({
				OSDY_PI_PROFILE_NAME: "untrusted/profile",
			}),
		),
		"Osdy-Pi",
	);
});

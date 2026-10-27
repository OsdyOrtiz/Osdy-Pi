import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";
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

const { renderPiMascot, piWaveFrameAt, PI_WAVE_TICKS } = await import("./pixel-mascot.js");
const { PI_RACCOON_MASCOT_SIZES, PI_RACCOON_MASCOT_WAVE, PI_RACCOON_PALETTE } = await import("./pi-raccoon-sprites.js");

/** Records theme tokens as `<token>text</>` so glow cells are visible in the output. */
const theme: SimpleTheme = { fg: (token: string, text: string) => `<${token}>${text}</>` };
const GLOW_TOKENS = ["accent", "mdHeading", "mdLink"];

function lastToken(line: string): string | undefined {
	return [...line.matchAll(/<(\w+)>/g)].at(-1)?.[1];
}

void test("pi mascot glow is a discreet one-pixel dimmed rim in the theme's accent when static", () => {
	const lines = renderPiMascot(80, 32, { frame: 0, theme, style: "static" });
	const spriteLines = lines.filter((line: string) => line.includes("\u001b[38;2;") || line.includes("<"));
	assert.ok(spriteLines.length > 20);
	for (const line of spriteLines) {
		assert.equal(lastToken(line), "accent", "outermost rim pixel uses accent when static");
		assert.ok(line.includes("\u001b[2m<accent>"), "glow is dimmed");
	}
	const text = lines.join("\n");
	assert.ok(!text.includes("<mdHeading>") && !text.includes("<mdLink>"), "only the outermost pixel glows");
});

void test("animated pi mascot rim cycles through the theme's mascot glow tokens", () => {
	const text = Array.from({ length: 12 }, (_, frame) =>
		renderPiMascot(80, 32, { frame, theme, style: "animated" }).join("\n")).join("\n");
	for (const token of GLOW_TOKENS) assert.ok(text.includes(`<${token}>`), token);
});

void test("pi mascot glow travels through the theme tokens when animated and holds when static", () => {
	const render = (frame: number, style: "static" | "animated") =>
		renderPiMascot(80, 32, { frame, theme, style }).join("\n");
	assert.equal(render(0, "static"), render(5, "static"));
	const frames = new Set(Array.from({ length: 9 }, (_, frame) => render(frame, "animated")));
	assert.ok(frames.size > 1);
});

void test("small pi mascot sizes keep a one-pixel rim", () => {
	const lines = renderPiMascot(20, 8, { frame: 0, theme, style: "static" });
	assert.ok(lines.length > 0 && lines.length <= 8);
	for (const line of lines.filter((line: string) => line.includes("<"))) assert.equal(lastToken(line), "accent");
});

void test("every mascot size has four wave frames with exactly the neutral grid's dimensions", () => {
	assert.equal(PI_RACCOON_MASCOT_WAVE.length, PI_RACCOON_MASCOT_SIZES.length);
	PI_RACCOON_MASCOT_SIZES.forEach((neutral, index) => {
		const frames = PI_RACCOON_MASCOT_WAVE[index] ?? [];
		assert.equal(frames.length, 4);
		for (const frame of frames) {
			assert.equal(frame.length, neutral.length);
			for (const row of frame) {
				assert.equal(row.length, neutral[0]?.length);
				for (const cell of row) assert.ok(cell === "." || cell in PI_RACCOON_PALETTE, `unknown key ${cell}`);
			}
		}
		assert.ok(new Set(frames.map(frame => frame.join("\n"))).size > 1, "frames differ from each other");
	});
});

void test("wave frame selection plays the four frames twice at 5 ticks each, then stops", () => {
	assert.equal(PI_WAVE_TICKS, 40);
	assert.deepEqual([0, 4, 5, 19, 20, 39].map(piWaveFrameAt), [0, 0, 1, 3, 0, 3]);
	assert.equal(piWaveFrameAt(40), undefined);
	assert.equal(piWaveFrameAt(1000), undefined);
	assert.equal(piWaveFrameAt(-1), undefined);
});

void test("pi mascot renders the wave frame only when asked and keeps its size", () => {
	const neutral = renderPiMascot(80, 32, { frame: 0, theme, style: "static" });
	const waves = [0, 1, 2, 3].map(waveFrame => renderPiMascot(80, 32, { frame: 0, theme, style: "static", waveFrame }));
	for (const wave of waves) {
		assert.equal(wave.length, neutral.length);
		assert.notDeepEqual(wave, neutral);
	}
	assert.equal(new Set(waves.map(wave => wave.join("\n"))).size, 4, "each wave frame renders differently");
	assert.deepEqual(renderPiMascot(80, 32, { frame: 0, theme, style: "static", waveFrame: undefined }), neutral);
});

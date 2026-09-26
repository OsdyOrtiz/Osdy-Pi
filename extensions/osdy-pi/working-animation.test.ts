import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";
import { visibleWidth } from "@earendil-works/pi-tui";
import type { SimpleTheme, WorkingWidgetState } from "./types.js";

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
const { renderWorkingWidget } = await import("./working-animation.ts");
// @ts-expect-error Node's native TypeScript runner resolves test-only TypeScript source imports.
const { WORKING_SPINNER_FRAMES } = await import("./constants.ts");

function state(label: string, frame = 0, active = true): WorkingWidgetState {
	return { active, label, frame, timer: undefined, tui: undefined };
}

function theme(base: string, accent: string, muted: string): SimpleTheme {
	return {
		fg(name, text) {
			const color = name === "accent" ? accent : name === "muted" ? muted : base;
			return `\u001B[${color}m${text}\u001B[0m`;
		},
	};
}

const palette = theme("37", "33", "90");
void test("original Braille frames advance every 80ms tick, wrap at ten, and use theme accent", () => {
	assert.equal(WORKING_SPINNER_FRAMES.length, 10);
	for (let frame = 0; frame <= WORKING_SPINNER_FRAMES.length; frame += 1) {
		const glyph = WORKING_SPINNER_FRAMES[frame % WORKING_SPINNER_FRAMES.length] ?? "";
		const spinner = palette.fg("accent", glyph);
		const line = renderWorkingWidget(state("Working...", frame), palette, 40)[0] ?? "";
		assert.ok(line.includes(`${spinner} `), `frame ${frame} uses accent Braille ${glyph}`);
		assert.equal(visibleWidth(spinner), 1);
	}
	const at = (frame: number) => renderWorkingWidget(state("Working...", frame), palette, 40)[0] ?? "";
	assert.ok(at(0).includes(`${palette.fg("accent", WORKING_SPINNER_FRAMES[0] ?? "")} ${palette.fg("accent", "W")}${palette.fg("text", "o")}`));
	assert.ok(at(1).includes(`${palette.fg("accent", WORKING_SPINNER_FRAMES[1] ?? "")} ${palette.fg("text", "W")}${palette.fg("accent", "o")}`));
	const runningAt = (frame: number) => renderWorkingWidget(state("Running build...", frame), palette, 40)[0] ?? "";
	assert.notEqual(runningAt(0), runningAt(10), "letter wave advances when the spinner wraps");
});

void test("Running label skips spaces, wraps its one highlighted grapheme, and follows theme on next render", () => {
	const label = "Running build...";
	const changedTheme = theme("36", "35", "34");
	const first = renderWorkingWidget(state(label, 7), palette, 40)[0] ?? "";
	const changed = renderWorkingWidget(state(label, 7), changedTheme, 40)[0] ?? "";
	assert.ok(first.includes(`${palette.fg("accent", WORKING_SPINNER_FRAMES[7] ?? "")} `));
	assert.ok(changed.includes(`${changedTheme.fg("accent", WORKING_SPINNER_FRAMES[7] ?? "")} `));
	assert.ok(first.includes(`${palette.fg("text", "g")} ${palette.fg("accent", "b")}`));
	assert.ok(changed.includes(`${changedTheme.fg("text", "g")} ${changedTheme.fg("accent", "b")}`));
	assert.ok(changed.includes(changedTheme.fg("text", "R")));
	assert.ok(renderWorkingWidget(state("A B", 1), palette, 20)[0]?.includes(
		`${palette.fg("text", "A")} ${palette.fg("accent", "B")}`,
	));
	assert.ok(renderWorkingWidget(state("AB", 2), palette, 20)[0]?.includes(
		`${palette.fg("accent", "A")}${palette.fg("text", "B")}`,
	));
});

void test("tab-separated label skips whitespace when advancing the highlight", () => {
	const label = "A\tB";
	const line = renderWorkingWidget(state(label, 1), palette, 20)[0] ?? "";
	assert.ok(line.includes(`${palette.fg("accent", WORKING_SPINNER_FRAMES[1] ?? "")} ${palette.fg("text", "A")}\t${palette.fg("accent", "B")}`));
	assert.equal(visibleWidth(line.trimStart()), 2 + visibleWidth(label));
});

void test("combining marks and ZWJ emoji remain whole graphemes in the traveling wave", () => {
	const label = "A\u0301👩‍💻 B";
	for (const [frame, expected] of [
		[0, `${palette.fg("accent", "A\u0301")}${palette.fg("text", "👩‍💻")} ${palette.fg("text", "B")}`],
		[1, `${palette.fg("text", "A\u0301")}${palette.fg("accent", "👩‍💻")} ${palette.fg("text", "B")}`],
		[2, `${palette.fg("text", "A\u0301")}${palette.fg("text", "👩‍💻")} ${palette.fg("accent", "B")}`],
	] as const) {
		const line = renderWorkingWidget(state(label, frame), palette, 40)[0] ?? "";
		assert.ok(line.includes(`${palette.fg("accent", WORKING_SPINNER_FRAMES[frame] ?? "")} ${expected}`), `frame ${frame} preserves graphemes`);
		assert.equal(visibleWidth(line.trimStart()), 2 + visibleWidth(label));
	}
});

void test("inactive widget renders nothing; narrow output fits and full output stays centered", () => {
	assert.deepEqual(renderWorkingWidget(state("Working...", 18, false), palette, 20), []);
	for (const frame of [0, 2, 4, 6]) {
		const line = renderWorkingWidget(state("Working...", frame), palette, 5)[0] ?? "";
		assert.equal(visibleWidth(line), 5);
	}
	const centered = renderWorkingWidget(state("Working..."), palette, 20)[0] ?? "";
	assert.equal(centered.match(/^ */)?.[0].length, 4);
});

import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";
import { visibleWidth } from "@earendil-works/pi-tui";
import type { SimpleTheme, WorkingActivity, WorkingWidgetState } from "./types.js";

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
const expectedFrames: Record<WorkingActivity, readonly string[]> = {
	thinking: ["◌", "◎", "◉", "●"],
	exploring: ["✶", "✷", "✸", "✹"],
	verifying: ["◇", "◈", "◆", "◈"],
	working: ["✻", "✼", "✽", "❋"],
	delegating: ["✧", "✦", "✧"],
	executing: ["◴", "◷", "◶", "◵"],
};
const activities: readonly WorkingActivity[] = [
	"thinking", "exploring", "verifying", "working", "delegating", "executing",
];
const expectedPulse = [
	"mdQuoteBorder", "thinkingHigh", "accent", "borderAccent",
	"accent", "thinkingHigh", "mdQuoteBorder", "mdQuoteBorder",
];

function symbol(
	theme: SimpleTheme,
	frame: number,
	activity: WorkingActivity = "thinking",
): string {
	const frames = expectedFrames[activity];
	const color = expectedPulse[frame % expectedPulse.length] ?? "";
	const glyph = frames[frame % frames.length] ?? "";
	return theme.fg(color, glyph);
}

function state(label: string, frame = 0, active = true): WorkingWidgetState {
	return { active, activity: "thinking", label, frame, timer: undefined, tui: undefined };
}

function theme(base: string, accent: string, warning: string): SimpleTheme {
	return {
		fg(name, text) {
			const colors: Record<string, string> = {
				accent,
				warning,
				mdQuoteBorder: `2;${base}`,
				thinkingHigh: `2;${accent}`,
				borderAccent: `1;${accent}`,
			};
			return `\u001B[${colors[name] ?? base}m${text}\u001B[0m`;
		},
	};
}

const palette = theme("37", "33", "34");
for (const activity of activities) {
	void test(`${activity} uses its approved one-cell frames and full shared pulse cycle`, () => {
		const frames = expectedFrames[activity];
		for (const glyph of frames) assert.equal(visibleWidth(glyph), 1, glyph);
		for (let frame = 0; frame < 24; frame += 1) {
			const current = { ...state("Working...", frame), activity };
			const line = renderWorkingWidget(current, palette, 40)[0] ?? "";
			assert.ok(line.includes(`${symbol(palette, frame, activity)} `), `${activity} frame ${frame}`);
			assert.equal(visibleWidth(line.trimStart()), 12, "one symbol cell plus separator and label");
		}
	});
}

void test("letter wave advances independently when the symbol wraps", () => {
	const at = (frame: number) => renderWorkingWidget(state("Working...", frame), palette, 40)[0] ?? "";
	assert.ok(at(0).includes(`${symbol(palette, 0)} ${palette.fg("accent", "W")}${palette.fg("text", "o")}`));
	assert.ok(at(0).includes(`${palette.fg("text", ".")}${palette.fg("warning", ".")}`), "frame zero wraps the trailing position to the last grapheme");
	assert.ok(at(1).includes(`${palette.fg("warning", "W")}${palette.fg("accent", "o")}`), "frame one trails the current accent");
	const runningAt = (frame: number) => renderWorkingWidget(state("Running build...", frame), palette, 40)[0] ?? "";
	assert.ok(runningAt(4).includes(`${palette.fg("warning", "n")}${palette.fg("accent", "i")}`), "letter wave advances when the symbol wraps");
});

void test("every activity resolves the live theme for each pulse phase", () => {
	const changedTheme = theme("36", "35", "32");
	for (const activity of activities) {
		for (let frame = 0; frame < expectedPulse.length; frame += 1) {
			const current = { ...state("AB", frame), activity };
			const first = renderWorkingWidget(current, palette, 20)[0] ?? "";
			const changed = renderWorkingWidget(current, changedTheme, 20)[0] ?? "";
			assert.ok(first.includes(symbol(palette, frame, activity)));
			assert.ok(changed.includes(symbol(changedTheme, frame, activity)));
			assert.ok(!changed.includes(symbol(palette, frame, activity)), "old symbol color is not cached");
		}
	}
});

void test("Running label skips spaces, wraps the trailing grapheme, and follows theme on next render", () => {
	const label = "Running build...";
	const changedTheme = theme("36", "35", "32");
	const first = renderWorkingWidget(state(label, 7), palette, 40)[0] ?? "";
	const changed = renderWorkingWidget(state(label, 7), changedTheme, 40)[0] ?? "";
	assert.ok(first.includes(`${symbol(palette, 7)} `));
	assert.ok(changed.includes(`${symbol(changedTheme, 7)} `));
	assert.ok(first.includes(`${palette.fg("warning", "g")} ${palette.fg("accent", "b")}`));
	assert.ok(changed.includes(`${changedTheme.fg("warning", "g")} ${changedTheme.fg("accent", "b")}`));
	assert.ok(!changed.includes(palette.fg("warning", "g")), "old trailing color does not persist after theme change");
	assert.ok(changed.includes(changedTheme.fg("text", "R")));
	assert.ok(renderWorkingWidget(state("A B", 1), palette, 20)[0]?.includes(
		`${palette.fg("warning", "A")} ${palette.fg("accent", "B")}`,
	));
	assert.ok(renderWorkingWidget(state("AB", 2), palette, 20)[0]?.includes(
		`${palette.fg("accent", "A")}${palette.fg("warning", "B")}`,
	));
	assert.ok(renderWorkingWidget(state("A", 3), palette, 20)[0]?.includes(
		`${palette.fg("accent", "A")}`,
	));
	assert.ok(!renderWorkingWidget(state("A", 3), palette, 20)[0]?.includes(palette.fg("warning", "A")));
});

void test("only the moving accent grapheme is bold without changing width", () => {
	const boldTheme = {
		...palette,
		bold(text: string) { return `\u001B[1m${text}\u001B[22m`; },
	};
	const spinner = (frame: number) => symbol(boldTheme, frame);
	const accent = (segment: string) => boldTheme.bold(boldTheme.fg("accent", segment));
	const label = "A\u0301👩‍💻 B";
	for (const [frame, expected] of [
		[0, `${accent("A\u0301")}${boldTheme.fg("text", "👩‍💻")} ${boldTheme.fg("warning", "B")}`],
		[1, `${boldTheme.fg("warning", "A\u0301")}${accent("👩‍💻")} ${boldTheme.fg("text", "B")}`],
		[2, `${boldTheme.fg("text", "A\u0301")}${boldTheme.fg("warning", "👩‍💻")} ${accent("B")}`],
	] as const) {
		const line = renderWorkingWidget(state(label, frame), boldTheme, 40)[0] ?? "";
		assert.ok(line.includes(`${spinner(frame)} ${expected}`), `frame ${frame} bolds only the current accent grapheme`);
		assert.equal(line.split("\u001B[1m").length - 1, 1, "exactly one grapheme is bold");
		assert.ok(!line.includes("\u001B[7m"), "no inverse effect");
		assert.equal(visibleWidth(line.trimStart()), 2 + visibleWidth(label));
	}
	const single = renderWorkingWidget(state("A", 3), boldTheme, 20)[0] ?? "";
	assert.ok(single.includes(`${spinner(3)} ${accent("A")}`));
	assert.equal(single.split("\u001B[1m").length - 1, 1);
	assert.equal(visibleWidth(single.trimStart()), 3);
});

void test("trailing warning stays plain even when theme exposes inverse and bold", () => {
	const pulseTheme = {
		...palette,
		bold(text: string) { return `\u001B[1m${text}\u001B[22m`; },
		inverse(text: string) { return `\u001B[7m${text}\u001B[27m`; },
	};
	const accent = (segment: string) => pulseTheme.bold(pulseTheme.fg("accent", segment));
	const label = "A\u0301👩‍💻 B";
	for (const [frame, expected] of [
		[0, `${accent("A\u0301")}${pulseTheme.fg("text", "👩‍💻")} ${pulseTheme.fg("warning", "B")}`],
		[1, `${pulseTheme.fg("warning", "A\u0301")}${accent("👩‍💻")} ${pulseTheme.fg("text", "B")}`],
		[2, `${pulseTheme.fg("text", "A\u0301")}${pulseTheme.fg("warning", "👩‍💻")} ${accent("B")}`],
	] as const) {
		const spinner = symbol(pulseTheme, frame);
		const line = renderWorkingWidget(state(label, frame), pulseTheme, 40)[0] ?? "";
		assert.ok(line.includes(`${spinner} ${expected}`), `frame ${frame} keeps warning plain`);
		assert.equal(line.split("\u001B[1m").length - 1, 1, "spinner and warning stay unbolded");
		assert.ok(!line.includes("\u001B[7m"), "no inverse effect");
		assert.equal(visibleWidth(line.trimStart()), 2 + visibleWidth(label));
	}
	const single = renderWorkingWidget(state("A", 3), pulseTheme, 20)[0] ?? "";
	assert.ok(single.includes(`${symbol(pulseTheme, 3)} ${accent("A")}`));
	assert.equal(single.split("\u001B[1m").length - 1, 1);
	assert.ok(!single.includes("\u001B[7m"));
	const changedTheme = {
		...theme("36", "35", "32"),
		bold(text: string) { return `<bold>${text}</bold>`; },
		inverse(text: string) { return `\u001B[7m${text}\u001B[27m`; },
	};
	assert.ok(renderWorkingWidget(state("AB", 1), changedTheme, 20)[0]?.includes(
		`${changedTheme.fg("warning", "A")}${changedTheme.bold(changedTheme.fg("accent", "B"))}`,
	), "next render uses the new theme's bold and plain trailing color");
});

void test("tab-separated label skips whitespace when advancing the highlight", () => {
	const label = "A\tB";
	const line = renderWorkingWidget(state(label, 1), palette, 20)[0] ?? "";
	assert.ok(line.includes(`${symbol(palette, 1)} ${palette.fg("warning", "A")}\t${palette.fg("accent", "B")}`));
	assert.equal(visibleWidth(line.trimStart()), 2 + visibleWidth(label));
});

void test("combining marks and ZWJ emoji remain whole graphemes in the traveling wave", () => {
	const label = "A\u0301👩‍💻 B";
	for (const [frame, expected] of [
		[0, `${palette.fg("accent", "A\u0301")}${palette.fg("text", "👩‍💻")} ${palette.fg("warning", "B")}`],
		[1, `${palette.fg("warning", "A\u0301")}${palette.fg("accent", "👩‍💻")} ${palette.fg("text", "B")}`],
		[2, `${palette.fg("text", "A\u0301")}${palette.fg("warning", "👩‍💻")} ${palette.fg("accent", "B")}`],
	] as const) {
		const line = renderWorkingWidget(state(label, frame), palette, 40)[0] ?? "";
		assert.ok(line.includes(`${symbol(palette, frame)} ${expected}`), `frame ${frame} preserves graphemes`);
		assert.equal(visibleWidth(line.trimStart()), 2 + visibleWidth(label));
	}
});

void test("inactive widget renders nothing; narrow output fits and full output stays centered", () => {
	assert.deepEqual(renderWorkingWidget(state("Working...", 18, false), palette, 20), []);
	for (const activity of activities) {
		assert.deepEqual(renderWorkingWidget({ ...state("Working...", 18, false), activity }, palette, 20), []);
		for (const frame of [0, 1, 2, 3, 4, 6, 7, 8]) {
			for (const width of [0, 1, 2, 5]) {
				const line = renderWorkingWidget({ ...state("Working...", frame), activity }, palette, width)[0] ?? "";
				assert.equal(visibleWidth(line), Math.max(1, width), `${activity} frame ${frame} width ${width}; existing clipping has a one-cell minimum`);
			}
		}
		const centered = renderWorkingWidget({ ...state("Working..."), activity }, palette, 20)[0] ?? "";
		assert.equal(centered.match(/^ */)?.[0].length, 4);
	}
});

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { registerHooks } from "node:module";
import test from "node:test";
import { visibleWidth } from "@earendil-works/pi-tui";
import type { WorkingActivity } from "./types.js";

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
const companion = await import("./companion-panel.ts");
// @ts-expect-error Node's native TypeScript runner resolves test-only TypeScript source imports.
const { COMPANION_FRAMES, COMPANION_PALETTE } = await import("./companion-sprite.ts");
// @ts-expect-error Node's native TypeScript runner resolves test-only TypeScript source imports.
const { PI_RACCOON_COMPANION } = await import("./pi-raccoon-sprites.ts");
// @ts-expect-error Node's native TypeScript runner resolves test-only TypeScript source imports.
const { PI_ROUNDED_FRAMES, PI_ROUNDED_PALETTE } = await import("./pi-rounded-sprites.ts");
// @ts-expect-error Node's native TypeScript runner resolves test-only TypeScript source imports.
const { PI_TERMINAL_FRAMES, PI_TERMINAL_PALETTE } = await import("./pi-terminal-sprites.ts");
// @ts-expect-error Node's native TypeScript runner resolves test-only TypeScript source imports.
const { PI_SLIM_FRAMES, PI_SLIM_SMALL_FRAMES, PI_SLIM_PALETTE } = await import("./pi-slim-sprites.ts");
const {
	fitCompanionLabel,
	companionLayout,
	composeWithCompanion,
	renderCompanionBox,
	resolveMascotPose,
	shouldShowCompanion,
} = companion;

const styles = ["original", "drawn", "rounded", "terminal", "slim", "slim-small"] as const;
const activities: readonly WorkingActivity[] = [
	"thinking", "exploring", "verifying", "working", "delegating", "executing",
];
const plain = { fg: (_token: string, text: string): string => text };
const tagged = { fg: (token: string, text: string): string => `<${token}>${text}</${token}>` };
const boldTagged = { ...tagged, bold: (text: string): string => `**${text}**` };
const TAG = /<(\w+)>([^<]*)<\/\1>/g;
const labels: Record<(typeof styles)[number], string> = {
	original: "Pixel Pal", drawn: "Tiny Doodle", rounded: "Big Cuddle",
	terminal: "Retro Buddy", slim: "Slim Ringtail", "slim-small": "Pocket Ringtail",
};

void test("Rounded is native 48 by 52 in a 50 by 28 box", () => {
	assert.deepEqual(companionLayout("rounded"), {
		boxWidth: 50, boxHeight: 28, columns: 51, minTotalWidth: 98, minTerminalRows: 42,
	});
});

void test("Terminal is 24 by 24 in a 26 by 14 box", () => {
	assert.deepEqual(companionLayout("terminal"), {
		boxWidth: 26, boxHeight: 14, columns: 27, minTotalWidth: 74, minTerminalRows: 28,
	});
});

void test("Slim is 24 by 24 in a 26 by 14 box; Pocket is 16 by 16 in an 18 by 10 box", () => {
	assert.deepEqual(companionLayout("slim"), companionLayout("terminal"));
	assert.deepEqual(companionLayout("slim-small"), companionLayout("drawn"));
});

for (const style of ["slim", "slim-small"] as const) {
	void test(`${style}: each frame lasts its own duration on the 80 ms working tick`, () => {
		const render = (pose: (typeof activities)[number], frame: number): string =>
			renderCompanionBox(style, pose, frame, plain).join("\n");
		// Wave frames last 140 and 150 ms: two ticks each.
		assert.equal(render("delegating", 0), render("delegating", 1));
		assert.notEqual(render("delegating", 1), render("delegating", 2));
		assert.equal(render("delegating", 2), render("delegating", 3));
		assert.notEqual(render("delegating", 3), render("delegating", 4));
		// Think frames last 200, 400, 400 and 200 ms: 3, 5, 5 and 3 ticks, then it loops.
		// The two 400 ms frames draw the same pose, so that pose holds for ten ticks.
		const think = (frame: number): string => render("thinking", frame);
		assert.equal(think(0), think(2));
		assert.notEqual(think(2), think(3));
		assert.equal(think(3), think(12));
		assert.notEqual(think(12), think(13));
		assert.equal(think(13), think(15));
		assert.equal(think(16), think(0));
		assert.equal(think(26), think(10));
		assert.notEqual(think(29), think(10));
	});
}

void test("Terminal plays its 140 ms animations at two working ticks per frame", () => {
	const wave = (frame: number): string => renderCompanionBox("terminal", "delegating", frame, plain).join("\n");
	assert.equal(wave(0), wave(1));
	assert.notEqual(wave(1), wave(2));
});

void test("pack styles follow each state's frame duration on the 80 ms working tick", () => {
	// Rounded thinks at 240 ms per frame: three ticks per frame.
	const think = (frame: number): string => renderCompanionBox("rounded", "thinking", frame, plain).join("\n");
	assert.equal(think(0), think(2));
	assert.notEqual(think(2), think(3));
});

for (const [style, frames, palette, width, height] of [
	["rounded", PI_ROUNDED_FRAMES, PI_ROUNDED_PALETTE, 48, 52],
	["terminal", PI_TERMINAL_FRAMES, PI_TERMINAL_PALETTE, 24, 24],
] as const) {
	void test(`${style}: generated frames are ${width} by ${height} grids that only use palette keys`, () => {
		for (const [state, animation] of Object.entries(frames as Record<string, { durationMs: number; frames: readonly (readonly string[])[] }>)) {
			assert.ok(animation.durationMs > 0, state);
			assert.ok(animation.frames.length > 0 && animation.frames.length <= 8, state);
			for (const frame of animation.frames) {
				assert.equal(frame.length, height, state);
				for (const row of frame) {
					assert.equal(row.length, width, `${state}: ${row}`);
					for (const key of row) assert.ok(key === "." || key in palette, `${state}: ${key}`);
				}
			}
		}
	});
}

for (const [style, frames, width] of [
	["slim", PI_SLIM_FRAMES, 24],
	["slim-small", PI_SLIM_SMALL_FRAMES, 16],
] as const) {
	void test(`${style}: generated frames are ${width} by ${width} grids with one positive duration per frame`, () => {
		const states = Object.entries(frames as Record<string, { durationsMs: readonly number[]; frames: readonly (readonly string[])[] }>);
		assert.deepEqual(states.map(([state]) => state), ["idle", "think", "walkRight", "eat", "walkLeft", "wave", "jump"]);
		for (const [state, animation] of states) {
			assert.ok(animation.frames.length > 0 && animation.frames.length <= 8, state);
			assert.equal(animation.durationsMs.length, animation.frames.length, state);
			for (const duration of animation.durationsMs) assert.ok(Number.isInteger(duration) && duration > 0, state);
			for (const frame of animation.frames) {
				assert.equal(frame.length, width, state);
				for (const row of frame) {
					assert.equal(row.length, width, `${state}: ${row}`);
					for (const key of row) assert.ok(key === "." || key in PI_SLIM_PALETTE, `${state}: ${key}`);
				}
			}
		}
		assert.equal(states[0]?.[1].frames.length, 1);
	});
}

void test("Original is a 24-pixel raccoon in a 26 by 14 box; Hand-drawn stays 16 pixels in 18 by 10", () => {
	assert.deepEqual(companionLayout("original"), {
		boxWidth: 26, boxHeight: 14, columns: 27, minTotalWidth: 74, minTerminalRows: 28,
	});
	assert.deepEqual(companionLayout("drawn"), {
		boxWidth: 18, boxHeight: 10, columns: 19, minTotalWidth: 66, minTerminalRows: 24,
	});
});

// The frame changed (corners, name tab, gradient), so whole boxes no longer hash to their old values.
// These guards hash only the interior sprite rows (frame characters removed), captured before the frame change.
void test("sprite rows of every style remain byte-identical inside the new frame", () => {
	for (const [style, expected] of [
		["original", "209311e4d05ae3ff6181937d6bf5997169a0d0c3bbff0c606eb61c27054b49cb"],
		["drawn", "db9c5d584aefb8e8a5b56a6995a971dcacb433840a6933234b1fa1d34f9d19ca"],
		["rounded", "cfee2d08b8ce504245c9ce19f6524aaa57901ceaf345cdcb305667570270c2da"],
		["terminal", "36873d4be5389df69739afdaa22083215f39b5771251ea8c7dfe5d181c59aeb0"],
		["slim", "c5dbca33752fec686b463c053c0d2bb9d16842902f298d8f94bf73f73d818de3"],
		["slim-small", "7479b0b17a3b084c8e829fbff9151915fc20d9ccc46c64f472e504c3ca757bcd"],
	] as const) {
		const renders: string[][] = [];
		for (const pose of ["idle", ...activities] as const) {
			for (let frame = 0; frame < 256; frame++) {
				renders.push(renderCompanionBox(style, pose, frame, plain).slice(1, -1).map(row => row.slice(1, -1)));
			}
		}
		const actual = createHash("sha256").update(JSON.stringify({ layout: companionLayout(style), renders })).digest("hex");
		assert.equal(actual, expected, style);
	}
});

void test("themed frames leave the sprite rows untouched", () => {
	for (const style of styles) {
		const inner = (theme: typeof plain): string[] =>
			renderCompanionBox(style, "working", 3, theme).slice(1, -1).map(row => row.replace(TAG, "$2").slice(1, -1));
		assert.deepEqual(inner(tagged), inner(plain), style);
	}
});

void test("mascot pose follows the working activity and rests when the agent is idle", () => {
	assert.equal(resolveMascotPose(undefined), "idle");
	assert.equal(resolveMascotPose({ active: false, activity: "working", frame: 3 }), "idle");
	for (const activity of activities) {
		assert.equal(resolveMascotPose({ active: true, activity, frame: 0 }), activity);
	}
});

for (const style of styles) {
	void test(`${style}: companion box keeps its size with sparkle corners and a name tab`, () => {
		for (const pose of ["idle", ...activities] as const) {
			const lines = renderCompanionBox(style, pose, 0, plain);
			assert.equal(lines.length, companionLayout(style).boxHeight);
			for (const line of lines) assert.equal(visibleWidth(line), companionLayout(style).boxWidth);
			assert.ok(lines[0]?.startsWith("✦") && lines[0].endsWith("✦"));
			assert.ok(lines.at(-1)?.startsWith("╰") && lines.at(-1)?.endsWith("╯"));
			for (const row of lines.slice(1, -1)) assert.ok(row.startsWith("│") && row.endsWith("│"));
		}
		const top = renderCompanionBox(style, "idle", 0, plain)[0] ?? "";
		const inner = companionLayout(style).boxWidth - 2;
		const label = labels[style];
		const expectedTab = label.length + 4 <= inner
			? `─ ${label} ${"─".repeat(inner - label.length - 3)}`
			: `─ ${label.slice(0, inner - 5)}… ─`;
		assert.equal(top, `✦${expectedTab}✦`);
	});

	void test(`${style}: border follows a theme gradient and the name uses accent`, () => {
		const lines = renderCompanionBox(style, "idle", 0, boldTagged);
		const { boxWidth, boxHeight } = companionLayout(style);
		const cells = (line: string): [string, string][] => [...line.matchAll(TAG)].map(([, token, text]) => [token ?? "", text ?? ""]);
		const top = cells(lines[0] ?? "");
		const bottom = cells(lines.at(-1) ?? "");
		const right = lines.slice(1, -1).map(line => cells(line).at(-1));
		const left = lines.slice(1, -1).map(line => cells(line)[0]);
		const name = top.find(([, text]) => text.startsWith("**"));
		assert.equal(name?.[0], "accent");
		assert.equal(name?.[1], `**${fitCompanionLabel(labels[style], boxWidth - 2)}**`);
		// Walk the perimeter clockwise from the top-left corner; label cells are not border cells.
		const perimeter = [
			...top.filter(([, text]) => !text.startsWith("**")).map(([token]) => token),
			...right.map(cell => cell?.[0] ?? "?"),
			...[...bottom].reverse().map(([token]) => token),
			...[...left].reverse().map(cell => cell?.[0] ?? "?"),
		];
		// The name and its two flanking spaces are the only uncolored-by-gradient cells.
		const shownLabel = fitCompanionLabel(labels[style], boxWidth - 2) ?? "";
		assert.equal(perimeter.length, 2 * boxWidth + 2 * (boxHeight - 2) - shownLabel.length - 2);
		assert.equal(bottom.length, boxWidth);
		assert.equal(left.length, boxHeight - 2);
		const order = ["accent", "mdHeading", "mdLink"];
		const ranks = perimeter.map(token => order.indexOf(token));
		assert.ok(ranks.every(rank => rank >= 0), "only the three theme tokens color the frame");
		assert.deepEqual(ranks, [...ranks].sort((a, b) => a - b), "segments are contiguous");
		assert.deepEqual(new Set(ranks), new Set([0, 1, 2]));
		assert.equal(top[0]?.[0], "accent");
		assert.equal(top[0]?.[1], "✦");
	});

	void test(`${style}: companion sprite is half-block truecolor pixel art and resets styles before the frame`, () => {
		const inner = renderCompanionBox(style, "idle", 0, plain).slice(1, -1);
		assert.match(inner.join("\n"), /[▀▄█]/);
		assert.ok(inner.join("\n").includes("\u001b[38;2;"));
		for (const line of inner) {
			if (line.includes("\u001b[")) assert.ok(line.slice(0, -1).endsWith("\u001b[0m"));
		}
	});

	void test(`${style}: every working pose animates and differs from the idle pose`, () => {
		const idle = renderCompanionBox(style, "idle", 0, plain).join("\n");
		for (const activity of activities) {
			const frames = new Set(
				Array.from({ length: 16 }, (_, frame) => renderCompanionBox(style, activity, frame, plain).join("\n")),
			);
			assert.ok(frames.size > 1, `${activity} should animate`);
			assert.ok(!frames.has(idle), `${activity} should look different from idle`);
		}
	});

	void test(`${style}: idle pose stays still across frames`, () => {
		assert.equal(
			renderCompanionBox(style, "idle", 0, plain).join("\n"),
			renderCompanionBox(style, "idle", 13, plain).join("\n"),
		);
	});
}

void test("every style draws a different raccoon", () => {
	for (const pose of ["idle", ...activities] as const) {
		const renders = new Set(styles.map(style => renderCompanionBox(style, pose, 0, plain).join("\n")));
		assert.equal(renders.size, styles.length, pose);
	}
});

void test("fitCompanionLabel keeps the label when a closing edge fits, shortens it with an ellipsis, then drops it", () => {
	assert.equal(fitCompanionLabel("Ab", 6), "Ab");
	assert.equal(fitCompanionLabel("Abc", 6), "A…");
	assert.equal(fitCompanionLabel("Pocket Ringtail", 16), "Pocket Ring…");
	assert.equal(fitCompanionLabel("Abc", 5), "…");
	assert.equal(fitCompanionLabel("Abc", 4), undefined);
	assert.equal(fitCompanionLabel("", 20), undefined);
});

for (const style of styles) {
	void test(`${style}: composition bottom-aligns the editor and the taller companion box`, () => {
		const { boxHeight, boxWidth, columns } = companionLayout(style);
		const box = renderCompanionBox(style, "idle", 0, plain);
		const editor = ["╭──╮", "│ab│", "╰──╯"];
		const lines = composeWithCompanion(editor, 4, box, boxWidth);
		assert.equal(lines.length, boxHeight);
		for (const line of lines) assert.equal(visibleWidth(line), 4 + columns);
		assert.deepEqual(lines.slice(-3).map(line => line.slice(0, 4)), editor);
		assert.ok(lines[0]?.startsWith(" ".repeat(4 + columns - boxWidth)));
		assert.equal(lines.at(-1)?.slice(4 + columns - boxWidth), box.at(-1));

		const tall = Array.from({ length: boxHeight + 2 }, () => "│ab│");
		const tallLines = composeWithCompanion(tall, 4, box, boxWidth);
		assert.equal(tallLines.length, boxHeight + 2);
		assert.equal(tallLines[0], `│ab│${" ".repeat(columns)}`);
	});

	void test(`${style}: companion shows only when enabled with enough width and height outside small mode`, () => {
		const { minTotalWidth, minTerminalRows } = companionLayout(style);
		const fits = { style, enabled: true, smallMode: false, width: minTotalWidth, terminalRows: minTerminalRows };
		assert.equal(shouldShowCompanion(fits), true);
		assert.equal(shouldShowCompanion({ ...fits, enabled: false }), false);
		assert.equal(shouldShowCompanion({ ...fits, smallMode: true }), false);
		assert.equal(shouldShowCompanion({ ...fits, width: minTotalWidth - 1 }), false);
		assert.equal(shouldShowCompanion({ ...fits, terminalRows: minTerminalRows - 1 }), false);
	});
}

void test("hand-drawn companion frames are 16 by 16 grids that only use palette keys", () => {
	for (const pose of ["idle", ...activities] as const) {
		const frames: readonly (readonly string[])[] = COMPANION_FRAMES[pose];
		assert.ok(frames.length > 0, pose);
		for (const frame of frames) {
			assert.equal(frame.length, 16, pose);
			for (const row of frame) {
				assert.equal(row.length, 16, `${pose}: ${row}`);
				for (const key of row) assert.ok(key === "." || key in COMPANION_PALETTE, `${pose}: ${key}`);
			}
		}
	}
});

/** Isolated light pixels inside the dark mask: the eye highlights. */
function eyeHighlights(grid: readonly string[]): number {
	let count = 0;
	for (let y = 1; y < grid.length - 1; y++) {
		for (let x = 1; x < (grid[y]?.length ?? 0) - 1; x++) {
			if (grid[y]?.[x] !== "L") continue;
			let dark = 0;
			let light = 0;
			for (let dy = -1; dy <= 1; dy++) {
				for (let dx = -1; dx <= 1; dx++) {
					if (!dx && !dy) continue;
					const key = grid[y + dy]?.[x + dx];
					if (key === "O" || key === "H") dark++;
					if (key === "L") light++;
				}
			}
			if (dark >= 5 && light === 0) count++;
		}
	}
	return count;
}

void test("Original idle raccoon keeps a highlight dot in each eye instead of solid black eyes", () => {
	const idle: readonly string[] | undefined = PI_RACCOON_COMPANION.idle[0];
	assert.ok(idle);
	assert.equal(eyeHighlights(idle), 2);
});

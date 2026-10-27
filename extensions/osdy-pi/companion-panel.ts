import { COMPANION_STYLE_LABELS } from "./companion-labels.js";
import { COMPANION_FRAMES, COMPANION_PALETTE } from "./companion-sprite.js";
import { PI_RACCOON_COMPANION, PI_RACCOON_PALETTE, type PixelGrid, type PixelRgb } from "./pi-raccoon-sprites.js";
import { PI_ROUNDED_FRAMES, PI_ROUNDED_PALETTE } from "./pi-rounded-sprites.js";
import { PI_SLIM_FRAMES, PI_SLIM_PALETTE, PI_SLIM_SMALL_FRAMES } from "./pi-slim-sprites.js";
import { PI_TERMINAL_FRAMES, PI_TERMINAL_PALETTE } from "./pi-terminal-sprites.js";
import { renderHalfBlockGrid } from "./pixel-art.js";
import type { CompanionStyle, SimpleTheme, WorkingActivity, WorkingWidgetState } from "./types.js";

/**
 * Full-body pixel-art raccoon shown in its own box beside the extended editor,
 * in independent styles: Original, Hand-drawn, Rounded, Terminal, Slim, or Slim Small.
 * The existing converted and hand-drawn artwork is never transformed here.
 *
 * Pure presentation: it maps a working snapshot to a pose and renders that pose
 * with half-block characters. Timers and agent events stay in the working
 * controller; this module never schedules work.
 */

export type MascotPose = "idle" | WorkingActivity;

export type MascotWorkingSnapshot = Readonly<Pick<WorkingWidgetState, "active" | "activity" | "frame">>;

const GAP = " ";
/** The editor keeps at least 45 text columns beside the companion. */
const MIN_EDITOR_COLUMNS = 45;
/** Rows left for the conversation above the companion box. */
const MIN_CONVERSATION_ROWS = 14;

/** Native geometry of the companion styles. */
const SPRITE_SIZES: Record<CompanionStyle, { width: number; height: number }> = {
	original: { width: 24, height: 24 },
	drawn: { width: 16, height: 16 },
	rounded: { width: 48, height: 52 },
	terminal: { width: 24, height: 24 },
	slim: { width: 24, height: 24 },
	"slim-small": { width: 16, height: 16 },
};

/** Interval of the working indicator timer that drives the session-wide frame counter. */
const WORKING_TICK_MS = 80;

export type CompanionLayout = {
	boxWidth: number;
	/** Independent of the editor frame, which keeps its own height. */
	boxHeight: number;
	/** Columns the companion takes from the editor: one gap plus the box. */
	columns: number;
	minTotalWidth: number;
	minTerminalRows: number;
};

export function companionLayout(style: CompanionStyle): CompanionLayout {
	const size = SPRITE_SIZES[style];
	const boxWidth = size.width + 2;
	const boxHeight = Math.ceil(size.height / 2) + 2;
	const columns = GAP.length + boxWidth;
	return {
		boxWidth,
		boxHeight,
		columns,
		minTotalWidth: MIN_EDITOR_COLUMNS + 2 + columns,
		minTerminalRows: MIN_CONVERSATION_ROWS + boxHeight,
	};
}

/**
 * Frames per pose and how many 80ms working ticks each lasts. Idle has no timer
 * and keeps its first frame, because the working frame counter keeps whatever
 * value it had when work stopped. When `frameTicks` is set, it holds one tick count per
 * frame and replaces the uniform `ticksPerFrame`.
 */
type PoseFrames = {
	readonly frames: readonly PixelGrid[];
	readonly ticksPerFrame: number;
	readonly frameTicks?: readonly number[];
};

type StyleArt = { readonly palette: Readonly<Record<string, PixelRgb>>; readonly poses: Record<MascotPose, PoseFrames> };

const STILL = Number.POSITIVE_INFINITY;

/** A generated pack state: its frames and the pack's own frame duration. */
type PackState = { readonly durationMs: number; readonly frames: readonly PixelGrid[] };

/** Follows the pack's timing on the working tick, rounded to whole ticks. */
const timed = (state: PackState): PoseFrames => ({
	frames: state.frames,
	ticksPerFrame: Math.max(1, Math.round(state.durationMs / WORKING_TICK_MS)),
});

/** A generated pack state whose frames each have their own duration. */
type VariableState = { readonly durationsMs: readonly number[]; readonly frames: readonly PixelGrid[] };

/** Follows each frame's own duration on the working tick, rounded to whole ticks. */
const timedPerFrame = (state: VariableState): PoseFrames => ({
	frames: state.frames,
	ticksPerFrame: STILL,
	frameTicks: state.durationsMs.map(durationMs => Math.max(1, Math.round(durationMs / WORKING_TICK_MS))),
});

type PackFrames = Readonly<Record<"idle" | "think" | "walkRight" | "look" | "walkLeft" | "wave" | "jump", PackState>>;

/** The same state mapping for every generated pack; idle keeps its first frame. */
function packArt(palette: Readonly<Record<string, PixelRgb>>, pack: PackFrames): StyleArt {
	return {
		palette,
		poses: {
			idle: { frames: pack.idle.frames, ticksPerFrame: STILL },
			thinking: timed(pack.think),
			exploring: timed(pack.walkRight),
			verifying: timed(pack.look),
			working: timed(pack.walkLeft),
			delegating: timed(pack.wave),
			executing: timed(pack.jump),
		},
	};
}

type TerminalFrames = Readonly<Record<"idle" | "think" | "walkRight" | "eat" | "walkLeft" | "wave" | "jump", PackState>>;

/** The Pi Terminal pack has no look-around state, so verifying chews on the result instead. */
const terminalArt = (pack: TerminalFrames): StyleArt => packArt(PI_TERMINAL_PALETTE, { ...pack, look: pack.eat });

type SlimFrames = Readonly<Record<"idle" | "think" | "walkRight" | "eat" | "walkLeft" | "wave" | "jump", VariableState>>;

/** The Pi Terminal v2 pack has no look-around state either, so verifying is Eat as well. */
const slimArt = (pack: SlimFrames): StyleArt => ({
	palette: PI_SLIM_PALETTE,
	poses: {
		idle: { frames: pack.idle.frames, ticksPerFrame: STILL },
		thinking: timedPerFrame(pack.think),
		exploring: timedPerFrame(pack.walkRight),
		verifying: timedPerFrame(pack.eat),
		working: timedPerFrame(pack.walkLeft),
		delegating: timedPerFrame(pack.wave),
		executing: timedPerFrame(pack.jump),
	},
});

const STYLE_ART: Record<CompanionStyle, StyleArt> = {
	original: {
		palette: PI_RACCOON_PALETTE,
		poses: {
			idle: { frames: PI_RACCOON_COMPANION.idle, ticksPerFrame: STILL },
			thinking: { frames: PI_RACCOON_COMPANION.waiting, ticksPerFrame: 4 },
			exploring: { frames: PI_RACCOON_COMPANION.runRight, ticksPerFrame: 2 },
			verifying: { frames: PI_RACCOON_COMPANION.review, ticksPerFrame: 3 },
			working: { frames: PI_RACCOON_COMPANION.running, ticksPerFrame: 3 },
			delegating: { frames: PI_RACCOON_COMPANION.waving, ticksPerFrame: 3 },
			executing: { frames: PI_RACCOON_COMPANION.jumping, ticksPerFrame: 2 },
		},
	},
	drawn: {
		palette: COMPANION_PALETTE,
		poses: {
			idle: { frames: COMPANION_FRAMES.idle, ticksPerFrame: STILL },
			thinking: { frames: COMPANION_FRAMES.thinking, ticksPerFrame: 6 },
			exploring: { frames: COMPANION_FRAMES.exploring, ticksPerFrame: 3 },
			verifying: { frames: COMPANION_FRAMES.verifying, ticksPerFrame: 5 },
			working: { frames: COMPANION_FRAMES.working, ticksPerFrame: 3 },
			delegating: { frames: COMPANION_FRAMES.delegating, ticksPerFrame: 4 },
			executing: { frames: COMPANION_FRAMES.executing, ticksPerFrame: 4 },
		},
	},
	rounded: packArt(PI_ROUNDED_PALETTE, PI_ROUNDED_FRAMES),
	terminal: terminalArt(PI_TERMINAL_FRAMES),
	slim: slimArt(PI_SLIM_FRAMES),
	"slim-small": slimArt(PI_SLIM_SMALL_FRAMES),
};

export function resolveMascotPose(working: MascotWorkingSnapshot | undefined): MascotPose {
	return working?.active ? working.activity : "idle";
}

export type CompanionVisibility = {
	style: CompanionStyle;
	enabled: boolean;
	smallMode: boolean;
	width: number;
	terminalRows: number;
};

export function shouldShowCompanion(input: CompanionVisibility): boolean {
	const layout = companionLayout(input.style);
	return input.enabled
		&& !input.smallMode
		&& input.width >= layout.minTotalWidth
		&& input.terminalRows >= layout.minTerminalRows;
}

/** Index of the frame showing at a working tick, looping over the cumulative per-frame ticks. */
function stepInTimeline(frameTicks: readonly number[], frame: number): number {
	const total = frameTicks.reduce((sum, ticks) => sum + ticks, 0);
	let remaining = Math.floor(Math.max(0, frame)) % total;
	for (const [index, ticks] of frameTicks.entries()) {
		if (remaining < ticks) return index;
		remaining -= ticks;
	}
	return 0;
}

function poseFrame(art: StyleArt, pose: MascotPose, frame: number): PixelGrid {
	const { frames, ticksPerFrame, frameTicks } = art.poses[pose];
	if (frameTicks) return frames[stepInTimeline(frameTicks, frame)] ?? frames[0] ?? [];
	const step = Number.isFinite(ticksPerFrame) ? Math.floor(Math.max(0, frame) / ticksPerFrame) % frames.length : 0;
	return frames[step] ?? frames[0] ?? [];
}

/** Theme tokens the frame cycles through, in order, around the perimeter. */
const FRAME_GRADIENT = ["accent", "mdHeading", "mdLink"] as const;
const NAME_TOKEN = "accent";
const CORNER_SPARKLE = "✦";

/**
 * Name tab text for a border `innerWidth` cells wide. The tab is "─ name ─…",
 * so it needs four cells besides the name. A name that does not fit is cut and
 * ends with "…"; when not even "…" fits there is no tab.
 */
export function fitCompanionLabel(label: string, innerWidth: number): string | undefined {
	const maxLength = innerWidth - 4;
	const characters = Array.from(label);
	if (characters.length === 0 || maxLength < 1) return undefined;
	if (characters.length <= maxLength) return label;
	return `${characters.slice(0, maxLength - 1).join("")}…`;
}

/**
 * Renders the companion box using the session-wide working frame.
 *
 * The frame is drawn with ✦ top corners and the style's display name in the
 * top edge. Its color is a static gradient: the perimeter, walked clockwise from
 * the top-left corner, is split into three contiguous thirds that use the theme
 * tokens accent, mdHeading and mdLink. The sprite rows are not themed here.
 */
export function renderCompanionBox(
	style: CompanionStyle,
	pose: MascotPose,
	frame: number,
	theme: SimpleTheme,
): string[] {
	const grid = poseFrame(STYLE_ART[style], pose, frame);
	const palette = STYLE_ART[style].palette;
	const spriteRows = renderHalfBlockGrid(grid, palette);
	const innerWidth = SPRITE_SIZES[style].width;
	const sideRows = spriteRows.length;
	const perimeter = 2 * (innerWidth + 2) + 2 * sideRows;
	const border = (position: number, glyph: string): string => {
		const segment = Math.floor((position * FRAME_GRADIENT.length) / perimeter);
		return theme.fg(FRAME_GRADIENT[segment] ?? FRAME_GRADIENT[0], glyph);
	};
	const rightStart = innerWidth + 2;
	const bottomStart = rightStart + sideRows;
	const leftStart = bottomStart + innerWidth + 2;

	// Top edge cells are positions 1..innerWidth; the tab is "─ name " and the rest is plain edge.
	const label = fitCompanionLabel(COMPANION_STYLE_LABELS[style], innerWidth);
	const tabCells = label === undefined ? 0 : Array.from(label).length + 3;
	const tab = label === undefined ? "" : `${border(1, "─")} ${theme.fg(NAME_TOKEN, theme.bold ? theme.bold(label) : label)} `;
	const topEdge = Array.from({ length: innerWidth - tabCells }, (_, index) => border(tabCells + index + 1, "─")).join("");
	const topLine = `${border(0, CORNER_SPARKLE)}${tab}${topEdge}${border(innerWidth + 1, CORNER_SPARKLE)}`;

	const rows = spriteRows.map((row, index) =>
		`${border(leftStart + (sideRows - 1 - index), "│")}${row}${border(rightStart + index, "│")}`);
	const bottomEdge = Array.from({ length: innerWidth }, (_, index) =>
		border(bottomStart + (innerWidth - index), "─")).join("");
	const bottomLine = `${border(leftStart - 1, "╰")}${bottomEdge}${border(bottomStart, "╯")}`;
	return [topLine, ...rows, bottomLine];
}

/**
 * Places the companion box to the right of already-framed editor lines.
 * Both blocks are bottom-aligned; whichever is shorter gets blank rows above it.
 */
export function composeWithCompanion(
	editorLines: readonly string[],
	editorWidth: number,
	box: readonly string[],
	boxWidth: number,
): string[] {
	const height = Math.max(editorLines.length, box.length);
	const editorPad = height - editorLines.length;
	const boxPad = height - box.length;
	const blankEditor = " ".repeat(editorWidth);
	const blankBox = " ".repeat(boxWidth);
	return Array.from({ length: height }, (_, index) => {
		const editor = index < editorPad ? blankEditor : editorLines[index - editorPad] ?? blankEditor;
		const companion = index < boxPad ? blankBox : box[index - boxPad] ?? blankBox;
		return `${editor}${GAP}${companion}`;
	});
}

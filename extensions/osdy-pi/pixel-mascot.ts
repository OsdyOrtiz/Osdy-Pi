import { colorAsciiCharacter, glowToneColor, type AsciiAnimationStyle, type GlowTone } from "./animation.js";
import type { MascotTonePalette } from "./constants.js";
import { PI_RACCOON_MASCOT_SIZES, PI_RACCOON_MASCOT_WAVE, PI_RACCOON_PALETTE, type PixelGrid } from "./pi-raccoon-sprites.js";
import { pixelGridWidth, renderHalfBlockGrid, type PixelOverlay } from "./pixel-art.js";
import type { SimpleTheme } from "./types.js";

/**
 * The "pi" header mascot: the neutral OpenPets raccoon pre-rendered at several
 * heights. Pixel art is never resampled at runtime; the header picks the largest
 * generated size that fits its budget. Like the text mascots, its right edge glows
 * in the active theme's accent, mdHeading, and mdLink colors, kept discreet: a
 * single dimmed outline pixel per row.
 */

export type PiMascotGlow = {
	frame: number;
	theme: SimpleTheme;
	style: AsciiAnimationStyle;
	/** Index of the startup wave frame to show instead of the neutral pose; undefined for neutral. */
	waveFrame?: number | undefined;
};

/** Header timer ticks each wave frame stays on screen (5 x 30 ms = 150 ms). */
const WAVE_TICKS_PER_FRAME = 5;
/** How many times the wave frames play at startup. */
const WAVE_REPEATS = 2;
const WAVE_FRAME_COUNT = PI_RACCOON_MASCOT_WAVE[0]?.length ?? 0;

/** Header timer ticks the whole startup wave lasts (about 1.2 s). */
export const PI_WAVE_TICKS = WAVE_FRAME_COUNT * WAVE_TICKS_PER_FRAME * WAVE_REPEATS;

/** Wave frame index to show at a header timer tick, or undefined once the wave is over. */
export function piWaveFrameAt(tick: number): number | undefined {
	if (tick < 0 || tick >= PI_WAVE_TICKS) return undefined;
	return Math.floor(tick / WAVE_TICKS_PER_FRAME) % WAVE_FRAME_COUNT;
}

/** The same theme tokens the text mascots use for their edge glow, dimmed. */
const GLOW_PALETTE: Pick<MascotTonePalette, GlowTone> = {
	p: { kind: "theme", token: "accent", dimmed: true },
	c: { kind: "theme", token: "mdHeading", dimmed: true },
	v: { kind: "theme", token: "mdLink", dimmed: true },
};

const rowsOf = (grid: PixelGrid): number => Math.ceil(grid.length / 2);

function largestFittingIndex(maximumWidth: number, maximumRows: number): number {
	return PI_RACCOON_MASCOT_SIZES.findIndex(grid =>
		pixelGridWidth(grid) <= maximumWidth && rowsOf(grid) <= maximumRows);
}

/** Width of the largest size within `maximumRows`, or of the smallest size when none fits. */
export function piMascotWidthForRows(maximumRows: number): number {
	const grid = PI_RACCOON_MASCOT_SIZES.find(size => rowsOf(size) <= maximumRows)
		?? PI_RACCOON_MASCOT_SIZES.at(-1);
	return grid ? pixelGridWidth(grid) : 0;
}

/** Marks the rightmost opaque pixel of every pixel row; the animated wave cycles its color. */
function rimGlow(grid: PixelGrid, glow: PiMascotGlow): PixelOverlay {
	const rim = grid.map(row => row.search(/[^.][.]*$/));
	return (x, y) => {
		if (rim[y] !== x) return undefined;
		const color = glowToneColor("p", x, Math.floor(y / 2), glow.frame, GLOW_PALETTE, glow.style);
		return (text) => colorAsciiCharacter(glow.theme, color, text);
	};
}

/** Half-block lines for the largest size within both budgets; empty when none fits. */
export function renderPiMascot(maximumWidth: number, maximumRows: number, glow: PiMascotGlow): string[] {
	const size = largestFittingIndex(maximumWidth, maximumRows);
	const neutral = PI_RACCOON_MASCOT_SIZES[size];
	if (!neutral) return [];
	// Wave frames share the neutral grid's dimensions, so the layout never shifts.
	const grid = glow.waveFrame === undefined ? neutral : PI_RACCOON_MASCOT_WAVE[size]?.[glow.waveFrame] ?? neutral;
	return renderHalfBlockGrid(grid, PI_RACCOON_PALETTE, rimGlow(grid, glow));
}

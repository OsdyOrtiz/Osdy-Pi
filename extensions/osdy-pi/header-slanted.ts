import { glowToneColor, type AsciiAnimationStyle } from "./animation.js";
import type { MascotTonePalette } from "./constants.js";
import type { SimpleTheme } from "./types.js";

/**
 * Renders the slanted pixel header: two logical pixels per terminal cell, drawn
 * with half blocks. The pixel keys are roles (bevel, face, depth) that follow
 * the same cyan, silver and violet theme tokens as the osdy-theme header, so
 * the art adapts to every theme.
 *
 * Presentation only: no timers, no I/O. The caller owns the frame counter.
 */

type PixelTone = "p" | "v" | "c";

/** Bevel = accent, face = mdLink, depth = mdHeading, matching the osdy-theme roles. */
const PIXEL_TONES: Readonly<Record<string, PixelTone>> = { C: "p", S: "v", V: "c" };

/** Same wave rotation as the osdy-theme header: accent -> mdHeading -> mdLink -> accent. */
const SLANTED_TONE_PALETTE: Pick<MascotTonePalette, PixelTone> = {
	p: { kind: "theme", token: "accent" },
	v: { kind: "theme", token: "mdLink" },
	c: { kind: "theme", token: "mdHeading" },
};

const UPPER_HALF = "▀";
const LOWER_HALF = "▄";
const FULL_BLOCK = "█";
const ESC = String.fromCharCode(27);
const SGR_SEQUENCE = new RegExp(`^${ESC}\\[([0-9;]*)m`);
const RESET_BACKGROUND = `${ESC}[49m`;

function isColorByte(value: number | undefined): value is number {
	return value !== undefined && Number.isInteger(value) && value >= 0 && value <= 255;
}

function parseParameters(body: string): number[] | undefined {
	const values = body === "" ? [0] : body.split(";").map((part) => (/^[0-9]{1,3}$/.test(part) ? Number(part) : Number.NaN));
	return values.every((value) => !Number.isNaN(value)) ? values : undefined;
}

/** Converts one SGR parameter list into a background color sequence, or undefined when it holds no valid foreground. */
function backgroundFromParameters(parameters: readonly number[]): string | undefined {
	let background: string | undefined;
	for (let index = 0; index < parameters.length; index += 1) {
		const code = parameters[index];
		if (code === 38) {
			const mode = parameters[index + 1];
			if (mode === 2) {
				const [red, green, blue] = parameters.slice(index + 2, index + 5);
				if (!isColorByte(red) || !isColorByte(green) || !isColorByte(blue)) return undefined;
				background = `${ESC}[48;2;${red};${green};${blue}m`;
				index += 4;
			} else if (mode === 5) {
				const palette = parameters[index + 2];
				if (!isColorByte(palette)) return undefined;
				background = `${ESC}[48;5;${palette}m`;
				index += 2;
			} else {
				return undefined;
			}
		} else if (code !== undefined && ((code >= 30 && code <= 37) || (code >= 90 && code <= 97))) {
			background = `${ESC}[${code + 10}m`;
		} else if (code === undefined || code > 107) {
			return undefined;
		}
	}
	return background;
}

/**
 * Boundary helper: SimpleTheme only exposes foreground colors, so the matching
 * background escape is derived from the SGR prefix a foreground color emits.
 * Accepts 38;2;r;g;b, 38;5;n and basic 30-37/90-97 colors; anything else
 * (non-SGR text, out of range values, trailing parameters) yields undefined so
 * callers can fall back instead of emitting a malformed escape.
 */
export function foregroundToBackground(prefix: string): string | undefined {
	let remaining = prefix;
	let background: string | undefined;
	while (remaining.length > 0) {
		const match = SGR_SEQUENCE.exec(remaining);
		if (!match) return undefined;
		const parameters = parseParameters(match[1] ?? "");
		if (!parameters) return undefined;
		const converted = backgroundFromParameters(parameters);
		if (converted === undefined && parameters.includes(38)) return undefined;
		background = converted ?? background;
		remaining = remaining.slice(match[0].length);
	}
	return background;
}

/** Background escape for a theme token, derived once per render from what theme.fg emits. */
function backgroundForToken(theme: SimpleTheme, token: string): string | undefined {
	const sample = theme.fg(token, FULL_BLOCK);
	const end = sample.indexOf(FULL_BLOCK);
	return end < 0 ? undefined : foregroundToBackground(sample.slice(0, end));
}

function tokenFor(
	pixel: string,
	column: number,
	cellRow: number,
	frame: number,
	style: AsciiAnimationStyle,
): string | undefined {
	const tone = PIXEL_TONES[pixel];
	if (!tone) return undefined;
	const color = glowToneColor(tone, column, cellRow, frame, SLANTED_TONE_PALETTE, style);
	return typeof color === "string" ? color : color.token;
}

/**
 * Cells: empty -> space; one pixel -> half block; equal pixels -> full block;
 * different pixels -> upper half in the top color over the bottom color as
 * background. If the bottom color cannot be turned into a background, the cell
 * degrades to a full block in the top color so the silhouette keeps its width.
 */
export function renderPixelHeader(
	pixels: readonly string[],
	frame: number,
	theme: SimpleTheme,
	style: AsciiAnimationStyle,
): string[] {
	const backgrounds = new Map<string, string | undefined>();
	const background = (token: string): string | undefined => {
		if (!backgrounds.has(token)) backgrounds.set(token, backgroundForToken(theme, token));
		return backgrounds.get(token);
	};
	const cellRows = Math.floor(pixels.length / 2);
	return Array.from({ length: cellRows }, (_row, cellRow) => {
		const upper = pixels[cellRow * 2] ?? "";
		const lower = pixels[cellRow * 2 + 1] ?? "";
		return Array.from(upper, (upperPixel, column) => {
			const top = tokenFor(upperPixel, column, cellRow, frame, style);
			const bottom = tokenFor(lower[column] ?? ".", column, cellRow, frame, style);
			if (top === undefined && bottom === undefined) return " ";
			if (top === undefined) return theme.fg(bottom ?? "", LOWER_HALF);
			if (bottom === undefined) return theme.fg(top, UPPER_HALF);
			if (top === bottom) return theme.fg(top, FULL_BLOCK);
			const bottomBackground = background(bottom);
			return bottomBackground === undefined
				? theme.fg(top, FULL_BLOCK)
				: `${bottomBackground}${theme.fg(top, UPPER_HALF)}${RESET_BACKGROUND}`;
		}).join("");
	});
}

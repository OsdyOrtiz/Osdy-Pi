import type { PixelGrid, PixelRgb } from "./pi-raccoon-sprites.js";

/**
 * Half-block pixel-art rendering: each terminal cell shows two vertical pixels,
 * the top one as the foreground of `▀` and the bottom one as its background.
 * Pure presentation; colors are 24-bit and every line resets its own styles.
 */

const RESET = "\u001b[0m";
const fg = ([r, g, b]: PixelRgb): string => `\u001b[38;2;${r};${g};${b}m`;
const bg = ([r, g, b]: PixelRgb): string => `\u001b[48;2;${r};${g};${b}m`;

/** Paints a glyph in a foreground color it owns, such as a theme token. */
export type PixelPainter = (text: string) => string;

/** Optional per-pixel painter that replaces the pixel's own color. */
export type PixelOverlay = (x: number, y: number) => PixelPainter | undefined;

type Pixel = PixelRgb | PixelPainter | undefined;

const isPainter = (pixel: Pixel): pixel is PixelPainter => typeof pixel === "function";

function renderCell(top: Pixel, bottom: Pixel): string {
	// A painter only sets the foreground, so it takes the half it covers and the
	// other half becomes the background; two painters share one full block.
	if (isPainter(top)) {
		if (isPainter(bottom)) return top("█");
		return bottom ? `${bg(bottom)}${top("▀")}` : top("▀");
	}
	if (isPainter(bottom)) return top ? `${bg(top)}${bottom("▄")}` : bottom("▄");
	if (top && bottom) return top === bottom ? `${fg(top)}█` : `${fg(top)}${bg(bottom)}▀`;
	if (top) return `${fg(top)}▀`;
	if (bottom) return `${fg(bottom)}▄`;
	return " ";
}

function renderRow(
	y: number,
	top: string,
	bottom: string,
	width: number,
	palette: Readonly<Record<string, PixelRgb>>,
	overlay: PixelOverlay | undefined,
): string {
	let line = "";
	let styled = false;
	let anyStyle = false;
	for (let x = 0; x < width; x += 1) {
		const cell = renderCell(
			overlay?.(x, y) ?? palette[top[x] ?? ""],
			overlay?.(x, y + 1) ?? palette[bottom[x] ?? ""],
		);
		const colored = cell !== " ";
		// Reset before every cell so a background color never bleeds into the next one.
		if (styled || colored) line += RESET;
		line += cell;
		styled = colored;
		anyStyle ||= colored;
	}
	return anyStyle ? `${line}${RESET}` : line;
}

export function pixelGridWidth(grid: PixelGrid): number {
	return grid.reduce((maximum, row) => Math.max(maximum, row.length), 0);
}

/** Renders `ceil(rows / 2)` lines, each exactly `pixelGridWidth(grid)` columns wide. */
export function renderHalfBlockGrid(
	grid: PixelGrid,
	palette: Readonly<Record<string, PixelRgb>>,
	overlay?: PixelOverlay,
): string[] {
	const width = pixelGridWidth(grid);
	const lines: string[] = [];
	for (let y = 0; y < grid.length; y += 2) {
		lines.push(renderRow(y, grid[y] ?? "", grid[y + 1] ?? "", width, palette, overlay));
	}
	return lines;
}

import { sliceByColumn } from "@earendil-works/pi-tui";
import type { SimpleTheme } from "./types.js";

/** Header timer ticks the startup typewriter takes to write the whole wordmark (24 x 30 ms = 720 ms). */
export const TYPEWRITER_FRAMES = 24;
/** Caret drawn just after the last written column while the wordmark is being typed. */
export const TYPEWRITER_CURSOR = "▌";

const ANSI_RESET = "\u001B[0m";

/** Columns of a `width`-wide wordmark already written at a header timer tick. */
export function typewriterColumns(frame: number, width: number): number {
	if (frame >= TYPEWRITER_FRAMES) return width;
	return Math.max(0, Math.floor((width * frame) / TYPEWRITER_FRAMES));
}

/** Reveal the wordmark left to right, every row at once, with a caret at the writing edge. */
export function typewriterReveal(
	lines: readonly string[],
	frame: number,
	width: number,
	theme: SimpleTheme,
): string[] {
	const columns = typewriterColumns(frame, width);
	if (columns >= width) return [...lines];
	const cursor = theme.fg("accent", TYPEWRITER_CURSOR);
	return lines.map((line) => `${sliceByColumn(line, 0, columns)}${ANSI_RESET}${cursor}`);
}

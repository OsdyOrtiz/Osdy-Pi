import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import type { SimpleTheme } from "./types.js";

export const MODAL_OVERLAY_OPTIONS = {
	anchor: "center",
	width: 96,
	minWidth: 48,
	maxHeight: "92%",
	margin: 1,
} as const;

export function doubleBorderBox(
	theme: SimpleTheme,
	width: number,
	title: string,
	lines: string[],
): string[] {
	const innerWidth = Math.max(1, width - 2);
	const heading = truncateToWidth(` ${title} `, innerWidth, "...", true);
	const leftWidth = Math.floor(
		Math.max(0, innerWidth - visibleWidth(heading)) / 2,
	);
	const rightWidth = Math.max(0, innerWidth - visibleWidth(heading) - leftWidth);
	const pad = (line: string): string => {
		const text = truncateToWidth(line, innerWidth, "...", true);
		return `${text}${" ".repeat(Math.max(0, innerWidth - visibleWidth(text)))}`;
	};
	return [
		`${theme.fg("border", `╔${"═".repeat(leftWidth)}`)}${theme.fg("accent", heading)}${theme.fg("border", `${"═".repeat(rightWidth)}╗`)}`,
		...lines.map(
			(line) => `${theme.fg("border", "║")}${pad(line)}${theme.fg("border", "║")}`,
		),
		theme.fg("border", `╚${"═".repeat(innerWidth)}╝`),
	];
}

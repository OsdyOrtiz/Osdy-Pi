import type { TUI } from "@earendil-works/pi-tui";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import { headerWidth, HEADER_VARIANTS, MASCOT_GAP } from "./constants.js";
import type { HeaderVariant } from "./types.js";

export function sanitizeStatusText(text: string): string {
	return text
		.replace(/[\r\n\t]/g, " ")
		.replace(/ +/g, " ")
		.trim();
}

export function positiveModulo(value: number, divisor: number): number {
	return ((value % divisor) + divisor) % divisor;
}

export function centerVisible(line: string, width: number): string {
	const leftPad = Math.max(0, Math.floor((width - visibleWidth(line)) / 2));
	return `${" ".repeat(leftPad)}${line}`;
}

export function fitCenterVisible(line: string, width: number): string {
	return centerVisible(truncateToWidth(line, Math.max(1, width)), width);
}

export function padVisibleRight(line: string, width: number): string {
	return `${line}${" ".repeat(Math.max(0, width - visibleWidth(line)))}`;
}

export function composeSideBySide(
	leftLines: string[],
	leftWidth: number,
	rightLines: string[],
	width: number,
	rightWidth: number,
): string[] {
	const combinedWidth = leftWidth + MASCOT_GAP + rightWidth;
	if (width < combinedWidth) return rightLines;
	const leftPad = " ".repeat(
		Math.max(0, Math.floor((width - combinedWidth) / 2)),
	);
	const rows = Math.max(leftLines.length, rightLines.length);
	const topOffset = Math.max(0, Math.floor((rows - rightLines.length) / 2));
	const composedRows: string[] = [];
	for (let index = 0; index < rows; index += 1) {
		const left = padVisibleRight(leftLines[index] ?? "", leftWidth);
		const right = rightLines[index - topOffset] ?? "";
		composedRows.push(`${leftPad}${left}${" ".repeat(MASCOT_GAP)}${right}`);
	}
	return composedRows;
}

export function isSmallResponsiveMode(
	variant: HeaderVariant,
	columns: number,
	rows: number,
): boolean {
	const header = HEADER_VARIANTS[variant];
	const hasMascot =
		(header.mascot?.length ?? 0) > 0 && (header.mascotMap?.length ?? 0) > 0;
	return (
		!hasMascot ||
		columns < headerWidth(variant) + MASCOT_GAP + 1 ||
		rows < header.header.length
	);
}

// In mascot-only mode, phone-sized terminals use roughly four-fifths of the
// available width while wider compact terminals gradually recover more detail.
const COMPACT_MASCOT_BASE_RATIO = 0.7938;
const COMPACT_MASCOT_MAX_RATIO = 0.87318;
const COMPACT_MASCOT_RATIO_RAMP_START_COLUMNS = 60;
const COMPACT_MASCOT_RATIO_RAMP_COLUMNS = 40;

export function compactMascotWidthBudget(availableWidth: number): number {
	const normalizedWidth = Math.max(1, Math.floor(availableWidth));
	const ratioProgress = Math.max(
		0,
		Math.min(
			1,
			(normalizedWidth - COMPACT_MASCOT_RATIO_RAMP_START_COLUMNS) /
				COMPACT_MASCOT_RATIO_RAMP_COLUMNS,
		),
	);
	const widthRatio =
		COMPACT_MASCOT_BASE_RATIO +
		(COMPACT_MASCOT_MAX_RATIO - COMPACT_MASCOT_BASE_RATIO) * ratioProgress;
	return Math.min(
		normalizedWidth,
		Math.max(1, Math.round(normalizedWidth * widthRatio)),
	);
}

export function internalLineTarget(tui: TUI): number {
	return tui.terminal.rows < 18 ? 3 : 4;
}

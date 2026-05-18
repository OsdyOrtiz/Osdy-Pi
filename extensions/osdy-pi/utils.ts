import type { TUI } from "@earendil-works/pi-tui";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import { MASCOT_GAP } from "./constants.js";

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

export function internalLineTarget(tui: TUI): number {
	return tui.terminal.rows < 18 ? 3 : 4;
}

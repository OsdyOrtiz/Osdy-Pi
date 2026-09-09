import { visibleWidth } from "@earendil-works/pi-tui";
import { shortNumber } from "./format.js";

export type ContextUsageDisplayData = {
	input: number;
	output: number;
	cacheRead: number;
	cacheWrite: number;
	cost: number;
	percent: number | undefined;
	contextWindow: number | undefined;
};

type UsageTheme = {
	fg(token: "success" | "warning" | "error", text: string): string;
};

function roundedClampedPercent(
	percent: number | undefined,
): number | undefined {
	if (percent === undefined || !Number.isFinite(percent)) return undefined;
	return Math.min(100, Math.max(0, Math.round(percent)));
}

function usageTone(percent: number): "success" | "warning" | "error" {
	if (percent <= 30) return "success";
	if (percent <= 80) return "warning";
	return "error";
}

function usageBar(percent: number): string {
	const filledCells = Math.round(percent / 10);
	return "█".repeat(filledCells) + "░".repeat(10 - filledCells);
}

export function formatContextUsage(
	theme: UsageTheme,
	usage: ContextUsageDisplayData,
	availableWidth?: number,
): string {
	const percent = roundedClampedPercent(usage.percent);
	const displayPercent = percent ?? 0;
	const percentageLabel = percent === undefined ? "?" : String(percent);
	const contextWindowLabel =
		usage.contextWindow === undefined || !Number.isFinite(usage.contextWindow)
			? "?"
			: shortNumber(usage.contextWindow);
	const cacheLabel =
		usage.cacheRead || usage.cacheWrite
			? ` R${shortNumber(usage.cacheRead)} W${shortNumber(usage.cacheWrite)}`
			: "";
	const bar = theme.fg(
		usageTone(displayPercent),
		`[${usageBar(displayPercent)}]`,
	);
	const full = `tok ↑${shortNumber(usage.input)} ↓${shortNumber(usage.output)}${cacheLabel} · $${usage.cost.toFixed(4)} · ctx ${bar} ${percentageLabel}%/${contextWindowLabel}`;
	if (availableWidth === undefined || visibleWidth(full) <= availableWidth)
		return full;
	return `$${usage.cost.toFixed(4)} · ctx ${bar} ${percentageLabel}%`;
}

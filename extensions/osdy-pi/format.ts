import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

export function formatPath(cwd: string): string {
	const home = process.env.HOME;
	return home && cwd.startsWith(home) ? `~${cwd.slice(home.length)}` : cwd;
}

function getMiddleWidths(maxWidth: number): {
	headWidth: number;
	tailWidth: number;
} {
	const headWidth = Math.max(1, Math.ceil((maxWidth - 1) / 2));
	return {
		headWidth,
		tailWidth: Math.max(1, maxWidth - 1 - headWidth),
	};
}

function getTrailingText(value: string, tailWidth: number): string {
	const reversedValue = Array.from(value).reverse().join("");
	return truncateToWidth(reversedValue, tailWidth, "")
		.split("")
		.reverse()
		.join("");
}

export function truncateMiddle(value: string, maxWidth: number): string {
	if (maxWidth <= 0) return "";
	if (visibleWidth(value) <= maxWidth) return value;
	if (maxWidth <= 3) return truncateToWidth(value, maxWidth);
	const { headWidth, tailWidth } = getMiddleWidths(maxWidth);
	const head = truncateToWidth(value, headWidth, "");
	const tail = getTrailingText(value, tailWidth);
	return `${head}…${tail}`;
}

export function shortNumber(value: number): string {
	if (!Number.isFinite(value)) return "0";
	if (Math.abs(value) < 1_000) return Math.round(value).toString();
	if (Math.abs(value) < 1_000_000) return `${(value / 1_000).toFixed(1)}k`;
	return `${(value / 1_000_000).toFixed(1)}m`;
}

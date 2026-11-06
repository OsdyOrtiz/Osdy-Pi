import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { matchesKey, truncateToWidth, visibleWidth, wrapTextWithAnsi, type Component, type TUI } from "@earendil-works/pi-tui";
import type { ClaudeBridgeUsageSnapshot, ClaudeBridgeUsageWindow } from "./claude-bridge-usage.js";
import type { CodexUsageSnapshot, CodexUsageWindow } from "./codex-usage.js";
import { renderCodexUsageDashboardContentLines, renderCompactQuotaWindows, type CodexUsagePresentation } from "./codex-usage-ui.js";
import { doubleBorderBox, MODAL_OVERLAY_OPTIONS } from "./modal-frame.js";
import type { CodexUsageState, SimpleTheme } from "./types.js";

type Windows = readonly [CodexUsageWindow | undefined, CodexUsageWindow | undefined];

function usableWindow(window: CodexUsageWindow | undefined): CodexUsageWindow | undefined {
	return window && Number.isFinite(window.usedPercent) ? window : undefined;
}

function codexWindows(snapshot: CodexUsageSnapshot | undefined): Windows {
	const bucket = snapshot?.buckets.find(item => item.id === "codex");
	return [usableWindow(bucket?.primary), usableWindow(bucket?.secondary)];
}

// Filter only the combined view; shared dashboard and stored-profile callers keep their original snapshot.
function combinedCodexSnapshot(snapshot: CodexUsageSnapshot): CodexUsageSnapshot {
	return {
		...snapshot,
		buckets: snapshot.buckets.flatMap(bucket => {
			if (bucket.id !== "codex") return [bucket];
			const primary = usableWindow(bucket.primary);
			const secondary = usableWindow(bucket.secondary);
			return primary || secondary ? [{ ...bucket, primary, secondary }] : [];
		}),
	};
}

function bridgeWindow(window: ClaudeBridgeUsageWindow | undefined, minutes: number): CodexUsageWindow | undefined {
	if (window?.usedPercent === undefined || !Number.isFinite(window.usedPercent)) return undefined;
	return { usedPercent: window.usedPercent, windowMinutes: minutes, resetsAt: window.resetsAt };
}

function bridgeWindows(snapshot: ClaudeBridgeUsageSnapshot | undefined): Windows {
	return [bridgeWindow(snapshot?.session, 300), bridgeWindow(snapshot?.weekly, 10_080)];
}

// Keep enough space for a full window label, percentage, and a visible bar in each column.
const COMPACT_COLUMNS_MIN_WIDTH = 63;
const MODAL_COLUMNS_MIN_WIDTH = 160;
const COLUMN_GAP = 3;

function sideBySide(left: string[], right: string[], leftWidth: number): string[] {
	return Array.from({ length: Math.max(left.length, right.length) }, (_value, index) => {
		const line = left[index] ?? "";
		const other = right[index] ?? "";
		if (!other) return line;
		return `${line}${" ".repeat(Math.max(0, leftWidth - visibleWidth(line)) + COLUMN_GAP)}${other}`;
	});
}

/** Separate source labels and windows; absent values never become quota percentages. */
export function renderCombinedCompanionUsage(
	theme: SimpleTheme, codex: CodexUsageState, bridge: ClaudeBridgeUsageSnapshot | undefined, width: number,
): string[] {
	if (width <= 0) return [];
	const maximumWidth = Math.max(1, Math.floor(width));
	const snapshot = codex.kind === "idle" ? undefined : codex.snapshot;
	const columns = maximumWidth >= COMPACT_COLUMNS_MIN_WIDTH;
	const leftWidth = columns ? Math.floor((maximumWidth - COLUMN_GAP) / 2) : maximumWidth;
	const rightWidth = columns ? maximumWidth - COLUMN_GAP - leftWidth : maximumWidth;
	const block = (label: string, windows: Windows, blockWidth: number): string[] => [
		...wrapTextWithAnsi(theme.fg("accent", label), blockWidth),
		...renderCompactQuotaWindows(theme, windows, blockWidth, "spaced"),
	];
	const left = block("Codex", codexWindows(snapshot), leftWidth);
	const right = block("Claude Bridge", bridgeWindows(bridge), rightWidth);
	return columns ? sideBySide(left, right, leftWidth) : [...left, ...right];
}

function bridgeContent(theme: SimpleTheme, snapshot: ClaudeBridgeUsageSnapshot | undefined, width: number): string[] {
	const maximumWidth = Math.max(1, width);
	const lines = [theme.fg("accent", "Claude Bridge")];
	if (!snapshot) lines.push(theme.fg("muted", "Waiting for a Claude Bridge response."));
	const windows = bridgeWindows(snapshot);
	let displayed = false;
	for (const [index, window] of windows.entries()) {
		if (!window) continue;
		if (displayed) lines.push("");
		displayed = true;
		const selected: Windows = index === 0 ? [window, undefined] : [undefined, window];
		// Modal content can wrap: keep names and percentages instead of compact-label elision.
		lines.push(...renderCompactQuotaWindows(theme, selected, Math.max(32, maximumWidth)));
		const date = window.resetsAt === undefined ? undefined : new Date(window.resetsAt * 1000);
		const reset = date && Number.isFinite(date.getTime())
			? `${date.toISOString().replace("T", " ").slice(0, 16)} UTC` : "unknown";
		lines.push(theme.fg("muted", `Next reset: ${reset}`));
	}
	return lines.flatMap(line => line ? wrapTextWithAnsi(line, maximumWidth) : [""]);
}

function codexContent(theme: SimpleTheme, state: CodexUsageState, presentation: CodexUsagePresentation, width: number, now: number): string[] {
	const lines = [theme.fg("accent", "Codex")];
	const snapshot = state.kind === "idle" ? undefined : state.snapshot;
	if (state.kind === "loading") lines.push(theme.fg("muted", "Loading subscription usage…"));
	if (state.kind === "error") lines.push(theme.fg("warning", state.message));
	if (!snapshot) {
		if (state.kind === "idle") lines.push(theme.fg("muted", "Waiting for Codex usage."));
	} else {
		lines.push(...renderCodexUsageDashboardContentLines(theme, combinedCodexSnapshot(snapshot), { profile: presentation.profile }, now, width));
		lines.push(theme.fg("muted", `Fetched: ${new Date(snapshot.fetchedAt).toLocaleString()} (cached)`));
	}
	return lines.flatMap(line => wrapTextWithAnsi(line, Math.max(1, width)));
}

/** One interaction owns its subscription and scroll state; reset dialogs start after it closes. */
export async function showCombinedUsagePanel(
	ctx: Pick<ExtensionContext, "ui">,
	getCodex: () => CodexUsageState,
	getBridge: () => ClaudeBridgeUsageSnapshot | undefined,
	subscribe: (redraw: () => void) => () => void,
	refresh: () => Promise<void>,
	presentation: CodexUsagePresentation,
	canReset: () => boolean,
	useReset?: () => Promise<boolean>,
): Promise<void> {
	let firstOpen = true;
	while (true) {
		let unsubscribe = () => {};
		let disposed = false;
		let intent: "reset" | undefined;
		try {
			intent = await ctx.ui.custom<"reset" | undefined>((tui: TUI, theme, _keys, done): Component => {
				let offset = 0;
				let pageSize = 1;
				let maxOffset = 0;
				let inFlight = false;
				const redraw = () => { if (!disposed) tui.requestRender(); };
				unsubscribe = subscribe(redraw);
				const runRefresh = async (): Promise<void> => {
					if (inFlight) return;
					inFlight = true;
					try { const pending = refresh(); redraw(); await pending; }
					finally { inFlight = false; redraw(); }
				};
				if (firstOpen) void runRefresh().catch(() => {});
				firstOpen = false;
				return {
					render(width) {
						const contentWidth = Math.max(1, width - 2);
						const now = Date.now();
						const columns = contentWidth >= MODAL_COLUMNS_MIN_WIDTH;
						const leftWidth = columns ? Math.floor((contentWidth - COLUMN_GAP) / 2) : contentWidth;
						const rightWidth = columns ? contentWidth - COLUMN_GAP - leftWidth : contentWidth;
						const left = codexContent(theme, getCodex(), presentation, leftWidth, now);
						const right = bridgeContent(theme, getBridge(), rightWidth);
						const content = columns ? sideBySide(left, right, leftWidth) : [...left, "", ...right];
						const controls = `${useReset && canReset() ? "u use/check reset · " : ""}r refresh Codex · ↑/↓ PgUp/PgDn Home/End scroll · esc/q close`;
						const hints = wrapTextWithAnsi(theme.fg("muted", controls), contentWidth);
						const rows = tui.terminal?.rows ?? 40;
						const height = Math.max(1, Math.min(Math.floor(rows * 0.92), rows - 2));
						const framed = height >= 4;
						const hintBudget = Math.max(0, height - (framed ? 3 : 1));
						const visibleHints = hintBudget ? hints.slice(-hintBudget) : [];
						content.push(...hints.slice(0, hints.length - visibleHints.length));
						pageSize = Math.max(1, height - (framed ? 2 : 0) - visibleHints.length);
						maxOffset = Math.max(0, content.length - pageSize);
						offset = Math.max(0, Math.min(offset, maxOffset));
						const view = [...content.slice(offset, offset + pageSize), ...visibleHints];
						const lines = framed
							? doubleBorderBox(theme, width, "Codex + Claude Bridge subscription usage", view)
							: view.map(line => truncateToWidth(line, Math.max(1, width), ""));
						if (width <= 0) return lines.map(() => "");
						return width < 3 ? lines.map(line => truncateToWidth(line, width, "")) : lines;
					},
					handleInput(data) {
						if (matchesKey(data, "escape") || matchesKey(data, "q")) { done(undefined); return; }
						if (matchesKey(data, "u") && useReset && canReset()) { done("reset"); return; }
						if (matchesKey(data, "r")) { void runRefresh().catch(() => {}); return; }
						if (matchesKey(data, "down")) offset++;
						else if (matchesKey(data, "up")) offset--;
						else if (matchesKey(data, "pageDown")) offset += pageSize;
						else if (matchesKey(data, "pageUp")) offset -= pageSize;
						else if (matchesKey(data, "home")) offset = 0;
						else if (matchesKey(data, "end")) offset = maxOffset;
						else return;
						offset = Math.max(0, Math.min(offset, maxOffset)); redraw();
					},
					invalidate() {},
				};
			}, { overlay: true, overlayOptions: { ...MODAL_OVERLAY_OPTIONS, width: "90%" } });
		} finally { disposed = true; unsubscribe(); }
		if (intent !== "reset" || !useReset || !canReset() || !(await useReset()) || !canReset()) return;
	}
}

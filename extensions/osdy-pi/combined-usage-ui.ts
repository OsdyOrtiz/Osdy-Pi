import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { matchesKey, truncateToWidth, wrapTextWithAnsi, type Component, type TUI } from "@earendil-works/pi-tui";
import type { ClaudeBridgeUsageSnapshot, ClaudeBridgeUsageWindow } from "./claude-bridge-usage.js";
import type { CodexUsageSnapshot, CodexUsageWindow } from "./codex-usage.js";
import { renderCodexUsageDashboardContentLines, renderCompactQuotaWindows, renderControlCenterQuotaWindow, type CodexUsagePresentation } from "./codex-usage-ui.js";
import { doubleBorderBox, MODAL_OVERLAY_OPTIONS } from "./modal-frame.js";
import type { CodexUsageState, SimpleTheme } from "./types.js";

type Windows = readonly [CodexUsageWindow | undefined, CodexUsageWindow | undefined];

function codexWindows(snapshot: CodexUsageSnapshot | undefined): Windows {
	const bucket = snapshot?.buckets.find(item => item.id === "codex");
	return [bucket?.primary, bucket?.secondary];
}

function bridgeWindow(window: ClaudeBridgeUsageWindow | undefined, minutes: number): CodexUsageWindow | undefined {
	if (window?.usedPercent === undefined) return undefined;
	return { usedPercent: window.usedPercent, windowMinutes: minutes, resetsAt: window.resetsAt };
}

function bridgeWindows(snapshot: ClaudeBridgeUsageSnapshot | undefined): Windows {
	return [bridgeWindow(snapshot?.session, 300), bridgeWindow(snapshot?.weekly, 10_080)];
}

/** Separate source labels and windows; absent values never become quota percentages. */
export function renderCombinedCompanionUsage(
	theme: SimpleTheme, codex: CodexUsageState, bridge: ClaudeBridgeUsageSnapshot | undefined, width: number,
): string[] {
	const snapshot = codex.kind === "idle" ? undefined : codex.snapshot;
	return [
		theme.fg("accent", "Codex"),
		...renderCompactQuotaWindows(theme, codexWindows(snapshot), width, "spaced", true),
		theme.fg("accent", "Claude Bridge"),
		...renderCompactQuotaWindows(theme, bridgeWindows(bridge), width, "spaced", true),
	];
}

function bridgeContent(theme: SimpleTheme, snapshot: ClaudeBridgeUsageSnapshot | undefined, width: number, now: number): string[] {
	const lines = [theme.fg("accent", "Claude Bridge")];
	if (!snapshot) lines.push(theme.fg("muted", "Waiting for a Claude Bridge response."));
	const windows = bridgeWindows(snapshot);
	for (const [index, name] of (["Session", "Weekly"] as const).entries()) {
		const source = index === 0 ? snapshot?.session : snapshot?.weekly;
		const window = windows[index];
		if (window) lines.push(...renderControlCenterQuotaWindow(theme, window, width, name, now));
		else {
			lines.push(theme.fg("muted", `${name}: unknown`));
			const reset = source?.resetsAt;
			lines.push(theme.fg("muted", `Reset: ${reset === undefined ? "unknown" : new Date(reset * 1000).toISOString().replace("T", " ").slice(0, 16) + " UTC"}`));
		}
	}
	if (snapshot) lines.push(theme.fg("muted", `Captured: ${new Date(snapshot.capturedAt).toLocaleString()} (cached)`));
	return lines.flatMap(line => wrapTextWithAnsi(line, Math.max(1, width)));
}

function codexContent(theme: SimpleTheme, state: CodexUsageState, presentation: CodexUsagePresentation, width: number, now: number): string[] {
	const lines = [theme.fg("accent", "Codex")];
	const snapshot = state.kind === "idle" ? undefined : state.snapshot;
	if (state.kind === "loading") lines.push(theme.fg("muted", "Loading subscription usage…"));
	if (state.kind === "error") lines.push(theme.fg("warning", state.message));
	if (!snapshot) {
		if (state.kind === "idle") lines.push(theme.fg("muted", "Waiting for Codex usage."));
		lines.push(...renderCompactQuotaWindows(theme, [undefined, undefined], width, "spaced", true));
	} else {
		lines.push(...renderCodexUsageDashboardContentLines(theme, snapshot, { profile: presentation.profile }, now, width));
		const windows = codexWindows(snapshot);
		for (const [index, name] of (["Session", "Weekly"] as const).entries())
			if (!windows[index]) lines.push(theme.fg("muted", `Codex ${name}: unknown`));
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
						const content = [...codexContent(theme, getCodex(), presentation, contentWidth, now), "",
							...bridgeContent(theme, getBridge(), contentWidth, now)];
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
			}, { overlay: true, overlayOptions: MODAL_OVERLAY_OPTIONS });
		} finally { disposed = true; unsubscribe(); }
		if (intent !== "reset" || !useReset || !canReset() || !(await useReset()) || !canReset()) return;
	}
}

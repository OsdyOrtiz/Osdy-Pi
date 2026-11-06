import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { matchesKey, type Component } from "@earendil-works/pi-tui";
import type { ClaudeBridgeUsageSnapshot, ClaudeBridgeUsageWindow } from "./claude-bridge-usage.js";
import { doubleBorderBox, MODAL_OVERLAY_OPTIONS } from "./modal-frame.js";
import type { SimpleTheme } from "./types.js";

function utc(timestamp: number): string {
	return `${new Date(timestamp).toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

function windowLines(label: string, duration: string, window: ClaudeBridgeUsageWindow | undefined): string[] {
	const remaining = window?.usedPercent === undefined ? "unknown" : `${Math.round(100 - window.usedPercent)}% left`;
	const reset = window?.resetsAt === undefined ? "unknown" : utc(window.resetsAt * 1000);
	return [`${label} (${duration}): ${remaining}`, `  Reset: ${reset}`];
}

export function renderClaudeBridgeUsageLines(theme: SimpleTheme, snapshot: ClaudeBridgeUsageSnapshot | undefined, width: number): string[] {
	const content = snapshot ? [
		...windowLines("Session", "5h", snapshot.session),
		...windowLines("Weekly", "7d", snapshot.weekly),
		`Captured: ${utc(snapshot.capturedAt)}`,
	] : ["Waiting for a Claude Bridge response."];
	return doubleBorderBox(theme, width, "Claude Bridge subscription usage", [...content, "esc/q close"]);
}

/** Passive overlay: data arrives only through the caller's response-event cache. */
export async function showClaudeBridgeUsagePanel(
	ctx: Pick<ExtensionContext, "ui">,
	getSnapshot: () => ClaudeBridgeUsageSnapshot | undefined,
	subscribe: (redraw: () => void) => () => void,
): Promise<void> {
	let unsubscribe = () => {};
	try {
		await ctx.ui.custom<void>((tui, theme, _keys, done): Component => {
			unsubscribe = subscribe(() => tui.requestRender());
			return {
				render: width => renderClaudeBridgeUsageLines(theme, getSnapshot(), width),
				handleInput: data => { if (matchesKey(data, "escape") || matchesKey(data, "q")) done(); },
				invalidate: () => {},
			};
		}, { overlay: true, overlayOptions: MODAL_OVERLAY_OPTIONS });
	} finally { unsubscribe(); }
}

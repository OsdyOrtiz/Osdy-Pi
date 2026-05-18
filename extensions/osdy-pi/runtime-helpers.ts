import type {
	ExtensionAPI,
	ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { asciiAnimationMode } from "./animation.js";
import { THEME_NAME, WORKING_WIDGET_KEY } from "./constants.js";
import { modelLabel, usageLabel } from "./metrics.js";
import type { OsdyState, WorkingWidgetState } from "./types.js";
import {
	createEditorComponent,
	createFooterComponent,
	createHeaderComponent,
	createWorkingWidgetFactory,
} from "./ui.js";

function shouldRememberTheme(
	previousThemeName: string | undefined,
	currentTheme: string | undefined,
): currentTheme is string {
	return (
		previousThemeName === undefined &&
		currentTheme !== undefined &&
		currentTheme !== THEME_NAME
	);
}

export function rememberPreviousTheme(
	ctx: ExtensionContext,
	state: OsdyState,
): void {
	const currentTheme = ctx.ui.theme.name;
	if (shouldRememberTheme(state.previousThemeName, currentTheme)) {
		state.previousThemeName = currentTheme;
	}
}

export function applyOsdyTheme(ctx: ExtensionContext): void {
	const osdyTheme = ctx.ui.getTheme(THEME_NAME);
	const themeResult = osdyTheme
		? ctx.ui.setTheme(osdyTheme)
		: ctx.ui.setTheme(THEME_NAME);
	if (!themeResult.success) {
		ctx.ui.notify(
			`osdy-pi theme failed: ${themeResult.error ?? "unknown error"}`,
			"warning",
		);
	}
}

export function mountOsdyUi(
	pi: ExtensionAPI,
	ctx: ExtensionContext,
	state: OsdyState,
	workingState: WorkingWidgetState,
): void {
	ctx.ui.setHeader(createHeaderComponent(pi, ctx, state));
	ctx.ui.setFooter((_tui, theme, footerData) =>
		createFooterComponent(ctx, footerData, theme),
	);
	ctx.ui.setWorkingVisible(false);
	ctx.ui.setWidget(
		WORKING_WIDGET_KEY,
		createWorkingWidgetFactory(workingState),
		{ placement: "aboveEditor" },
	);
	ctx.ui.setEditorComponent(createEditorComponent(pi, ctx));
}

export function applyOsdyPi(
	pi: ExtensionAPI,
	ctx: ExtensionContext,
	state: OsdyState,
	workingState: WorkingWidgetState,
	notify = false,
): void {
	if (!ctx.hasUI) return;
	rememberPreviousTheme(ctx, state);
	applyOsdyTheme(ctx);
	mountOsdyUi(pi, ctx, state, workingState);
	if (notify) ctx.ui.notify("osdy-pi enabled", "info");
}

export function disableOsdyPi(ctx: ExtensionContext, state: OsdyState): void {
	if (!ctx.hasUI) return;
	ctx.ui.setHeader(undefined);
	ctx.ui.setEditorComponent(undefined);
	ctx.ui.setFooter(undefined);
	ctx.ui.setWidget(WORKING_WIDGET_KEY, undefined);
	ctx.ui.setWorkingVisible(true);
	const targetTheme = state.previousThemeName ?? "dark";
	const result = ctx.ui.setTheme(targetTheme);
	if (!result.success && targetTheme !== "dark") ctx.ui.setTheme("dark");
	ctx.ui.notify("osdy-pi disabled", "info");
}

export function notifyStatus(ctx: ExtensionContext, state: OsdyState): void {
	ctx.ui.notify(
		`osdy-pi ${state.enabled ? "enabled" : "disabled"} · theme ${ctx.ui.theme.name ?? "unknown"} · style ${state.headerVariant} · animation ${asciiAnimationMode()} · ${modelLabel(ctx)} · ${usageLabel(ctx).trim()}`,
		"info",
	);
}

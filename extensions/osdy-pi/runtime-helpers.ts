import type {
	ExtensionAPI,
	ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { asciiAnimationMode } from "./animation.js";
import { WORKING_TREE_WIDGET_KEY, WORKING_WIDGET_KEY } from "./constants.js";
import { modelLabel, usageLabel } from "./metrics.js";
import {
	resolveEffectiveEditorMode,
	type OsdyState,
	type WorkingTreeState,
	type WorkingWidgetState,
} from "./types.js";
import {
	createEditorComponent,
	createFooterComponent,
	createHeaderComponent,
	createWorkingWidgetFactory,
} from "./ui.js";
import { createWorkingTreeWidgetFactory } from "./working-tree.js";
import { isSmallResponsiveMode } from "./utils.js";

const GENTLE_SHELL_CHANGES_WIDGET_KEY = "gentle-shell-changes";
const RESPONSIVE_WATCH_INTERVAL_MS = 150;

export function clearGentleShellChangesWidget(ctx: ExtensionContext): void {
	ctx.ui.setWidget(GENTLE_SHELL_CHANGES_WIDGET_KEY, undefined);
}

function workingTreeEffective(
	state: OsdyState,
): "visible" | "hidden" | "unmounted" {
	if (!state.enabled || !state.workingTreeEnabled) return "unmounted";
	return state.smallMode ? "hidden" : "visible";
}

function desiredSmallMode(state: OsdyState): boolean {
	const tui = state.tui;
	return tui
		? isSmallResponsiveMode(
				state.headerVariant,
				tui.terminal.columns,
				tui.terminal.rows,
			)
		: false;
}

/** Only editor reconstruction is deferred: all other visual owners stay live. */
function reconcileEditorMount(pi: ExtensionAPI, ctx: ExtensionContext, state: OsdyState): void {
	const extended = state.enabled && resolveEffectiveEditorMode(state.editorMode, state.smallMode) === "extended";
	if (state.enabled && state.editorEffective === extended && !state.editorSessionRemountPending) {
		state.editorReconcilePending = false;
		return;
	}
	if (state.editorMountHold?.count || state.tui?.hasOverlay()) {
		state.editorReconcilePending = true;
		return;
	}
	if (extended) mountOsdyEditor(pi, ctx, state);
	else if (state.enabled) unmountOsdyEditor(ctx);
	else ctx.ui.setEditorComponent(state.fallbackEditorFactory);
	state.editorEffective = extended;
	state.editorReconcilePending = false;
	state.editorSessionRemountPending = false;
	if (!state.enabled) state.tui = undefined;
}

export function reconcileResponsiveUi(
	pi: ExtensionAPI,
	ctx: ExtensionContext,
	state: OsdyState,
	workingTreeState: WorkingTreeState,
): void {
	if (!ctx.hasUI) return;
	if (!state.enabled) {
		if (state.editorReconcilePending) reconcileEditorMount(pi, ctx, state);
		return;
	}
	const nextSmallMode = desiredSmallMode(state);
	const smallModeChanged = nextSmallMode !== state.smallMode;
	state.smallMode = nextSmallMode;
	reconcileEditorMount(pi, ctx, state);
	const treeVisible = state.workingTreeEnabled && !state.smallMode;
	if (workingTreeState.visible !== treeVisible) {
		workingTreeState.visible = treeVisible;
		if (!smallModeChanged) workingTreeState.tui?.requestRender();
	}
	if (smallModeChanged) (state.tui ?? workingTreeState.tui)?.requestRender();
}

export function createResponsiveCoordinator(
	pi: ExtensionAPI,
	ctx: ExtensionContext,
	state: OsdyState,
	workingTreeState: WorkingTreeState,
) {
	let timer: ReturnType<typeof setInterval> | undefined;
	return {
		start(): void {
			if (timer) return;
			reconcileResponsiveUi(pi, ctx, state, workingTreeState);
			timer = setInterval(() => {
				if (!state.enabled && !state.editorReconcilePending) {
					this.stop();
					return;
				}
				const nextSmallMode = desiredSmallMode(state);
				if (state.editorReconcilePending || nextSmallMode !== state.smallMode) {
					reconcileResponsiveUi(pi, ctx, state, workingTreeState);
				}
			}, RESPONSIVE_WATCH_INTERVAL_MS);
		},
		stop(): void {
			if (timer) clearInterval(timer);
			timer = undefined;
		},
	};
}

export function mountOsdyEditor(
	pi: ExtensionAPI,
	ctx: ExtensionContext,
	state: OsdyState,
): void {
	ctx.ui.setEditorComponent(createEditorComponent(pi, ctx, state));
}

export function unmountOsdyEditor(ctx: ExtensionContext): void {
	ctx.ui.setEditorComponent(undefined);
}

export function syncWorkingTreeWidget(
	ctx: ExtensionContext,
	state: OsdyState,
	workingState: WorkingWidgetState,
	workingTreeState: WorkingTreeState,
): void {
	if (!state.enabled || !state.workingTreeEnabled) {
		ctx.ui.setWidget(WORKING_TREE_WIDGET_KEY, undefined);
		return;
	}
	ctx.ui.setWidget(
		WORKING_TREE_WIDGET_KEY,
		createWorkingTreeWidgetFactory(
			workingTreeState,
			workingState,
			state.workingTreePlacement,
		),
		{ placement: state.workingTreePlacement },
	);
}

export function mountOsdyUi(
	pi: ExtensionAPI,
	ctx: ExtensionContext,
	state: OsdyState,
	workingState: WorkingWidgetState,
	workingTreeState: WorkingTreeState,
): void {
	ctx.ui.setHeader(createHeaderComponent(pi, ctx, state));
	ctx.ui.setFooter((tui, theme, footerData) => {
		state.tui = tui;
		return createFooterComponent(pi, ctx, state, footerData, theme);
	});
	ctx.ui.setWorkingVisible(false);
	clearGentleShellChangesWidget(ctx);
	ctx.ui.setWidget(
		WORKING_WIDGET_KEY,
		createWorkingWidgetFactory(workingState),
		{ placement: "aboveEditor" },
	);
	syncWorkingTreeWidget(ctx, state, workingState, workingTreeState);
	reconcileResponsiveUi(pi, ctx, state, workingTreeState);
}

export function applyOsdyPi(
	pi: ExtensionAPI,
	ctx: ExtensionContext,
	state: OsdyState,
	workingState: WorkingWidgetState,
	workingTreeState: WorkingTreeState,
): void {
	if (!ctx.hasUI) return;
	mountOsdyUi(pi, ctx, state, workingState, workingTreeState);
}

export function disableOsdyPi(ctx: ExtensionContext, state: OsdyState): void {
	if (!ctx.hasUI) return;
	ctx.ui.setHeader(undefined);
	if (state.editorMountHold?.count || state.tui?.hasOverlay()) {
		state.editorReconcilePending = true;
	} else {
		ctx.ui.setEditorComponent(state.fallbackEditorFactory);
		state.editorEffective = false;
		state.editorReconcilePending = false;
		state.editorSessionRemountPending = false;
		state.tui = undefined;
	}
	ctx.ui.setFooter(undefined);
	ctx.ui.setWidget(WORKING_WIDGET_KEY, undefined);
	ctx.ui.setWidget(WORKING_TREE_WIDGET_KEY, undefined);
	ctx.ui.setWorkingVisible(true);
	state.smallMode = false;
}

export function notifyStatus(ctx: ExtensionContext, state: OsdyState): void {
	ctx.ui.notify(
		`osdy-pi ${state.enabled ? "enabled" : "disabled"} · editor ${state.editorMode}, effective ${state.editorEffective ? "extended" : "simple/native"} · working-tree desired ${state.workingTreeEnabled ? "on" : "off"}, effective ${workingTreeEffective(state)} · widget ${state.workingTreePlacement === "aboveEditor" ? "top" : "bottom"} · theme ${ctx.ui.theme.name ?? "unknown"} · style ${state.headerVariant} · animation ${asciiAnimationMode()} · ${modelLabel(ctx)} · ${usageLabel(ctx).trim()}`,
		"info",
	);
}

import type {
	ExtensionAPI,
	ExtensionCommandContext,
	ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { homedir } from "node:os";
import { showControlCenter } from "./control-center.js";
import { bindControlCenterAccount } from "./control-center-account.js";
import { readActiveProfileName } from "./account-profiles.js";
import { createControlCenterUsage } from "./control-center-usage.js";
import type { UsageSnapshot } from "./usage-analytics-store.js";
import { createControlCenterGit } from "./control-center-git.js";
import { bindControlCenterSounds } from "./control-center-sounds.js";
import type { VisualPreferenceAction } from "./control-center-preferences.js";
import { identifyLocalPackage, runOsdyUninstall } from "./uninstall.js";
import { isAbsolute, join } from "node:path";
import { inspectJokerAgents, setupJokerAgents, switchAgentMode } from "./agent-coexistence-setup.js";
import { createAudioEventRouter } from "./audio-event-router.js";
import { registerAudioNotificationFlags } from "./audio-notification-config.js";
import { createAudioNotificationService } from "./audio-notification-service.js";
import { createAudioPlaybackAdapter } from "./audio-playback.js";
import { subscribeQuestionPromptAudioNotification } from "./plugin-events.js";
import { createAudioSoundSettingsStore } from "./audio-sound-settings.js";
import { createEditorSettingsStore } from "./editor-settings.js";
import { registerAccountProfilesCommand } from "./account-profiles.js";
import {
	applyOsdyPi,
	clearGentleShellChangesWidget,
	createResponsiveCoordinator,
	disableOsdyPi,
	notifyStatus,
	reconcileResponsiveUi,
	syncWorkingTreeWidget,
} from "./runtime-helpers.js";
import { runSoundSetupWizard } from "./sound-setup-wizard.js";
import {
	DEFAULT_EDITOR_MODE,
	EDITOR_MODES,
	HEADER_VARIANT_CHOICES,
	type EditorMode,
	type HeaderVariant,
	MASCOT_CHOICES,
	type MascotChoice,
	type OsdyState,
	type WorkingTreeState,
	type WorkingWidgetState,
} from "./types.js";
import { WORKING_TREE_WIDGET_KEY, WORKING_WIDGET_KEY } from "./constants.js";
import {
	clearWorkingTree,
	refreshWorkingTree,
	shouldRefreshWorkingTree,
} from "./working-tree.js";
import { showWorkingTreeDiffPanel } from "./diff-panel.js";
import {
	extractCodexAccountId,
	fetchCodexUsage,
	type CodexUsageAuth,
	type CodexUsageSnapshot,
} from "./codex-usage.js";
import { showCodexUsagePanel } from "./codex-usage-ui.js";
import { modelLabel } from "./metrics.js";
import { readLastActiveProfileLabel, resolveActiveProfileLabel } from "./profile-label.js";
import {
	createWorkingController,
	type WorkingController,
} from "./working-controller.js";
import { registerTodoTool } from "./todo-tool.js";
import { registerTodosCommand } from "./todo-command.js";
import { createTodoSessionStore } from "./todo-session.js";
import { registerMessageRoleMarkers } from "./message-role-markers.js";
import { registerTodoWidget } from "./todo-widget.js";
import { registerUsageAnalytics } from "./usage-analytics.js";
import { inspectTodoProvider, selectTodoProvider, todoAgentDir, todoProviderConfigured } from "./todo-provider-settings.js";

function scheduleOsdyRefresh(
	delayMs: number,
	pi: ExtensionAPI,
	ctx: ExtensionContext,
	state: OsdyState,
	workingState: WorkingWidgetState,
	workingTreeState: WorkingTreeState,
	pendingRefreshes: Set<ReturnType<typeof setTimeout>>,
	isCurrentSession: () => boolean,
): void {
	const timeout = setTimeout(() => {
		pendingRefreshes.delete(timeout);
		if (state.enabled && isCurrentSession())
			applyOsdyPi(pi, ctx, state, workingState, workingTreeState);
	}, delayMs);
	pendingRefreshes.add(timeout);
}

function claimOsdyVisualLayer(
	pi: ExtensionAPI,
	ctx: ExtensionContext,
	state: OsdyState,
	workingState: WorkingWidgetState,
	workingTreeState: WorkingTreeState,
	pendingRefreshes: Set<ReturnType<typeof setTimeout>>,
	isCurrentSession: () => boolean,
): void {
	if (!state.enabled) return;
	applyOsdyPi(pi, ctx, state, workingState, workingTreeState);
	for (const delayMs of [300, 1000]) {
		scheduleOsdyRefresh(
			delayMs,
			pi,
			ctx,
			state,
			workingState,
			workingTreeState,
			pendingRefreshes,
			isCurrentSession,
		);
	}
}

function parseCommandArgs(args: string): string[] {
	return args.trim().split(/\s+/).filter(Boolean);
}

function isMascotChoice(value: string): value is MascotChoice {
	return MASCOT_CHOICES.includes(value as MascotChoice);
}

function mascotLabel(mascot: MascotChoice): string {
	return mascot === "bts" ? "Bts" : mascot;
}

function isHeaderVariant(value: string): value is HeaderVariant {
	return HEADER_VARIANT_CHOICES.includes(value as HeaderVariant);
}

async function saveVisualSettings(
	state: OsdyState,
	settingsStore: ReturnType<typeof createEditorSettingsStore>,
): Promise<boolean> {
	try {
		await settingsStore.save({
			version: 1,
			enabled: state.enabled,
			editorMode: state.editorMode,
			workingTreeEnabled: state.workingTreeEnabled,
			headerVariant: state.headerVariant,
			mascot: state.mascot,
		});
		return true;
	} catch {
		return false;
	}
}

/** Shared by inline controls and legacy commands; save failure never rolls back live state. */
export async function applyVisualPreference(
	action: VisualPreferenceAction,
	pi: ExtensionAPI,
	ctx: ExtensionContext,
	state: OsdyState,
	workingState: WorkingWidgetState,
	workingTreeState: WorkingTreeState,
	settingsStore: ReturnType<typeof createEditorSettingsStore>,
): Promise<boolean> {
	switch (action.kind) {
		case "header": state.headerVariant = action.value; break;
		case "mascot": state.mascot = action.value; break;
		case "editor": state.editorMode = action.value; break;
	}
	if (state.enabled) {
		if (action.kind === "editor") reconcileResponsiveUi(pi, ctx, state, workingTreeState);
		else applyOsdyPi(pi, ctx, state, workingState, workingTreeState);
	}
	return saveVisualSettings(state, settingsStore);
}

/** The SDK completion promise owns overlay removal; never manipulate its handle. */
export async function withEditorMountHold(
	pi: ExtensionAPI,
	ctx: ExtensionContext,
	state: OsdyState,
	workingTreeState: WorkingTreeState,
	show: () => Promise<void>,
	isCurrent: () => boolean = () => true,
): Promise<void> {
	if (!ctx.hasUI || ctx.mode !== "tui") return show();
	const hold = state.editorMountHold ?? { count: 0 };
	state.editorMountHold = hold;
	hold.count++;
	try {
		await show();
	} finally {
		// Session transitions invalidate ownership before an old modal can finish.
		if (state.editorMountHold === hold) {
			hold.count--;
			if (!hold.count) {
				state.editorMountHold = undefined;
				if (isCurrent()) reconcileResponsiveUi(pi, ctx, state, workingTreeState);
			}
		}
	}
}

async function enableOsdyPi(
	pi: ExtensionAPI,
	ctx: ExtensionContext,
	state: OsdyState,
	workingState: WorkingWidgetState,
	workingTreeState: WorkingTreeState,
	controller: WorkingController,
	settingsStore: ReturnType<typeof createEditorSettingsStore>,
): Promise<void> {
	state.enabled = true;
	applyOsdyPi(pi, ctx, state, workingState, workingTreeState);
	controller.refreshWorking();
	const saved = await saveVisualSettings(state, settingsStore);
	if (state.workingTreeEnabled)
		await refreshWorkingTree(pi, ctx, workingTreeState);
	ctx.ui.notify(
		saved ? "osdy-pi enabled" : "osdy-pi enabled but could not be saved",
		saved ? "info" : "warning",
	);
}

async function disableOsdyPiCommand(
	ctx: ExtensionContext,
	state: OsdyState,
	workingTreeState: WorkingTreeState,
	controller: WorkingController,
	stopResponsive: () => void,
	settingsStore: ReturnType<typeof createEditorSettingsStore>,
): Promise<void> {
	state.enabled = false;
	workingTreeState.visible = false;
	controller.stopWorking();
	clearWorkingTree(workingTreeState);
	disableOsdyPi(ctx, state);
	if (!state.editorReconcilePending) stopResponsive();
	const saved = await saveVisualSettings(state, settingsStore);
	ctx.ui.notify(
		saved ? "osdy-pi disabled" : "osdy-pi disabled but could not be saved",
		saved ? "info" : "warning",
	);
}

async function handleMascotCommand(
	action: string | undefined,
	rest: string[],
	pi: ExtensionAPI,
	ctx: ExtensionContext,
	state: OsdyState,
	workingState: WorkingWidgetState,
	workingTreeState: WorkingTreeState,
	settingsStore: ReturnType<typeof createEditorSettingsStore>,
): Promise<void> {
	const mascotUsage = `Usage: /osdy-pi mascot ${MASCOT_CHOICES.join(" | ")} | status`;
	if (rest.length > 0) {
		ctx.ui.notify(mascotUsage, "warning");
		return;
	}
	if (action === "status" || action === undefined) {
		ctx.ui.notify(`osdy-pi mascot: ${mascotLabel(state.mascot)}`, "info");
		return;
	}
	if (!isMascotChoice(action)) {
		ctx.ui.notify(mascotUsage, "warning");
		return;
	}
	const saved = await applyVisualPreference({ kind: "mascot", value: action }, pi, ctx, state, workingState, workingTreeState, settingsStore);
	ctx.ui.notify(
		saved
			? `osdy-pi mascot: ${mascotLabel(action)}`
			: "osdy-pi mascot changed but could not be saved",
		saved ? "info" : "warning",
	);
}

async function handleHeaderCommand(
	action: string | undefined,
	rest: string[],
	pi: ExtensionAPI,
	ctx: ExtensionContext,
	state: OsdyState,
	workingState: WorkingWidgetState,
	workingTreeState: WorkingTreeState,
	settingsStore: ReturnType<typeof createEditorSettingsStore>,
): Promise<void> {
	const headerUsage = `Usage: /osdy-pi header ${HEADER_VARIANT_CHOICES.join(" | ")} | status`;
	if (
		rest.length > 0 ||
		(action !== undefined && action !== "status" && !isHeaderVariant(action))
	) {
		ctx.ui.notify(headerUsage, "warning");
		return;
	}
	if (action === "status" || action === undefined) {
		ctx.ui.notify(`osdy-pi header: ${state.headerVariant}`, "info");
		return;
	}
	const saved = await applyVisualPreference({ kind: "header", value: action }, pi, ctx, state, workingState, workingTreeState, settingsStore);
	ctx.ui.notify(
		saved
			? `osdy-pi header: ${action}`
			: "osdy-pi header changed but could not be saved",
		saved ? "info" : "warning",
	);
}

export function getOsdyCommandCompletions(prefix: string) {
	const trimmed = prefix.trim();
	const parts = parseCommandArgs(trimmed);
	if (parts.length === 0) {
		return [
   "todo",
			"enable",
			"disable",
			"on",
			"off",
			"status",
			"agents",
			"sound",
			"working-tree",
			"editor",
			"mascot",
			"header",
			"diff",
			"uninstall",
		].map((value) => ({ value, label: value }));
	}
 if (parts[0] === "todo" && parts.length <= 2) {
  return ["on", "off", "status"].filter((action) => action.startsWith(parts[1] ?? ""))
   .map((action) => ({ value: `todo ${action}`, label: `todo ${action}` }));
 }
	if (trimmed === "agents") {
		return ["agents setup", "agents on", "agents off", "agents status"].map((value) => ({ value, label: value }));
	}
	if (trimmed === "sound") {
		return [{ value: "sound setup", label: "sound setup" }];
	}
	if (trimmed === "working-tree") {
		return [
			"working-tree on",
			"working-tree off",
			"working-tree toggle",
			"working-tree status",
			"working-tree position top",
			"working-tree position bottom",
		].map((value) => ({ value, label: value }));
	}
	if (trimmed === "mascot") {
		return [
			...MASCOT_CHOICES.map((choice) => `mascot ${choice}`),
			"mascot status",
		].map((value) => ({ value, label: value }));
	}
	if (trimmed === "header") {
		return [
			...HEADER_VARIANT_CHOICES.map((choice) => `header ${choice}`),
			"header status",
		].map((value) => ({ value, label: value }));
	}
	if (trimmed === "editor") {
		return [
			"editor auto",
			"editor extended",
			"editor simple",
			"editor on",
			"editor off",
			"editor toggle",
			"editor status",
		].map((value) => ({ value, label: value }));
	}
	if (parts.length === 1) {
		const valuePrefix = parts[0] ?? "";
		return [
   "todo",
			"enable",
			"disable",
			"on",
			"off",
			"status",
			"agents",
			"sound",
			"working-tree",
			"editor",
			"mascot",
			"header",
			"diff",
			"uninstall",
		]
			.filter((value) => value.startsWith(valuePrefix))
			.map((value) => ({ value, label: value }));
	}
	if (parts[0] === "agents" && parts.length === 2) {
		const valuePrefix = parts[1] ?? "";
		return ["setup", "status"]
			.filter((value) => value.startsWith(valuePrefix))
			.map((value) => ({ value: `agents ${value}`, label: `agents ${value}` }));
	}
	if (parts[0] === "sound" && parts.length === 2) {
		const valuePrefix = parts[1] ?? "";
		return ["setup"]
			.filter((value) => value.startsWith(valuePrefix))
			.map((value) => ({ value: `sound ${value}`, label: `sound ${value}` }));
	}
	if (parts[0] === "header" && parts.length === 2) {
		const valuePrefix = parts[1] ?? "";
		return [...HEADER_VARIANT_CHOICES, "status"]
			.filter((value) => value.startsWith(valuePrefix))
			.map((value) => ({ value: `header ${value}`, label: `header ${value}` }));
	}
	if (parts[0] === "mascot" && parts.length === 2) {
		const valuePrefix = parts[1] ?? "";
		return [...MASCOT_CHOICES, "status"]
			.filter((value) => value.startsWith(valuePrefix))
			.map((value) => ({ value: `mascot ${value}`, label: `mascot ${value}` }));
	}
	if (parts[0] === "editor" && parts.length === 2) {
		const valuePrefix = parts[1] ?? "";
		return ["auto", "extended", "simple", "on", "off", "toggle", "status"]
			.filter((value) => value.startsWith(valuePrefix))
			.map((value) => ({
				value: `editor ${value}`,
				label: `editor ${value}`,
			}));
	}
	if (parts[0] === "working-tree" && parts.length === 2) {
		const valuePrefix = parts[1] ?? "";
		return ["on", "off", "toggle", "status", "position"]
			.filter((value) => value.startsWith(valuePrefix))
			.map((value) => ({
				value: `working-tree ${value}`,
				label: `working-tree ${value}`,
			}));
	}
	if (
		parts[0] === "working-tree" &&
		parts[1] === "position" &&
		parts.length === 3
	) {
		const valuePrefix = parts[2] ?? "";
		return ["top", "bottom", "status"]
			.filter((value) => value.startsWith(valuePrefix))
			.map((value) => ({
				value: `working-tree position ${value}`,
				label: `working-tree position ${value}`,
			}));
	}
	return null;
}

async function handleSoundCommand(
	args: string[],
	ctx: ExtensionContext,
	settingsStore: ReturnType<typeof createAudioSoundSettingsStore>,
): Promise<void> {
	const [subcommand] = args;
	if (subcommand === "setup") {
		await runSoundSetupWizard(ctx, settingsStore);
		return;
	}
	ctx.ui.notify("Usage: /osdy-pi sound setup", "warning");
}

function handleWorkingTreePositionCommand(
	action: string | undefined,
	pi: ExtensionAPI,
	ctx: ExtensionContext,
	state: OsdyState,
	workingState: WorkingWidgetState,
	workingTreeState: WorkingTreeState,
): void {
	if (action === "top") {
		state.workingTreePlacement = "aboveEditor";
		if (state.enabled)
			applyOsdyPi(pi, ctx, state, workingState, workingTreeState);
		ctx.ui.notify("osdy-pi working tree position: top", "info");
		return;
	}
	if (action === "bottom") {
		state.workingTreePlacement = "belowEditor";
		if (state.enabled)
			applyOsdyPi(pi, ctx, state, workingState, workingTreeState);
		ctx.ui.notify("osdy-pi working tree position: bottom", "info");
		return;
	}
	if (action === "status" || action === undefined) {
		ctx.ui.notify(
			`osdy-pi working tree position ${state.workingTreePlacement === "aboveEditor" ? "top" : "bottom"}`,
			"info",
		);
		return;
	}
	ctx.ui.notify(
		"Usage: /osdy-pi working-tree position top | bottom | status",
		"warning",
	);
}

async function setEditorMode(
	mode: EditorMode,
	pi: ExtensionAPI,
	ctx: ExtensionContext,
	state: OsdyState,
	workingState: WorkingWidgetState,
	workingTreeState: WorkingTreeState,
	settingsStore: ReturnType<typeof createEditorSettingsStore>,
): Promise<void> {
	const saved = await applyVisualPreference({ kind: "editor", value: mode }, pi, ctx, state, workingState, workingTreeState, settingsStore);
	ctx.ui.notify(
		saved
			? `osdy-pi editor mode: ${mode}`
			: "osdy-pi editor mode changed but could not be saved",
		saved ? "info" : "warning",
	);
}

async function handleEditorCommand(
	action: string | undefined,
	rest: string[],
	pi: ExtensionAPI,
	ctx: ExtensionContext,
	state: OsdyState,
	workingState: WorkingWidgetState,
	workingTreeState: WorkingTreeState,
	settingsStore: ReturnType<typeof createEditorSettingsStore>,
): Promise<void> {
	if (rest.length > 0) {
		ctx.ui.notify(
			"Usage: /osdy-pi editor auto | extended | simple | on | off | toggle | status",
			"warning",
		);
		return;
	}
	const modeForAction: Record<string, EditorMode> = {
		auto: EDITOR_MODES.AUTO,
		extended: EDITOR_MODES.EXTENDED,
		simple: EDITOR_MODES.SIMPLE,
		on: EDITOR_MODES.EXTENDED,
		off: EDITOR_MODES.SIMPLE,
	};
	const mode = action ? modeForAction[action] : undefined;
	if (mode) {
		await setEditorMode(mode, pi, ctx, state, workingState, workingTreeState, settingsStore);
		return;
	}
	if (action === "toggle") {
		await setEditorMode(
			state.editorMode === EDITOR_MODES.EXTENDED
				? EDITOR_MODES.SIMPLE
				: EDITOR_MODES.EXTENDED,
			pi,
			ctx,
			state,
			workingState,
			workingTreeState,
			settingsStore,
		);
		return;
	}
	if (action === "status" || action === undefined) {
		ctx.ui.notify(
			`osdy-pi editor mode ${state.editorMode}, effective ${state.editorEffective ? "extended" : "simple/native"}`,
			"info",
		);
		return;
	}
	ctx.ui.notify(
		"Usage: /osdy-pi editor auto | extended | simple | on | off | toggle | status",
		"warning",
	);
}

async function saveWorkingTreePreference(
	state: OsdyState,
	settingsStore: ReturnType<typeof createEditorSettingsStore>,
): Promise<boolean> {
	return saveVisualSettings(state, settingsStore);
}

/** Shared by legacy commands and the modal; session placement is not persisted. */
export async function applyWorkingTreeEnabled(
	value: boolean,
	pi: ExtensionAPI,
	ctx: ExtensionContext,
	state: OsdyState,
	workingState: WorkingWidgetState,
	workingTreeState: WorkingTreeState,
	settingsStore: ReturnType<typeof createEditorSettingsStore>,
): Promise<boolean> {
	state.workingTreeEnabled = value;
	workingTreeState.enabled = value;
	syncWorkingTreeWidget(ctx, state, workingState, workingTreeState);
	reconcileResponsiveUi(pi, ctx, state, workingTreeState);
	if (!value) clearWorkingTree(workingTreeState);
	const saved = await saveWorkingTreePreference(state, settingsStore);
	if (value) await refreshWorkingTree(pi, ctx, workingTreeState);
	return saved;
}

async function handleWorkingTreeCommand(
	action: string | undefined,
	rest: string[],
	pi: ExtensionAPI,
	ctx: ExtensionContext,
	state: OsdyState,
	workingState: WorkingWidgetState,
	workingTreeState: WorkingTreeState,
	settingsStore: ReturnType<typeof createEditorSettingsStore>,
): Promise<void> {
	if (action === "position") {
		handleWorkingTreePositionCommand(
			rest[0],
			pi,
			ctx,
			state,
			workingState,
			workingTreeState,
		);
		return;
	}
	if (action === "on") {
		const saved = await applyWorkingTreeEnabled(true, pi, ctx, state, workingState, workingTreeState, settingsStore);
		ctx.ui.notify(
			saved
				? "osdy-pi working tree enabled"
				: "osdy-pi working tree enabled but could not be saved",
			saved ? "info" : "warning",
		);
		return;
	}
	if (action === "off") {
		const saved = await applyWorkingTreeEnabled(false, pi, ctx, state, workingState, workingTreeState, settingsStore);
		ctx.ui.notify(
			saved
				? "osdy-pi working tree disabled"
				: "osdy-pi working tree disabled but could not be saved",
			saved ? "info" : "warning",
		);
		return;
	}
	if (action === "toggle") {
		const nextAction = state.workingTreeEnabled ? "off" : "on";
		await handleWorkingTreeCommand(
			nextAction,
			[],
			pi,
			ctx,
			state,
			workingState,
			workingTreeState,
			settingsStore,
		);
		return;
	}
	if (action === "status" || action === undefined) {
		const status = state.workingTreeEnabled ? "enabled" : "disabled";
		ctx.ui.notify(`osdy-pi working tree ${status}`, "info");
		return;
	}
	ctx.ui.notify(
		"Usage: /osdy-pi working-tree on | off | toggle | status | position ...",
		"warning",
	);
}

async function openDiffCommand(
	pi: ExtensionAPI,
	ctx: ExtensionContext,
	state: OsdyState,
	workingState: WorkingWidgetState,
	workingTreeState: WorkingTreeState,
): Promise<void> {
	if (!state.workingTreeEnabled) {
		ctx.ui.notify(
			"Enable working-tree first with /osdy-pi working-tree on",
			"warning",
		);
		return;
	}
	if (workingTreeState.loading) {
		ctx.ui.notify("working tree is still refreshing", "warning");
		return;
	}
	if (!workingTreeState.snapshot) {
		await refreshWorkingTree(pi, ctx, workingTreeState);
	}
	ctx.ui.setHeader(undefined);
	ctx.ui.setFooter(undefined);
	ctx.ui.setWidget(WORKING_WIDGET_KEY, undefined);
	ctx.ui.setWidget(WORKING_TREE_WIDGET_KEY, undefined);
	ctx.ui.setWorkingVisible(false);
	try {
		await showWorkingTreeDiffPanel(pi, ctx, workingTreeState);
	} finally {
		if (state.enabled) {
			applyOsdyPi(pi, ctx, state, workingState, workingTreeState);
		}
	}
}

type CodexUsageRefreshContext = {
	modelRegistry: {
		getProviderAuth(
			provider: string,
		): Promise<{ auth: { apiKey?: string } } | undefined>;
	};
};

type CodexUsageRefreshState = {
	codexUsage: OsdyState["codexUsage"];
	tui?: { requestRender(): void } | undefined;
};

type CodexUsageFetcher = (
	auth: CodexUsageAuth,
	options: { signal: AbortSignal },
) => Promise<CodexUsageSnapshot>;

export async function refreshCodexUsage(
	ctx: CodexUsageRefreshContext,
	state: CodexUsageRefreshState,
	abort: AbortController,
	fetchUsage: CodexUsageFetcher = fetchCodexUsage,
): Promise<void> {
	state.codexUsage = { kind: "loading", snapshot: undefined };
	state.tui?.requestRender();
	try {
		const providerAuth = await ctx.modelRegistry.getProviderAuth("openai-codex");
		const accessToken = providerAuth?.auth.apiKey;
		if (!accessToken) throw new Error("Codex login is required");
		const snapshot = await fetchUsage(
			{ accessToken, accountId: extractCodexAccountId(accessToken) },
			{ signal: abort.signal },
		);
		if (abort.signal.aborted) return;
		state.codexUsage = { kind: "ready", snapshot };
	} catch (error) {
		if (abort.signal.aborted) return;
		state.codexUsage = {
			kind: "error",
			message:
				error instanceof Error ? error.message : "Codex usage is unavailable",
			snapshot: undefined,
		};
	}
	state.tui?.requestRender();
}

export function createActiveSessionRefresh<T>(
	getSessionContext: () => T | undefined,
	startRefresh: (context: T) => Promise<void>,
): () => Promise<void> {
	return async () => {
		const activeSessionContext = getSessionContext();
		if (activeSessionContext) await startRefresh(activeSessionContext);
	};
}

function registerUsageCommand(
	pi: ExtensionAPI,
	state: OsdyState,
	getSessionContext: () => ExtensionContext | undefined,
	startRefresh: (ctx: ExtensionContext) => Promise<void>,
): void {
	const refreshActiveSessionUsage = createActiveSessionRefresh(
		getSessionContext,
		startRefresh,
	);
	pi.registerCommand("usage", {
		description: "Show current Codex subscription usage.",
		handler: async (_args, ctx) => {
			if (!ctx.hasUI) {
				ctx.ui.notify("Codex usage requires the interactive UI", "warning");
				return;
			}
			await showCodexUsagePanel(
				ctx,
				() => state.codexUsage,
				refreshActiveSessionUsage,
				{
					profile: resolveActiveProfileLabel(),
					provider: ctx.model?.provider ?? "unknown",
					model: modelLabel(ctx),
				},
			);
		},
	});
}

export async function handleAgentsSetupCommand(
	action: string | undefined,
	ctx: ExtensionCommandContext,
	setup: typeof setupJokerAgents = setupJokerAgents,
	inspect: typeof inspectJokerAgents = inspectJokerAgents,
	switchMode: typeof switchAgentMode = switchAgentMode,
): Promise<void> {
	if (action !== "setup" && action !== "on" && action !== "off" && action !== "status") {
		ctx.ui.notify("Usage: /osdy-pi agents setup|on|off|status", "warning");
		return;
	}
	if (!ctx.hasUI) {
		ctx.ui.notify("Agents setup requires an interactive confirmation.", "warning");
		return;
	}
	const target = join(homedir(), ".pi", "agent");
	if (action === "status") {
		try {
			const status = await inspect({ agentDir: target, cwd: ctx.cwd, env: process.env });
			ctx.ui.notify(`Agent mode: ${status.mode}; Joker ${status.jokerInstalled ? "installed" : "not installed"}; ${status.gentleCount} Gentle entries; agent exclusion ${status.filtered ? "complete" : "incomplete"}.`, "info");
		} catch (error) {
			ctx.ui.notify(`Agents status unavailable: ${error instanceof Error ? error.message : "unknown error"}`, "warning");
		}
		return;
	}
	const confirmed = await ctx.ui.confirm(
		`Switch agents to ${action === "off" ? "Gentle" : "Joker"} in normal Pi?`,
		`Target: ${join(target, "settings.json")}\n${action === "off" ? "Disable Joker's ./index.ts extension and enable Gentle agents (requires eligible Gentle)." : "Install npm:pi-subagents-j0k3r if absent, enable Joker's ./index.ts extension and exclude only -extensions/gentle-agents.ts from eligible Gentle packages."} Packages and unrelated resources remain installed. No isolated profile or credentials are changed.`,
	);
	if (!confirmed) return;
	try {
		const result = action === "setup" ? await setup({ agentDir: target, cwd: ctx.cwd, env: process.env }) :
			await switchMode({ agentDir: target, cwd: ctx.cwd, env: process.env, mode: action });
		ctx.ui.notify(`${action === "off" ? "Gentle" : "Joker"} agents ready (${result.gentleCount} Gentle entries checked). ${result.changed || result.installed ? "Reloading resources." : "Settings already in this mode; reloading resources."}`, "info");
	} catch (error) {
		ctx.ui.notify(`Agents setup failed: ${error instanceof Error ? error.message : "unknown error"}. Check settings and retry after resolving the error.`, "error");
		return;
	}
	try {
		await ctx.reload();
	} catch {
		ctx.ui.notify("Agent settings saved, but reload failed; restart Pi to apply the changes.", "warning");
	}
}

export async function handleTodoProviderCommand(
 action: string | undefined,
 ctx: ExtensionCommandContext,
 active: boolean,
 select: typeof selectTodoProvider = selectTodoProvider,
): Promise<void> {
 if (!["on", "off", "status"].includes(action ?? "")) {
  ctx.ui.notify("Usage: /osdy-pi todo on|off|status", "warning");
  return;
 }
 const options = { agentDir: todoAgentDir(), cwd: ctx.cwd };
 if (action === "status") {
  const status = inspectTodoProvider(options);
  ctx.ui.notify(`TODO configured: ${status.configured ? "on" : "off"}; actual registration: ${active ? "on" : "off"}; current eligibility: ${status.active ? "on" : "off"}. ${status.reason} Target: ${status.target}`, "info");
  return;
 }
 if (!ctx.hasUI) {
  ctx.ui.notify("TODO selection requires interactive confirmation.", "warning");
  return;
 }
 try {
  if (!await ctx.ui.confirm(`Turn Osdy TODO ${action}?`,
   `Target: ${join(options.agentDir, "settings.json")}\n${action === "on" ? "Opt Osdy in and exclude only -extensions/gentle-todo.ts from supported Gentle package entries." : "Opt Osdy out and restore only selector-owned Gentle TODO exclusions."} Unrelated resources and task history remain unchanged. Reload follows; restart Pi if it fails.`)) return;
  select({ ...options, mode: action as "on" | "off" });
  ctx.ui.notify(`TODO ${action} saved. Reloading resources; restart Pi if reload fails.`, "info");
 } catch (error) {
  ctx.ui.notify(`TODO selection failed: ${error instanceof Error ? error.message : "unknown error"}`, "error");
  return;
 }
 // Reload invalidates the old runtime/context, even on failure. Never notify via it afterward.
 try { await ctx.reload(); } catch { return; }
 return;
}

function registerCommand(
	pi: ExtensionAPI,
	state: OsdyState,
	workingState: WorkingWidgetState,
	workingTreeState: WorkingTreeState,
	controller: WorkingController,
	settingsStore: ReturnType<typeof createAudioSoundSettingsStore>,
	editorSettingsStore: ReturnType<typeof createEditorSettingsStore>,
	startResponsive: () => void,
	stopResponsive: () => void,
 todoActive: boolean,
 readUsageHistory: () => Promise<UsageSnapshot>,
 refreshUsage: () => Promise<void>,
	captureCurrentRuntime: () => () => boolean,
): void {
	pi.registerCommand("osdyConfig", {
		description: "Open Osdy Control Center (preferences, Git, Sounds, Account and Usage).",
		handler: async (_args, ctx) => {
			const isCurrent = captureCurrentRuntime();
			await withEditorMountHold(pi, ctx, state, workingTreeState, () => showControlCenter(ctx, {
			snapshot: () => state,
			apply: (action) => isCurrent()
				? applyVisualPreference(action, pi, ctx, state, workingState, workingTreeState, editorSettingsStore)
				: Promise.resolve(false),
		}, {
			git: createControlCenterGit({
				snapshot: () => ({ enabled: state.workingTreeEnabled, placement: state.workingTreePlacement }),
				exec: async (args) => {
					const result = await pi.exec("git", args, { cwd: ctx.cwd, timeout: 5000 });
					if (result.code !== 0 || result.killed) throw new Error("Git inspection failed");
					return result.stdout;
				},
				applyEnabled: (value) => applyWorkingTreeEnabled(value, pi, ctx, state, workingState, workingTreeState, editorSettingsStore),
			}),
			sounds: bindControlCenterSounds(pi, ctx, settingsStore, createAudioPlaybackAdapter()),
			account: bindControlCenterAccount(ctx, refreshUsage, () => state.tui?.requestRender()),
			usage: createControlCenterUsage({ quota: () => state.codexUsage, history: readUsageHistory,
				refresh: refreshUsage, active: readActiveProfileName }),
			}), isCurrent);
		},
	});
	pi.registerCommand("osdy-pi", {
		description:
			"Manage Osdy Pi: visual on/off, status, todo on/off/status, agents, mascot, editor, sound, working tree, or diff.",
		getArgumentCompletions: getOsdyCommandCompletions,
		handler: async (args, ctx) => {
			const [action = "status", ...rest] = parseCommandArgs(args);
			if (action === "uninstall") {
				if (rest.length || !ctx.hasUI || !ctx.isProjectTrusted()) {
					ctx.ui.notify("Uninstall requires an interactive, trusted project and no extra arguments; nothing was removed.", "warning");
					return;
				}
				await runOsdyUninstall({
					list: async () => {
						const result = await pi.exec("pi", ["list", "--approve"], { cwd: ctx.cwd });
						if (result.code !== 0 || result.stderr.trim()) throw new Error("pi list failed");
						return result.stdout;
					},
					remove: async (source, local) => {
						const result = await pi.exec("pi", ["remove", source, ...(local ? ["--local", "--approve"] : [])], { cwd: ctx.cwd });
						if (result.code !== 0) throw new Error("pi remove failed");
					},
					identifyLocal: (path) => identifyLocalPackage(path, import.meta.url),
					confirm: (source, scope) => ctx.ui.confirm("Uninstall Osdy Pi?", `Remove only the Pi package registration:\nSource: ${source}\nScope: ${scope}\nProfiles, accounts and global CLI stay intact. Continue?`),
					notify: (message, level = "info") => ctx.ui.notify(message, level),
				});
				return;
			}
   if (action === "todo") {
    await handleTodoProviderCommand(rest.length === 1 ? rest[0] : undefined, ctx, todoActive);
    return;
   }
			if (action === "agents") {
				await handleAgentsSetupCommand(rest.length === 1 ? rest[0] : undefined, ctx);
				return;
			}
			if (["enable", "on"].includes(action)) {
				await enableOsdyPi(
					pi,
					ctx,
					state,
					workingState,
					workingTreeState,
					controller,
					editorSettingsStore,
				);
				startResponsive();
				return;
			}
			if (["disable", "off"].includes(action)) {
				await disableOsdyPiCommand(
					ctx,
					state,
					workingTreeState,
					controller,
					stopResponsive,
					editorSettingsStore,
				);
				return;
			}
			if (action === "status") {
				notifyStatus(ctx, state);
				return;
			}
			if (action === "sound") {
				await handleSoundCommand(rest, ctx, settingsStore);
				return;
			}
			if (action === "mascot") {
				await handleMascotCommand(
					rest[0],
					rest.slice(1),
					pi,
					ctx,
					state,
					workingState,
					workingTreeState,
					editorSettingsStore,
				);
				return;
			}
			if (action === "header") {
				await handleHeaderCommand(
					rest[0],
					rest.slice(1),
					pi,
					ctx,
					state,
					workingState,
					workingTreeState,
					editorSettingsStore,
				);
				return;
			}
			if (action === "editor") {
				await handleEditorCommand(
					rest[0],
					rest.slice(1),
					pi,
					ctx,
					state,
					workingState,
					workingTreeState,
					editorSettingsStore,
				);
				return;
			}
			if (action === "working-tree") {
				await handleWorkingTreeCommand(
					rest[0],
					rest.slice(1),
					pi,
					ctx,
					state,
					workingState,
					workingTreeState,
					editorSettingsStore,
				);
				return;
			}
			if (action === "diff") {
				await openDiffCommand(pi, ctx, state, workingState, workingTreeState);
				return;
			}
			ctx.ui.notify(
				`Usage: /osdy-pi todo on|off|status | agents setup|on|off|status | enable|disable|on|off|status | mascot ${MASCOT_CHOICES.join("|")}|status | header ${HEADER_VARIANT_CHOICES.join("|")}|status | editor auto|extended|simple|on|off|toggle|status | sound setup | working-tree ... | diff | uninstall`,
				"warning",
			);
		},
	});
}

async function sdkTodoActive(pi: ExtensionAPI): Promise<boolean> {
 const agentDir = todoAgentDir();
 if (!todoProviderConfigured(agentDir)) return false;
 try {
  // No pure cwd getter exists during factory loading; getSettings is not bound yet.
  // This opt-in-only, bounded read-only probe uses pi.exec's SDK cwd, never process.cwd.
  // Await it before registering tools, commands or shortcuts; start no long-lived resource.
  const result = await pi.exec(process.execPath,
   ["--input-type=commonjs", "--eval", "process.stdout.write(JSON.stringify(process.cwd()))"],
   { timeout: 2000 });
  if (result.code !== 0 || result.killed || result.stderr || result.stdout.length > 16384) return false;
  const cwd: unknown = JSON.parse(result.stdout);
  if (typeof cwd !== "string" || !isAbsolute(cwd) || cwd.includes("\u0000")) return false;
  return inspectTodoProvider({ agentDir, cwd }).active;
 } catch { return false; }
}

export async function registerOsdyPi(
	pi: ExtensionAPI,
	dependencies: {
		readActiveProfile?: () => Promise<string | undefined>;
		editorSettingsStore?: ReturnType<typeof createEditorSettingsStore>;
	} = {},
): Promise<void> {
	const state: OsdyState = {
		codexUsage: { kind: "idle" },
		enabled: true,
		editorEffective: false,
		editorMode: DEFAULT_EDITOR_MODE,
		fallbackEditorFactory: undefined,
		headerVariant: "osdy-theme",
		mascot: "current",
		smallMode: false,
		tui: undefined,
		workingTreeEnabled: true,
		workingTreePlacement: "aboveEditor",
	};
	const workingState: WorkingWidgetState = {
		active: false,
		label: "Working...",
		frame: 0,
		timer: undefined,
		tui: undefined,
	};
	const workingTreeState: WorkingTreeState = {
		enabled: true,
		loading: false,
		visible: true,
		snapshot: null,
		error: undefined,
		tui: undefined,
	};
	const controller = createWorkingController(state, workingState);
	const settingsStore = createAudioSoundSettingsStore();
	const editorSettingsStore = dependencies.editorSettingsStore ?? createEditorSettingsStore();
	registerAudioNotificationFlags(pi);
	registerMessageRoleMarkers(pi, () => state.enabled);
 const todoActive = await sdkTodoActive(pi);
 if (todoActive) {
  const todoStore = createTodoSessionStore();
  registerTodoTool(pi, todoStore);
  registerTodosCommand(pi, todoStore);
  registerTodoWidget(pi, todoStore);
 }
	const audioRouter = createAudioEventRouter(
		createAudioNotificationService(
			pi,
			createAudioPlaybackAdapter(),
			settingsStore,
		),
	);
	let responsiveCoordinator:
		| ReturnType<typeof createResponsiveCoordinator>
		| undefined;
	let sessionContext: ExtensionContext | undefined;
	let runtimeGeneration = 0;
	let usageSettingsReady = false;
	let codexUsageAbort: AbortController | undefined;
	const refreshCurrentCodexUsage = async (
		ctx: ExtensionContext,
	): Promise<void> => {
		codexUsageAbort?.abort();
		const abort = new AbortController();
		codexUsageAbort = abort;
		await refreshCodexUsage(ctx, state, abort);
		if (codexUsageAbort === abort) codexUsageAbort = undefined;
	};
	registerAccountProfilesCommand(pi, {
		requestRender: () => {
			state.tui?.requestRender();
		},
		refreshUsage: async () => {
			const activeSessionContext = sessionContext;
			if (activeSessionContext)
				await refreshCurrentCodexUsage(activeSessionContext);
		},
	});
	const pendingOsdyRefreshes = new Set<ReturnType<typeof setTimeout>>();
	const cancelOsdyRefreshes = (): void => {
		for (const timeout of pendingOsdyRefreshes) clearTimeout(timeout);
		pendingOsdyRefreshes.clear();
	};
	const startResponsive = (): void => {
		if (!responsiveCoordinator && sessionContext) {
			responsiveCoordinator = createResponsiveCoordinator(
				pi,
				sessionContext,
				state,
				workingTreeState,
			);
		}
		responsiveCoordinator?.start();
	};
	const stopResponsive = (): void => responsiveCoordinator?.stop();

	subscribeQuestionPromptAudioNotification(
		pi,
		{ getCurrentSessionContext: () => sessionContext },
		audioRouter,
	);

	pi.on("agent_start", () => {
		controller.onAgentStart();
		audioRouter.onAgentStart();
	});
	pi.on("agent_end", (_event, ctx) => {
		controller.onAgentEnd();
		audioRouter.onAgentEnd(ctx);
		if (state.enabled) clearGentleShellChangesWidget(ctx);
	});
	pi.on("agent_settled", () => {
		const activeSessionContext = sessionContext;
		if (
			state.enabled &&
			activeSessionContext &&
			activeSessionContext.model?.provider === "openai-codex"
		) {
			void refreshCurrentCodexUsage(activeSessionContext);
		}
	});
	pi.on("tool_execution_start", (event) =>
		controller.onToolStart(event.toolName),
	);
	pi.on("tool_execution_end", (event, ctx) => {
		controller.onToolEnd();
		audioRouter.onToolExecutionEnd(event.isError === true, ctx);
		if (state.enabled) clearGentleShellChangesWidget(ctx);
		if (
			state.enabled &&
			state.workingTreeEnabled &&
			event.isError !== true &&
			shouldRefreshWorkingTree(event.toolName)
		) {
			void refreshWorkingTree(pi, ctx, workingTreeState);
		}
	});
	pi.on("session_shutdown", () => {
		usageSettingsReady = false;
		runtimeGeneration++;
		state.editorMountHold = undefined;
		state.editorReconcilePending = false;
		state.tui = undefined;
		state.editorSessionRemountPending = false;
		codexUsageAbort?.abort();
		codexUsageAbort = undefined;
		state.codexUsage = { kind: "idle" };
		cancelOsdyRefreshes();
		controller.onShutdown();
		stopResponsive();
		workingTreeState.tui = undefined;
		sessionContext = undefined;
	});
	pi.on("session_start", async (_event, ctx) => {
		usageSettingsReady = false;
		runtimeGeneration++;
		state.editorMountHold = undefined;
		state.editorReconcilePending = false;
		state.tui = undefined;
		state.editorSessionRemountPending = state.editorEffective;
		cancelOsdyRefreshes();
		stopResponsive();
		responsiveCoordinator = undefined;
		sessionContext = ctx;
		const startupProfile = process.env.OSDY_PI_PROFILE_NAME;
		if (resolveActiveProfileLabel() === undefined) {
			try {
				const profile = await (dependencies.readActiveProfile ?? readLastActiveProfileLabel)();
				if (sessionContext !== ctx) return;
				if (
					process.env.OSDY_PI_PROFILE_NAME === startupProfile &&
					resolveActiveProfileLabel({ OSDY_PI_PROFILE_NAME: profile }) !== undefined
				) process.env.OSDY_PI_PROFILE_NAME = profile;
			} catch {
				// Visual metadata failures must not prevent session startup.
			}
		}
		if (sessionContext !== ctx) return;
		const editorSettings = await editorSettingsStore.load();
		if (sessionContext !== ctx) return;
		state.fallbackEditorFactory = ctx.ui.getEditorComponent();
		state.enabled = editorSettings.enabled;
		usageSettingsReady = true;
		state.editorMode = editorSettings.editorMode;
		state.workingTreeEnabled = editorSettings.workingTreeEnabled;
		state.headerVariant = editorSettings.headerVariant;
		state.mascot = editorSettings.mascot;
		workingTreeState.enabled = editorSettings.workingTreeEnabled;
		if (!state.enabled) return;
		claimOsdyVisualLayer(
			pi,
			ctx,
			state,
			workingState,
			workingTreeState,
			pendingOsdyRefreshes,
			() => sessionContext === ctx,
		);
		startResponsive();
		if (state.workingTreeEnabled) {
			void refreshWorkingTree(pi, ctx, workingTreeState);
		}
		void refreshCurrentCodexUsage(ctx);
	});

	const usageAnalytics = registerUsageAnalytics(pi, { isEnabled: () => usageSettingsReady && state.enabled });
	registerUsageCommand(
		pi,
		state,
		() => sessionContext,
		refreshCurrentCodexUsage,
	);
	registerCommand(
		pi,
		state,
		workingState,
		workingTreeState,
		controller,
		settingsStore,
		editorSettingsStore,
		startResponsive,
		stopResponsive,
  todoActive,
		() => usageAnalytics.read(),
		async () => {
			if (!sessionContext) throw new Error("Usage session unavailable");
			await refreshCurrentCodexUsage(sessionContext);
		},
		() => {
			const generation = runtimeGeneration;
			return () => generation === runtimeGeneration;
		},
	);
}

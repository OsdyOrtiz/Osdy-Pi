import type {
	ExtensionAPI,
	ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { createAudioEventRouter } from "./audio-event-router.js";
import { registerAudioNotificationFlags } from "./audio-notification-config.js";
import { createAudioNotificationService } from "./audio-notification-service.js";
import { createAudioPlaybackAdapter } from "./audio-playback.js";
import { subscribeQuestionPromptAudioNotification } from "./plugin-events.js";
import { createAudioSoundSettingsStore } from "./audio-sound-settings.js";
import {
	applyOsdyPi,
	createResponsiveCoordinator,
	disableOsdyPi,
	notifyStatus,
	reconcileResponsiveUi,
} from "./runtime-helpers.js";
import { runSoundSetupWizard } from "./sound-setup-wizard.js";
import {
	DEFAULT_EDITOR_MODE,
	EDITOR_MODES,
	type EditorMode,
	type HeaderVariant,
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
	createWorkingController,
	type WorkingController,
} from "./working-controller.js";

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

const HEADER_VARIANTS = ["osdy-theme", "classic"] as const;

function isHeaderVariant(value: string): value is HeaderVariant {
	return HEADER_VARIANTS.includes(value as HeaderVariant);
}

async function enableOsdyPi(
	pi: ExtensionAPI,
	ctx: ExtensionContext,
	state: OsdyState,
	workingState: WorkingWidgetState,
	workingTreeState: WorkingTreeState,
	controller: WorkingController,
): Promise<void> {
	state.enabled = true;
	applyOsdyPi(pi, ctx, state, workingState, workingTreeState, true);
	controller.refreshWorking();
	if (state.workingTreeEnabled)
		await refreshWorkingTree(pi, ctx, workingTreeState);
}

function disableOsdyPiCommand(
	ctx: ExtensionContext,
	state: OsdyState,
	workingTreeState: WorkingTreeState,
	controller: WorkingController,
	stopResponsive: () => void,
): void {
	stopResponsive();
	state.enabled = false;
	workingTreeState.visible = false;
	controller.stopWorking();
	clearWorkingTree(workingTreeState);
	disableOsdyPi(ctx, state);
}

function setHeaderVariant(
	pi: ExtensionAPI,
	ctx: ExtensionContext,
	state: OsdyState,
	workingState: WorkingWidgetState,
	workingTreeState: WorkingTreeState,
	variant: HeaderVariant,
): void {
	state.headerVariant = variant;
	if (state.enabled) applyOsdyPi(pi, ctx, state, workingState, workingTreeState);
	ctx.ui.notify(`osdy-pi style: ${variant}`, "info");
}

function getOsdyCommandCompletions(prefix: string) {
	const trimmed = prefix.trim();
	const parts = parseCommandArgs(trimmed);
	if (parts.length === 0) {
		return [
			"enable",
			"disable",
			"status",
			"sound",
			"working-tree",
			"editor",
			"diff",
			...HEADER_VARIANTS,
		].map((value) => ({ value, label: value }));
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
			"enable",
			"disable",
			"status",
			"sound",
			"working-tree",
			"editor",
			"diff",
			...HEADER_VARIANTS,
		]
			.filter((value) => value.startsWith(valuePrefix))
			.map((value) => ({ value, label: value }));
	}
	if (parts[0] === "sound" && parts.length === 2) {
		const valuePrefix = parts[1] ?? "";
		return ["setup"]
			.filter((value) => value.startsWith(valuePrefix))
			.map((value) => ({ value: `sound ${value}`, label: `sound ${value}` }));
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

function setEditorMode(
	mode: EditorMode,
	pi: ExtensionAPI,
	ctx: ExtensionContext,
	state: OsdyState,
	workingTreeState: WorkingTreeState,
): void {
	state.editorMode = mode;
	if (state.enabled) reconcileResponsiveUi(pi, ctx, state, workingTreeState);
	ctx.ui.notify(`osdy-pi editor mode: ${mode}`, "info");
}

function handleEditorCommand(
	action: string | undefined,
	rest: string[],
	pi: ExtensionAPI,
	ctx: ExtensionContext,
	state: OsdyState,
	workingTreeState: WorkingTreeState,
): void {
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
		setEditorMode(mode, pi, ctx, state, workingTreeState);
		return;
	}
	if (action === "toggle") {
		setEditorMode(
			state.editorMode === EDITOR_MODES.EXTENDED
				? EDITOR_MODES.SIMPLE
				: EDITOR_MODES.EXTENDED,
			pi,
			ctx,
			state,
			workingTreeState,
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

async function handleWorkingTreeCommand(
	action: string | undefined,
	rest: string[],
	pi: ExtensionAPI,
	ctx: ExtensionContext,
	state: OsdyState,
	workingState: WorkingWidgetState,
	workingTreeState: WorkingTreeState,
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
		state.workingTreeEnabled = true;
		workingTreeState.enabled = true;
		reconcileResponsiveUi(pi, ctx, state, workingTreeState);
		await refreshWorkingTree(pi, ctx, workingTreeState);
		ctx.ui.notify("osdy-pi working tree enabled", "info");
		return;
	}
	if (action === "off") {
		state.workingTreeEnabled = false;
		workingTreeState.enabled = false;
		reconcileResponsiveUi(pi, ctx, state, workingTreeState);
		clearWorkingTree(workingTreeState);
		ctx.ui.notify("osdy-pi working tree disabled", "info");
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

function registerCommand(
	pi: ExtensionAPI,
	state: OsdyState,
	workingState: WorkingWidgetState,
	workingTreeState: WorkingTreeState,
	controller: WorkingController,
	settingsStore: ReturnType<typeof createAudioSoundSettingsStore>,
	startResponsive: () => void,
	stopResponsive: () => void,
): void {
	pi.registerCommand("osdy-pi", {
		description:
			"Manage the Osdy Pi experience: enable, disable, status, editor, style, sound setup, working tree, or diff panel.",
		getArgumentCompletions: getOsdyCommandCompletions,
		handler: async (args, ctx) => {
			const [action = "status", ...rest] = parseCommandArgs(args);
			if (action === "enable") {
				await enableOsdyPi(
					pi,
					ctx,
					state,
					workingState,
					workingTreeState,
					controller,
				);
				startResponsive();
				return;
			}
			if (action === "disable") {
				disableOsdyPiCommand(
					ctx,
					state,
					workingTreeState,
					controller,
					stopResponsive,
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
			if (action === "editor") {
				handleEditorCommand(
					rest[0],
					rest.slice(1),
					pi,
					ctx,
					state,
					workingTreeState,
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
				);
				return;
			}
			if (action === "diff") {
				await openDiffCommand(pi, ctx, state, workingState, workingTreeState);
				return;
			}
			if (isHeaderVariant(action)) {
				setHeaderVariant(pi, ctx, state, workingState, workingTreeState, action);
				return;
			}
			ctx.ui.notify(
				"Usage: /osdy-pi enable | disable | status | editor auto|extended|simple|on|off|toggle|status | sound setup | working-tree ... | diff | osdy-theme | classic",
				"warning",
			);
		},
	});

	for (const variant of HEADER_VARIANTS) {
		pi.registerCommand(`osdy-pi-${variant}`, {
			description: `Switch Osdy Pi header to ${variant}.`,
			handler: (_args, ctx) => {
				setHeaderVariant(pi, ctx, state, workingState, workingTreeState, variant);
				return Promise.resolve();
			},
		});
	}
}

export function registerOsdyPi(pi: ExtensionAPI): void {
	const state: OsdyState = {
		enabled: true,
		editorEffective: false,
		editorMode: DEFAULT_EDITOR_MODE,
		headerVariant: "osdy-theme",
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
	registerAudioNotificationFlags(pi);
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
	const pendingOsdyRefreshes = new Set<ReturnType<typeof setTimeout>>();
	const cancelOsdyRefreshes = (): void => {
		for (const timeout of pendingOsdyRefreshes) clearTimeout(timeout);
		pendingOsdyRefreshes.clear();
	};
	const startResponsive = (): void => responsiveCoordinator?.start();
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
	});
	pi.on("tool_execution_start", (event) =>
		controller.onToolStart(event.toolName),
	);
	pi.on("tool_execution_end", (event, ctx) => {
		controller.onToolEnd();
		audioRouter.onToolExecutionEnd(event.isError === true, ctx);
		if (event.isError !== true && shouldRefreshWorkingTree(event.toolName)) {
			void refreshWorkingTree(pi, ctx, workingTreeState);
		}
	});
	pi.on("session_shutdown", () => {
		cancelOsdyRefreshes();
		controller.onShutdown();
		stopResponsive();
		if (sessionContext) disableOsdyPi(sessionContext, state);
		workingTreeState.tui = undefined;
		sessionContext = undefined;
	});
	pi.on("session_start", (_event, ctx) => {
		cancelOsdyRefreshes();
		stopResponsive();
		sessionContext = ctx;
		claimOsdyVisualLayer(
			pi,
			ctx,
			state,
			workingState,
			workingTreeState,
			pendingOsdyRefreshes,
			() => sessionContext === ctx,
		);
		responsiveCoordinator = createResponsiveCoordinator(
			pi,
			ctx,
			state,
			workingTreeState,
		);
		responsiveCoordinator.start();
		if (state.workingTreeEnabled) {
			void refreshWorkingTree(pi, ctx, workingTreeState);
		}
	});

	registerCommand(
		pi,
		state,
		workingState,
		workingTreeState,
		controller,
		settingsStore,
		startResponsive,
		stopResponsive,
	);
}

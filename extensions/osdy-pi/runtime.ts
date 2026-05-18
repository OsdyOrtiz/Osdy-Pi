import type {
	ExtensionAPI,
	ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { createAudioEventRouter } from "./audio-event-router.js";
import { registerAudioNotificationFlags } from "./audio-notification-config.js";
import { createAudioNotificationService } from "./audio-notification-service.js";
import { createAudioPlaybackAdapter } from "./audio-playback.js";
import { createAudioSoundSettingsStore } from "./audio-sound-settings.js";
import { applyOsdyPi, disableOsdyPi, notifyStatus } from "./runtime-helpers.js";
import { runSoundSetupWizard } from "./sound-setup-wizard.js";
import type { HeaderVariant, OsdyState, WorkingWidgetState } from "./types.js";
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
): void {
	setTimeout(() => {
		if (state.enabled) applyOsdyPi(pi, ctx, state, workingState);
	}, delayMs);
}

function claimOsdyVisualLayer(
	pi: ExtensionAPI,
	ctx: ExtensionContext,
	state: OsdyState,
	workingState: WorkingWidgetState,
): void {
	if (!state.enabled) return;
	applyOsdyPi(pi, ctx, state, workingState);
	for (const delayMs of [300, 1000]) {
		scheduleOsdyRefresh(delayMs, pi, ctx, state, workingState);
	}
}

function loadSessionMetadata(
	pi: ExtensionAPI,
	ctx: ExtensionContext,
	state: OsdyState,
): void {
	void pi
		.exec("git", ["branch", "--show-current"], { cwd: ctx.cwd })
		.then((result) => {
			state.gitLabel = result.stdout.trim() || "detached";
		})
		.catch(() => {
			state.gitLabel = "no-git";
		});
	void pi
		.exec("find", [ctx.cwd, "-name", "AGENTS.md", "-o", "-name", "AGENTS.MD"], {
			cwd: ctx.cwd,
		})
		.then((result) => {
			state.agentsLabel = String(
				result.stdout.split("\n").filter(Boolean).length,
			);
		})
		.catch(() => {
			state.agentsLabel = "0";
		});
}

function parseCommandArgs(args: string): string[] {
	return args.trim().split(/\s+/).filter(Boolean);
}

const HEADER_VARIANTS = ["osdy-theme", "classic"] as const;

function isHeaderVariant(value: string): value is HeaderVariant {
	return HEADER_VARIANTS.includes(value as HeaderVariant);
}

function enableOsdyPi(
	pi: ExtensionAPI,
	ctx: ExtensionContext,
	state: OsdyState,
	workingState: WorkingWidgetState,
	controller: WorkingController,
): void {
	state.enabled = true;
	applyOsdyPi(pi, ctx, state, workingState, true);
	controller.refreshWorking();
}

function disableOsdyPiCommand(
	ctx: ExtensionContext,
	state: OsdyState,
	controller: WorkingController,
): void {
	state.enabled = false;
	controller.stopWorking();
	disableOsdyPi(ctx, state);
}

function setHeaderVariant(
	pi: ExtensionAPI,
	ctx: ExtensionContext,
	state: OsdyState,
	workingState: WorkingWidgetState,
	variant: HeaderVariant,
): void {
	state.headerVariant = variant;
	if (state.enabled) applyOsdyPi(pi, ctx, state, workingState);
	ctx.ui.notify(`osdy-pi style: ${variant}`, "info");
}

function getOsdyCommandCompletions(prefix: string) {
	const trimmed = prefix.trim();
	const parts = parseCommandArgs(trimmed);
	if (parts.length === 0) {
		return ["enable", "disable", "status", "sound", ...HEADER_VARIANTS].map(
			(value) => ({ value, label: value }),
		);
	}
	if (trimmed === "sound") {
		return [{ value: "sound setup", label: "sound setup" }];
	}
	if (parts.length === 1) {
		const valuePrefix = parts[0] ?? "";
		return ["enable", "disable", "status", "sound", ...HEADER_VARIANTS]
			.filter((value) => value.startsWith(valuePrefix))
			.map((value) => ({ value, label: value }));
	}
	if (parts[0] === "sound" && parts.length === 2) {
		const valuePrefix = parts[1] ?? "";
		return ["setup"]
			.filter((value) => value.startsWith(valuePrefix))
			.map((value) => ({ value: `sound ${value}`, label: `sound ${value}` }));
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

function registerCommand(
	pi: ExtensionAPI,
	state: OsdyState,
	workingState: WorkingWidgetState,
	controller: WorkingController,
	settingsStore: ReturnType<typeof createAudioSoundSettingsStore>,
): void {
	pi.registerCommand("osdy-pi", {
		description:
			"Manage the Osdy Pi experience: enable, disable, status, style, or sound setup.",
		getArgumentCompletions: getOsdyCommandCompletions,
		handler: async (args, ctx) => {
			const [action = "status", ...rest] = parseCommandArgs(args);
			if (action === "enable") {
				enableOsdyPi(pi, ctx, state, workingState, controller);
				return;
			}
			if (action === "disable") {
				disableOsdyPiCommand(ctx, state, controller);
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
			if (isHeaderVariant(action)) {
				setHeaderVariant(pi, ctx, state, workingState, action);
				return;
			}
			ctx.ui.notify(
				"Usage: /osdy-pi enable | disable | status | sound setup | osdy-theme | classic",
				"warning",
			);
		},
	});

	for (const variant of HEADER_VARIANTS) {
		pi.registerCommand(`osdy-pi-${variant}`, {
			description: `Switch Osdy Pi header to ${variant}.`,
			handler: (_args, ctx) => {
				setHeaderVariant(pi, ctx, state, workingState, variant);
				return Promise.resolve();
			},
		});
	}
}

export function registerOsdyPi(pi: ExtensionAPI): void {
	const state: OsdyState = {
		enabled: true,
		headerVariant: "osdy-theme",
		gitLabel: "-",
		agentsLabel: "-",
	};
	const workingState: WorkingWidgetState = {
		active: false,
		label: "Working...",
		frame: 0,
		timer: undefined,
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
	});
	pi.on("session_shutdown", () => controller.onShutdown());
	pi.on("session_start", (_event, ctx) => {
		loadSessionMetadata(pi, ctx, state);
		claimOsdyVisualLayer(pi, ctx, state, workingState);
	});

	registerCommand(pi, state, workingState, controller, settingsStore);
}

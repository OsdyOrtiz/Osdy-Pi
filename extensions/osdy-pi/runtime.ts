import type {
	ExtensionAPI,
	ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { applyOsdyPi, disableOsdyPi, notifyStatus } from "./runtime-helpers.js";
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

function registerCommand(
	pi: ExtensionAPI,
	state: OsdyState,
	workingState: WorkingWidgetState,
	controller: WorkingController,
): void {
	pi.registerCommand("osdy-pi", {
		description:
			"Manage the Osdy Pi experience: enable, disable, status, or style.",
		getArgumentCompletions(prefix: string) {
			const trimmed = prefix.trim();
			const parts = parseCommandArgs(trimmed);
			if (parts.length <= 1) {
				const valuePrefix = parts[0] ?? "";
				return ["enable", "disable", "status", ...HEADER_VARIANTS]
					.filter((value) => value.startsWith(valuePrefix))
					.map((value) => ({ value, label: value }));
			}
			return null;
		},
		handler: (args, ctx) => {
			const [action = "status"] = parseCommandArgs(args);
			if (action === "enable") {
				enableOsdyPi(pi, ctx, state, workingState, controller);
				return Promise.resolve();
			}
			if (action === "disable") {
				disableOsdyPiCommand(ctx, state, controller);
				return Promise.resolve();
			}
			if (action === "status") {
				notifyStatus(ctx, state);
				return Promise.resolve();
			}
			if (isHeaderVariant(action)) {
				setHeaderVariant(pi, ctx, state, workingState, action);
				return Promise.resolve();
			}
			ctx.ui.notify(
				"Usage: /osdy-pi enable | disable | status | osdy-theme | classic",
				"warning",
			);
			return Promise.resolve();
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

	pi.on("agent_start", () => controller.onAgentStart());
	pi.on("agent_end", () => controller.onAgentEnd());
	pi.on("tool_execution_start", (event) =>
		controller.onToolStart(event.toolName),
	);
	pi.on("tool_execution_end", () => controller.onToolEnd());
	pi.on("session_shutdown", () => controller.onShutdown());
	pi.on("session_start", (_event, ctx) => {
		loadSessionMetadata(pi, ctx, state);
		claimOsdyVisualLayer(pi, ctx, state, workingState);
	});

	registerCommand(pi, state, workingState, controller);
}

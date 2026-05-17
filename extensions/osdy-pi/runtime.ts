import type {
	ExtensionAPI,
	ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { applyOsdyPi, disableOsdyPi, notifyStatus } from "./runtime-helpers.js";
import type { OsdyState, WorkingWidgetState } from "./types.js";
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

function parseCommandAction(args: string): string {
	return args.trim().split(/\s+/, 1)[0] || "status";
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

function registerCommand(
	pi: ExtensionAPI,
	state: OsdyState,
	workingState: WorkingWidgetState,
	controller: WorkingController,
): void {
	pi.registerCommand("osdy-pi", {
		description: "Manage the Osdy Pi experience: enable, disable, or status.",
		getArgumentCompletions(prefix: string) {
			return ["enable", "disable", "status"]
				.filter((value) => value.startsWith(prefix.trim()))
				.map((value) => ({ value, label: value }));
		},
		handler: (args, ctx) => {
			const action = parseCommandAction(args);
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
			ctx.ui.notify("Usage: /osdy-pi enable | disable | status", "warning");
			return Promise.resolve();
		},
	});
}

export function registerOsdyPi(pi: ExtensionAPI): void {
	const state: OsdyState = { enabled: true, gitLabel: "-", agentsLabel: "-" };
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

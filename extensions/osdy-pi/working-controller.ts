import type { OsdyState, WorkingActivity, WorkingWidgetState } from "./types.js";
import { classifyWorkingActivity, WORKING_ACTIVITY_LABELS } from "./working-activity.js";

export type WorkingController = {
	onAgentStart(): void;
	onAgentEnd(): void;
	onToolStart(toolName: string, toolCallId: string, args?: unknown): void;
	onToolEnd(toolCallId: string): void;
	onShutdown(): void;
	refreshWorking(): void;
	stopWorking(): void;
};

export function createWorkingController(
	state: Pick<OsdyState, "enabled">,
	workingState: WorkingWidgetState,
): WorkingController {
	let activeAgent = false;
	// Map insertion order is start order; duplicate starts must not reorder it.
	const activeTools = new Map<string, WorkingActivity>();

	const requestWorkingRender = () => workingState.tui?.requestRender();
	const clearWorkingTimer = () => {
		if (!workingState.timer) return;
		clearInterval(workingState.timer);
		workingState.timer = undefined;
	};
	const ensureWorkingTimer = () => {
		if (workingState.timer) return;
		workingState.timer = setInterval(() => {
			workingState.frame += 1;
			requestWorkingRender();
		}, 80);
	};
	const setActivity = (activity: WorkingActivity) => {
		workingState.activity = activity;
		workingState.label = WORKING_ACTIVITY_LABELS[activity];
	};
	const stopWorking = () => {
		workingState.active = false;
		clearWorkingTimer();
		requestWorkingRender();
	};
	const refreshWorking = () => {
		let activity: WorkingActivity = "thinking";
		for (const remaining of activeTools.values()) activity = remaining;
		setActivity(activity);
		if (!state.enabled || (!activeAgent && activeTools.size === 0)) {
			stopWorking();
			return;
		}
		workingState.active = true;
		ensureWorkingTimer();
		requestWorkingRender();
	};
	const resetActivity = () => {
		activeAgent = false;
		activeTools.clear();
		setActivity("thinking");
	};

	return {
		onAgentStart(): void {
			activeAgent = true;
			refreshWorking();
		},
		onAgentEnd(): void {
			resetActivity();
			refreshWorking();
		},
		onToolStart(toolName: string, toolCallId: string, args?: unknown): void {
			if (activeTools.has(toolCallId)) return;
			activeTools.set(toolCallId, classifyWorkingActivity(toolName, args));
			refreshWorking();
		},
		onToolEnd(toolCallId: string): void {
			if (!activeTools.delete(toolCallId)) return;
			refreshWorking();
		},
		onShutdown(): void {
			resetActivity();
			stopWorking();
			workingState.tui = undefined;
		},
		refreshWorking,
		stopWorking,
	};
}

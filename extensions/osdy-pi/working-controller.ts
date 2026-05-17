import type { OsdyState, WorkingWidgetState } from "./types.js";

export type WorkingController = {
	onAgentStart(): void;
	onAgentEnd(): void;
	onToolStart(toolName: string): void;
	onToolEnd(): void;
	onShutdown(): void;
	refreshWorking(): void;
	stopWorking(): void;
};

export function createWorkingController(
	state: OsdyState,
	workingState: WorkingWidgetState,
): WorkingController {
	let activeAgent = false;
	let activeToolCount = 0;

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
	const setWorkingState = (active: boolean, label: string) => {
		workingState.active = active;
		workingState.label = label;
	};
	const startWorking = (label: string) => {
		if (!state.enabled) return;
		setWorkingState(true, label);
		ensureWorkingTimer();
		requestWorkingRender();
	};
	const stopWorking = () => {
		setWorkingState(false, workingState.label);
		clearWorkingTimer();
		requestWorkingRender();
	};
	const getIdleLabel = () =>
		activeToolCount > 0 ? "Running tool..." : "Working...";
	const refreshWorking = () => {
		if (!state.enabled || (!activeAgent && activeToolCount === 0)) {
			stopWorking();
			return;
		}
		startWorking(getIdleLabel());
	};
	const resetActivity = () => {
		activeAgent = false;
		activeToolCount = 0;
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
		onToolStart(toolName: string): void {
			activeToolCount += 1;
			startWorking(`Running ${toolName}...`);
		},
		onToolEnd(): void {
			activeToolCount = Math.max(0, activeToolCount - 1);
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

import { inspectTodoProvider, selectTodoProvider, type TodoProviderOptions } from "./todo-provider-settings.js";
import type { ControlCenterDetail } from "./control-center.js";

export type ControlCenterTodoAction = { kind: "todo-provider"; mode: "on" | "off" };
export type TodoApplyResult = { kind: "reload"; message: string } | { kind: "rejected"; message: string };
export interface ControlCenterTodoService {
	read(): Promise<ControlCenterDetail>;
	apply(action: ControlCenterTodoAction): Promise<TodoApplyResult>;
}

/** Existing provider owner is the only settings writer; loaded is a factory-time snapshot. */
export function createControlCenterTodo(options: TodoProviderOptions & {
	loaded: boolean;
	isIdle: () => boolean;
	isCurrent?: () => boolean;
	inspect?: typeof inspectTodoProvider;
	select?: typeof selectTodoProvider;
}): ControlCenterTodoService {
	let busy = false;
	return {
		read() {
			const status = (options.inspect ?? inspectTodoProvider)(options);
			return Promise.resolve({
				summary: `Configured: ${status.configured ? "on" : "off"} | Eligibility: ${status.active ? "on" : "off"} | Loaded registration: ${options.loaded ? "on" : "off"}`,
				note: status.reason,
				rows: (["on", "off"] as const).map(mode => ({
					label: `Osdy TODO ${mode}`, current: status.configured === (mode === "on"),
					action: { kind: "todo-provider", mode },
					details: [`Target: ${status.target}`, mode === "on"
						? "Opt in; exclude only -extensions/gentle-todo.ts from supported Gentle entries."
						: "Opt out; restore only selector-owned Gentle TODO exclusions.",
						"Unrelated resources and task history unchanged. Reload follows; restart Pi if it fails."],
				})),
			});
		},
		apply(action) {
			if (busy || !options.isIdle() || options.isCurrent?.() === false)
				return Promise.resolve({ kind: "rejected", message: "TODO selection requires the current idle session; nothing changed." });
			busy = true;
			try {
				(options.select ?? selectTodoProvider)({ ...options, mode: action.mode });
				return Promise.resolve({ kind: "reload", message: "TODO selection saved. Reloading resources; restart Pi if reload fails." });
			} catch (error) {
				return Promise.resolve({ kind: "rejected", message: `TODO selection failed: ${error instanceof Error ? error.message : "unknown error"}. Reload not requested.` });
			} finally { busy = false; }
		},
	};
}

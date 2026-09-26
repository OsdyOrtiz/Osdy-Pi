// Session snapshot behavior adapted independently from @juicesharp/rpiv-todo@2.11.0 (MIT); see root LICENSE.
import { emptyTodoState, type TodoState, type TodoTask } from "./todo-domain.js";

/** The branch shape needed for replay; Pi's SessionEntry[] is assignable to this view. */
export type TodoBranch = readonly { type: string; message?: unknown }[];

function record(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

function positiveId(value: unknown): value is number {
	return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function validTask(value: unknown): value is TodoTask {
	if (!record(value) || !positiveId(value.id) || typeof value.subject !== "string" ||
		!(["pending", "in_progress", "completed", "deleted"] as unknown[]).includes(value.status)) return false;
	for (const field of ["description", "activeForm", "owner"])
		if (value[field] !== undefined && typeof value[field] !== "string") return false;
	if (value.blockedBy !== undefined && (!Array.isArray(value.blockedBy) || !value.blockedBy.every(positiveId))) return false;
	if (value.metadata !== undefined && !record(value.metadata)) return false;
	return true;
}

function snapshot(value: unknown): TodoState | undefined {
	if (!record(value) || !Array.isArray(value.tasks) || !positiveId(value.nextId) ||
		!value.tasks.every(validTask)) return undefined;
	const ids = new Set<number>();
	for (const task of value.tasks) {
		if (task.id >= value.nextId || ids.has(task.id)) return undefined;
		ids.add(task.id);
	}
	try {
		return structuredClone({ tasks: value.tasks, nextId: value.nextId });
	} catch {
		return undefined;
	}
}

/** Scan the selected ancestry, never the whole session tree; malformed entries are ignored. */
export function replayTodoBranch(branch: TodoBranch): TodoState {
	for (let index = branch.length - 1; index >= 0; index--) {
		const entry = branch[index];
		if (entry?.type !== "message" || !record(entry.message) ||
			entry.message.role !== "toolResult" || entry.message.toolName !== "todo") continue;
		const state = snapshot(entry.message.details);
		if (state) return state;
	}
	return emptyTodoState();
}

/** Use the foreground bucket when no persistent Pi session id is available. */
export function todoSessionId(sessionId: string | undefined): string {
	return sessionId || "foreground";
}

export function createTodoSessionStore() {
	const sessions = new Map<string, TodoState>();
	return {
		get(id: string): TodoState {
			return structuredClone(sessions.get(id) ?? emptyTodoState());
		},
		set(id: string, state: TodoState): void {
			const owned = snapshot(state);
			if (!owned) throw new TypeError("Invalid todo session state");
			sessions.set(id, owned);
		},
		replaceFromBranch(id: string, branch: TodoBranch): void {
			sessions.set(id, replayTodoBranch(branch));
		},
		evict(id: string): void {
			sessions.delete(id);
		},
	};
}

// TODO domain adapted from @juicesharp/rpiv-todo@2.11.0 (MIT); see root LICENSE.
export type TodoStatus = "pending" | "in_progress" | "completed" | "deleted";
export type TodoAction = "create" | "update" | "list" | "get" | "delete" | "clear";

export interface TodoTask {
	id: number;
	subject: string;
	status: TodoStatus;
	description?: string;
	activeForm?: string;
	blockedBy?: number[];
	owner?: string;
	metadata?: Record<string, unknown>;
}

export interface TodoState {
	tasks: TodoTask[];
	nextId: number;
}

export interface TodoParams {
	id?: number;
	subject?: string;
	description?: string;
	activeForm?: string;
	status?: TodoStatus;
	blockedBy?: readonly number[];
	addBlockedBy?: readonly number[];
	removeBlockedBy?: readonly number[];
	owner?: string;
	metadata?: Record<string, unknown>;
	includeDeleted?: boolean;
}

export type TodoOp =
	| { kind: "create"; taskId: number }
	| { kind: "update"; id: number; fromStatus: TodoStatus; toStatus: TodoStatus; changed: boolean }
	| { kind: "list"; statusFilter?: TodoStatus; includeDeleted: boolean }
	| { kind: "get"; task: TodoTask }
	| { kind: "delete"; id: number; subject: string }
	| { kind: "clear"; count: number }
	| { kind: "error"; message: string };

export interface TodoResult {
	state: TodoState;
	op: TodoOp;
}

export function emptyTodoState(): TodoState {
	return { tasks: [], nextId: 1 };
}

export function listTasks(state: TodoState, filter: { status?: TodoStatus; includeDeleted?: boolean } = {}): TodoTask[] {
	return state.tasks.filter((task) =>
		(filter.includeDeleted === true || task.status !== "deleted") &&
		(filter.status === undefined || task.status === filter.status));
}

export function getTaskWithBlocks(state: TodoState, id: number): { task: TodoTask; blocks: number[] } | undefined {
	const task = state.tasks.find((item) => item.id === id);
	if (!task) return undefined;
	return { task, blocks: state.tasks.filter((item) => item.blockedBy?.includes(id)).map((item) => item.id) };
}

function rejection(state: TodoState, message: string): TodoResult {
	return { state, op: { kind: "error", message } };
}

function allowed(from: TodoStatus, to: TodoStatus): boolean {
	if (from === to) return true;
	if (to === "deleted") return from !== "deleted";
	return from === "pending" || (from === "in_progress" && to !== "in_progress");
}

function dependencyError(tasks: readonly TodoTask[], ids: readonly number[], label: string): string | undefined {
	for (const id of ids) {
		const task = tasks.find((item) => item.id === id);
		if (!task) return `${label}: #${id} not found`;
		if (task.status === "deleted") return `${label}: #${id} is deleted`;
	}
	return undefined;
}

/** Walk from the proposed dependencies toward their ancestors before committing an edge. */
function closesCycle(tasks: readonly TodoTask[], id: number, dependencies: readonly number[]): boolean {
	const pending = [...dependencies];
	const seen = new Set<number>();
	while (pending.length) {
		const next = pending.pop();
		if (next === id) return true;
		if (next === undefined || seen.has(next)) continue;
		seen.add(next);
		pending.push(...(tasks.find((task) => task.id === next)?.blockedBy ?? []));
	}
	return false;
}

function sameTask(before: TodoTask, after: TodoTask): boolean {
	return before.subject === after.subject && before.status === after.status &&
		before.description === after.description && before.activeForm === after.activeForm && before.owner === after.owner &&
		JSON.stringify(before.blockedBy ?? []) === JSON.stringify(after.blockedBy ?? []) &&
		JSON.stringify(before.metadata ?? null) === JSON.stringify(after.metadata ?? null);
}

export function applyTodo(state: TodoState, action: TodoAction, params: TodoParams): TodoResult {
	switch (action) {
		case "create": {
			if (!params.subject?.trim()) return rejection(state, "subject required for create");
			const issue = dependencyError(state.tasks, params.blockedBy ?? [], "blockedBy");
			if (issue) return rejection(state, issue);
			const task: TodoTask = { id: state.nextId, subject: params.subject, status: "pending" };
			if (params.description) task.description = params.description;
			if (params.activeForm) task.activeForm = params.activeForm;
			if (params.blockedBy?.length) task.blockedBy = [...params.blockedBy];
			if (params.owner) task.owner = params.owner;
			if (params.metadata) task.metadata = { ...params.metadata };
			return { state: { tasks: [...state.tasks, task], nextId: state.nextId + 1 }, op: { kind: "create", taskId: task.id } };
		}
		case "update": {
			if (params.id === undefined) return rejection(state, "id required for update");
			const index = state.tasks.findIndex((item) => item.id === params.id);
			if (index < 0) return rejection(state, `#${params.id} not found`);
			const previous = state.tasks[index];
			if (!previous) return rejection(state, `#${params.id} not found`);
			if (params.subject === undefined && params.description === undefined && params.activeForm === undefined &&
				params.status === undefined && params.owner === undefined && params.metadata === undefined &&
				!params.addBlockedBy?.length && !params.removeBlockedBy?.length) {
				return rejection(state, "update requires at least one mutable field: subject, description, activeForm, status, owner, metadata, addBlockedBy, or removeBlockedBy");
			}
			const status = params.status ?? previous.status;
			if (!allowed(previous.status, status)) return rejection(state, `illegal transition ${previous.status} → ${status}`);
			let blockedBy = (previous.blockedBy ?? []).filter((id) => !params.removeBlockedBy?.includes(id));
			if (params.addBlockedBy?.length) {
				if (params.addBlockedBy.includes(previous.id)) return rejection(state, `cannot block #${previous.id} on itself`);
				const issue = dependencyError(state.tasks, params.addBlockedBy, "addBlockedBy");
				if (issue) return rejection(state, issue);
				blockedBy = [...blockedBy];
				for (const id of params.addBlockedBy) if (!blockedBy.includes(id)) blockedBy.push(id);
				if (closesCycle(state.tasks, previous.id, blockedBy))
					return rejection(state, "addBlockedBy would create a cycle in the blockedBy graph");
			}
			const updated: TodoTask = { ...previous, status };
			if (params.subject !== undefined) updated.subject = params.subject;
			if (params.description !== undefined) updated.description = params.description;
			if (params.activeForm !== undefined) updated.activeForm = params.activeForm;
			if (params.owner !== undefined) updated.owner = params.owner;
			if (blockedBy.length) updated.blockedBy = blockedBy;
			else delete updated.blockedBy;
			if (params.metadata !== undefined) {
				const merged = { ...previous.metadata };
				for (const [key, value] of Object.entries(params.metadata)) {
					if (value === null) delete merged[key];
					else merged[key] = value;
				}
				if (Object.keys(merged).length) updated.metadata = merged;
				else delete updated.metadata;
			}
			const tasks = [...state.tasks];
			tasks[index] = updated;
			return { state: { tasks, nextId: state.nextId }, op: { kind: "update", id: updated.id, fromStatus: previous.status, toStatus: status, changed: !sameTask(previous, updated) } };
		}
		case "list":
			return { state, op: { kind: "list", includeDeleted: params.includeDeleted === true,
				...(params.status === undefined ? {} : { statusFilter: params.status }) } };
		case "get": {
			if (params.id === undefined) return rejection(state, "id required for get");
			const task = state.tasks.find((item) => item.id === params.id);
			return task ? { state, op: { kind: "get", task } } : rejection(state, `#${params.id} not found`);
		}
		case "delete": {
			if (params.id === undefined) return rejection(state, "id required for delete");
			const index = state.tasks.findIndex((item) => item.id === params.id);
			const task = state.tasks[index];
			if (!task) return rejection(state, `#${params.id} not found`);
			if (task.status === "deleted") return rejection(state, `#${task.id} is already deleted`);
			const tasks = [...state.tasks];
			tasks[index] = { ...task, status: "deleted" };
			return { state: { tasks, nextId: state.nextId }, op: { kind: "delete", id: task.id, subject: task.subject } };
		}
		case "clear":
			return { state: emptyTodoState(), op: { kind: "clear", count: state.tasks.length } };
	}
}

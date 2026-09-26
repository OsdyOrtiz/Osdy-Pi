import assert from "node:assert/strict";
import test from "node:test";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore Node's native TypeScript runner resolves test-only TypeScript source imports.
import { applyTodo, emptyTodoState, listTasks, getTaskWithBlocks } from "./todo-domain.ts";

void test("create stores fields and allocates ids; clear resets even tombstones", () => {
	const initial = emptyTodoState();
	const first = applyTodo(initial, "create", { subject: "  Write parser  ", description: "details", activeForm: "writing parser", owner: "agent", metadata: { priority: 1 } });
	assert.equal(first.op.kind, "create");
	assert.deepEqual(initial, { tasks: [], nextId: 1 });
	assert.deepEqual(first.state.tasks[0], { id: 1, subject: "  Write parser  ", status: "pending", description: "details", activeForm: "writing parser", owner: "agent", metadata: { priority: 1 } });
	const second = applyTodo(first.state, "create", { subject: "Second", blockedBy: [1] });
	assert.deepEqual(second.state.tasks[1]?.blockedBy, [1]);
	assert.deepEqual(getTaskWithBlocks(second.state, 1)?.blocks, [2]);
	const deleted = applyTodo(second.state, "delete", { id: 1 });
	assert.equal(deleted.state.tasks[0]?.status, "deleted");
	assert.deepEqual(listTasks(deleted.state).map((task) => task.id), [2]);
	assert.deepEqual(listTasks(deleted.state, { includeDeleted: true }).map((task) => task.id), [1, 2]);
	assert.deepEqual(listTasks(deleted.state, { status: "deleted" }).map((task) => task.id), []);
	assert.deepEqual(listTasks(deleted.state, { status: "deleted", includeDeleted: true }).map((task) => task.id), [1]);
	const cleared = applyTodo(deleted.state, "clear", {});
	assert.deepEqual(cleared.state, initial);
	assert.deepEqual(applyTodo(cleared.state, "create", { subject: "Again" }).state.tasks.map((task) => task.id), [1]);
});

void test("status machine and same-status no-op", () => {
	let state = applyTodo(emptyTodoState(), "create", { subject: "A" }).state;
	for (const status of ["in_progress", "pending", "completed"] as const) {
		const result = applyTodo(state, "update", { id: 1, status });
		assert.deepEqual(result.op, { kind: "update", id: 1, fromStatus: state.tasks[0]?.status, toStatus: status, changed: true });
		state = result.state;
	}
	const noChange = applyTodo(state, "update", { id: 1, status: "completed" });
	assert.equal(noChange.op.kind, "update");
	if (noChange.op.kind === "update") assert.equal(noChange.op.changed, false);
	assert.deepEqual(applyTodo(state, "update", { id: 1, status: "pending" }).op, { kind: "error", message: "illegal transition completed → pending" });
	state = applyTodo(state, "delete", { id: 1 }).state;
	assert.deepEqual(applyTodo(state, "delete", { id: 1 }).op, { kind: "error", message: "#1 is already deleted" });
	assert.deepEqual(applyTodo(state, "update", { id: 1, status: "completed" }).op, { kind: "error", message: "illegal transition deleted → completed" });
	assert.equal(getTaskWithBlocks(state, 1)?.task.status, "deleted");
});

void test("dependencies validate atomically, preserve insertion order and reject cycles", () => {
	let state = emptyTodoState();
	for (const subject of ["A", "B", "C"]) state = applyTodo(state, "create", { subject }).state;
	const rejected = [
		["create", { subject: "D", blockedBy: [1, 99] }, "blockedBy: #99 not found"],
		["update", { id: 1, addBlockedBy: [1] }, "cannot block #1 on itself"],
		["update", { id: 1, addBlockedBy: [2, 99] }, "addBlockedBy: #99 not found"],
	] as const;
	for (const [action, params, message] of rejected) {
		const result = applyTodo(state, action, params);
		assert.deepEqual(result.op, { kind: "error", message });
		assert.strictEqual(result.state, state);
	}
	state = applyTodo(state, "update", { id: 1, addBlockedBy: [2, 3, 2] }).state;
	assert.deepEqual(state.tasks[0]?.blockedBy, [2, 3]);
	const cyclic = applyTodo(state, "update", { id: 2, addBlockedBy: [1] });
	assert.deepEqual(cyclic.op, { kind: "error", message: "addBlockedBy would create a cycle in the blockedBy graph" });
	assert.strictEqual(cyclic.state, state);
	state = applyTodo(state, "update", { id: 1, removeBlockedBy: [2] }).state;
	assert.deepEqual(state.tasks[0]?.blockedBy, [3]);
	state = applyTodo(state, "update", { id: 1, removeBlockedBy: [3] }).state;
	assert.equal(state.tasks[0]?.blockedBy, undefined);
	state = applyTodo(state, "delete", { id: 3 }).state;
	for (const [action, params, message] of [
		["create", { subject: "D", blockedBy: [3] }, "blockedBy: #3 is deleted"],
		["update", { id: 1, addBlockedBy: [3] }, "addBlockedBy: #3 is deleted"],
	] as const) assert.deepEqual(applyTodo(state, action, params).op, { kind: "error", message });
});

void test("metadata key merge and fields retain independent copies; no-op updates", () => {
	const metadata = { a: 1, b: "keep" };
	const start = applyTodo(emptyTodoState(), "create", { subject: "A", metadata }).state;
	metadata.a = 8;
	assert.deepEqual(start.tasks[0]?.metadata, { a: 1, b: "keep" });
	const updated = applyTodo(start, "update", { id: 1, subject: "B", description: "long", activeForm: "doing B", owner: "bot", metadata: { a: null, c: 3 } });
	assert.deepEqual(updated.state.tasks[0], { id: 1, subject: "B", status: "pending", description: "long", activeForm: "doing B", owner: "bot", metadata: { b: "keep", c: 3 } });
	assert.deepEqual(start.tasks[0]?.metadata, { a: 1, b: "keep" });
	const same = applyTodo(updated.state, "update", { id: 1, owner: "bot", metadata: { c: 3 } });
	assert.equal(same.op.kind, "update");
	if (same.op.kind === "update") assert.equal(same.op.changed, false);
	const emptied = applyTodo(updated.state, "update", { id: 1, metadata: { b: null, c: null } });
	assert.equal(emptied.state.tasks[0]?.metadata, undefined);
});

void test("missing ids, empty mutation and blank subject reject without altering state", () => {
	const state = applyTodo(emptyTodoState(), "create", { subject: "A" }).state;
	for (const [action, params, message] of [
		["create", { subject: "   " }, "subject required for create"],
		["get", {}, "id required for get"],
		["delete", {}, "id required for delete"],
		["update", {}, "id required for update"],
		["get", { id: 42 }, "#42 not found"],
		["delete", { id: 42 }, "#42 not found"],
		["update", { id: 42, status: "pending" }, "#42 not found"],
		["update", { id: 1, addBlockedBy: [] }, "update requires at least one mutable field: subject, description, activeForm, status, owner, metadata, addBlockedBy, or removeBlockedBy"],
	] as const) {
		const result = applyTodo(state, action, params);
		assert.deepEqual(result.op, { kind: "error", message });
		assert.strictEqual(result.state, state);
	}
	assert.deepEqual(applyTodo(state, "list", {}).op, { kind: "list", includeDeleted: false });
	assert.equal(applyTodo(state, "get", { id: 1 }).op.kind, "get");
});

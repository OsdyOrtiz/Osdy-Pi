import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import test from "node:test";
import { fileURLToPath } from "node:url";
import type { TodoState } from "./todo-domain.js";

registerHooks({
	resolve(specifier, context, next) {
		if (specifier.startsWith(".") && specifier.endsWith(".js") && context.parentURL?.endsWith(".ts")) {
			const url = new URL(`${specifier.slice(0, -3)}.ts`, context.parentURL);
			if (existsSync(fileURLToPath(url))) return { shortCircuit: true, url: url.href };
		}
		return next(specifier, context);
	},
});

const { emptyTodoState } = await import("./todo-domain.js");
const { createTodoSessionStore, replayTodoBranch, todoSessionId } = await import("./todo-session.js");

function snapshot(subject: string, nextId = 2): TodoState {
	return { tasks: [{ id: 1, subject, status: "pending", blockedBy: [2], metadata: { nested: { value: subject } } }], nextId };
}

function result(details: unknown, toolName = "todo") {
	return { type: "message", message: { role: "toolResult", toolName, details } };
}

void test("branch replay uses the last valid matching todo result, including empty snapshots", () => {
	const earlier = snapshot("earlier");
	const branch = [result(earlier), result(snapshot("other"), "other"), { type: "message", message: { role: "user" } },
		result({ tasks: [], nextId: 10 })];
	assert.deepEqual(replayTodoBranch(branch), { tasks: [], nextId: 10 });
	assert.deepEqual(replayTodoBranch([result(earlier), result(snapshot("latest"))]), snapshot("latest"));
	assert.deepEqual(replayTodoBranch([]), emptyTodoState());
});

void test("malformed details cannot become state or erase a preceding valid snapshot", () => {
	const valid = snapshot("valid");
	const invalid = [null, {}, { tasks: {}, nextId: 2 }, { tasks: [], nextId: 0 },
		{ tasks: [{ id: "1", subject: "bad", status: "pending" }], nextId: 2 },
		{ tasks: [{ id: 1, subject: "bad", status: "invalid" }], nextId: 2 },
		{ tasks: [{ id: 1, subject: "bad", status: "pending", blockedBy: "wrong" }], nextId: 2 }];
	for (const details of invalid) assert.deepEqual(replayTodoBranch([result(valid), result(details)]), valid);
});

void test("store isolates child sessions and clones at all ownership boundaries", () => {
	const store = createTodoSessionStore();
	const source = snapshot("parent");
	store.set("parent", source);
	store.set("child", source);
	source.tasks[0]!.subject = "source mutation";
	(source.tasks[0]!.metadata!.nested as { value: string }).value = "source mutation";
	store.get("parent").tasks[0]!.subject = "read mutation";
	assert.equal(store.get("parent").tasks[0]!.subject, "parent");
	assert.equal((store.get("child").tasks[0]!.metadata!.nested as { value: string }).value, "parent");
	const missing = store.get("missing");
	missing.tasks.push({ id: 1, subject: "not stored", status: "pending" });
	assert.deepEqual(store.get("missing"), emptyTodoState());
});

void test("branch switches replace stale session state and eviction resets that session only", () => {
	const store = createTodoSessionStore();
	store.set("a", snapshot("live"));
	store.set("b", snapshot("independent"));
	const branchSnapshot = snapshot("branch");
	store.replaceFromBranch("a", [result(branchSnapshot)]);
	branchSnapshot.tasks[0]!.subject = "changed after replay";
	assert.equal(store.get("a").tasks[0]!.subject, "branch");
	store.replaceFromBranch("a", []);
	assert.deepEqual(store.get("a"), emptyTodoState());
	store.evict("a");
	assert.deepEqual(store.get("a"), emptyTodoState());
	assert.equal(store.get("b").tasks[0]!.subject, "independent");
});

void test("foreground identifier is stable when a session id is unavailable", () => {
	assert.equal(todoSessionId("child"), "child");
	assert.equal(todoSessionId(undefined), "foreground");
	assert.equal(todoSessionId(""), "foreground");
});

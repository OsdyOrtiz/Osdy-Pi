import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";
import type { WorkingActivity } from "./types.js";

registerHooks({ resolve(specifier, context, nextResolve) {
	if (specifier.startsWith(".") && specifier.endsWith(".js") && context.parentURL?.endsWith(".ts"))
		return nextResolve(`${specifier.slice(0, -3)}.ts`, context);
	return nextResolve(specifier, context);
} });
const { childActivityState: activity, childAssignmentState: assignment } = await import("./working-child-activity.js");
const working = () => ({ activity: "working", label: "Working..." });

void test("fallback uses only validated public agent identity regardless of optional label", () => {
	assert.deepEqual(assignment("subagent_run", { agent: "explore", label: "map footer data" }), working());
	for (const args of [undefined, null, [], "scout", {}, { agent: 1 }, { agent: "\u0000\n" }, { agent: "a".repeat(4097) }, { label: "secret" }])
		assert.equal(assignment("subagent_run", args), undefined);
	for (const label of [undefined, null, 1, [], "", "\u0000", "x".repeat(4097)])
		assert.deepEqual(assignment("subagent_run", { agent: "scout", label, task: "SECRET", prompt: "SECRET", context: "SECRET" }), working());
	const metadata = { agent: "scout", get label() { throw new Error("label must not be read"); },
		get task() { throw new Error("task must not be read"); }, get prompt() { throw new Error("prompt must not be read"); },
		get context() { throw new Error("context must not be read"); } };
	assert.deepEqual(assignment("subagent_run", metadata), working());
	assert.equal(assignment("read", { agent: "scout" }), undefined);
	assert.deepEqual(assignment("subagent_continue", { id: "scout" }), working());
	for (const agent of [42, null, "", "\u0000"])
		assert.equal(assignment("subagent_continue", { agent }), undefined);
	assert.deepEqual(assignment("subagent_run", { agent: "\u001b[31m探索\u001b[0m\n\u202eagent" }), working());
	assert.deepEqual(assignment("subagent_run", { agent: "🙂".repeat(1000) }), working());
});

function task(agent = "scout", kind = "tool_running", tool_names: unknown = ["read"]) {
	return { agent, status: "running", live_activity: { current: { kind, tool_names,
		get label() { throw new Error("model label must not be read"); },
		get thinking() { throw new Error("thinking must not be read"); },
		get content() { throw new Error("content must not be read"); },
		get response() { throw new Error("response must not be read"); } },
		get trail() { throw new Error("trail must not be read"); } },
		get task() { throw new Error("task must not be read"); },
		get prompt() { throw new Error("prompt must not be read"); },
		get context() { throw new Error("context must not be read"); },
		get transcript() { throw new Error("transcript must not be read"); } };
}
const progress = (...tasks: unknown[]) => ({ details: { tasks } });

void test("public operations return structured six-state activity and label", () => {
	const cases: Array<[string, WorkingActivity, string]> = [
		["read", "exploring", "Exploring..."], ["grep", "exploring", "Exploring..."],
		["query-docs", "exploring", "Exploring..."], ["lens_diagnostics", "verifying", "Verifying..."],
		["edit", "working", "Working..."], ["write", "working", "Working..."],
		["subagent_run", "delegating", "Delegating..."], ["unknown", "executing", "Executing..."],
		["bash", "executing", "Executing..."], ["mcp", "executing", "Executing..."],
		["mcp__context7", "executing", "Executing..."], ["intercom", "executing", "Executing..."],
	];
	for (const kind of ["tool_running", "tool_completed", "tool_failed"])
		for (const [tool, state, label] of cases)
			assert.deepEqual(activity(progress(task("scout", kind, [tool]))), { activity: state, label });
	for (const kind of ["thinking", "streaming_response"])
		assert.deepEqual(activity(progress(task("scout", kind))), { activity: "thinking", label: "Thinking..." });
});

void test("multiple children select first running snapshot child and validate all children", () => {
	assert.deepEqual(activity(progress({ agent: "old", status: "completed" }, task("first"), task("second"), task("third"))),
		{ activity: "exploring", label: "Exploring... (+2)" });
	assert.deepEqual(activity(progress(task("first", "tool_running", ["read", "write"]))), { activity: "exploring", label: "Exploring..." });
	assert.equal(activity(progress(task(), task("bad", "tool_running", ["read", 1]))), undefined);
	assert.equal(activity(progress(...Array.from({ length: 65 }, () => task()))), undefined);
	assert.equal(activity(progress(...Array.from({ length: 64 }, () => task())))?.label, "Exploring... (+63)");
});

void test("terminal, missing, malformed and unsupported progress has no usable activity", () => {
	for (const status of ["completed", "failed", "cancelled", "aborted", "pending", "interrupted", "stopping", "queued", "unknown"]) {
		const child = task();
		child.status = status;
		assert.equal(activity(progress(child)), undefined);
	}
	for (const value of [undefined, null, [], {}, { details: null }, { details: { tasks: {} } }, progress(), progress(null),
		progress({ agent: 1, status: "running" }), progress({ agent: "scout", status: "running" }), progress(task("scout", "unknown"))])
		assert.equal(activity(value), undefined);
	for (const tool_names of [undefined, [], [""], ["\u0000"], [1], "read", ["read", null], Array(17).fill("read"), ["x".repeat(4097)]])
		assert.equal(activity(progress({ agent: "scout", status: "running", live_activity: { current: { kind: "tool_running", tool_names } } })), undefined);
	assert.equal(activity(progress(task("scout", "tool_running", Array(16).fill("read"))))?.activity, "exploring");
});

void test("non-string snapshot agent is rejected despite otherwise valid live activity", () => {
	assert.equal(activity(progress(Object.assign(task(), { agent: 1 }))), undefined);
});

void test("oversized snapshot agent is rejected despite otherwise valid live activity", () => {
	assert.equal(activity(progress(task("a".repeat(4097)))), undefined);
});

void test("snapshot agent at the input bound remains valid without appearing in the label", () => {
	assert.deepEqual(activity(progress(task("a".repeat(4096)))),
		{ activity: "exploring", label: "Exploring..." });
});

void test("external names are single-line, control-free and bounded before classification", () => {
	const dirty = "\u001b[31mAgent\u001b[0m\n\t\u202eName\u0007";
	assert.deepEqual(activity(progress(task(dirty, "tool_running", ["\u001b]0;title\u0007read\nfile"]))),
		{ activity: "executing", label: "Executing..." });
	assert.deepEqual(activity(progress(task("a".repeat(1000), "tool_running", ["b".repeat(1000)]))),
		{ activity: "executing", label: "Executing..." });
	assert.equal(activity(progress(task("\u0000\n"))), undefined);
});

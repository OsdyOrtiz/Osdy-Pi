import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";

registerHooks({ resolve(specifier, context, nextResolve) {
	if (specifier.startsWith(".") && specifier.endsWith(".js") && context.parentURL?.endsWith(".ts"))
		return nextResolve(`${specifier.slice(0, -3)}.ts`, context);
	return nextResolve(specifier, context);
} });
const { childActivityLabel, childAssignmentLabel: assignment } = await import("./working-child-activity.js");

void test("assignment uses only validated public agent and label metadata", () => {
	assert.equal(assignment("subagent_run", { agent: "explore", label: "map footer data" }), "explore · Task: map footer data");
	for (const args of [undefined, null, [], "scout", {}, { agent: 1 }, { agent: "\u0000\n" }, { agent: "a".repeat(4097) }, { label: "secret" }])
		assert.equal(assignment("subagent_run", args), undefined);
	for (const label of [undefined, null, 1, [], "", "\u0000", "x".repeat(4097)])
		assert.equal(assignment("subagent_run", { agent: "scout", label, task: "SECRET", prompt: "SECRET", context: "SECRET" }), "scout · Task assigned");
	const metadata = { agent: "scout", get task() { throw new Error("task must not be read"); },
		get prompt() { throw new Error("prompt must not be read"); }, get context() { throw new Error("context must not be read"); } };
	assert.equal(assignment("subagent_run", metadata), "scout · Task assigned");
	assert.equal(assignment("read", { agent: "scout", label: "map" }), undefined);
	assert.equal(assignment("subagent_continue", { id: "scout", label: "resume" }), "Subagent · Task: resume");
	assert.equal(assignment("subagent_continue", { agent: 42, label: "resume" }), undefined);
	assert.equal(assignment("subagent_run", { agent: "\u001b[31m探索\u001b[0m\n\u202eagent", label: "\u001b]0;title\u0007map\t👩‍💻 footer\u0000" }), "探索 agent · Task: map 👩‍💻 footer");
	const bounded = assignment("subagent_run", { agent: "🙂".repeat(1000), label: "界".repeat(1000) });
	assert.equal(Array.from(bounded ?? "").length, 32 + " · Task: ".length + 80);
});

function task(agent = "scout", kind = "tool_running", label = "Reading files", tool_names: unknown = ["read"]) {
	return { agent, status: "running", live_activity: { current: { kind, label, tool_names } } };
}
const progress = (...tasks: unknown[]) => ({ details: { tasks } });

void test("running child shows name and current tool; successive snapshots replace activity", () => {
	assert.equal(childActivityLabel(progress(task())), "scout · read");
	assert.equal(childActivityLabel(progress(task("scout", "tool_running", "Checking", ["bash"]))), "scout · bash");
	assert.equal(childActivityLabel(progress(task("scout", "tool_completed", "Read completed", undefined))), "scout · read (done)");
	assert.equal(childActivityLabel(progress(task("scout", "tool_failed", "Failed", ["bash"]))), "scout · bash (failed)");
	assert.equal(childActivityLabel(progress({ agent: "scout", status: "running", live_activity: { current: { kind: "tool_running", label: "UNTRUSTED TEXT" } } })), "scout · Tool running");
});

void test("multiple children select the first running child in snapshot order with bounded count", () => {
	assert.equal(childActivityLabel(progress({ agent: "old", status: "completed" }, task("first"), task("second"), task("third"))), "first · read (+2)");
	assert.equal(childActivityLabel(progress(...Array.from({ length: 65 }, () => task()))), undefined);
});

void test("terminal, missing, malformed and unsupported progress falls back", () => {
	for (const status of ["completed", "failed", "cancelled", "aborted", "pending", "interrupted", "stopping", "queued"]) {
		assert.equal(childActivityLabel(progress({ ...task(), status })), undefined);
	}
	for (const value of [undefined, null, [], {}, { details: null }, { details: { tasks: {} } }, progress(), progress(null), progress({ ...task(), agent: 1 }), progress({ ...task(), status: "unknown" }), progress({ agent: "scout", status: "running" }), progress(task("scout", "unknown")), progress(task("scout", "tool_running", "Read", [1]))]) {
		assert.equal(childActivityLabel(value), undefined, JSON.stringify(value));
	}
});

void test("model activity never exposes thinking labels or response text", () => {
	assert.equal(childActivityLabel(progress(task("scout", "thinking", "PRIVATE REASONING"))), "scout · Waiting on model");
	assert.equal(childActivityLabel(progress(task("scout", "streaming_response", "PRIVATE RESPONSE"))), "scout · Responding");
});

void test("external labels are single-line, control-free and bounded", () => {
	const dirty = "\u001b[31mAgent\u001b[0m\n\t\u202eName\u0007";
	assert.equal(childActivityLabel(progress(task(dirty, "tool_running", "unused", ["\u001b]0;title\u0007read\nfile"]))), "Agent Name · read file");
	const label = childActivityLabel(progress(task("a".repeat(1000), "tool_running", "unused", ["b".repeat(1000)])));
	assert.ok(label && label.length <= 100);
	assert.equal(childActivityLabel(progress(task("\u0000\n"))), undefined);
});

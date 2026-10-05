import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";
import type { WorkingActivity, WorkingWidgetState } from "./types.js";

registerHooks({ resolve(specifier, context, nextResolve) {
	if (specifier.startsWith(".") && specifier.endsWith(".js") && context.parentURL?.endsWith(".ts"))
		return nextResolve(`${specifier.slice(0, -3)}.ts`, context);
	return nextResolve(specifier, context);
} });
const { createWorkingController } = await import("./working-controller.js");
const { renderWorkingWidget } = await import("./working-animation.js");
const { WORKING_ACTIVITY_FRAMES } = await import("./constants.js");

function assertDisplay(working: WorkingWidgetState, activity: WorkingActivity, label: string): void {
	assert.equal(working.activity, activity);
	assert.equal(working.label, label);
	for (let frame = 0; frame < WORKING_ACTIVITY_FRAMES[activity].length; frame++) {
		const line = renderWorkingWidget({ ...working, frame }, { fg: (_color, text) => text }, 100)[0];
		assert.equal(line?.trim(), `${WORKING_ACTIVITY_FRAMES[activity][frame]} ${label}`);
	}
}

function fixture() {
	const state = { enabled: true };
	const working: WorkingWidgetState = { active: false, activity: "thinking", label: "Thinking...", frame: 0, timer: undefined, tui: undefined };
	return { state, working, controller: createWorkingController(state, working) };
}

void test("agent without tools thinks and matching ends restore the newest remaining tool", (t) => {
	t.mock.timers.enable({ apis: ["setInterval"] });
	const { working, controller: c } = fixture();
	c.onAgentStart(); assert.equal(working.label, "Thinking...");
	c.onToolStart("read", "a", {}); assert.equal(working.activity, "exploring");
	c.onToolStart("write", "b", {}); assert.equal(working.label, "Working...");
	c.onToolStart("bash", "c", { command: "npm test" }); assert.equal(working.label, "Verifying...");
	c.onToolEnd("b"); assert.equal(working.activity, "verifying");
	c.onToolEnd("c"); assert.equal(working.label, "Exploring...");
	c.onToolEnd("a"); assert.equal(working.label, "Thinking...");
	c.onAgentEnd(); assert.equal(working.active, false); assert.equal(working.timer, undefined);
});

void test("duplicate starts and unmatched ends neither replace nor reorder activity", (t) => {
	t.mock.timers.enable({ apis: ["setInterval"] });
	const { working, controller: c } = fixture();
	c.onToolStart("read", "a"); c.onToolStart("subagent_run", "b");
	c.onToolStart("write", "a"); c.onToolEnd("missing");
	assert.equal(working.label, "Delegating...");
	c.onToolEnd("b"); assert.equal(working.label, "Exploring...");
	c.onToolEnd("a"); assert.equal(working.active, false);
	c.onToolEnd("a"); assert.equal(working.timer, undefined);
});

void test("single 80ms clock stops while disabled and resumes the current tool", (t) => {
	t.mock.timers.enable({ apis: ["setInterval"] });
	const { state, working, controller: c } = fixture();
	c.onAgentStart(); const timer = working.timer;
	c.onToolStart("read", "a"); c.refreshWorking(); assert.equal(working.timer, timer);
	t.mock.timers.tick(79); assert.equal(working.frame, 0);
	t.mock.timers.tick(1); assert.equal(working.frame, 1);
	state.enabled = false; c.stopWorking();
	t.mock.timers.tick(800); assert.equal(working.frame, 1); assert.equal(working.timer, undefined);
	c.onToolStart("write", "b"); assert.equal(working.active, false);
	state.enabled = true; c.refreshWorking(); assert.equal(working.label, "Working...");
	t.mock.timers.tick(80); assert.equal(working.frame, 2);
	c.onToolEnd("b"); assert.equal(working.label, "Exploring...");
	c.onShutdown(); assert.equal(working.timer, undefined); assert.equal(working.active, false);
	t.mock.timers.tick(800); assert.equal(working.frame, 2);
	c.refreshWorking(); assert.equal(working.active, false);
});

void test("agent end clears tool identities before the next agent starts", (t) => {
	t.mock.timers.enable({ apis: ["setInterval"] });
	const { working, controller: c } = fixture();
	c.onToolStart("unknown", "a"); assert.equal(working.label, "Executing...");
	c.onAgentEnd(); c.onAgentStart(); c.onToolEnd("a");
	assert.equal(working.label, "Thinking...");
	c.onToolStart("edit", "a"); assert.equal(working.label, "Working...");
	c.onShutdown(); assert.equal(working.activity, "thinking");
});

void test("bounded exact tool classification and unknown argument narrowing", (t) => {
	t.mock.timers.enable({ apis: ["setInterval"] });
	const { working, controller: c } = fixture();
	const cases: Array<[string, unknown, string]> = [];
	for (const name of ["read", "grep", "find", "ls", "codegraph", "symbol_search", "project_report", "module_report", "read_symbol", "read_enclosing", "ast_grep_search", "resolve-library-id", "query-docs", "get-library-docs", "subagent_status", "subagent_result"])
		cases.push([name, undefined, "Exploring..."]);
	for (const name of ["edit", "write", "ast_grep_replace"]) cases.push([name, undefined, "Working..."]);
	cases.push(["subagent_run", undefined, "Delegating..."], ["lens_diagnostics", null, "Verifying..."], ["unknown", {}, "Executing..."], ["read_more", {}, "Executing..."]);
	for (const action of ["send", "ask", "handover"]) cases.push(["intercom", { action }, "Delegating..."]);
	for (const args of [undefined, null, [], "send", { action: 1 }, { action: "status" }, { action: "receive" }]) cases.push(["intercom", args, "Executing..."]);
	for (const [name, args, label] of cases) {
		c.onToolStart(name, "case", args); assert.equal(working.label, label, name); c.onToolEnd("case");
	}
});

void test("MCP wrappers explore only exact Context7 documentation selectors", (t) => {
	t.mock.timers.enable({ apis: ["setInterval"] });
	const { working, controller: c } = fixture();
	for (const wrapper of ["mcp", "mcp__context7"]) {
		for (const tool of ["resolve-library-id", "query-docs", "get-library-docs", "context7_resolve-library-id", "context7_query-docs"]) {
			c.onToolStart(wrapper, "case", { tool, args: {} });
			assert.equal(working.label, "Exploring...", `${wrapper}: ${tool}`);
			c.onToolEnd("case");
		}
		for (const args of [undefined, null, [], "query-docs", { tool: null }, { tool: 1 }, { tool: {} }, { tool: ["query-docs"] }, { tool: "" }, { tool: "unknown" }, { tool: "write" }, { tool: "query-docs-more" }, { tool: " QUERY-DOCS" }, { args: { tool: "query-docs" } }, { tool: "mcp", args: { tool: "query-docs" } }, { search: "query-docs" }]) {
			c.onToolStart(wrapper, "case", args);
			assert.equal(working.label, "Executing...", `${wrapper}: ${JSON.stringify(args)}`);
			c.onToolEnd("case");
		}
	}
	c.onToolStart("mcp__other", "case", { tool: "query-docs" });
	assert.equal(working.label, "Executing...");
	c.onToolEnd("case");
});

const childProgress = (agent: string, tool = "read", status = "running") => ({ details: { tasks: [
	{ agent, status, live_activity: { current: { kind: "tool_running", label: "Reading", tool_names: [tool] } } },
] } });

void test("child states select matching text and every existing glyph frame", (t) => {
	t.mock.timers.enable({ apis: ["setInterval"] });
	const { working, controller: c } = fixture();
	c.onToolStart("subagent_run", "child", { agent: "scout" });
	assertDisplay(working, "working", "Working...");
	const cases: Array<[string, string | undefined, WorkingActivity, string]> = [
		["thinking", undefined, "thinking", "Thinking..."],
		["streaming_response", undefined, "thinking", "Thinking..."],
		["tool_running", "read", "exploring", "Exploring..."],
		["tool_completed", "lens_diagnostics", "verifying", "Verifying..."],
		["tool_failed", "write", "working", "Working..."],
		["tool_running", "subagent_run", "delegating", "Delegating..."],
		["tool_running", "unknown", "executing", "Executing..."],
	];
	for (const [kind, tool, activity, label] of cases) {
		c.onToolUpdate("subagent_run", "child", { details: { tasks: [{ agent: "scout", status: "running",
			live_activity: { current: { kind, label: "IGNORED", tool_names: tool ? [tool] : undefined } } }] } });
		assertDisplay(working, activity, label);
	}
	c.onShutdown();
});

void test("child updates respect tool identity and latest remaining tool ownership", (t) => {
	t.mock.timers.enable({ apis: ["setInterval"] });
	const { working, controller: c } = fixture();
	c.onToolStart("subagent_run", "a");
	c.onToolUpdate("subagent_run", "a", childProgress("scout"));
	assertDisplay(working, "exploring", "Exploring...");
	c.onToolStart("subagent_run", "b");
	c.onToolUpdate("subagent_run", "b", childProgress("writer", "edit"));
	c.onToolUpdate("subagent_run", "a", childProgress("scout", "grep"));
	c.onToolUpdate("read", "b", childProgress("wrong"));
	c.onToolUpdate("subagent_run", "missing", childProgress("late"));
	c.onToolEnd("missing");
	assertDisplay(working, "working", "Working...");
	c.onToolStart("read", "ordinary");
	c.onToolUpdate("subagent_run", "ordinary", childProgress("wrong"));
	assert.equal(working.label, "Exploring...");
	c.onToolEnd("ordinary"); assertDisplay(working, "working", "Working...");
	c.onToolEnd("b"); assertDisplay(working, "exploring", "Exploring...");
	c.onToolUpdate("subagent_run", "b", childProgress("late"));
	assertDisplay(working, "exploring", "Exploring...");
	c.onToolUpdate("subagent_run", "a", childProgress("scout", "read", "completed"));
	assert.equal(working.label, "Delegating...");
	c.onToolUpdate("subagent_run", "a", childProgress("scout"));
	c.onToolUpdate("subagent_run", "a", { details: { tasks: null } });
	assert.equal(working.label, "Delegating...");
	c.onToolEnd("a"); assert.equal(working.active, false);
});

void test("agent/session disposal clears child progress and rejects late updates", (t) => {
	t.mock.timers.enable({ apis: ["setInterval"] });
	const { working, controller: c } = fixture();
	for (const cleanup of [() => c.onAgentEnd(), () => c.onShutdown()]) {
		c.onToolStart("subagent_run", "a");
		c.onToolUpdate("subagent_run", "a", childProgress("scout"));
		cleanup();
		c.onToolUpdate("subagent_run", "a", childProgress("late"));
		assert.equal(working.active, false); assert.equal(working.label, "Thinking...");
		assert.equal(working.timer, undefined);
		c.onAgentStart(); assert.equal(working.label, "Thinking...");
		c.onAgentEnd();
	}
});

void test("agent fallback appears at start and resets after unavailable, malformed or terminal live progress", (t) => {
	t.mock.timers.enable({ apis: ["setInterval"] });
	const { working, controller: c } = fixture();
	c.onToolStart("subagent_run", "a", { agent: "explore", label: "map footer data", task: "SECRET TASK", prompt: "SECRET PROMPT" });
	assertDisplay(working, "working", "Working...");
	c.onToolUpdate("subagent_run", "a", childProgress("explore"));
	assertDisplay(working, "exploring", "Exploring...");
	for (const update of [undefined, {}, { details: { tasks: null } }, { details: { tasks: [{ agent: "explore", status: "running" }] } }, childProgress("explore", "read", "completed"), childProgress("explore", ""),
		{ details: { tasks: [{ agent: "explore", status: "running", live_activity: { current: { kind: "tool_running", tool_names: [] } } }] } },
		{ details: { tasks: [{ agent: "explore", status: "running", live_activity: { current: { kind: "tool_running" } } }] } }]) {
		c.onToolUpdate("subagent_run", "a", childProgress("explore"));
		assertDisplay(working, "exploring", "Exploring...");
		c.onToolUpdate("subagent_run", "a", update);
		assertDisplay(working, "working", "Working...");
	}
	c.onToolEnd("a"); assert.equal(working.label, "Thinking...");
});

void test("continuations use generic identity without guessing and preserve call ownership", (t) => {
	t.mock.timers.enable({ apis: ["setInterval"] });
	const { working, controller: c } = fixture();
	c.onToolStart("subagent_run", "a", { agent: "scout" });
	assert.equal(working.label, "Working...");
	c.onToolStart("subagent_continue", "b", { id: "a", label: "check footer" });
	assert.equal(working.label, "Working...");
	c.onToolStart("subagent_continue", "a", { agent: "wrong", label: "wrong" });
	c.onToolUpdate("subagent_run", "b", childProgress("wrong"));
	c.onToolUpdate("subagent_continue", "missing", childProgress("wrong"));
	assert.equal(working.label, "Working...");
	c.onToolUpdate("subagent_continue", "b", childProgress("writer", "edit"));
	assertDisplay(working, "working", "Working...");
	c.onToolUpdate("subagent_run", "a", childProgress("scout"));
	assertDisplay(working, "working", "Working...");
	c.onToolUpdate("subagent_continue", "b", {});
	assert.equal(working.label, "Working...");
	c.onToolEnd("b"); assertDisplay(working, "exploring", "Exploring...");
	c.onToolUpdate("subagent_continue", "b", childProgress("late"));
	c.onToolUpdate("subagent_run", "a", {}); assert.equal(working.label, "Working...");
	c.onToolEnd("a");
	c.onToolStart("subagent_continue", "c", { agent: "writer", label: "finish" });
	assert.equal(working.label, "Working...");
	c.onToolEnd("c");
	c.onToolStart("subagent_continue", "d", { id: "c", task: "SECRET" });
	assert.equal(working.label, "Working...");
	c.onToolEnd("d");
});

void test("identity failures stay parent-owned and live snapshots retain validated public identity", (t) => {
	t.mock.timers.enable({ apis: ["setInterval"] });
	const { working, controller: c } = fixture();
	for (const args of [undefined, {}, { agent: null }, { agent: "" }]) {
		c.onToolStart("subagent_run", "run", args);
		assertDisplay(working, "delegating", "Delegating...");
		c.onToolUpdate("subagent_run", "run", childProgress("public"));
		assertDisplay(working, "exploring", "Exploring...");
		c.onToolUpdate("subagent_run", "run", {});
		assertDisplay(working, "delegating", "Delegating...");
		c.onToolEnd("run");
	}
	c.onToolStart("subagent_continue", "continue", { agent: null });
	assertDisplay(working, "executing", "Executing...");
	c.onToolEnd("continue");
	c.onToolStart("subagent_continue", "continue", {});
	assertDisplay(working, "working", "Working...");
	c.onToolUpdate("subagent_continue", "continue", { details: { tasks: [
		{ agent: "first", status: "running", live_activity: { current: { kind: "tool_running", tool_names: ["read"] } } },
		{ agent: "second", status: "running", live_activity: { current: { kind: "thinking" } } },
	] } });
	assertDisplay(working, "exploring", "Exploring... (+1)");
	c.onToolStart("subagent_run", "continue", { agent: "wrong" });
	c.onToolUpdate("subagent_run", "continue", childProgress("wrong"));
	assertDisplay(working, "exploring", "Exploring... (+1)");
	c.onToolUpdate("subagent_continue", "continue", {});
	assertDisplay(working, "working", "Working...");
	c.onShutdown();
});

void test("assignment metadata is cleared on agent and session cleanup", (t) => {
	t.mock.timers.enable({ apis: ["setInterval"] });
	const { working, controller: c } = fixture();
	for (const cleanup of [() => c.onAgentEnd(), () => c.onShutdown()]) {
		c.onToolStart("subagent_run", "a", { agent: "scout", label: "map" });
		assert.equal(working.label, "Working...");
		cleanup(); c.onToolUpdate("subagent_run", "a", childProgress("late"));
		c.refreshWorking(); assert.equal(working.label, "Thinking...");
		assert.equal(working.active, false); assert.equal(working.timer, undefined);
	}
});

void test("bash accepts only simple anchored explicit check commands", (t) => {
	t.mock.timers.enable({ apis: ["setInterval"] });
	const { working, controller: c } = fixture();
	for (const command of ["npm test", "npm test -- --runInBand", "npm run test", "npm run lint", "npm run typecheck", "npm run build", "node --test test.ts", "node --test --experimental-strip-types test.ts", "node --experimental-strip-types --test test.ts", "bun test", "npx tsc --noEmit", "npx tsc --noEmit --pretty false", "pytest -q tests", "go test ./...", "  npm test  "]) {
		c.onToolStart("bash", "case", { command }); assert.equal(working.label, "Verifying...", command); c.onToolEnd("case");
	}
	for (const args of [undefined, null, [], "npm test", { command: 1 }, ...["echo npm test", "npm install", "npm run testing", "npm run test:unit", "npx tsc", "node script.js --test", "npm test && echo done", "npm test | cat", "npm test; npm install", "npm test > log", "npm test\necho done", "pytest $(echo tests)", "go test `echo ./...`", "npm test &", "npm test # comment"].map(command => ({ command }))]) {
		c.onToolStart("bash", "case", args); assert.equal(working.label, "Executing...", JSON.stringify(args)); c.onToolEnd("case");
	}
});

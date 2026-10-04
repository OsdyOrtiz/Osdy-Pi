import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";
import type { WorkingWidgetState } from "./types.js";

registerHooks({ resolve(specifier, context, nextResolve) {
	if (specifier.startsWith(".") && specifier.endsWith(".js") && context.parentURL?.endsWith(".ts"))
		return nextResolve(`${specifier.slice(0, -3)}.ts`, context);
	return nextResolve(specifier, context);
} });
const { createWorkingController } = await import("./working-controller.js");

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

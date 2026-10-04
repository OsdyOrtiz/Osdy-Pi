import type { WorkingActivity } from "./types.js";

export const WORKING_ACTIVITY_LABELS: Record<WorkingActivity, string> = {
	thinking: "Thinking...",
	exploring: "Exploring...",
	verifying: "Verifying...",
	working: "Working...",
	delegating: "Delegating...",
	executing: "Executing...",
};

function stringArgument(args: unknown, key: string): string | undefined {
	if (typeof args !== "object" || args === null || Array.isArray(args)) return undefined;
	const value = (args as Record<string, unknown>)[key];
	return typeof value === "string" ? value : undefined;
}

function isSimpleCheck(command: string): boolean {
	// Deliberately not a shell parser: reject quoting, expansion and shell syntax.
	// Only plain command/argument tokens can enter the anchored allowlist.
	if (!/^[a-zA-Z0-9_./:=@%+*,? -]+$/.test(command)) return false;
	const text = command.trim();
	return /^(?:npm test|npm run (?:test|lint|typecheck|build)|node (?:--experimental-strip-types )?--test|bun test|npx tsc --noEmit|pytest|go test)(?: +[a-zA-Z0-9_./:=@%+*,?-]+)*$/.test(text);
}

export function classifyWorkingActivity(toolName: string, args: unknown): WorkingActivity {
	switch (toolName) {
		case "read": case "grep": case "find": case "ls":
		case "codegraph": case "symbol_search": case "project_report": case "module_report":
		case "read_symbol": case "read_enclosing": case "ast_grep_search":
		case "resolve-library-id": case "query-docs": case "get-library-docs":
		case "subagent_status": case "subagent_result":
			return "exploring";
		case "mcp": case "mcp__context7": {
			// Only exact documentation selectors; never recurse into wrapped arguments.
			const tool = stringArgument(args, "tool");
			return tool === "resolve-library-id" || tool === "query-docs" || tool === "get-library-docs"
				|| tool === "context7_resolve-library-id" || tool === "context7_query-docs" ? "exploring" : "executing";
		}
		case "edit": case "write": case "ast_grep_replace":
			return "working";
		case "subagent_run":
			return "delegating";
		case "lens_diagnostics":
			return "verifying";
		case "intercom": {
			const action = stringArgument(args, "action");
			return action === "send" || action === "ask" || action === "handover" ? "delegating" : "executing";
		}
		case "bash": {
			const command = stringArgument(args, "command");
			return command !== undefined && isSimpleCheck(command) ? "verifying" : "executing";
		}
		default:
			return "executing";
	}
}

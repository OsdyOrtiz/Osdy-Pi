import { stripVTControlCharacters } from "node:util";

function record(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Bound untrusted metadata before rendering; retain ZWJ emoji, never terminal controls. */
function safeLabel(value: unknown, limit: number): string | undefined {
	if (typeof value !== "string" || value.length > 4096) return undefined;
	const clean = stripVTControlCharacters(value)
		.replace(/[\p{Cc}\p{Cf}]/gu, character => character === "\u200d" ? character : " ")
		.replace(/\s+/gu, " ").trim();
	return Array.from(clean).slice(0, limit).join("") || undefined;
}

/** Assignment only: never infer activity or identity from task, prompt or context. */
export function childAssignmentLabel(toolName: string, args: unknown): string | undefined {
	if (toolName !== "subagent_run" && toolName !== "subagent_continue") return undefined;
	if (!record(args)) return undefined;
	const agent = args.agent === undefined && toolName === "subagent_continue" ? "Subagent" : safeLabel(args.agent, 32);
	if (!agent) return undefined;
	return `${agent} · Working...`;
}

function observableActivity(value: unknown): string | undefined {
	if (!record(value) || typeof value.label !== "string") return undefined;
	// Ignore model labels: they may contain response text or imply access to reasoning.
	if (value.kind === "thinking") return "Waiting on model";
	if (value.kind === "streaming_response") return "Responding";
	if (value.kind !== "tool_running" && value.kind !== "tool_completed" && value.kind !== "tool_failed") return undefined;
	let tool = "Tool";
	if (value.tool_names !== undefined) {
		if (!Array.isArray(value.tool_names) || value.tool_names.length > 16) return undefined;
		const names: string[] = [];
		for (const name of value.tool_names) {
			const safe = safeLabel(name, 40);
			if (!safe) return undefined;
			names.push(safe);
		}
		tool = names[0] ?? tool;
	}
	if (value.kind === "tool_completed") return `${tool} (done)`;
	if (value.kind === "tool_failed") return `${tool} (failed)`;
	return tool === "Tool" ? "Tool running" : tool;
}

/** Consume only public foreground metadata, not content, trails or transcripts. */
export function childActivityLabel(partialResult: unknown): string | undefined {
	if (!record(partialResult) || !record(partialResult.details)) return undefined;
	const tasks: unknown = partialResult.details.tasks;
	if (!Array.isArray(tasks) || tasks.length > 64) return undefined;
	let first: string | undefined;
	let running = 0;
	for (const task of tasks) {
		if (!record(task) || typeof task.status !== "string") return undefined;
		if (task.status !== "running") continue;
		const agent = safeLabel(task.agent, 32);
		const activity = record(task.live_activity) ? observableActivity(task.live_activity.current) : undefined;
		if (!agent || !activity) return undefined;
		first ??= `${agent} · ${activity}`;
		running++;
	}
	if (!first) return undefined;
	if (running > 1) return `${first} (+${running - 1})`;
	return first;
}

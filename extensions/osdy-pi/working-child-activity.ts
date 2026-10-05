import { stripVTControlCharacters } from "node:util";
import type { WorkingActivity } from "./types.js";
import { classifyWorkingActivity, WORKING_ACTIVITY_LABELS } from "./working-activity.js";

export type ChildWorkingState = { activity: WorkingActivity; label: string };

function childState(agent: string, activity: WorkingActivity): ChildWorkingState {
	return { activity, label: `${agent} · ${WORKING_ACTIVITY_LABELS[activity]}` };
}

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
export function childAssignmentState(toolName: string, args: unknown): ChildWorkingState | undefined {
	if (toolName !== "subagent_run" && toolName !== "subagent_continue") return undefined;
	if (!record(args)) return undefined;
	const agent = args.agent === undefined && toolName === "subagent_continue" ? "Subagent" : safeLabel(args.agent, 32);
	if (!agent) return undefined;
	return childState(agent, "working");
}

function observableActivity(value: unknown): WorkingActivity | undefined {
	if (!record(value)) return undefined;
	// Do not even access model labels: they may expose private response or reasoning text.
	if (value.kind === "thinking" || value.kind === "streaming_response") return "thinking";
	if (value.kind !== "tool_running" && value.kind !== "tool_completed" && value.kind !== "tool_failed") return undefined;
	let tool: string | undefined;
	if (value.tool_names !== undefined) {
		if (!Array.isArray(value.tool_names) || value.tool_names.length > 16) return undefined;
		const names: string[] = [];
		for (const name of value.tool_names) {
			const safe = safeLabel(name, 40);
			if (!safe) return undefined;
			names.push(safe);
		}
		tool = names[0];
	}
	// Public snapshots provide names only; never invent command or wrapper selectors.
	return tool === undefined ? undefined : classifyWorkingActivity(tool, undefined);
}

/** Consume only public foreground metadata, not content, trails or transcripts. */
export function childActivityState(partialResult: unknown): ChildWorkingState | undefined {
	if (!record(partialResult) || !record(partialResult.details)) return undefined;
	const tasks: unknown = partialResult.details.tasks;
	if (!Array.isArray(tasks) || tasks.length > 64) return undefined;
	let first: ChildWorkingState | undefined;
	let running = 0;
	for (const task of tasks) {
		if (!record(task) || typeof task.status !== "string") return undefined;
		if (task.status !== "running") continue;
		const agent = safeLabel(task.agent, 32);
		const activity = record(task.live_activity) ? observableActivity(task.live_activity.current) : undefined;
		if (!agent || !activity) return undefined;
		first ??= childState(agent, activity);
		running++;
	}
	if (!first) return undefined;
	if (running > 1) return { ...first, label: `${first.label} (+${running - 1})` };
	return first;
}

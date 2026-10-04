import { join } from "node:path";
import { inspectJokerAgents, setupJokerAgents, switchAgentMode } from "./agent-coexistence-setup.js";
import type { ControlCenterDetail, ProviderApplyResult } from "./control-center.js";

export type ControlCenterAgentsAction = { kind: "agents-provider"; mode: "joker" | "gentle" };
export interface ControlCenterAgentsService {
	read(): Promise<ControlCenterDetail>;
	apply(action: ControlCenterAgentsAction): Promise<ProviderApplyResult>;
}

/** The coexistence owner validates normal personal Pi and owns every install/filter write. */
export function createControlCenterAgents(options: Parameters<typeof setupJokerAgents>[0] & {
	isIdle: () => boolean;
	isCurrent?: () => boolean;
	inspect?: typeof inspectJokerAgents;
	setup?: typeof setupJokerAgents;
	switchMode?: typeof switchAgentMode;
}): ControlCenterAgentsService {
	let busy = false;
	const current = () => options.isCurrent?.() !== false;
	const target = join(options.agentDir, "settings.json");
	return {
		async read() {
			try {
				const status = await (options.inspect ?? inspectJokerAgents)(options);
				if (!current()) return { summary: "Agents status unavailable", note: "Session changed; reopen the panel.", rows: [] };
				return {
					summary: `Agent mode: ${status.mode} | Joker: ${status.jokerInstalled ? "installed" : "not installed"} | Gentle entries: ${status.gentleCount}`,
					note: "Configured provider, not proof of loaded tools. Opening this category never installs or switches agents.",
					rows: (["joker", "gentle"] as const).filter(mode => mode === "joker" || status.gentleCount > 0).map(mode => ({
						label: mode === "joker" ? "Joker agents" : "Gentle agents", current: status.mode === mode,
						action: { kind: "agents-provider", mode },
						details: [`Target: ${target}`, mode === "joker"
							? "Select Joker: Install npm:pi-subagents-j0k3r if absent; enable ./index.ts and exclude only -extensions/gentle-agents.ts from eligible Gentle entries."
							: "Select Gentle: enable extensions/gentle-agents.ts; exclude Joker ./index.ts with the owner's -./index.ts filter. No installation.",
							"Only owner-managed agent filters change; unrelated resources and installed packages are preserved.",
							"Successful save closes this panel before resource reload; restart Pi if reload fails."],
					})),
				};
			} catch (error) {
				return { summary: "Agents status unavailable", note: error instanceof Error ? error.message : "Inspection failed; reopen to retry.", rows: [] };
			}
		},
		async apply(action) {
			if (busy || !current() || !options.isIdle())
				return { kind: "rejected", message: "Agents selection requires the current idle session; nothing changed." };
			busy = true;
			try {
				if (action.mode === "joker") await (options.setup ?? setupJokerAgents)(options);
				else await (options.switchMode ?? switchAgentMode)({ ...options, mode: "off" });
				if (!current()) return { kind: "rejected", message: "Session changed after the owner operation; reload not requested. Reopen status in the current session." };
				return { kind: "reload", message: "Agents selection saved. Reloading resources; restart Pi if reload fails." };
			} catch (error) {
				return { kind: "rejected", message: `Agents selection failed: ${error instanceof Error ? error.message : "unknown error"}. Reload not requested.` };
			} finally {
				busy = false;
			}
		},
	};
}

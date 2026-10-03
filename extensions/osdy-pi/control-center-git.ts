import type { ControlCenterService } from "./control-center.js";
import type { WorkingTreePlacement } from "./types.js";

interface GitDependencies {
	snapshot(): { enabled: boolean; placement: WorkingTreePlacement };
	exec(args: string[]): Promise<string>;
	applyEnabled(value: boolean): Promise<boolean>;
}

/** Read-only Git inspection; the runtime retains ownership of widget persistence. */
export function createControlCenterGit(dependencies: GitDependencies): ControlCenterService {
	return {
		async read() {
			let summary: string;
			try {
				const [branch, status] = await Promise.all([
					dependencies.exec(["--no-optional-locks", "branch", "--show-current"]),
					dependencies.exec(["--no-optional-locks", "status", "--short", "--untracked-files=normal"]),
				]);
				const changed = status.split("\n").filter((line) => line.trim()).length;
				summary = `Branch: ${branch.trim() || "detached HEAD"} | ${changed ? `${changed} changed entries` : "working tree clean"}`;
			} catch {
				summary = "Git branch/worktree unavailable (not a repository or inspection failed).";
			}
			const state = dependencies.snapshot();
			return {
				summary,
				note: `Position: ${state.placement} (session detail, read-only). Inspection never writes Git.`,
				rows: [true, false].map((value) => ({ label: `Working-tree widget: ${value ? "enabled" : "disabled"}`,
					current: state.enabled === value, action: { kind: "git-enabled" as const, value } })),
			};
		},
		async apply(action) {
			if (action.kind !== "git-enabled") return { failed: true, message: "Not a Git preference action" };
			const saved = await dependencies.applyEnabled(action.value);
			return { failed: !saved, message: saved ? "Saved globally: working-tree widget"
				: "Applied live: working-tree widget, but could not be saved. Retry to persist." };
		},
	};
}

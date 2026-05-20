import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type {
	ExtensionAPI,
	ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import type { Component, TUI } from "@earendil-works/pi-tui";
import { truncateToWidth } from "@earendil-works/pi-tui";
import type {
	SimpleTheme,
	WorkingTreeFileSummary,
	WorkingTreeSnapshot,
	WorkingTreeState,
} from "./types.js";
import { fitCenterVisible } from "./utils.js";

const MUTATING_TOOL_NAMES = new Set(["edit", "write", "ast_grep_replace"]);

type FileFlags = {
	path: string;
	staged: boolean;
	unstaged: boolean;
	untracked: boolean;
	additions: number;
	removals: number;
};

function requestWorkingTreeRender(state: WorkingTreeState): void {
	state.tui?.requestRender();
}

function createEmptyFlags(path: string): FileFlags {
	return {
		path,
		staged: false,
		unstaged: false,
		untracked: false,
		additions: 0,
		removals: 0,
	};
}

function getOrCreateFile(map: Map<string, FileFlags>, path: string): FileFlags {
	const current = map.get(path);
	if (current) return current;
	const next = createEmptyFlags(path);
	map.set(path, next);
	return next;
}

function parseDiffNumber(value: string): number {
	const parsed = Number.parseInt(value, 10);
	return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeGitPath(path: string): string {
	const trimmed = path.trim();
	if (!trimmed.includes(" -> ")) return trimmed;
	const [, renamedPath = trimmed] = trimmed.split(" -> ");
	return renamedPath.trim();
}

function mergeNumstat(
	map: Map<string, FileFlags>,
	output: string,
	kind: "staged" | "unstaged",
): void {
	for (const line of output.split("\n")) {
		if (!line.trim()) continue;
		const [additionsRaw = "0", removalsRaw = "0", ...pathParts] =
			line.split("\t");
		const path = normalizeGitPath(pathParts.join("\t"));
		if (!path) continue;
		const file = getOrCreateFile(map, path);
		file.additions += parseDiffNumber(additionsRaw);
		file.removals += parseDiffNumber(removalsRaw);
		if (kind === "staged") file.staged = true;
		if (kind === "unstaged") file.unstaged = true;
	}
}

function mergeStatus(map: Map<string, FileFlags>, output: string): void {
	for (const line of output.split("\n")) {
		if (!line.trim()) continue;
		if (line.startsWith("?? ")) {
			const path = normalizeGitPath(line.slice(3));
			if (!path) continue;
			const file = getOrCreateFile(map, path);
			file.untracked = true;
			file.unstaged = true;
			continue;
		}
		if (line.length < 4) continue;
		const x = line[0] ?? " ";
		const y = line[1] ?? " ";
		const path = normalizeGitPath(line.slice(3));
		if (!path) continue;
		const file = getOrCreateFile(map, path);
		if (x !== " ") file.staged = true;
		if (y !== " ") file.unstaged = true;
	}
}

function toFileSummary(file: FileFlags): WorkingTreeFileSummary {
	return {
		path: file.path,
		additions: file.additions,
		removals: file.removals,
		staged: file.staged,
		unstaged: file.unstaged,
		untracked: file.untracked,
	};
}

function compareFiles(
	left: WorkingTreeFileSummary,
	right: WorkingTreeFileSummary,
): number {
	const leftMagnitude = left.additions + left.removals;
	const rightMagnitude = right.additions + right.removals;
	if (leftMagnitude !== rightMagnitude) return rightMagnitude - leftMagnitude;
	return left.path.localeCompare(right.path);
}

async function hydrateUntrackedStats(
	ctx: ExtensionContext,
	fileMap: Map<string, FileFlags>,
): Promise<void> {
	await Promise.all(
		Array.from(fileMap.values()).map(async (file) => {
			if (!file.untracked || file.additions > 0 || file.removals > 0) return;
			try {
				const content = await readFile(resolve(ctx.cwd, file.path), "utf8");
				file.additions = content.length === 0 ? 0 : content.split("\n").length;
			} catch {
				file.additions = 1;
			}
		}),
	);
}

function createSnapshot(files: WorkingTreeFileSummary[]): WorkingTreeSnapshot {
	const stagedFiles = files.filter((file) => file.staged).length;
	const unstagedFiles = files.filter((file) => file.unstaged).length;
	const untrackedFiles = files.filter((file) => file.untracked).length;
	const additions = files.reduce((total, file) => total + file.additions, 0);
	const removals = files.reduce((total, file) => total + file.removals, 0);
	return {
		files,
		totalFiles: files.length,
		stagedFiles,
		unstagedFiles,
		untrackedFiles,
		additions,
		removals,
	};
}

async function runGit(
	pi: ExtensionAPI,
	ctx: ExtensionContext,
	args: string[],
): Promise<string> {
	const result = await pi.exec("git", args, { cwd: ctx.cwd });
	if (result.code !== 0) {
		throw new Error(result.stderr.trim() || `git ${args.join(" ")} failed`);
	}
	return result.stdout;
}

let refreshGeneration = 0;

export async function refreshWorkingTree(
	pi: ExtensionAPI,
	ctx: ExtensionContext,
	state: WorkingTreeState,
): Promise<void> {
	if (!state.enabled) return;
	const generation = ++refreshGeneration;
	state.loading = true;
	state.error = undefined;
	requestWorkingTreeRender(state);

	try {
		await runGit(pi, ctx, ["rev-parse", "--is-inside-work-tree"]);
		const [statusOutput, stagedOutput, unstagedOutput] = await Promise.all([
			runGit(pi, ctx, ["status", "--short", "--untracked-files=all"]),
			runGit(pi, ctx, ["diff", "--cached", "--numstat", "--no-ext-diff"]),
			runGit(pi, ctx, ["diff", "--numstat", "--no-ext-diff"]),
		]);
		if (generation !== refreshGeneration) return;
		const fileMap = new Map<string, FileFlags>();
		mergeStatus(fileMap, statusOutput);
		mergeNumstat(fileMap, stagedOutput, "staged");
		mergeNumstat(fileMap, unstagedOutput, "unstaged");
		await hydrateUntrackedStats(ctx, fileMap);
		const files = Array.from(fileMap.values())
			.map(toFileSummary)
			.sort(compareFiles);
		state.snapshot = createSnapshot(files);
	} catch {
		if (generation !== refreshGeneration) return;
		state.snapshot = null;
		state.error = "working tree unavailable";
	} finally {
		if (generation === refreshGeneration) {
			state.loading = false;
			requestWorkingTreeRender(state);
		}
	}
}

export function clearWorkingTree(state: WorkingTreeState): void {
	refreshGeneration += 1;
	state.loading = false;
	state.snapshot = null;
	state.error = undefined;
	requestWorkingTreeRender(state);
}

export function shouldRefreshWorkingTree(toolName: string): boolean {
	return MUTATING_TOOL_NAMES.has(toolName) || toolName === "bash";
}

function renderSummaryLine(
	snapshot: WorkingTreeSnapshot,
	theme: SimpleTheme,
): string {
	if (snapshot.totalFiles === 0) {
		return theme.fg("mdLink", "Git changes · working tree clean");
	}
	const parts = [
		theme.fg("mdLink", `Git changes · ${snapshot.totalFiles} files`),
		theme.fg("success", `+${snapshot.additions}`),
		theme.fg("error", `-${snapshot.removals}`),
		theme.fg("mdLink", `staged ${snapshot.stagedFiles}`),
		theme.fg("mdLink", `unstaged ${snapshot.unstagedFiles}`),
	];
	if (snapshot.untrackedFiles > 0) {
		parts.push(theme.fg("mdLink", `new ${snapshot.untrackedFiles}`));
	}
	return parts.join(theme.fg("muted", " · "));
}

class WorkingTreeWidget implements Component {
	constructor(
		private readonly state: WorkingTreeState,
		private readonly theme: SimpleTheme,
	) {}

	render(width: number): string[] {
		if (!this.state.enabled) return [];
		if (this.state.loading) {
			return [
				fitCenterVisible(
					this.theme.fg("muted", "Git changes · refreshing..."),
					width,
				),
			];
		}
		if (this.state.error) {
			return [
				fitCenterVisible(
					this.theme.fg("warning", "Git changes unavailable"),
					width,
				),
			];
		}
		const snapshot = this.state.snapshot;
		if (!snapshot) return [];
		return [
			fitCenterVisible(
				truncateToWidth(
					renderSummaryLine(snapshot, this.theme),
					Math.max(1, width),
				),
				width,
			),
		];
	}

	invalidate(): void {}
}

export function createWorkingTreeWidgetFactory(state: WorkingTreeState) {
	return (tui: TUI, theme: SimpleTheme): Component => {
		state.tui = tui;
		return new WorkingTreeWidget(state, theme);
	};
}

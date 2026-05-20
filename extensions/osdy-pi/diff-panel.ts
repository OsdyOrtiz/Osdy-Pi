import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type {
	ExtensionAPI,
	ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import {
	matchesKey,
	truncateToWidth,
	visibleWidth,
	type Component,
	type TUI,
} from "@earendil-works/pi-tui";
import { truncateMiddle } from "./format.js";
import type {
	SimpleTheme,
	WorkingTreeFileSummary,
	WorkingTreeState,
} from "./types.js";

type DiffFileView = {
	file: WorkingTreeFileSummary;
	patch: string[];
};

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

function normalizePatchLines(output: string): string[] {
	return output
		.split("\n")
		.filter(
			(line, index, lines) => !(index === lines.length - 1 && line === ""),
		);
}

async function loadUntrackedPatch(
	ctx: ExtensionContext,
	path: string,
): Promise<string[]> {
	const absolutePath = resolve(ctx.cwd, path);
	const content = await readFile(absolutePath, "utf8");
	const lines = content.split("\n");
	return [
		`diff --git a/${path} b/${path}`,
		"new file mode 100644",
		"--- /dev/null",
		`+++ b/${path}`,
		`@@ -0,0 +1,${lines.length} @@`,
		...lines.map((line) => `+${line}`),
	];
}

async function loadFilePatch(
	pi: ExtensionAPI,
	ctx: ExtensionContext,
	file: WorkingTreeFileSummary,
): Promise<string[]> {
	if (file.untracked) {
		return loadUntrackedPatch(ctx, file.path);
	}
	const [stagedPatch, unstagedPatch] = await Promise.all([
		runGit(pi, ctx, ["diff", "--cached", "--no-ext-diff", "--", file.path]),
		runGit(pi, ctx, ["diff", "--no-ext-diff", "--", file.path]),
	]);
	const merged = [stagedPatch, unstagedPatch]
		.filter((patch) => patch.trim().length > 0)
		.join("\n");
	return normalizePatchLines(merged);
}

async function buildDiffFiles(
	pi: ExtensionAPI,
	ctx: ExtensionContext,
	state: WorkingTreeState,
): Promise<DiffFileView[]> {
	const files = state.snapshot?.files ?? [];
	const entries = await Promise.all(
		files.map(async (file) => {
			try {
				return {
					file,
					patch: await loadFilePatch(pi, ctx, file),
				};
			} catch (error) {
				const message =
					error instanceof Error ? error.message : "Patch unavailable";
				return {
					file,
					patch: [message],
				};
			}
		}),
	);
	return entries;
}

function fileFlags(theme: SimpleTheme, file: WorkingTreeFileSummary): string {
	const flags: string[] = [];
	if (file.untracked) flags.push(theme.fg("warning", "NEW"));
	if (file.staged) flags.push(theme.fg("success", "STAGED"));
	if (file.unstaged) flags.push(theme.fg("accent", "UNSTAGED"));
	if (flags.length === 0) return theme.fg("muted", "[clean]");
	return `${theme.fg("muted", "[")}${flags.join(theme.fg("muted", ", "))}${theme.fg("muted", "]")}`;
}

function padLine(line: string, width: number): string {
	const currentWidth = visibleWidth(line);
	return `${line}${" ".repeat(Math.max(0, width - currentWidth))}`;
}

function borderBox(
	theme: SimpleTheme,
	width: number,
	title: string,
	lines: string[],
): string[] {
	const innerWidth = Math.max(1, width - 2);
	const header = truncateToWidth(` ${title} `, innerWidth, "...", true);
	const left = "─".repeat(
		Math.max(0, Math.floor((innerWidth - visibleWidth(header)) / 2)),
	);
	const right = "─".repeat(
		Math.max(0, innerWidth - visibleWidth(header) - left.length),
	);
	const result = [
		theme.fg("border", `╭${left}`) +
			theme.fg("accent", header) +
			theme.fg("border", `${right}╮`),
	];
	for (const line of lines) {
		result.push(
			theme.fg("border", "│") +
				padLine(truncateToWidth(line, innerWidth, "...", true), innerWidth) +
				theme.fg("border", "│"),
		);
	}
	result.push(theme.fg("border", `╰${"─".repeat(innerWidth)}╯`));
	return result;
}

class WorkingTreeDiffPanel implements Component {
	private selectedIndex = 0;
	private scrollOffset = 0;
	private mode: "select" | "view" = "select";
	private searchTerm = "";

	constructor(
		private readonly tui: TUI,
		private readonly theme: SimpleTheme,
		private readonly files: DiffFileView[],
		private readonly close: () => void,
	) {}

	private get filteredFiles(): DiffFileView[] {
		const query = this.searchTerm.trim().toLowerCase();
		if (!query) return this.files;
		return this.files.filter((entry) =>
			entry.file.path.toLowerCase().includes(query),
		);
	}

	private get selected(): DiffFileView | undefined {
		return this.filteredFiles[this.selectedIndex];
	}

	private clampSelection(): void {
		const files = this.filteredFiles;
		this.selectedIndex = Math.max(
			0,
			Math.min(Math.max(0, files.length - 1), this.selectedIndex),
		);
	}

	private moveSelection(delta: number): void {
		const files = this.filteredFiles;
		if (files.length === 0) return;
		this.selectedIndex = Math.max(
			0,
			Math.min(files.length - 1, this.selectedIndex + delta),
		);
		this.scrollOffset = 0;
		this.tui.requestRender();
	}

	private updateSearch(next: string): void {
		this.searchTerm = next;
		this.selectedIndex = 0;
		this.scrollOffset = 0;
		this.tui.requestRender();
	}

	private renderModal(width: number, title: string, lines: string[]): string[] {
		return borderBox(this.theme, width, title, lines);
	}

	handleInput(data: string): void {
		if (matchesKey(data, "ctrl+c") || matchesKey(data, "q")) {
			this.close();
			return;
		}
		if (this.mode === "select") {
			if (matchesKey(data, "escape")) {
				if (this.searchTerm.length > 0) {
					this.updateSearch("");
					return;
				}
				this.close();
				return;
			}
			if (matchesKey(data, "backspace")) {
				if (this.searchTerm.length > 0) {
					this.updateSearch(this.searchTerm.slice(0, -1));
					return;
				}
			}
			if (matchesKey(data, "up") || matchesKey(data, "k")) {
				this.moveSelection(-1);
				return;
			}
			if (matchesKey(data, "down") || matchesKey(data, "j")) {
				this.moveSelection(1);
				return;
			}
			if (
				matchesKey(data, "return") ||
				matchesKey(data, "space") ||
				matchesKey(data, "right") ||
				matchesKey(data, "l")
			) {
				if (this.filteredFiles.length === 0) return;
				this.mode = "view";
				this.scrollOffset = 0;
				this.tui.requestRender();
				return;
			}
			if (data.length === 1 && data >= " " && data !== "\u007f") {
				this.updateSearch(`${this.searchTerm}${data}`);
				return;
			}
			return;
		}
		if (
			matchesKey(data, "escape") ||
			matchesKey(data, "backspace") ||
			matchesKey(data, "left") ||
			matchesKey(data, "h")
		) {
			this.mode = "select";
			this.tui.requestRender();
			return;
		}
		if (data === "\u001b[5~") {
			this.scrollOffset = Math.max(0, this.scrollOffset - 12);
			this.tui.requestRender();
			return;
		}
		if (data === "\u001b[6~" || matchesKey(data, "space")) {
			this.scrollOffset += 12;
			this.tui.requestRender();
		}
	}

	render(width: number): string[] {
		this.clampSelection();
		const filteredFiles = this.filteredFiles;
		const selected = this.selected;
		if (this.files.length === 0) {
			return this.renderModal(width, "Osdy Pi Diff", [
				this.theme.fg("muted", "q or esc to close"),
				this.theme.fg("warning", "No tracked changes available."),
			]);
		}
		if (this.mode === "select") {
			const innerWidth = Math.max(20, width - 4);
			const listStart = Math.max(
				0,
				Math.min(
					this.selectedIndex - 4,
					Math.max(0, filteredFiles.length - 10),
				),
			);
			const listEntries = filteredFiles.slice(listStart, listStart + 10);
			const listLines = listEntries.map((entry, index) => {
				const fileIndex = listStart + index;
				const isSelected = fileIndex === this.selectedIndex;
				const marker = isSelected
					? this.theme.fg("accent", "❯")
					: this.theme.fg("muted", "·");
				const path = truncateMiddle(
					entry.file.path,
					Math.max(12, innerWidth - 34),
				);
				const stats = `${this.theme.fg("success", `+${entry.file.additions}`)}/${this.theme.fg("error", `-${entry.file.removals}`)}`;
				const badges = fileFlags(this.theme, entry.file);
				return `${marker} ${this.theme.fg(isSelected ? "accent" : "toolOutput", path)} ${badges} ${stats}`;
			});
			return this.renderModal(width, "Osdy Pi Diff · Select file", [
				this.theme.fg(
					"muted",
					"Type to filter · ↑↓ move · enter/right open · esc clear/close",
				),
				`${this.theme.fg("accent", "Search:")} ${this.theme.fg("toolOutput", this.searchTerm || "")}${this.searchTerm.length === 0 ? this.theme.fg("muted", "(all files)") : ""}`,
				this.theme.fg(
					"mdLink",
					`Files ${filteredFiles.length === 0 ? 0 : this.selectedIndex + 1}/${filteredFiles.length} · total ${this.files.length}`,
				),
				...(listLines.length > 0
					? listLines
					: [this.theme.fg("warning", "No files match the current search.")]),
			]);
		}
		if (!selected) {
			return this.renderModal(width, "Osdy Pi Diff", [
				this.theme.fg("muted", "esc to go back"),
				this.theme.fg("warning", "No file selected."),
			]);
		}
		const patchLines =
			selected.patch.length > 0
				? selected.patch
				: ["(No patch lines for this file)"];
		const availablePatchHeight = Math.max(8, this.tui.terminal.rows - 10);
		const maxOffset = Math.max(0, patchLines.length - availablePatchHeight);
		this.scrollOffset = Math.min(this.scrollOffset, maxOffset);
		const visiblePatch = patchLines
			.slice(this.scrollOffset, this.scrollOffset + availablePatchHeight)
			.map((line) => {
				if (line.startsWith("+") && !line.startsWith("+++"))
					return this.theme.fg("success", line);
				if (line.startsWith("-") && !line.startsWith("---"))
					return this.theme.fg("error", line);
				if (line.startsWith("@@")) return this.theme.fg("accent", line);
				return this.theme.fg("toolOutput", line);
			});
		return this.renderModal(width, `Diff · ${selected.file.path}`, [
			this.theme.fg(
				"muted",
				"PgUp/PgDn scroll · esc/backspace/left back · q close",
			),
			this.theme.fg(
				"mdLink",
				`Patch ${Math.min(this.scrollOffset + 1, patchLines.length)}/${patchLines.length}`,
			),
			...visiblePatch,
		]);
	}

	invalidate(): void {}
}

export async function showWorkingTreeDiffPanel(
	pi: ExtensionAPI,
	ctx: ExtensionContext,
	state: WorkingTreeState,
): Promise<void> {
	const files = await buildDiffFiles(pi, ctx, state);
	await ctx.ui.custom<void>(
		(tui, theme, _keybindings, done) =>
			new WorkingTreeDiffPanel(tui, theme, files, () => done()),
		{
			overlay: true,
			overlayOptions: {
				anchor: "center",
				width: 112,
				minWidth: 56,
				maxHeight: "88%",
				margin: 1,
			},
		},
	);
}

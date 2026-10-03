import type { ExtensionContext, Theme } from "@earendil-works/pi-coding-agent";
import { Key, matchesKey, truncateToWidth, visibleWidth, type Component } from "@earendil-works/pi-tui";
import { doubleBorderBox, MODAL_OVERLAY_OPTIONS } from "./modal-frame.js";

export const CONTROL_CENTER_CATEGORIES = [
	"Theme", "Header", "Mascot", "Editor", "Git", "Sounds", "Account", "Usage",
] as const;
export type ControlCenterCategory = (typeof CONTROL_CENTER_CATEGORIES)[number];
export type ControlCenterAction = { kind: "theme"; name: string };
export interface ControlCenterRow {
	label: string;
	current: boolean;
	action: ControlCenterAction;
}
export interface ControlCenterDependencies {
	theme: () => Pick<Theme, "name" | "appearance" | "fg">;
	readThemes: () => { name: string; path: string | undefined }[];
	applyTheme: (name: string) => { success: boolean; error?: string };
	requestRender: () => void;
	height: () => number;
	close: () => void;
}
type ControlCenterContext = Pick<ExtensionContext, "mode" | "hasUI"> & {
	ui: Pick<ExtensionContext["ui"], "custom" | "theme" | "getAllThemes" | "setTheme" | "notify">;
};
const errorMessage = (error: unknown): string => error instanceof Error ? error.message : "Unknown error";

/** One interaction owns this instance. Rows carry actions, never command strings. */
export class ControlCenter implements Component {
	private readonly dependencies: ControlCenterDependencies;
	private categoryIndex = 0;
	private rowIndex = 0;
	private focus: "categories" | "detail" = "categories";
	private names: string[] = [];
	private feedback = "";
	private failed = false;
	private disposed = false;
	private pageSize = 1;

	constructor(dependencies: ControlCenterDependencies) {
		this.dependencies = dependencies;
		try {
			this.names = dependencies.readThemes().map(({ name }) => name);
			this.rowIndex = Math.max(0, this.names.indexOf(dependencies.theme().name ?? ""));
		} catch (error) {
			this.failed = true;
			this.feedback = `Themes unavailable: ${errorMessage(error)}`;
		}
	}

	private get category(): ControlCenterCategory {
		return CONTROL_CENTER_CATEGORIES[this.categoryIndex] ?? "Theme";
	}

	private rows(): ControlCenterRow[] {
		if (this.category !== "Theme") return [];
		const current = this.dependencies.theme().name;
		return this.names.map((name) => ({
			label: name,
			current: name === current,
			action: { kind: "theme", name },
		}));
	}

	private activate(action: ControlCenterAction): void {
		try {
			const result = this.dependencies.applyTheme(action.name);
			this.failed = !result.success;
			this.feedback = result.success
				? `Saved globally: ${action.name}`
				: `Theme failed: ${result.error ?? "No reason provided"}`;
		} catch (error) {
			this.failed = true;
			this.feedback = `Theme failed: ${errorMessage(error)}`;
		}
	}

	handleInput(data: string): void {
		if (this.disposed) return;
		if (matchesKey(data, Key.escape)) {
			this.dispose();
			this.dependencies.close();
			return;
		}
		if (matchesKey(data, Key.tab) || matchesKey(data, Key.shift("tab"))) {
			this.focus = this.focus === "categories" ? "detail" : "categories";
		} else if (matchesKey(data, Key.left)) {
			this.focus = "categories";
		} else if (matchesKey(data, Key.right)) {
			this.focus = "detail";
		} else if (matchesKey(data, Key.enter)) {
			if (this.focus === "categories") this.focus = "detail";
			else {
				const row = this.rows()[this.rowIndex];
				if (row) this.activate(row.action);
			}
		} else {
			const count = this.focus === "categories" ? CONTROL_CENTER_CATEGORIES.length : this.rows().length;
			let index = this.focus === "categories" ? this.categoryIndex : this.rowIndex;
			if (matchesKey(data, Key.up)) index--;
			else if (matchesKey(data, Key.down)) index++;
			else if (matchesKey(data, Key.pageUp)) index -= this.pageSize;
			else if (matchesKey(data, Key.pageDown)) index += this.pageSize;
			else if (matchesKey(data, Key.home)) index = 0;
			else if (matchesKey(data, Key.end)) index = count - 1;
			else return;
			index = Math.max(0, Math.min(Math.max(0, count - 1), index));
			if (this.focus === "categories") this.categoryIndex = index;
			else this.rowIndex = index;
		}
		this.dependencies.requestRender();
	}

	render(width: number): string[] {
		if (width <= 0 || this.disposed) return [];
		const height = Math.max(0, Math.floor(this.dependencies.height()));
		if (height === 0) return [];
		const theme = this.dependencies.theme();
		const rows = this.rows();
		const available = this.category === "Theme";
		const summary = available
			? `Current: ${theme.name ?? "unnamed"} | Appearance: ${theme.appearance}`
			: `${this.category}: not yet available`;
		const feedback = this.feedback ? theme.fg(this.failed ? "error" : "success", this.feedback) : "";
		if (height < 7) {
			return doubleBorderBox(theme, width, `Osdy / ${this.category}`, [feedback || summary, "Esc close | Tab focus"].slice(0, Math.max(0, height - 2)))
				.slice(0, height).map((line) => truncateToWidth(line, width, "", true));
		}
		this.pageSize = Math.max(1, height - 8);
		const wide = width >= 58;
		const showCategories = wide || this.focus === "categories";
		const count = showCategories && !wide ? CONTROL_CENTER_CATEGORIES.length : rows.length;
		const selected = showCategories && !wide ? this.categoryIndex : this.rowIndex;
		const start = Math.max(0, Math.min(selected - Math.floor(this.pageSize / 2), count - this.pageSize));
		const categoryStart = Math.max(0, Math.min(this.categoryIndex - Math.floor(this.pageSize / 2), CONTROL_CENTER_CATEGORIES.length - this.pageSize));
		const list: string[] = [];
		const size = Math.min(this.pageSize, Math.max(wide ? CONTROL_CENTER_CATEGORIES.length : 0, count, 1));
		for (let index = 0; index < size; index++) {
			const row = rows[start + index];
			const prefix = this.focus === "detail" && start + index === this.rowIndex ? ">" : " ";
			const empty = available ? "No themes available" : "Not yet available";
			const detail = row
				? `${prefix} ${row.label}${row.current ? " (current)" : ""}`
				: index === 0 ? empty : "";
			const category = CONTROL_CENTER_CATEGORIES[categoryStart + index];
			const nav = category ? `${this.focus === "categories" && categoryStart + index === this.categoryIndex ? ">" : " "} ${category}` : "";
			if (wide) {
				const padded = `${nav}${" ".repeat(Math.max(0, 14 - visibleWidth(nav)))}`;
				list.push(`${theme.fg("accent", padded)}│ ${detail}`);
			} else list.push(showCategories ? nav : detail);
		}
		const focusedCount = this.focus === "categories" ? CONTROL_CENTER_CATEGORIES.length : rows.length;
		const focusedIndex = this.focus === "categories" ? this.categoryIndex : this.rowIndex;
		const position = `${this.focus}: ${focusedCount ? focusedIndex + 1 : 0}/${focusedCount}`;
		const lines = [summary, ...list,
			available ? "Saves globally; project settings can override at startup." : "Inline controls arrive in a later unit.",
			feedback || position,
			"Esc close · Tab/←/→ focus · ↑/↓ Home/End PgUp/PgDn · Enter select",
		];
		return doubleBorderBox(theme, width, `Osdy Control Center / ${this.category}`, lines)
			.slice(0, height).map((line) => truncateToWidth(line, width, "", true));
	}

	// Rendering reads the live theme; there are no cached ANSI strings to rebuild.
	invalidate(): void {}
	dispose(): void { this.disposed = true; }
}

export async function showControlCenter(ctx: ControlCenterContext): Promise<void> {
	if (!ctx.hasUI || ctx.mode !== "tui") {
		ctx.ui.notify("Osdy Control Center requires the interactive terminal UI; RPC, JSON and print modes are unsupported.", "warning");
		return;
	}
	let panel: ControlCenter | undefined;
	try {
		await ctx.ui.custom<void>((tui, _theme, _keybindings, done) => {
			panel = new ControlCenter({
				theme: () => ctx.ui.theme,
				readThemes: () => ctx.ui.getAllThemes(),
				applyTheme: (name) => ctx.ui.setTheme(name),
				requestRender: () => tui.requestRender(),
				height: () => Math.max(1, Math.floor(tui.terminal.rows * 0.92) - 2),
				close: () => done(),
			});
			return panel;
		}, { overlay: true, overlayOptions: { ...MODAL_OVERLAY_OPTIONS, minWidth: 1, width: "96%", margin: 0 } });
	} catch (error) {
		ctx.ui.notify(`Control Center unavailable: ${errorMessage(error)}`, "error");
	} finally {
		panel?.dispose();
	}
}

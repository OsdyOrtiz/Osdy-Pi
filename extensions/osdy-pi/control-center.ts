import type { ExtensionContext, Theme } from "@earendil-works/pi-coding-agent";
import { Input, Key, matchesKey, truncateToWidth, visibleWidth, wrapTextWithAnsi, type Component, type Focusable } from "@earendil-works/pi-tui";
import { doubleBorderBox, MODAL_OVERLAY_OPTIONS } from "./modal-frame.js";
import { preferenceDetail, visualPreferenceLabel } from "./control-center-preferences.js";
import type { ControlCenterPreferences, VisualPreferenceAction } from "./control-center-preferences.js";
import type { AudioNotificationEvent } from "./audio-notification-types.js";

export const CONTROL_CENTER_CATEGORIES = [
	"Theme", "Header", "Mascot", "Editor", "Git", "Sounds", "Account", "Usage",
] as const;
export type ControlCenterCategory = (typeof CONTROL_CENTER_CATEGORIES)[number];
export type ControlCenterServiceAction =
	| { kind: "git-enabled"; value: boolean }
	| { kind: "sound-set"; event: AudioNotificationEvent; path: string }
	| { kind: "sound-clear"; event: AudioNotificationEvent }
	| { kind: "sound-test"; event: AudioNotificationEvent };
export type ControlCenterAccountAction =
	| { kind: "account-switch"; profile: string }
	| { kind: "account-default"; profile: string | undefined };
export type ControlCenterUsageAction =
	| { kind: "usage-refresh" }
	| { kind: "usage-range"; range: "day" | "week" | "month" }
	| { kind: "usage-account"; current: boolean }
	| { kind: "usage-detail" };
export type ControlCenterAction = { kind: "theme"; name: string } | VisualPreferenceAction
	| ControlCenterServiceAction | ControlCenterAccountAction | ControlCenterUsageAction
	| { kind: "sound-configure"; event: AudioNotificationEvent; path: string };
type InlineServiceAction = ControlCenterServiceAction | ControlCenterAccountAction | ControlCenterUsageAction;
export interface ControlCenterDetail { summary: string; note: string; rows: ControlCenterRow[] }
export interface ControlCenterService<Action = ControlCenterServiceAction> {
	read(): Promise<ControlCenterDetail>;
	apply(action: Action): Promise<{ failed: boolean; message: string }>;
}
export interface ControlCenterRow {
	label: string;
	current: boolean;
	action: ControlCenterAction;
	details?: string[];
}
export interface ControlCenterDependencies {
	preferences?: ControlCenterPreferences | undefined;
	git?: ControlCenterService | undefined;
	sounds?: ControlCenterService | undefined;
	account?: ControlCenterService<ControlCenterAccountAction> | undefined;
	usage?: ControlCenterService<ControlCenterUsageAction> | undefined;
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
export class ControlCenter implements Component, Focusable {
	private readonly dependencies: ControlCenterDependencies;
	private categoryIndex = 0;
	private rowIndex = 0;
	private focus: "categories" | "detail" = "categories";
	private names: string[] = [];
	private feedback = "";
	private failed = false;
	private saving = false;
	private disposed = false;
	private pageSize = 1;
	private loading = false;
	private readGeneration = 0;
	private serviceView: ControlCenterDetail | undefined;
	private input: Input | undefined;
	private inputEvent: AudioNotificationEvent | undefined;
	private confirmation: { action: ControlCenterAccountAction; accept: boolean } | undefined;
	private lastWidth = 80;
	private hasFocus = false;
	get focused(): boolean { return this.hasFocus; }
	set focused(value: boolean) {
		this.hasFocus = value;
		if (this.input) this.input.focused = value;
	}

	private service(): Pick<ControlCenterService, "read"> | undefined {
		switch (this.category) {
			case "Git": return this.dependencies.git;
			case "Sounds": return this.dependencies.sounds;
			case "Account": return this.dependencies.account;
			case "Usage": return this.dependencies.usage;
			default: return undefined;
		}
	}

	private async loadService(): Promise<void> {
		const generation = ++this.readGeneration;
		const service = this.service();
		this.serviceView = undefined;
		this.loading = !!service;
		if (!service) return;
		try {
			const view = await service.read();
			if (this.disposed || generation !== this.readGeneration) return;
			this.serviceView = view;
			this.rowIndex = Math.max(0, view.rows.findIndex((row) => row.current));
		} catch (error) {
			if (this.disposed || generation !== this.readGeneration) return;
			this.failed = true;
			this.feedback = `Details unavailable: ${errorMessage(error)}. Reopen category to retry.`;
		} finally {
			if (!this.disposed && generation === this.readGeneration) {
				this.loading = false;
				this.dependencies.requestRender();
			}
		}
	}

	private applyService(action: InlineServiceAction) {
		if (action.kind === "account-switch" || action.kind === "account-default") return this.dependencies.account?.apply(action);
		if (action.kind === "usage-refresh" || action.kind === "usage-range" || action.kind === "usage-account" || action.kind === "usage-detail") return this.dependencies.usage?.apply(action);
		return (this.category === "Git" ? this.dependencies.git : this.dependencies.sounds)?.apply(action);
	}

	private async activateService(action: InlineServiceAction): Promise<void> {
		const service = this.service();
		if (!service) return;
		const category = this.category;
		const actionGeneration = this.readGeneration;
		this.saving = true;
		this.failed = false;
		this.feedback = category === "Usage" ? "Refreshing usage / read-only view..."
			: category === "Account" ? "Applying confirmed account action..."
			: action.kind === "sound-test" ? "Testing effective sound..." : "Saving globally...";
		try {
			const result = await this.applyService(action);
			if (!result) return;
			if (this.disposed || actionGeneration !== this.readGeneration) return;
			this.failed = result.failed;
			this.feedback = result.message;
			if (category === this.category) {
				const generation = this.readGeneration;
				try {
					const view = await service.read();
					if (!this.disposed && generation === this.readGeneration) {
						this.serviceView = view;
						this.rowIndex = Math.min(this.rowIndex, Math.max(0, view.rows.length - 1));
					}
				} catch (error) {
					if (!this.disposed && generation === this.readGeneration) {
						this.failed = true;
						this.feedback = `${result.message} Details refresh failed: ${errorMessage(error)}`;
					}
				}
			}
		} catch (error) {
			if (this.disposed || actionGeneration !== this.readGeneration) return;
			this.failed = true;
			this.feedback = `Action failed: ${errorMessage(error)}. Persistence not confirmed.`;
		} finally {
			if (!this.disposed) {
				this.saving = false;
				this.dependencies.requestRender();
			}
		}
	}

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
		if (this.category !== "Theme") return this.preferenceView()?.rows ?? [];
		const current = this.dependencies.theme().name;
		return this.names.map((name) => ({
			label: name,
			current: name === current,
			action: { kind: "theme", name },
		}));
	}

	private preferenceView() {
		if (this.service()) return this.serviceView ?? { summary: this.loading ? "Loading details..." : "Details unavailable", note: "Opening categories never applies actions.", rows: [] };
		const preferences = this.dependencies.preferences;
		return preferences ? preferenceDetail(this.category, preferences.snapshot()) : undefined;
	}

	private async activatePreference(action: VisualPreferenceAction): Promise<void> {
		const preferences = this.dependencies.preferences;
		if (!preferences) return;
		this.saving = true;
		this.failed = false;
		const label = visualPreferenceLabel(action);
		this.feedback = `Saving globally: ${label}...`;
		try {
			const saved = await preferences.apply(action);
			if (this.disposed) return;
			this.failed = !saved;
			this.feedback = saved ? `Saved globally: ${label}` : `Applied live: ${label}, but could not be saved. Retry to persist.`;
		} catch (error) {
			if (this.disposed) return;
			this.failed = true;
			this.feedback = `Preference failed: ${errorMessage(error)}. Not saved.`;
		} finally {
			if (!this.disposed) {
				this.saving = false;
				this.dependencies.requestRender();
			}
		}
	}

	private activate(action: ControlCenterAction): void {
		if (this.saving || this.loading) return;
		if (action.kind === "account-switch" || action.kind === "account-default") {
			this.confirmation = { action, accept: false };
			return;
		}
		if (action.kind === "sound-configure") {
			this.inputEvent = action.event;
			this.input = new Input({ prompt: "Path: ", placeholder: "/absolute/path/sound.mp3 or .wav" });
			this.input.setValue(action.path);
			this.input.focused = this.focused;
			this.input.onEscape = () => { this.input = undefined; this.inputEvent = undefined; };
			this.input.onSubmit = (path) => {
				this.input = undefined;
				this.inputEvent = undefined;
				void this.activateService({ kind: "sound-set", event: action.event, path });
			};
			return;
		}
		if (action.kind === "git-enabled" || action.kind === "sound-set" || action.kind === "sound-clear" || action.kind === "sound-test" || action.kind === "usage-refresh" || action.kind === "usage-range" || action.kind === "usage-account" || action.kind === "usage-detail") {
			void this.activateService(action);
			return;
		}
		if (action.kind !== "theme") {
			void this.activatePreference(action);
			return;
		}
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

	private confirmationLines(): string[] {
		const pending = this.confirmation;
		if (!pending) return [];
		const action = pending.action;
		const operation = action.kind === "account-switch" ? `Switch to ${action.profile}?` : `Set default: ${action.profile ?? "none"}?`;
		return [...wrapTextWithAnsi(operation, Math.max(1, this.lastWidth - 2)),
			`${pending.accept ? " " : ">"} Cancel`, `${pending.accept ? ">" : " "} Confirm`, "↑/↓ choose · Enter select · Esc cancel"];
	}

	private confirmationFits(): boolean {
		return this.lastWidth >= 11 && this.dependencies.height() >= this.confirmationLines().length + 2;
	}

	handleInput(data: string): void {
		if (this.disposed) return;
		if (this.confirmation) {
			const pending = this.confirmation;
			if (matchesKey(data, Key.escape)) this.confirmation = undefined;
			else if (matchesKey(data, Key.up) || matchesKey(data, Key.down) || matchesKey(data, Key.tab)) pending.accept = !pending.accept;
			else if (matchesKey(data, Key.enter)) {
				if (!pending.accept || this.confirmationFits()) {
					this.confirmation = undefined;
					if (pending.accept) void this.activateService(pending.action);
				}
			}
			this.dependencies.requestRender();
			return;
		}
		if (this.input) {
			this.input.handleInput(data);
			this.dependencies.requestRender();
			return;
		}
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
			if (this.focus === "categories") {
				if (this.categoryIndex !== index) {
					this.categoryIndex = index;
					this.rowIndex = Math.max(0, this.rows().findIndex((row) => row.current));
					this.feedback = "";
					void this.loadService();
				}
			} else this.rowIndex = index;
		}
		this.dependencies.requestRender();
	}

	render(width: number): string[] {
		this.lastWidth = width;
		if (width <= 0 || this.disposed) return [];
		const height = Math.max(0, Math.floor(this.dependencies.height()));
		if (height === 0) return [];
		const theme = this.dependencies.theme();
		if (this.confirmation) {
			return doubleBorderBox(theme, width, "Confirm account action",
				this.confirmationFits() ? this.confirmationLines() : ["Resize to confirm; Esc cancels."])
				.slice(0, height).map(line => truncateToWidth(line, width, "", true));
		}
		if (this.input) {
			return doubleBorderBox(theme, width, `Sound path / ${this.inputEvent ?? ""}`,
				[...this.input.render(Math.max(1, width - 2)), ".mp3/.wav · Enter save now · Esc cancel"])
				.slice(0, height).map((line) => truncateToWidth(line, width, "", true));
		}
		const rows = this.rows();
		const preference = this.preferenceView();
		const available = this.category === "Theme" || preference !== undefined;
		const summary = this.category === "Theme"
			? `Current: ${theme.name ?? "unnamed"} | Appearance: ${theme.appearance}`
			: preference?.summary ?? `${this.category}: not yet available`;
		const feedback = this.feedback ? theme.fg(this.failed ? "error" : this.saving ? "muted" : "success", this.feedback) : "";
		if (height < 7) {
			return doubleBorderBox(theme, width, `Osdy / ${this.category}`, [feedback || summary, "Esc close | Tab focus"].slice(0, Math.max(0, height - 2)))
				.slice(0, height).map((line) => truncateToWidth(line, width, "", true));
		}
		const details = this.focus === "detail" ? rows[this.rowIndex]?.details ?? [] : [];
		this.pageSize = Math.max(1, height - 8 - details.length);
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
			const empty = this.loading ? "Loading..." : this.category === "Theme" ? "No themes available" : available ? "No controls available" : "Not yet available";
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
		const lines = [summary, ...details, ...list,
			preference?.note ?? (available ? "Saves globally; project settings can override at startup." : "Inline controls arrive in a later unit."),
			feedback || position,
			"Esc close · Tab/←/→ focus · ↑/↓ Home/End PgUp/PgDn · Enter select",
		];
		return doubleBorderBox(theme, width, `Osdy Control Center / ${this.category}`, lines)
			.slice(0, height).map((line) => truncateToWidth(line, width, "", true));
	}

	// Rendering reads the live theme; there are no cached ANSI strings to rebuild.
	invalidate(): void {}
	dispose(): void {
		if (this.disposed) return;
		this.disposed = true;
	}
}

export async function showControlCenter(ctx: ControlCenterContext, preferences?: ControlCenterPreferences,
	services?: Pick<ControlCenterDependencies, "git" | "sounds" | "account" | "usage">): Promise<void> {
	if (!ctx.hasUI || ctx.mode !== "tui") {
		ctx.ui.notify("Osdy Control Center requires the interactive terminal UI; RPC, JSON and print modes are unsupported.", "warning");
		return;
	}
	let panel: ControlCenter | undefined;
	try {
		await ctx.ui.custom<void>((tui, _theme, _keybindings, done) => {
			panel = new ControlCenter({
				preferences,
				...services,
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

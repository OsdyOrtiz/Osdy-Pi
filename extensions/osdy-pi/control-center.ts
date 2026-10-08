import type { ExtensionContext, Theme } from "@earendil-works/pi-coding-agent";
import { Input, Key, matchesKey, truncateToWidth, visibleWidth, wrapTextWithAnsi, type Component, type Focusable } from "@earendil-works/pi-tui";
import { doubleBorderBox, MODAL_OVERLAY_OPTIONS } from "./modal-frame.js";
import { preferenceDetail, visualPreferenceLabel } from "./control-center-preferences.js";
import type { ControlCenterPreferences, VisualPreferenceAction } from "./control-center-preferences.js";
import type { CodexResetAction } from "./codex-reset-ui.js";
import type { ControlCenterTodoAction, ControlCenterTodoService } from "./control-center-todo.js";
import type { ControlCenterAgentsAction, ControlCenterAgentsService } from "./control-center-agents.js";
import type { AudioNotificationEvent } from "./audio-notification-types.js";
import type { CodexUsageSnapshot, CodexUsageWindow } from "./codex-usage.js";
import { renderCodexUsageDashboardContentLines, renderControlCenterQuotaWindow } from "./codex-usage-ui.js";

export const CONTROL_CENTER_CATEGORIES = [
	"Theme", "Header", "Mascot", "Editor", "Git", "Sounds", "Account", "Usage", "TODO", "Agents",
] as const;
export type ControlCenterCategory = (typeof CONTROL_CENTER_CATEGORIES)[number];
export type ControlCenterServiceAction =
	| { kind: "git-enabled"; value: boolean }
	| { kind: "sound-enabled"; value: boolean }
	| { kind: "sound-set"; event: AudioNotificationEvent; path: string }
	| { kind: "sound-clear"; event: AudioNotificationEvent }
	| { kind: "sound-test"; event: AudioNotificationEvent };
export type ControlCenterAccountAction =
	| { kind: "account-usage"; profile: string }
	| { kind: "account-switch"; profile: string }
	| { kind: "account-default"; profile: string | undefined };
export type ControlCenterUsageAction =
	| { kind: "usage-reset" }
	| { kind: "usage-refresh" }
	| { kind: "usage-range"; range: "day" | "week" | "month" }
	| { kind: "usage-account"; current: boolean }
	| { kind: "usage-detail" };
export type ControlCenterAction = { kind: "theme"; name: string } | VisualPreferenceAction
	| ControlCenterServiceAction | ControlCenterAccountAction | ControlCenterUsageAction | ControlCenterTodoAction | ControlCenterAgentsAction
	| { kind: "sound-configure"; event: AudioNotificationEvent; path: string }
	| { kind: "account-select"; profile: string }
	| { kind: "account-back" };
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
	actions?: ControlCenterRow[];
	group?: string;
	quota?: CodexUsageWindow;
	quotaName?: "Session" | "Weekly";
}
export type ControlCenterResult = { kind: "closed" } | { kind: "reload" } | { kind: "codex-reset" };
export type ProviderApplyResult = { kind: "reload"; message: string } | { kind: "rejected"; message: string };
export interface ControlCenterDependencies {
	preferences?: ControlCenterPreferences | undefined;
	git?: ControlCenterService | undefined;
	sounds?: ControlCenterService | undefined;
	account?: (ControlCenterService<ControlCenterAccountAction> & { cancelUsage?(): void; isCurrent?(): boolean; quotaDetails?(profile: string): string[]; quotaSnapshot?(profile: string): CodexUsageSnapshot | undefined }) | undefined;
	usage?: (ControlCenterService<ControlCenterUsageAction> & { useReset?: CodexResetAction | undefined }) | undefined;
	todo?: ControlCenterTodoService | undefined;
	agents?: ControlCenterAgentsService | undefined;
	reload?: (result: { kind: "reload" }) => void;
	external?: (result: { kind: "codex-reset" }) => void;
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

function accountActionKey(action: ControlCenterAction): "v" | "s" | "d" | "c" | undefined {
	switch (action.kind) {
		case "account-usage": return "v";
		case "account-switch": return "s";
		case "account-default": return action.profile === undefined ? "c" : "d";
		default: return undefined;
	}
}

function accountActionHint(action: ControlCenterAction, width: number): string {
	const key = accountActionKey(action);
	if (!key) return "";
	if (width < 30) return key;
	const labels = width < 70
		? { v: "Usage", s: "Switch", d: "Default", c: "Clear" }
		: { v: "View usage", s: "Switch", d: "Set default", c: "Clear default" };
	return `${key} ${labels[key]}`;
}

function agentActionKey(action: ControlCenterAction): "g" | "j" | undefined {
	return action.kind === "agents-provider" ? action.mode === "gentle" ? "g" : "j" : undefined;
}

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
	private expandedHelp = false;
	private themeRowIndex = 0;
	private selectedAgent: ControlCenterAgentsAction["mode"] | undefined;
	private loading = false;
	private readGeneration = 0;
	private serviceView: ControlCenterDetail | undefined;
	private input: Input | undefined;
	private inputEvent: AudioNotificationEvent | undefined;
	private confirmation: { action: ControlCenterAccountAction | ControlCenterTodoAction | ControlCenterAgentsAction; accept: boolean; details: string[] } | undefined;
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
			case "TODO": return this.dependencies.todo;
			case "Agents": return this.dependencies.agents;
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
			if (this.category === "Agents") {
				const selected = view.rows.findIndex(row => row.action.kind === "agents-provider" && row.action.mode === this.selectedAgent);
				if (selected >= 0) this.rowIndex = selected;
			}
			if (this.category === "Account") {
				const selected = view.rows.findIndex(row => row.action.kind === "account-select" && row.action.profile === this.selectedProfile);
				if (selected >= 0) this.rowIndex = selected;
				const action = view.rows[this.rowIndex]?.action;
				this.selectedProfile = action?.kind === "account-select" ? action.profile : undefined;
			}
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
		if (action.kind === "usage-reset") return undefined;
		if (action.kind === "account-usage" || action.kind === "account-switch" || action.kind === "account-default") return this.dependencies.account?.apply(action);
		if (action.kind === "usage-refresh" || action.kind === "usage-range" || action.kind === "usage-account" || action.kind === "usage-detail") return this.dependencies.usage?.apply(action);
		return (this.category === "Git" ? this.dependencies.git : this.dependencies.sounds)?.apply(action);
	}

	private selectedProfile: string | undefined;
	private accountView: { kind: "overview" } | { kind: "quota"; profile: string } = { kind: "overview" };
	private overviewRow = 0;
	private quotaScroll = 0;
	private quotaPageSize = 1;
	private quotaLineCount = 0;
	private leaveQuota(): void {
		this.dependencies.account?.cancelUsage?.();
		this.readGeneration++;
		this.queryingUsage = false;
		this.accountView = { kind: "overview" };
		this.rowIndex = this.overviewRow;
		this.feedback = "";
		this.failed = false;
	}
	private queryingUsage = false;
	private async previewUsage(action: Extract<ControlCenterAccountAction, { kind: "account-usage" }>): Promise<void> {
		if (this.accountView.kind !== "quota") this.overviewRow = this.rowIndex;
		this.accountView = { kind: "quota", profile: action.profile };
		this.rowIndex = 0;
		this.quotaScroll = 0;
		const generation = this.readGeneration;
		this.queryingUsage = true;
		this.failed = false;
		this.feedback = `Querying stored-profile Codex usage: ${action.profile}...`;
		try {
			const result = await this.dependencies.account?.apply(action);
			if (this.disposed || generation !== this.readGeneration || this.dependencies.account?.isCurrent?.() === false) return;
			this.failed = result?.failed ?? true;
			this.feedback = result?.message ?? "Profile usage unavailable.";

		} catch {
			if (!this.disposed && generation === this.readGeneration && this.dependencies.account?.isCurrent?.() !== false) { this.failed = true; this.feedback = "Profile usage unavailable."; }
		} finally {
			if (!this.disposed && generation === this.readGeneration && this.dependencies.account?.isCurrent?.() !== false) { this.queryingUsage = false; this.dependencies.requestRender(); }
		}
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
						this.rowIndex = category === "Account"
							? Math.max(0, view.rows.findIndex(row => row.action.kind === "account-select" && row.action.profile === this.selectedProfile))
							: Math.min(this.rowIndex, Math.max(0, view.rows.length - 1));
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
			this.themeRowIndex = this.rowIndex;
		} catch (error) {
			this.failed = true;
			this.feedback = `Themes unavailable: ${errorMessage(error)}`;
		}
	}

	private get category(): ControlCenterCategory {
		return CONTROL_CENTER_CATEGORIES[this.categoryIndex] ?? "Theme";
	}

	private rows(): ControlCenterRow[] {
		if (this.category === "Account" && this.accountView.kind === "quota") return [
			{ label: "Refresh", current: false, action: { kind: "account-usage", profile: this.accountView.profile } },
			{ label: "Back", current: false, action: { kind: "account-back" } },
		];
		if (this.category !== "Theme") return this.preferenceView()?.rows ?? [];
		const current = this.dependencies.theme().name;
		return this.names.map((name) => ({
			label: name,
			current: name === current,
			action: { kind: "theme", name },
		}));
	}

	private quotaSwitch(): ControlCenterRow | undefined {
		if (this.accountView.kind !== "quota" || this.saving || this.loading || this.queryingUsage
			|| this.dependencies.account?.isCurrent?.() === false) return undefined;
		const profile = this.accountView.profile;
		// Reuse the projection for the viewed identity, never the quota action row or active auth.
		return this.serviceView?.rows.find(row => row.action.kind === "account-select" && row.action.profile === profile)
			?.actions?.find(row => row.action.kind === "account-switch" && row.action.profile === profile);
	}

	private agentBindings(): { key: "g" | "j"; row: ControlCenterRow }[] {
		if (this.category !== "Agents") return [];
		const rows = this.rows();
		return (["g", "j"] as const).flatMap(key => {
			const matches = rows.filter(row => agentActionKey(row.action) === key);
			// An ambiguous projection gets no letter; Enter remains the explicit fallback.
			return matches.length === 1 ? [{ key, row: matches[0]! }] : [];
		});
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

	private async activateProvider(action: ControlCenterTodoAction | ControlCenterAgentsAction): Promise<void> {
		const label = action.kind === "todo-provider" ? "TODO" : "Agents";
		const service = action.kind === "todo-provider" ? this.dependencies.todo : this.dependencies.agents;
		if (!service || !this.dependencies.reload) return;
		this.saving = true;
		this.feedback = `Saving confirmed ${label} selection...`;
		try {
			const result = action.kind === "todo-provider"
				? await this.dependencies.todo!.apply(action)
				: await this.dependencies.agents!.apply(action);
			if (this.disposed) return;
			if (result.kind === "reload") {
				// done owns overlay removal; showControlCenter finally owns disposal.
				this.dependencies.reload({ kind: "reload" });
				return;
			}
			this.failed = true;
			this.feedback = result.message;
		} catch (error) {
			if (this.disposed) return;
			this.failed = true;
			this.feedback = `${label} selection failed: ${errorMessage(error)}. Reload not requested.`;
		}
		if (!this.disposed) {
			this.saving = false;
			this.dependencies.requestRender();
		}
	}

	private activate(action: ControlCenterAction, details?: string[]): void {
		if (action.kind === "account-back") { this.leaveQuota(); return; }
		if (this.saving || this.loading || this.queryingUsage) return;
		if (action.kind === "usage-reset") {
			if (this.category === "Usage" && this.dependencies.usage?.useReset && this.dependencies.external) {
				this.dispose();
				this.dependencies.external({ kind: "codex-reset" });
			}
			return; // The workflow owns selection/confirmation AFTER custom disposal.
		}
		if (action.kind === "account-select") {
			this.dependencies.account?.cancelUsage?.();
			this.selectedProfile = action.profile;
			this.feedback = "";
			void this.previewUsage({ kind: "account-usage", profile: action.profile });
			return;
		}
		if (action.kind === "account-usage") { void this.previewUsage(action); return; }
		if (action.kind === "account-switch" || action.kind === "account-default" || action.kind === "todo-provider" || action.kind === "agents-provider") {
			this.confirmation = { action, accept: false, details: details ?? this.rows()[this.rowIndex]?.details ?? [] };
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
		if (action.kind === "git-enabled" || action.kind === "sound-enabled" || action.kind === "sound-set" || action.kind === "sound-clear" || action.kind === "sound-test" || action.kind === "usage-refresh" || action.kind === "usage-range" || action.kind === "usage-account" || action.kind === "usage-detail") {
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
		const operation = action.kind === "todo-provider" ? `Turn Osdy TODO ${action.mode}?`
			: action.kind === "agents-provider" ? `Select ${action.mode === "joker" ? "Joker" : "Gentle"} agents?`
			: action.kind === "account-switch" ? `Switch to ${action.profile}?` : `Set default: ${action.profile ?? "none"}?`;
		const contentWidth = Math.max(1, this.lastWidth - 2);
		const content = [operation, ...pending.details].flatMap(line => wrapTextWithAnsi(line, contentWidth));
		const choices = [`${pending.accept ? " " : ">"} Cancel`, `${pending.accept ? ">" : " "} Confirm`]
			.flatMap(line => wrapTextWithAnsi(line, contentWidth));
		const instructions = wrapTextWithAnsi("↑/↓ choose · Enter select · Esc cancel", contentWidth);
		// Budget the actual composed lines; whitespace yields, never safety text or controls.
		const gap = this.dependencies.height() >= content.length + choices.length + instructions.length + 5 ? [""] : [];
		return [...gap, ...content, ...gap, ...choices, ...gap, ...instructions];
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
					if (pending.accept) {
						if (pending.action.kind === "todo-provider" || pending.action.kind === "agents-provider") void this.activateProvider(pending.action);
						else void this.activateService(pending.action);
					}
				}
			}
			this.dependencies.requestRender();
			return;
		}
		if (this.saving && (this.category === "TODO" || this.category === "Agents")) return;
		if (this.input) {
			this.input.handleInput(data);
			this.dependencies.requestRender();
			return;
		}
		if (data === "?") {
			if (!this.saving && !this.loading && !this.queryingUsage) {
				this.expandedHelp = !this.expandedHelp;
				this.dependencies.requestRender();
			}
			return;
		}
		if (matchesKey(data, Key.escape)) {
			if (this.category === "Account" && this.accountView.kind === "quota") {
				this.leaveQuota(); this.dependencies.requestRender(); return;
			}
			this.dispose();
			this.dependencies.close();
			return;
		}
		if (this.category === "Account" && this.accountView.kind === "quota" && this.focus === "detail"
			&& (matchesKey(data, Key.pageUp) || matchesKey(data, Key.pageDown) || matchesKey(data, Key.home) || matchesKey(data, Key.end))) {
			this.quotaPageSize = this.quotaCapacity();
			this.quotaLineCount = this.quotaLines(this.accountView.profile, this.lastWidth).length;
			const max = Math.max(0, this.quotaLineCount - this.quotaPageSize);
			this.quotaScroll = matchesKey(data, Key.home) ? 0 : matchesKey(data, Key.end) ? max
				: Math.max(0, Math.min(max, this.quotaScroll + (matchesKey(data, Key.pageDown) ? this.quotaPageSize : -this.quotaPageSize)));
			this.dependencies.requestRender(); return;
		}
		if (this.category === "Account" && this.focus === "detail") {
			if (this.accountView.kind === "quota" && matchesKey(data, "b") && !this.saving && !this.loading) {
				this.leaveQuota(); this.dependencies.requestRender(); return;
			}
			if ((["v", "s", "d", "c", "r"] as const).some(key => matchesKey(data, key))) {
				if (!this.saving && !this.loading && !this.queryingUsage) {
					if (this.accountView.kind === "quota") {
						if (matchesKey(data, "r")) this.activate({ kind: "account-usage", profile: this.accountView.profile });
						else if (matchesKey(data, "s")) {
							const row = this.quotaSwitch();
							if (row) this.activate(row.action, row.details ?? []);
						}
					} else {
						const selected = this.rows()[this.rowIndex];
						const action = selected?.actions?.find(row => {
							const key = accountActionKey(row.action);
							return key !== undefined && matchesKey(data, key);
						});
						if (action) this.activate(action.action, action.details ?? []);
					}
				}
				this.dependencies.requestRender(); return;
			}
		}
		if (this.category === "Agents" && this.focus === "detail" && (matchesKey(data, "g") || matchesKey(data, "j"))) {
			// Direct letters are lowercase-only, as displayed; modified/uppercase input is not accepted.
			if (!this.saving && !this.loading && !this.queryingUsage) {
				const binding = this.agentBindings().find(candidate => matchesKey(data, candidate.key));
				if (binding) {
					this.rowIndex = this.rows().indexOf(binding.row);
					this.activate(binding.row.action, binding.row.details ?? []);
				}
			}
			this.dependencies.requestRender(); return;
		}
		// Recompute before navigation too: resize may precede the next render.
		this.pageSize = this.optionCapacity(this.lastWidth);
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
						if (this.category === "Theme") this.themeRowIndex = this.rowIndex;
						if (this.category === "Agents") {
							const action = this.rows()[this.rowIndex]?.action;
							this.selectedAgent = action?.kind === "agents-provider" ? action.mode : undefined;
						}
						if (this.category === "Account") this.leaveQuota();
					this.queryingUsage = false;
					this.categoryIndex = index;
					this.rowIndex = this.category === "Theme" ? this.themeRowIndex
						: Math.max(0, this.rows().findIndex((row) => row.current));
					this.feedback = "";
					void this.loadService();
				}
			} else {
				this.rowIndex = index;
				const action = this.rows()[index]?.action;
				if (action?.kind === "account-select" && action.profile !== this.selectedProfile) {
					this.dependencies.account?.cancelUsage?.();
					this.selectedProfile = action.profile;
					this.feedback = "";
				}
			}
		}
		this.dependencies.requestRender();
	}

	private helpLines(width: number): string[] {
		const row = this.rows()[this.rowIndex];
		const note = this.preferenceView()?.note ?? (this.category === "Theme"
			? "Saves globally; project settings can override at startup." : "No inline controls available.");
		const details = row?.details ?? [];
		const brief = row?.action.kind === "agents-provider"
			? `Select ${row.action.mode === "joker" ? "Joker" : "Gentle"}; confirm effects before saving.`
			: details[0]?.split(/(?<=[.!?])\s/)[0] ?? (this.category === "Theme"
			? "Apply selected theme live and save globally." : row ? `Enter selects ${row.label}.` : note);
		if (!this.expandedHelp) return [`Help: ${truncateToWidth(brief, Math.max(1, width - 8), "…")}`];
		const budget = Math.max(1, Math.min(6, Math.floor((this.dependencies.height() - 6) / 2)));
		const lines = [`Help: ${details.length ? details[0] : brief}`, ...details.slice(1), `Note: ${note}`]
			.flatMap(line => wrapTextWithAnsi(line, Math.max(1, width - 2)));
		return lines.length <= budget ? lines : [...lines.slice(0, budget - 1), "Help: resize for more details."];
	}

	private quotaCapacity(): number {
		const height = Math.max(0, Math.floor(this.dependencies.height()));
		return Math.max(1, height - 5 - (height >= 7 ? 1 : 0) - (height >= 12 ? 3 : 0));
	}

	private quotaLines(profile: string, width: number): string[] {
		const details = this.queryingUsage ? ["Checked: pending", "Loading stored-profile Codex quota..."]
			: (this.dependencies.account?.quotaDetails?.(profile) ?? ["Checked: unknown", "Profile usage unavailable."])
				.filter(line => line !== `Profile: ${profile}`);
		const snapshot = !this.queryingUsage ? this.dependencies.account?.quotaSnapshot?.(profile) : undefined;
		const contentWidth = Math.max(1, width - 2);
		const quota = snapshot ? renderCodexUsageDashboardContentLines(this.dependencies.theme(), snapshot,
			{ profile }, Date.now(), contentWidth) : [];
		const metadata = snapshot ? [...details.filter(line => line.startsWith("Checked:")),
			`Updated: ${new Date(snapshot.fetchedAt).toLocaleString()} (local time)`] : details;
		return [...metadata, ...quota].flatMap(line => wrapTextWithAnsi(line, contentWidth));
	}

	private sectionGaps(width: number): boolean {
		// Optional whitespace yields before options/help/status/controls do.
		return Math.floor(this.dependencies.height()) >= 12 + this.helpLines(width).length;
	}

	private optionCapacity(width: number): number {
		const capacity = Math.max(1, Math.floor(this.dependencies.height()) - 5 - this.helpLines(width).length - (this.sectionGaps(width) ? 5 : 0));
		return this.category === "Theme" ? Math.min(8, capacity) : capacity;
	}

	render(width: number): string[] {
		this.lastWidth = width;
		if (width <= 0 || this.disposed) return [];
		const height = Math.max(0, Math.floor(this.dependencies.height()));
		if (height === 0) return [];
		const theme = this.dependencies.theme();
		if (this.confirmation) {
			return doubleBorderBox(theme, width, this.confirmation.action.kind === "todo-provider" ? "Confirm TODO selection"
				: this.confirmation.action.kind === "agents-provider" ? "Confirm Agents selection" : "Confirm account action",
				this.confirmationFits() ? this.confirmationLines() : ["Resize to confirm; Esc cancels."])
				.slice(0, height).map(line => truncateToWidth(line, width, "", true));
		}
		if (this.input) {
			return doubleBorderBox(theme, width, `Sound path / ${this.inputEvent ?? ""}`,
				[...this.input.render(Math.max(1, width - 2)), ".mp3/.wav · Enter save now · Esc cancel"])
				.slice(0, height).map((line) => truncateToWidth(line, width, "", true));
		}
		if (this.category === "Account" && this.accountView.kind === "quota" && this.focus === "detail") {
			const profile = this.accountView.profile;
			const lines = this.quotaLines(profile, width);
			const gaps = height >= 12;
			const showHints = height >= 7;
			this.quotaPageSize = this.quotaCapacity();
			this.quotaLineCount = lines.length;
			this.quotaScroll = Math.min(this.quotaScroll, Math.max(0, lines.length - this.quotaPageSize));
			const switchHint = this.quotaSwitch() ? " · [s] Switch" : "";
			const controls = width < 30 ? `r Refresh · b Back${switchHint} · Esc`
				: `${this.rowIndex === 0 ? ">" : " "} r Refresh · ${this.rowIndex === 1 ? ">" : " "} b Back${switchHint} · Esc back`;
			const feedback = theme.fg(this.failed ? "error" : this.queryingUsage ? "muted" : "success", this.feedback);
			const gap = gaps ? [""] : [];
			const body = height < 6 ? [controls, feedback, `Profile: ${profile}`, ...lines] : [`Profile: ${profile}`, ...gap,
				...lines.slice(this.quotaScroll, this.quotaScroll + this.quotaPageSize), ...gap, feedback, ...gap, controls,
				...(showHints ? ["↑/↓ action · Enter select · PgUp/PgDn Home/End scroll · Tab/← categories"] : [])];
			return doubleBorderBox(theme, width, "Account / Codex quota", body.slice(0, Math.max(0, height - 2)))
				.slice(0, height).map(line => truncateToWidth(line, width, "", true));
		}
		const rows = this.rows();
		const preference = this.preferenceView();
		const available = this.category === "Theme" || preference !== undefined;
		const summary = this.category === "Theme"
			? `Current: ${theme.name ?? "unnamed"} | Appearance: ${theme.appearance}`
			: preference?.summary ?? `${this.category}: not yet available`;
		const feedback = this.feedback ? theme.fg(this.failed ? "error" : this.saving ? "muted" : "success", this.feedback) : "";
		const help = this.helpLines(width);
		this.pageSize = this.optionCapacity(width);
		const page = this.category === "Theme"
			? `Page ${rows.length ? Math.floor(this.rowIndex / this.pageSize) + 1 : 0}/${Math.ceil(rows.length / this.pageSize)}` : "";
		const accountActions = this.category === "Account" && this.accountView.kind === "overview"
			? this.rows()[this.rowIndex]?.actions ?? [] : [];
		const accountHints = accountActions.map(row => accountActionHint(row.action, width)).filter(Boolean).join(" · ");
		const agentBindings = this.agentBindings();
		const agentHints = this.focus === "detail" && agentBindings.length
			? `${agentBindings.map(({ key }) => width < 30 ? key : `${key} ${key === "g" ? "Gentle" : "Joker"}`).join(" · ")} · Enter ? Esc${width >= 58 ? " · Tab/←/→ focus · ↑/↓" : ""}` : "";
		const hints = agentHints || accountHints || (width < 30 ? "Enter ? Esc Tab ↑↓"
			: width < 58 ? "Enter select · ? help · Esc close · Tab focus"
			: "Enter select · ? help · Esc close · Tab/←/→ focus · ↑/↓ PgUp/PgDn Home/End");
		if (height < 7) {
			const selected = this.focus === "categories" ? this.category : rows[this.rowIndex]?.label ?? "No themes available";
			const compact = [`> ${selected} · ${feedback || summary}`, `${hints}${page ? ` · ${page}` : ""}`];
			return doubleBorderBox(theme, width, `Osdy / ${this.category}`, compact.slice(0, Math.max(0, height - 2)))
				.slice(0, height).map((line) => truncateToWidth(line, width, "", true));
		}
		const wide = width >= 58;
		const showCategories = wide || this.focus === "categories";
		const count = showCategories && !wide ? CONTROL_CENTER_CATEGORIES.length : rows.length;
		const selected = showCategories && !wide ? this.categoryIndex : this.rowIndex;
		const start = this.category === "Theme" && (wide || !showCategories)
			? Math.floor(this.rowIndex / this.pageSize) * this.pageSize
			: Math.max(0, Math.min(selected - Math.floor(this.pageSize / 2), count - this.pageSize));
		const categoryStart = Math.max(0, Math.min(this.categoryIndex - Math.floor(this.pageSize / 2), CONTROL_CENTER_CATEGORIES.length - this.pageSize));
		const list: string[] = [];
		const size = Math.min(this.pageSize, Math.max(wide ? CONTROL_CENTER_CATEGORIES.length : 0, count, 1));
		for (let index = 0; index < size; index++) {
			const row = rows[start + index];
			const prefix = this.focus === "detail" && start + index === this.rowIndex ? ">" : " ";
			const empty = this.loading ? "Loading..." : this.category === "Theme" ? "No themes available" : available ? "No controls available" : "Not yet available";
			const label = row?.quota
				? `Quota / ${renderControlCenterQuotaWindow(theme, row.quota, Math.max(1, width - (wide ? 28 : 12)), row.quotaName)[0]}`
				: row?.label;
			const agentKey = agentBindings.find(binding => binding.row === row)?.key;
			const detail = row
				? `${prefix} ${agentKey ? `[${agentKey}] ` : ""}${label}${row.current ? " (current)" : ""}`
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
		const group = rows[this.rowIndex]?.group;
		const gap = this.sectionGaps(width) ? [""] : [];
		const lines = [...gap, group ? `${summary} · ${group}` : summary, ...gap, ...list, ...gap, ...help, ...gap,
			[page, feedback || position].filter(Boolean).join(" · "), ...gap, hints,
		];
		return doubleBorderBox(theme, width, `Osdy Control Center / ${this.category}`, lines)
			.slice(0, height).map((line) => truncateToWidth(line, width, "", true));
	}

	// Rendering reads the live theme; there are no cached ANSI strings to rebuild.
	invalidate(): void {}
	dispose(): void {
		if (this.disposed) return;
		this.disposed = true;
		this.dependencies.account?.cancelUsage?.();
	}
}

export async function showControlCenter(ctx: ControlCenterContext, preferences?: ControlCenterPreferences,
	services?: Pick<ControlCenterDependencies, "git" | "sounds" | "account" | "usage" | "todo" | "agents">): Promise<ControlCenterResult> {
	if (!ctx.hasUI || ctx.mode !== "tui") {
		ctx.ui.notify("Osdy Control Center requires the interactive terminal UI; RPC, JSON and print modes are unsupported.", "warning");
		return { kind: "closed" };
	}
	let panel: ControlCenter | undefined;
	try {
		return await ctx.ui.custom<ControlCenterResult>((tui, _theme, _keybindings, done) => {
			panel = new ControlCenter({
				preferences,
				...services,
				theme: () => ctx.ui.theme,
				readThemes: () => ctx.ui.getAllThemes(),
				applyTheme: (name) => ctx.ui.setTheme(name),
				requestRender: () => tui.requestRender(),
				height: () => Math.max(1, Math.floor(tui.terminal.rows * 0.92) - 2),
				close: () => done({ kind: "closed" }),
				reload: result => done(result),
				external: result => done(result),
			});
			return panel;
		}, { overlay: true, overlayOptions: { ...MODAL_OVERLAY_OPTIONS, minWidth: 1, width: "96%", margin: 0 } });
	} catch (error) {
		ctx.ui.notify(`Control Center unavailable: ${errorMessage(error)}`, "error");
		return { kind: "closed" };
	} finally {
		panel?.dispose();
	}
}

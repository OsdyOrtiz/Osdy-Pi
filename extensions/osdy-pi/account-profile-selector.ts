import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Key, matchesKey, truncateToWidth, type Component } from "@earendil-works/pi-tui";
import { renderCodexUsageDashboardContentLines } from "./codex-usage-ui.js";
import type { ProfileCodexUsageResult } from "./profile-codex-usage.js";
import type { SimpleTheme } from "./types.js";

export interface AccountProfileChoice {
	profile: string;
	label: string;
	usage: ProfileCodexUsageResult | undefined;
}

/** Snapshot-only explorer: completion is possible only from the profile list. */
export class AccountProfileSelector implements Component {
	private index = 0;
	private details = false;
	private scroll = 0;
	private width = 80;
	private closed = false;

	private readonly choices: readonly AccountProfileChoice[];
	private readonly theme: SimpleTheme;
	private readonly height: () => number;
	private readonly requestRender: () => void;
	private readonly done: (profile: string | undefined) => void;

	constructor(
		choices: readonly AccountProfileChoice[],
		theme: SimpleTheme,
		height: () => number,
		requestRender: () => void,
		done: (profile: string | undefined) => void,
	) {
		this.choices = choices;
		this.theme = theme;
		this.height = height;
		this.requestRender = requestRender;
		this.done = done;
	}

	private capacity(): number { return Math.max(1, this.height() - 2); }

	private detailLines(width: number): string[] {
		const choice = this.choices[this.index];
		const usage = choice?.usage;
		if (!choice || usage?.status !== "ready" || usage.profile.toLowerCase() !== choice.profile.toLowerCase()) {
			return [this.theme.fg("muted", "Profile usage unavailable. You can still switch from the list.")];
		}
		return [
			this.theme.fg("muted", `Checked: ${new Date(usage.checkedAt).toLocaleString()} (local time)`),
			this.theme.fg("muted", `Updated: ${new Date(usage.quotaSnapshot.fetchedAt).toLocaleString()} (local time)`),
			...renderCodexUsageDashboardContentLines(this.theme, usage.quotaSnapshot,
				{ profile: choice.profile, provider: "openai-codex" }, usage.checkedAt, width),
		];
	}

	handleInput(data: string): void {
		if (this.closed) return;
		if (matchesKey(data, Key.escape) || (this.details && matchesKey(data, "b"))) {
			if (this.details) { this.details = false; this.scroll = 0; }
			else { this.closed = true; this.done(undefined); }
		} else if (!this.details && matchesKey(data, Key.enter)) {
			this.closed = true;
			this.done(this.choices[this.index]?.profile);
		} else if (!this.details && matchesKey(data, "v")) {
			this.details = true;
			this.scroll = 0;
		} else {
			const maximum = this.details ? Math.max(0, this.detailLines(this.width).length - this.capacity())
				: Math.max(0, this.choices.length - 1);
			let position = this.details ? this.scroll : this.index;
			if (matchesKey(data, Key.up)) position--;
			else if (matchesKey(data, Key.down)) position++;
			else if (matchesKey(data, Key.pageUp)) position -= this.capacity();
			else if (matchesKey(data, Key.pageDown)) position += this.capacity();
			else if (matchesKey(data, Key.home)) position = 0;
			else if (matchesKey(data, Key.end)) position = maximum;
			else return; // Enter, refresh and reset controls never act in details.
			position = Math.max(0, Math.min(maximum, position));
			if (this.details) this.scroll = position;
			else this.index = position;
		}
		this.requestRender();
	}

	render(width: number): string[] {
		this.width = Math.max(1, Math.floor(width));
		const capacity = this.capacity();
		let content: string[];
		let hint: string;
		if (this.details) {
			const lines = this.detailLines(this.width);
			this.scroll = Math.min(this.scroll, Math.max(0, lines.length - capacity));
			content = lines.slice(this.scroll, this.scroll + capacity);
			hint = `esc/b back · ↑/↓ PgUp/PgDn Home/End scroll · ${this.scroll + 1}–${Math.min(lines.length, this.scroll + capacity)}/${lines.length}`;
		} else {
			const start = Math.max(0, this.index - capacity + 1);
			content = this.choices.slice(start, start + capacity).map((choice, offset) =>
				this.theme.fg(start + offset === this.index ? "accent" : "text",
					`${start + offset === this.index ? ">" : " "} ${choice.label}`));
			hint = "↑/↓ highlight · v usage details · enter switch · esc cancel";
		}
		return [
			this.theme.fg("accent", this.details ? `Usage: ${this.choices[this.index]?.profile ?? "unknown"} (read-only)` : "Switch OpenAI account"),
			...content,
			this.theme.fg("muted", hint),
		].slice(0, Math.max(1, this.height())).map(line => truncateToWidth(line, this.width, ""));
	}

	invalidate(): void {} // Output is recomputed with the current theme and viewport.
}

export function selectAccountProfile(
	ui: Pick<ExtensionContext["ui"], "custom">,
	choices: readonly AccountProfileChoice[],
): Promise<string | undefined> {
	return ui.custom<string | undefined>((tui, theme, _keys, done) => new AccountProfileSelector(
		// Match the SDK's 100%-height, zero-margin overlay viewport on every resize.
		choices, theme, () => Math.max(1, tui.terminal.rows), () => tui.requestRender(), done,
	), {
		overlay: true,
		overlayOptions: { width: "100%", maxHeight: "100%", margin: 0, nonCapturing: false },
	});
}

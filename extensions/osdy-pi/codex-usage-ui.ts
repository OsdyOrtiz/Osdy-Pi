import {
	matchesKey,
	truncateToWidth,
	visibleWidth,
	type Component,
	type TUI,
} from "@earendil-works/pi-tui";
import type { CodexUsageSnapshot, CodexUsageWindow } from "./codex-usage.js";
import type { CodexUsageState, SimpleTheme } from "./types.js";

export type CodexUsageViewState = CodexUsageState;

export type CodexUsageRefresh = () => Promise<void>;

export type CodexUsagePresentation = {
	profile?: string | undefined;
	provider?: string | undefined;
	model?: string | undefined;
};

export const CODEX_USAGE_OVERLAY_OPTIONS = {
	anchor: "center",
	width: 96,
	minWidth: 48,
	maxHeight: "92%",
	margin: 1,
} as const;

const ESCAPE = String.fromCharCode(27);
const BELL = String.fromCharCode(7);
const ANSI_ESCAPE_SEQUENCE = new RegExp(
	`${ESCAPE}(?:\\][\\s\\S]*?(?:${BELL}|${ESCAPE}\\\\)|[PX^_][\\s\\S]*?${ESCAPE}\\\\|\\[[0-?]*[ -/]*[@-~]|[@-_])`,
	"g",
);

function sanitizeExternalField(
	value: string | undefined,
	fallback: string,
): string {
	const sanitized = Array.from(
		(value?.replace(ANSI_ESCAPE_SEQUENCE, "") ?? "").replace(/\s+/g, " "),
	)
		.filter((character) => {
			const code = character.charCodeAt(0);
			return code >= 32 && (code < 127 || code > 159);
		})
		.join("")
		.trim();
	return sanitized || fallback;
}

function bucketDisplay(bucket: CodexUsageSnapshot["buckets"][number]): {
	id: string;
	label: string;
} {
	const id = sanitizeExternalField(bucket.id, "unknown");
	return {
		id,
		label: sanitizeExternalField(bucket.label, id === "codex" ? "Codex" : id),
	};
}

function divider(theme: SimpleTheme, width: number): string {
	return theme.fg("border", "─".repeat(Math.max(1, Math.floor(width))));
}

export function formatRemainingPercent(usedPercent: number): string {
	return `${Math.max(0, Math.round(100 - usedPercent))}% left`;
}

function formatResetRelative(resetAt: number, now: number): string {
	const seconds = Math.round((resetAt * 1_000 - now) / 1_000);
	if (seconds <= 0) return "reset time passed";
	if (seconds < 60) return `resets in ${seconds}s`;
	if (seconds < 3_600) return `resets in ${Math.round(seconds / 60)}m`;
	if (seconds < 86_400) return `resets in ${Math.round(seconds / 3_600)}h`;
	return `resets in ${Math.round(seconds / 86_400)}d`;
}

function formatResetUtc(resetAt: number): string {
	const date = new Date(resetAt * 1_000);
	const pad = (value: number): string => String(value).padStart(2, "0");
	return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())} UTC`;
}

function formatResetTiming(
	resetAt: number | undefined,
	now: number,
): string | undefined {
	return resetAt === undefined
		? undefined
		: `${formatResetRelative(resetAt, now)} (${formatResetUtc(resetAt)})`;
}

export function formatCodexUsageWindow(
	window: CodexUsageWindow | undefined,
	now = Date.now(),
): string | undefined {
	if (!window) return undefined;
	const duration =
		window.windowMinutes === undefined
			? "quota"
			: window.windowMinutes % 1_440 === 0
				? `${window.windowMinutes / 1_440}d`
				: `${Math.round(window.windowMinutes / 60)}h`;
	const reset = formatResetTiming(window.resetsAt, now);
	return [`${duration} ${formatRemainingPercent(window.usedPercent)}`, reset]
		.filter((part): part is string => part !== undefined)
		.join(" · ");
}

export function formatCodexQuotaMetadata(snapshot: CodexUsageSnapshot): string {
	const main = snapshot.buckets[0];
	return [
		formatCodexUsageWindow(main?.primary),
		formatCodexUsageWindow(main?.secondary),
	]
		.filter((part): part is string => part !== undefined)
		.join(" · ");
}

export function formatCodexUsageMetadata(
	model: string,
	thinking: string,
	snapshot: CodexUsageSnapshot,
): string {
	const quota = formatCodexQuotaMetadata(snapshot);
	return [model, `think ${thinking}`, quota]
		.filter((part) => part.length > 0)
		.join(" · ");
}

export function resolveCodexUsageLayout(
	_left: string,
	modelAndThinking: string,
): { topRight: string } {
	return { topRight: modelAndThinking };
}

function borderBox(
	theme: SimpleTheme,
	width: number,
	title: string,
	lines: string[],
	titleTheme: "accent" | "mdLink" = "accent",
): string[] {
	const innerWidth = Math.max(1, width - 2);
	const heading = truncateToWidth(` ${title} `, innerWidth, "...", true);
	const leftWidth = Math.floor(
		Math.max(0, innerWidth - visibleWidth(heading)) / 2,
	);
	const rightWidth = Math.max(0, innerWidth - visibleWidth(heading) - leftWidth);
	const pad = (line: string): string => {
		const text = truncateToWidth(line, innerWidth, "...", true);
		return `${text}${" ".repeat(Math.max(0, innerWidth - visibleWidth(text)))}`;
	};
	return [
		`${theme.fg("border", `╭${"─".repeat(leftWidth)}`)}${theme.fg(titleTheme, heading)}${theme.fg("border", `${"─".repeat(rightWidth)}╮`)}`,
		`${theme.fg("border", "│")}${divider(theme, innerWidth)}${theme.fg("border", "│")}`,
		...lines.map(
			(line) => `${theme.fg("border", "│")}${pad(line)}${theme.fg("border", "│")}`,
		),
		theme.fg("border", `╰${"─".repeat(innerWidth)}╯`),
	];
}

function doubleBorderBox(
	theme: SimpleTheme,
	width: number,
	title: string,
	lines: string[],
): string[] {
	const innerWidth = Math.max(1, width - 2);
	const heading = truncateToWidth(` ${title} `, innerWidth, "...", true);
	const leftWidth = Math.floor(
		Math.max(0, innerWidth - visibleWidth(heading)) / 2,
	);
	const rightWidth = Math.max(0, innerWidth - visibleWidth(heading) - leftWidth);
	const pad = (line: string): string => {
		const text = truncateToWidth(line, innerWidth, "...", true);
		return `${text}${" ".repeat(Math.max(0, innerWidth - visibleWidth(text)))}`;
	};
	return [
		`${theme.fg("border", `╔${"═".repeat(leftWidth)}`)}${theme.fg("accent", heading)}${theme.fg("border", `${"═".repeat(rightWidth)}╗`)}`,
		...lines.map(
			(line) => `${theme.fg("border", "║")}${pad(line)}${theme.fg("border", "║")}`,
		),
		theme.fg("border", `╚${"═".repeat(innerWidth)}╝`),
	];
}

function quotaTheme(name: "Session" | "Weekly"): "accent" | "mdLink" {
	return name === "Session" ? "accent" : "mdLink";
}

function quotaLabel(
	theme: SimpleTheme,
	name: "Session" | "Weekly",
	suffix = "",
): string {
	return theme.fg("accent", `\u001B[1m${name}\u001B[22m${suffix}`);
}

function progress(
	theme: SimpleTheme,
	window: CodexUsageWindow,
	width = 10,
	fillTheme: "accent" | "mdLink" = "accent",
): string {
	const barWidth = Math.max(0, Math.round(width));
	const remainingPercent = Number.isFinite(window.usedPercent)
		? Math.max(0, Math.min(100, 100 - window.usedPercent))
		: 0;
	const filled = Math.max(
		0,
		Math.min(barWidth, Math.round((remainingPercent / 100) * barWidth)),
	);
	return `${theme.fg(fillTheme, "█".repeat(filled))}${theme.fg("muted", "░".repeat(barWidth - filled))}`;
}

/** Renders the main Codex bucket as compact, remaining-capacity quota bars. */
export function renderCompactCodexQuotaBars(
	theme: SimpleTheme,
	snapshot: CodexUsageSnapshot,
	width: number,
): string[] {
	const maximumWidth = Math.max(1, Math.floor(width));
	const main = snapshot.buckets.find((bucket) => bucket.id === "codex");
	const bars = (
		[
			["Session", main?.primary],
			["Weekly", main?.secondary],
		] as const
	).flatMap(([name, window]) => {
		if (!window) return [];
		const duration = formatWindowDuration(window);
		const remaining = formatRemainingPercent(window.usedPercent);
		const label =
			[
				`${name} ${duration} ${remaining}`,
				`${duration} ${remaining}`,
				duration,
				"",
			].find(
				(candidate) => maximumWidth > visibleWidth(candidate) + (candidate ? 1 : 0),
			) ?? "";
		const gap = label ? " " : "";
		const barWidth = Math.min(
			12,
			maximumWidth - visibleWidth(label) - visibleWidth(gap),
		);
		const themedLabel = label.startsWith(`${name} `)
			? `${quotaLabel(theme, name, " ")}${theme.fg("muted", `${label.slice(name.length + 1)}${gap}`)}`
			: label
				? theme.fg("muted", `${label}${gap}`)
				: "";
		const line = `${themedLabel}${progress(theme, window, barWidth, quotaTheme(name))}`;
		return [truncateToWidth(line, maximumWidth, "")];
	});
	if (bars.length !== 2) return bars;
	const combined = `${bars[0]}   ${bars[1]}`;
	return visibleWidth(combined) <= maximumWidth ? [combined] : bars;
}

export function renderCodexUsageReadyLines(
	theme: SimpleTheme,
	snapshot: CodexUsageSnapshot,
	now = Date.now(),
): string[] {
	const lines = [
		theme.fg("muted", "r refresh · esc/q close"),
		theme.fg(
			"mdLink",
			`Plan: ${sanitizeExternalField(snapshot.planType, "unknown")}`,
		),
	];
	for (const bucket of snapshot.buckets) {
		const { label } = bucketDisplay(bucket);
		lines.push(theme.fg("accent", label));
		for (const [name, window] of [
			["Session", bucket.primary],
			["Weekly", bucket.secondary],
		] as const) {
			if (!window) continue;
			const reset = formatResetTiming(window.resetsAt, now);
			lines.push(
				`${quotaLabel(theme, name, ": ")}${progress(theme, window, 10, quotaTheme(name))}${theme.fg("muted", ` ${formatRemainingPercent(window.usedPercent)}`)}${reset ? theme.fg("muted", ` · ${reset}`) : ""}`,
			);
		}
	}
	if (snapshot.credits) {
		const creditText = snapshot.credits.unlimited
			? "unlimited"
			: sanitizeExternalField(
					snapshot.credits.balance,
					snapshot.credits.hasCredits ? "available" : "none",
				);
		lines.push(theme.fg("mdLink", `Credits: ${creditText}`));
		if (snapshot.credits.resetCreditCount !== undefined)
			lines.push(
				theme.fg("muted", `Credit resets: ${snapshot.credits.resetCreditCount}`),
			);
	}
	if (snapshot.ordinaryUsageAllowed !== undefined)
		lines.push(
			theme.fg(
				"muted",
				`Ordinary usage: ${snapshot.ordinaryUsageAllowed ? "allowed" : "not allowed"}`,
			),
		);
	lines.push(
		theme.fg(
			"muted",
			`Updated: ${new Date(snapshot.fetchedAt).toLocaleString()}`,
		),
	);
	return lines;
}

function formatWindowDuration(window: CodexUsageWindow): string {
	if (window.windowMinutes === undefined) return "quota window";
	if (window.windowMinutes % 1_440 === 0)
		return `${window.windowMinutes / 1_440}d`;
	if (window.windowMinutes % 60 === 0) return `${window.windowMinutes / 60}h`;
	return `${window.windowMinutes}m`;
}

function formatResetDetails(
	resetAt: number | undefined,
	now: number,
): string[] {
	if (resetAt === undefined) return ["Reset: unavailable"];
	const date = new Date(resetAt * 1_000);
	return [
		`Reset: ${formatResetRelative(resetAt, now)}`,
		`Local: ${date.toLocaleString()}`,
		`UTC: ${formatResetUtc(resetAt)}`,
	];
}

function renderQuotaWindowCard(
	theme: SimpleTheme,
	name: "Session" | "Weekly",
	window: CodexUsageWindow,
	now: number,
	width: number,
): string[] {
	const resetDetails = formatResetDetails(window.resetsAt, now);
	const contentWidth = Math.max(1, width - 2);
	const lines = [
		`Window: ${formatWindowDuration(window)}`,
		...resetDetails,
	].flatMap((line) =>
		wrapToVisibleWidth(line, contentWidth).map((part) => theme.fg("muted", part)),
	);
	return borderBox(
		theme,
		Math.max(4, width),
		`\u001B[1m${name}\u001B[22m · ${formatWindowDuration(window)}`,
		lines,
		"accent",
	);
}

function renderQuotaBucketSection(
	theme: SimpleTheme,
	bucket: CodexUsageSnapshot["buckets"][number],
	now: number,
	width: number,
): string[] {
	const { id, label } = bucketDisplay(bucket);
	const windows = [
		["Session", bucket.primary],
		["Weekly", bucket.secondary],
	] as const;
	const availableWindows = windows.filter(
		(entry): entry is ["Session" | "Weekly", CodexUsageWindow] =>
			entry[1] !== undefined,
	);
	// 72 content columns retain two useful 34-column cards plus their three-column gap.
	const wide = availableWindows.length === 2 && width >= 72;
	const cards = availableWindows.map(([name, window]) =>
		renderQuotaWindowCard(
			theme,
			name,
			window,
			now,
			wide ? Math.floor((width - 3) / 2) : width,
		),
	);
	const lines = [
		...wrapToVisibleWidth(`${label} [${id}]`, width).map((line) =>
			theme.fg("accent", line),
		),
		divider(theme, width),
	];
	if (cards.length === 0) {
		lines.push(theme.fg("muted", "No quota windows available"));
		return lines;
	}
	const [primaryCard, secondaryCard] = cards;
	if (wide && primaryCard && secondaryCard)
		return [...lines, ...combineCards(primaryCard, secondaryCard)];
	return [...lines, ...cards.flat()];
}

function combineCards(left: string[], right: string[]): string[] {
	const gap = "   ";
	const leftWidth = left.reduce(
		(maximum, line) => Math.max(maximum, visibleWidth(line)),
		0,
	);
	const rows = Math.max(left.length, right.length);
	return Array.from({ length: rows }, (_value, index) => {
		const leftLine = left[index] ?? "";
		const rightLine = right[index] ?? "";
		return `${leftLine}${" ".repeat(Math.max(0, leftWidth - visibleWidth(leftLine)))}${gap}${rightLine}`;
	});
}

function wrapToVisibleWidth(text: string, width: number): string[] {
	const maximumWidth = Math.max(1, Math.floor(width));
	const lines: string[] = [];
	let line = "";
	for (const character of Array.from(text)) {
		if (line && visibleWidth(`${line}${character}`) > maximumWidth) {
			lines.push(line.trimEnd());
			line = character === " " ? "" : character;
		} else {
			line += character;
		}
	}
	if (line || lines.length === 0) lines.push(line);
	return lines;
}

function renderQuotaFooterLines(
	theme: SimpleTheme,
	snapshot: CodexUsageSnapshot,
	presentation: CodexUsagePresentation,
	width: number,
): string[] {
	const lines = [theme.fg("accent", "Quotas + account"), divider(theme, width)];
	const quotaLines: string[] = [];
	for (const bucket of snapshot.buckets) {
		const { label } = bucketDisplay(bucket);
		for (const [name, window] of [
			["Session", bucket.primary],
			["Weekly", bucket.secondary],
		] as const) {
			if (!window) continue;
			const prefix = `${label} ${name} `;
			const themedLabel = `${theme.fg("muted", `${label} `)}${quotaLabel(theme, name, " ")}`;
			const suffix = ` ${formatRemainingPercent(window.usedPercent)} · ${Math.round(window.usedPercent)}% used`;
			const availableBarWidth =
				width - visibleWidth(prefix) - visibleWidth(suffix);
			if (availableBarWidth < 6) {
				quotaLines.push(
					...wrapToVisibleWidth(
						`${themedLabel}${theme.fg("muted", suffix.trimStart())}`,
						width,
					),
					progress(theme, window, Math.max(1, width), quotaTheme(name)),
				);
			} else {
				const barWidth = Math.min(28, availableBarWidth);
				quotaLines.push(
					`${themedLabel}${progress(theme, window, barWidth, quotaTheme(name))}${theme.fg("muted", suffix)}`,
				);
			}
		}
	}
	lines.push(
		...quotaLines.flatMap((line, index) => (index === 0 ? [line] : ["", line])),
	);
	if (quotaLines.length > 0) lines.push("");
	const profile = sanitizeExternalField(presentation.profile, "none");
	const provider = sanitizeExternalField(presentation.provider, "unknown");
	const model = sanitizeExternalField(presentation.model, "unknown");
	const narrow = width < 72;
	const presentationText = `Profile: ${profile} · Provider: ${provider} · Model: ${model}`;
	if (narrow) {
		for (const field of [
			`Profile: ${profile}`,
			`Provider: ${provider}`,
			`Model: ${model}`,
		])
			lines.push(
				...wrapToVisibleWidth(field, width).map((line) => theme.fg("muted", line)),
			);
	} else {
		lines.push(
			...(visibleWidth(presentationText) > width
				? wrapToVisibleWidth(presentationText, width)
				: [presentationText]
			).map((line) => theme.fg("muted", line)),
		);
	}
	const accountFields = [
		snapshot.planType === undefined
			? undefined
			: `Plan: ${sanitizeExternalField(snapshot.planType, "unknown")}`,
		snapshot.ordinaryUsageAllowed === undefined
			? undefined
			: `Availability: ${snapshot.ordinaryUsageAllowed ? "allowed" : "not allowed"}`,
	].filter((field): field is string => field !== undefined);
	if (accountFields.length > 0) {
		const text = accountFields.join(" · ");
		lines.push(
			...(narrow || visibleWidth(text) > width
				? wrapToVisibleWidth(text, width)
				: [text]
			).map((line) => theme.fg("mdLink", line)),
		);
	}
	if (snapshot.credits) {
		const creditText = snapshot.credits.unlimited
			? "unlimited"
			: sanitizeExternalField(
					snapshot.credits.balance,
					snapshot.credits.hasCredits ? "available" : "none",
				);
		const creditFields = [
			`Credits: ${creditText}`,
			snapshot.credits.resetCreditCount === undefined
				? undefined
				: `Credit resets: ${snapshot.credits.resetCreditCount}`,
		].filter((field): field is string => field !== undefined);
		const text = creditFields.join(" · ");
		lines.push(
			...(narrow || visibleWidth(text) > width
				? wrapToVisibleWidth(text, width)
				: [text]
			).map((line) => theme.fg("mdLink", line)),
		);
	}
	return lines;
}

function controlHints(theme: SimpleTheme, width: number): string {
	const text = "r refresh · esc/q close";
	return theme.fg(
		"muted",
		`${" ".repeat(Math.max(0, width - visibleWidth(text)))}${text}`,
	);
}

export function renderCodexUsageDashboardLines(
	theme: SimpleTheme,
	snapshot: CodexUsageSnapshot,
	presentation: CodexUsagePresentation = {},
	now = Date.now(),
	width = 94,
): string[] {
	const lines: string[] = [];
	for (const bucket of snapshot.buckets)
		lines.push(...renderQuotaBucketSection(theme, bucket, now, width));
	lines.push(theme.fg("border", "─".repeat(Math.max(1, width))));
	lines.push(...renderQuotaFooterLines(theme, snapshot, presentation, width));
	lines.push(controlHints(theme, width));
	return lines;
}

export function renderCodexUsagePanelLines(
	theme: SimpleTheme,
	state: CodexUsageViewState,
	presentation: CodexUsagePresentation = {},
	now = Date.now(),
	width = 94,
): string[] {
	const contentWidth = Math.max(1, width - 2);
	const controls = controlHints(theme, contentWidth);
	const content =
		state.kind === "loading"
			? [theme.fg("muted", "Loading subscription usage…"), controls]
			: state.kind === "error"
				? [
						theme.fg("warning", state.message),
						...(state.snapshot
							? renderCodexUsageDashboardLines(
									theme,
									state.snapshot,
									presentation,
									now,
									contentWidth,
								)
							: [controls]),
					]
				: state.kind === "ready"
					? renderCodexUsageDashboardLines(
							theme,
							state.snapshot,
							presentation,
							now,
							contentWidth,
						)
					: [controls];
	return doubleBorderBox(theme, width, "Codex subscription usage", content);
}

class CodexUsagePanel implements Component {
	private readonly tui: TUI;
	private readonly theme: SimpleTheme;
	private readonly getState: () => CodexUsageViewState;
	private readonly refresh: CodexUsageRefresh;
	private readonly presentation: CodexUsagePresentation;
	private readonly close: () => void;

	constructor(
		tui: TUI,
		theme: SimpleTheme,
		getState: () => CodexUsageViewState,
		refresh: CodexUsageRefresh,
		presentation: CodexUsagePresentation,
		close: () => void,
	) {
		this.tui = tui;
		this.theme = theme;
		this.getState = getState;
		this.refresh = refresh;
		this.presentation = presentation;
		this.close = close;
	}

	handleInput(data: string): void {
		if (matchesKey(data, "escape") || matchesKey(data, "q")) return this.close();
		if (matchesKey(data, "r")) void this.refresh();
	}

	render(width: number): string[] {
		return renderCodexUsagePanelLines(
			this.theme,
			this.getState(),
			this.presentation,
			Date.now(),
			width,
		);
	}

	invalidate(): void {}
}

export async function showCodexUsagePanel(
	ctx: {
		ui: {
			custom<T>(
				factory: (
					tui: TUI,
					theme: SimpleTheme,
					keybindings: unknown,
					done: (result: T) => void,
				) => Component,
				options: {
					overlay: boolean;
					overlayOptions: {
						anchor: "center";
						width: number;
						minWidth: number;
						maxHeight: "92%";
						margin: number;
					};
				},
			): Promise<T>;
		};
	},
	getState: () => CodexUsageViewState,
	refresh: CodexUsageRefresh,
	presentation: CodexUsagePresentation = {},
): Promise<void> {
	await ctx.ui.custom<void>(
		(tui, theme, _keybindings, done) => {
			void refresh().finally(() => tui.requestRender());
			return new CodexUsagePanel(
				tui,
				theme,
				getState,
				async () => {
					await refresh();
					tui.requestRender();
				},
				presentation,
				() => done(),
			);
		},
		{
			overlay: true,
			overlayOptions: CODEX_USAGE_OVERLAY_OPTIONS,
		},
	);
}

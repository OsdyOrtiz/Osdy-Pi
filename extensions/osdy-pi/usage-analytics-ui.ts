import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { matchesKey, truncateToWidth, visibleWidth, wrapTextWithAnsi, type Component, type KeyId } from "@earendil-works/pi-tui";
import { adjacentPeriod, aggregateUsage, profileKey, usagePeriod, type UsageFilter, type UsagePeriod, type UsageTotals } from "./usage-analytics-data.js";
import type { UsageSnapshot } from "./usage-analytics-store.js";
import type { SimpleTheme } from "./types.js";
import { doubleBorderBox } from "./modal-frame.js";

export type UsageAnalyticsLoad =
	| { kind: "loading"; snapshot: UsageSnapshot | undefined }
	| { kind: "ready"; snapshot: UsageSnapshot }
	| { kind: "error"; message: string; snapshot: UsageSnapshot | undefined };
export type UsageAnalyticsPage = "summary" | "profiles" | "models" | "history";
const PAGES: readonly UsageAnalyticsPage[] = ["summary", "profiles", "models", "history"];
const PAGE_LABELS = { summary: "Summary", profiles: "Profiles", models: "Models", history: "History" };

export interface UsageAnalyticsState {
	page: UsageAnalyticsPage;
	help: "open" | "closed";
	period: UsagePeriod;
	filter: UsageFilter;
	scroll: number;
	load: UsageAnalyticsLoad;
}
export interface UsageAnalyticsPanelOptions {
	/** Inject the store read; this module never opens history or credentials itself. */
	read: () => Promise<UsageSnapshot>;
	now?: () => Date;
}
export interface UsageAnalyticsPanelHooks {
	requestRender: () => void;
	rows: () => number;
	done: () => void;
}
export type UsageAnalyticsAction = UsageAnalyticsPage | "nextPage" | "previousPage" | "help" | "day" | "week" | "month" | "previous" | "next" | "profile" | "provider" | "model" | "reset" | "up" | "down" | "pageUp" | "pageDown" | "home" | "end";
export interface UsageAnalyticsPanel extends Component {
	handleInput(data: string): void;
	refresh(): Promise<void>;
	dispose(): void;
}
export const USAGE_ANALYTICS_OVERLAY_OPTIONS = {
	anchor: "center", width: 96, minWidth: 12, maxHeight: "92%", margin: 1,
} as const;

export function createUsageAnalyticsState(anchor = new Date()): UsageAnalyticsState {
	return { page: "summary", help: "closed", period: usagePeriod("day", anchor), filter: {}, scroll: 0, load: { kind: "loading", snapshot: undefined } };
}

/** Choices come from the whole snapshot, not a filtered/top-N chart. Missing profile is tagged. */
function filterChoices(snapshot: UsageSnapshot | undefined): {
	profiles: (string | null)[]; providers: string[]; models: string[];
} {
	const profiles = new Map<string, string | null>();
	const providers = new Set<string>();
	const models = new Set<string>();
	for (const record of snapshot?.records ?? []) {
		profiles.set(profileKey(record.profile), record.profile);
		providers.add(record.provider);
		models.add(record.model);
	}
	return {
		profiles: [...profiles].sort(([a], [b]) => a === "unmanaged:" ? -1 : b === "unmanaged:" ? 1 : a.localeCompare(b)).map(([, value]) => value),
		providers: [...providers].sort(), models: [...models].sort(),
	};
}
function cycle<T>(choices: T[], current: T | undefined): T | undefined {
	return choices[choices.findIndex((value) => value === current) + 1];
}

export function updateUsageAnalyticsState(state: UsageAnalyticsState, action: UsageAnalyticsAction): UsageAnalyticsState {
	if (action === "help") return { ...state, help: state.help === "open" ? "closed" : "open", scroll: 0 };
	if (action === "summary" || action === "profiles" || action === "models" || action === "history") {
		return { ...state, page: action, help: "closed", scroll: 0 };
	}
	if (action === "nextPage" || action === "previousPage") {
		const index = (PAGES.indexOf(state.page) + (action === "nextPage" ? 1 : -1) + PAGES.length) % PAGES.length;
		return { ...state, page: PAGES[index] ?? "summary", help: "closed", scroll: 0 };
	}
	if (action === "up" || action === "down" || action === "pageUp" || action === "pageDown" || action === "home" || action === "end") {
		const scroll = action === "home" ? 0 : action === "end" ? Number.MAX_SAFE_INTEGER :
			Math.max(0, state.scroll + (action === "up" ? -1 : action === "down" ? 1 : action === "pageUp" ? -10 : 10));
		return { ...state, scroll };
	}
	if (action === "previous" || action === "next") return { ...state, period: adjacentPeriod(state.period, action === "previous" ? -1 : 1), scroll: 0 };
	if (action === "day" || action === "week" || action === "month") return { ...state, period: usagePeriod(action, new Date(state.period.start)), scroll: 0 };
	const filter = { ...state.filter };
	const choices = filterChoices(state.load.snapshot);
	if (action === "profile") {
		const current = choices.profiles.find((value) => state.filter.profile !== undefined && profileKey(value) === profileKey(state.filter.profile));
		const next = cycle(choices.profiles, current);
		if (next === undefined) delete filter.profile;
		else filter.profile = next;
	}
	if (action === "provider") {
		const next = cycle(choices.providers, filter.provider);
		if (next === undefined) delete filter.provider;
		else filter.provider = next;
	}
	if (action === "model") {
		const next = cycle(choices.models, filter.model);
		if (next === undefined) delete filter.model;
		else filter.model = next;
	}
	return { ...state, filter: action === "reset" ? {} : filter, scroll: 0 };
}

/** Strip terminal sequences and invisible/control characters before theming external text. */
export function sanitizeUsageAnalyticsText(text: string): string {
	const esc = String.fromCharCode(27);
	return text
		.replace(new RegExp(`${esc}\\][^\\u0007]*(?:\\u0007|${esc}\\\\)`, "g"), "")
		.replace(new RegExp(`${esc}\\[[0-?]*[ -/]*[@-~]`, "g"), "")
		.replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu, "")
		.slice(0, 1024);
}
function totalTokens(totals: UsageTotals): number {
	return totals.input + totals.output + totals.cacheRead + totals.cacheWrite;
}
function number(value: number): string { return value.toLocaleString("en-US"); }
function dateLabel(timestamp: number): string {
	const date = new Date(timestamp);
	return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export function usageBucketLabel(timestamp: number, hourly: boolean): string {
	if (!hourly) return dateLabel(timestamp);
	const date = new Date(timestamp);
	const offset = -date.getTimezoneOffset();
	const absolute = Math.abs(offset);
	return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")} UTC${offset >= 0 ? "+" : "-"}${String(Math.floor(absolute / 60)).padStart(2, "0")}:${String(absolute % 60).padStart(2, "0")}`;
}
function profileLabel(profile: string | null | undefined): string {
	return profile === undefined ? "All" : profile === null ? "Unmanaged (no profile)" : `Profile: ${profile}`;
}

function wrapped(text: string, width: number): string[] {
	// Pi's word wrapper can truncate a single oversized word. Split those words first,
	// without separating combining marks or emoji graphemes from their base.
	const segmenter = new Intl.Segmenter("en", { granularity: "grapheme" });
	const prepared = sanitizeUsageAnalyticsText(text).split(/(\s+)/u).map((word) => {
		if (visibleWidth(word) <= width) return word;
		const chunks: string[] = [];
		let chunk = "";
		for (const { segment } of segmenter.segment(word)) {
			if (chunk && visibleWidth(chunk + segment) > width) {
				chunks.push(chunk);
				chunk = "";
			}
			chunk += segment;
		}
		chunks.push(chunk);
		return chunks.join("\n");
	}).join("");
	return wrapTextWithAnsi(prepared, width);
}

function emphasized(theme: SimpleTheme, text: string): string {
	return theme.fg("accent", theme.bold?.(text) ?? text);
}

function metricLines(theme: SimpleTheme, totals: UsageTotals, width: number): string[] {
	let cost = "unavailable";
	if (totals.records === 0) cost = "No records";
	else if (totals.unavailableCostRecords < totals.records) cost = `$${totals.estimatedCost.toFixed(4)}`;
	const metrics = [
		["Total tokens", number(totalTokens(totals))],
		["Recorded turns", number(totals.records)],
		["Estimated USD", cost],
	];
	const cardWidth = Math.floor((width - 6) / 3);
	if (cardWidth >= 18 && metrics.every((metric) => metric.every((text) => visibleWidth(text) <= cardWidth))) {
		return [0, 1].map((row) => metrics.map((metric) => {
			const text = metric[row] ?? "";
			const padded = text + " ".repeat(cardWidth - visibleWidth(text));
			return row === 0 ? theme.fg("muted", padded) : emphasized(theme, padded);
		}).join(theme.fg("border", " │ ")));
	}
	return metrics.flatMap(([label, value]) => wrapped(`${label}: ${value}`, width).map((line) => emphasized(theme, line)));
}

interface RankingRow { label: string; tokens: number }
function rankingLines(theme: SimpleTheme, rows: RankingRow[], total: number, width: number): string[] {
	rows.sort((a, b) => b.tokens - a.tokens || (a.label < b.label ? -1 : Number(a.label > b.label)));
	const maximum = rows[0]?.tokens ?? 0;
	const nameWidth = Math.min(36, Math.floor(width * 0.4));
	const countWidth = Math.max(6, ...rows.map((row) => number(row.tokens).length));
	const barWidth = Math.min(20, width - nameWidth - countWidth - 10);
	const lines: string[] = [];
	for (const row of rows) {
		const share = total > 0 ? (100 * row.tokens / total).toFixed(1) : "0.0";
		const size = barWidth >= 8 ? barWidth : Math.min(20, width);
		const filled = row.tokens > 0 ? Math.max(1, Math.round(row.tokens / maximum * size)) : 0;
		const bar = theme.fg("accent", "█".repeat(filled)) + theme.fg("muted", "░".repeat(size - filled));
		if (barWidth < 8) {
			lines.push(...wrapped(row.label, width), ...wrapped(`${number(row.tokens)} tokens · ${share}%`, width), bar);
			continue;
		}
		const labels = wrapped(row.label, nameWidth);
		for (const [index, label] of labels.entries()) {
			const name = label + " ".repeat(nameWidth - visibleWidth(label));
			if (index > 0) { lines.push(name); continue; }
			lines.push(`${name} ${bar} ${number(row.tokens).padStart(countWidth)} ${`${share}%`.padStart(6)}`);
		}
	}
	return lines;
}

function helpLines(theme: SimpleTheme, width: number): string[] {
	const texts = [
		"Help · ? back to page",
		"Pages: 1 Summary · 2 Profiles · 3 Models · 4 History; Tab / Shift+Tab cycle with wrap.",
		"d/w/m day/week/month · left/right previous/next period · p/v/f cycle profile/provider/model · x reset filters.",
		"r refresh · up/down, Page Up/Down, Home/End scroll · Esc/q/Ctrl+C close (also in help).",
		"Coverage: recorded assistant turns since activation only; excludes background usage and processes without Osdy. Profile labels are historical, not verified identities.",
		"Cost: only available estimates summed; zero prices may mean unconfigured pricing. Not a provider bill and not subscription quota (including Codex).",
		"Rankings: bars scale to each chart maximum; percentages use the selected total tokens. All groups shown; filters cycle through every scanned group, then All.",
		"Composition: exact input/output/cache counts for the current period and filters; use f on Models to inspect a model.",
		`Local timezone: ${Intl.DateTimeFormat().resolvedOptions().timeZone}; civil boundaries, Monday weeks. Hour labels include UTC offset.`,
	];
	return texts.flatMap((text, index) => wrapped(text, width).map((line) =>
		truncateToWidth(theme.fg(index === 0 ? "accent" : "muted", line), width, "")));
}

/** Each page is complete and scrollable; shared warnings never depend on optional help. */
export function renderUsageAnalyticsContent(theme: SimpleTheme, state: UsageAnalyticsState, width: number): string[] {
	width = Math.max(1, Math.floor(width));
	const lines: string[] = [];
	const add = (text: string, color = "text"): void => {
		for (const line of wrapped(text, width)) lines.push(truncateToWidth(theme.fg(color, line), width, ""));
	};

	if (state.load.kind === "loading") add(state.load.snapshot ? "Loading… showing previous snapshot." : "Loading usage history…", "muted");
	if (state.load.kind === "error") {
		add(`Read error: ${state.load.message}`, "error");
		if (state.load.snapshot) add("Showing previous snapshot (stale).", "warning");
	}
	const snapshot = state.load.snapshot;
	if (!snapshot) return state.help === "open" ? [...lines, ...helpLines(theme, width)] : lines;
	if (snapshot.limited) add("Limited data: scan bounds reached; totals are incomplete, not full history.", "warning");
	if (snapshot.warnings.length) add(`Scan warnings: ${snapshot.warnings.join(", ")}; coverage may be incomplete.`, "warning");

	let usage;
	try { usage = aggregateUsage(snapshot.records, state.period, state.filter); }
	catch { add("Cannot aggregate this snapshot safely; refresh or choose another period.", "error"); return lines; }
	const totals = usage.totals;
	// Integrity/load warnings stay adjacent to the metrics, ahead of every chart.
	if (state.page === "summary" && state.help === "closed") lines.unshift(...metricLines(theme, totals, width));
	if (totals.unavailableCostRecords > 0) {
		const note = totals.unavailableCostRecords === totals.records ? "cost unavailable" : "partial estimates only";
		add(`${totals.unavailableCostRecords} unpriced turn(s); ${note}.`, "warning");
	}
	if (snapshot.records.length === 0) {
		add("No recorded history. No records yet: enable Osdy and complete a new assistant turn.", "muted");
	} else if (totals.records === 0) {
		add("No records match this period/filter. Use x to reset or ←/→ to change period.", "muted");
	}
	if (state.help === "open") {
		return [...lines, ...helpLines(theme, width)];
	}
	if (state.page === "summary" || state.page === "history") {
		add(`Timeline overview · ${state.period.kind}: ${dateLabel(state.period.start)} to ${dateLabel(state.period.end)} (exclusive)`, "accent");
		const bucketMax = Math.max(0, ...usage.buckets.map((bucket) => totalTokens(bucket.totals)));
		add(`max ${number(bucketMax)} tokens/bucket · · zero; ▁–█ positive · chronological, no binning`, "muted");
		const levels = ["▁", "▂", "▃", "▄", "▅", "▆", "▇", "█"];
		const spark = usage.buckets.map((bucket) => {
			const value = totalTokens(bucket.totals);
			if (value === 0) return "·";
			return levels[Math.max(0, Math.ceil(value / bucketMax * 8) - 1)] ?? "█";
		}).join("");
		for (const chunk of wrapped(spark, Math.min(32, width))) lines.push(emphasized(theme, chunk));
	}
	if (state.page === "profiles") {
		add("Profiles · tokens / share of selected total", "accent");
		lines.push(...rankingLines(theme, usage.profiles.map((group) => ({ label: profileLabel(group.profile), tokens: totalTokens(group.totals) })), totalTokens(totals), width));
	}
	if (state.page === "models") {
		add("Provider/models · tokens / share of selected total", "accent");
		lines.push(...rankingLines(theme, usage.models.map((group) => ({ label: `${group.provider} / ${group.model}`, tokens: totalTokens(group.totals) })), totalTokens(totals), width));
		const barWidth = Math.min(48, width);
		add("Token composition · I input / O output / R cache read / W cache write", "accent");
		const parts = [totals.input, totals.output, totals.cacheRead, totals.cacheWrite];
		const symbols = ["I", "O", "R", "W"];
		const colors = ["accent", "success", "warning", "dim"];
		let used = 0;
		const tokens = totalTokens(totals);
		const stack = parts.map((_value, i) => {
			const cumulative = parts.slice(0, i + 1).reduce((sum, part) => sum + part, 0);
			const end = tokens > 0 ? Math.round(cumulative / tokens * barWidth) : 0;
			const segment = theme.fg(colors[i] ?? "muted", (symbols[i] ?? "?").repeat(end - used));
			used = end;
			return segment;
		}).join("");
		lines.push(stack || theme.fg("muted", "░".repeat(barWidth)));
		add("Exact composition · current selection", "accent");
		add(`Selection: ${profileLabel(state.filter.profile)} · ${state.filter.provider ?? "All providers"} · ${state.filter.model ?? "All models"}`, "muted");
		add(`Input ${number(totals.input)} (I) · Output ${number(totals.output)} (O) · Cache read ${number(totals.cacheRead)} (R) · Cache write ${number(totals.cacheWrite)} (W)`);
	}
	if (state.page === "history") {
		add(`Local timezone: ${Intl.DateTimeFormat().resolvedOptions().timeZone}; civil boundaries, Monday weeks. Hour labels include UTC offset.`, "muted");
		add("Timeline detail · local bucket / exact tokens", "accent");
		for (const bucket of usage.buckets) add(`${usageBucketLabel(bucket.start, state.period.kind === "day")} · ${number(totalTokens(bucket.totals))} tokens`);
	}
	return lines;
}

function header(theme: SimpleTheme, state: UsageAnalyticsState, width: number): string[] {
	const page = PAGE_LABELS[state.page];
	const navigation = width >= 72
		? `${page}${state.help === "open" ? " · Help (? back)" : ""} · 1 Summary / 2 Profiles / 3 Models / 4 History · Tab/Shift+Tab · ? help`
		: `${page}${state.help === "open" ? " · ? back" : ""}`;
	const texts = [
		navigation,
		`${state.period.kind}: ${dateLabel(state.period.start)} → ${dateLabel(state.period.end)} excl. · d/w/m · ←/→`,
		`p ${profileLabel(state.filter.profile)} · v ${state.filter.provider ?? "All providers"} · f ${state.filter.model ?? "All models"} · x reset`,
	];
	const hasFilter = state.filter.profile !== undefined || state.filter.provider !== undefined || state.filter.model !== undefined;
	return texts.flatMap((text, index) => wrapped(text, width).map((line) => {
		if (index === 0 || hasFilter) return emphasized(theme, line);
		return theme.fg("muted", line);
	}));
}

function panelViewport(theme: SimpleTheme, state: UsageAnalyticsState, width: number, rows: number) {
	const framed = width >= 4 && rows >= 8;
	const inner = framed ? width - 2 : width;
	const available = rows - (framed ? 2 : 0);
	const heading = header(theme, state, inner).slice(0, Math.max(1, Math.min(5, Math.floor(available / 4))));
	// Statuses are sticky even at End or in help, and must not truncate each other.
	const flags: string[] = [];
	if (state.load.kind === "loading") flags.push(state.load.snapshot ? "Loading/stale" : "Loading");
	if (state.load.kind === "error") flags.push(state.load.snapshot ? "Read error/stale" : "Read error");
	const snapshot = state.load.snapshot;
	if (snapshot?.limited) flags.push("Limited");
	if (snapshot?.warnings.length) flags.push("Scan warnings");
	if (snapshot) {
		try {
			const totals = aggregateUsage(snapshot.records, state.period, state.filter).totals;
			if (totals.unavailableCostRecords) flags.push(totals.unavailableCostRecords === totals.records ? "Cost unknown" : "Partial cost");
			if (!totals.records) flags.push(snapshot.records.length ? "No match" : "Empty");
		} catch { flags.push("Unsafe totals"); }
	}
	const status: string[] = [];
	for (const flag of flags) {
		const compact = inner < 13 && flag === "Scan warnings" ? "Scan warn" : flag;
		const parts = inner < 16 && compact === "Read error/stale" ? ["Read error", "Stale"] : wrapped(compact, inner);
		const last = status.length - 1;
		if (parts.length === 1 && last >= 0 && visibleWidth(`${status[last]} · ${parts[0]}`) <= inner) {
			status[last] += ` · ${parts[0]}`;
		} else status.push(...parts);
	}
	// Reserve page identity when feasible, then status before optional headings,
	// controls or charts. A two-row wide viewport can show navigation + all flags.
	const statusRows = Math.min(status.length, Math.max(1, available - 1));
	const remaining = available - statusRows;
	const footerRows = remaining >= 2 ? 1 : 0;
	const headingRows = Math.min(heading.length, Math.max(0, remaining - footerRows));
	heading.splice(headingRows);
	heading.splice(Math.min(1, heading.length), 0, ...status.slice(0, statusRows).map((line) => theme.fg("warning", line)));
	const body = renderUsageAnalyticsContent(theme, state, inner);
	const height = Math.max(0, available - heading.length - footerRows);
	const offset = Math.min(state.scroll, Math.max(0, body.length - height));
	return { framed, available, heading, body, height, offset, footerRows };
}

/** Sticky controls plus a bounded, clamped content viewport; very narrow terminals omit the frame. */
export function renderUsageAnalyticsPanel(theme: SimpleTheme, state: UsageAnalyticsState, width: number, rows: number): string[] {
	width = Math.max(1, Math.floor(width));
	rows = Math.max(1, Math.floor(rows));
	const { framed, available, heading, body, height, offset, footerRows } = panelViewport(theme, state, width, rows);
	let footer = state.help === "open" ? "? back Tab" : "Tab 1-4 ?q";
	if (width >= 72) footer = `esc/q/^C close · ↑↓ PgUp/Dn Home/End · r refresh · scroll ${offset + 1}-${Math.min(body.length, offset + height)}/${body.length}`;
	else if (width >= 32) footer = `Tab/Shift+Tab 1-4 · ? ${state.help === "open" ? "back" : "help"} · q close · ↑↓ · r`;
	const content = [...heading, ...body.slice(offset, offset + height), ...(footerRows ? [theme.fg("muted", footer)] : [])].slice(0, available);
	const result = framed ? doubleBorderBox(theme, width, "Osdy usage analytics", content) : content;
	return result.map((line) => truncateToWidth(line, width, ""));
}

const ACTION_KEYS: readonly [KeyId, UsageAnalyticsAction][] = [
	["tab", "nextPage"], ["shift+tab", "previousPage"],
	["1", "summary"], ["2", "profiles"], ["3", "models"], ["4", "history"], ["?", "help"],
	["d", "day"], ["w", "week"], ["m", "month"], ["left", "previous"], ["right", "next"],
	["p", "profile"], ["v", "provider"], ["f", "model"], ["x", "reset"],
	["up", "up"], ["down", "down"], ["pageUp", "pageUp"], ["pageDown", "pageDown"], ["home", "home"], ["end", "end"],
];

export function createUsageAnalyticsPanel(theme: SimpleTheme, options: UsageAnalyticsPanelOptions, hooks: UsageAnalyticsPanelHooks): UsageAnalyticsPanel {
	let state = createUsageAnalyticsState(options.now?.() ?? new Date());
	let closed = false;
	let inFlight = false;
	let lastWidth = 96;
	const viewportRows = (): number => Math.max(1, Math.floor(hooks.rows() * 0.92) - 2);
	const repaint = (): void => { if (!closed) hooks.requestRender(); };
	const panel: UsageAnalyticsPanel = {
		async refresh(): Promise<void> {
			if (closed || inFlight) return;
			inFlight = true;
			state = { ...state, load: { kind: "loading", snapshot: state.load.snapshot } };
			repaint();
			try {
				const snapshot = await options.read();
				if (!closed) state = { ...state, load: { kind: "ready", snapshot } };
			} catch {
				// Exception details can contain private filesystem paths; keep the public error generic.
				if (!closed) state = { ...state, load: { kind: "error", message: "History could not be read. Press r to retry.", snapshot: state.load.snapshot } };
			} finally {
				inFlight = false;
				repaint();
			}
		},
		handleInput(data): void {
			if (closed) return;
			if (matchesKey(data, "escape") || matchesKey(data, "q") || matchesKey(data, "ctrl+c")) {
				closed = true;
				hooks.done();
				return;
			}
			if (matchesKey(data, "r")) { void panel.refresh(); return; }
			const action = ACTION_KEYS.find(([key]) => matchesKey(data, key))?.[1];
			if (!action) return;
			// Clamp before stepping so End/overscroll does not trap upward navigation.
			const { offset } = panelViewport(theme, state, Math.max(1, lastWidth), viewportRows());
			state = { ...state, scroll: offset };
			state = updateUsageAnalyticsState(state, action);
			repaint();
		},
		render(width): string[] {
			lastWidth = width;
			return renderUsageAnalyticsPanel(theme, state, width, viewportRows());
		},
		invalidate(): void {},
		dispose(): void { closed = true; },
	};
	return panel;
}

/** Interactive-only: the command must gate ctx.mode === "tui" before calling. */
export async function showUsageAnalyticsPanel(ctx: { ui: Pick<ExtensionContext["ui"], "custom"> }, options: UsageAnalyticsPanelOptions): Promise<void> {
	let panel: UsageAnalyticsPanel | undefined;
	try {
		await ctx.ui.custom<void>((tui, theme, _keybindings, done) => {
			panel = createUsageAnalyticsPanel(theme, options, { requestRender: () => tui.requestRender(), rows: () => tui.terminal.rows, done: () => done() });
			void panel.refresh();
			return panel;
		}, { overlay: true, overlayOptions: USAGE_ANALYTICS_OVERLAY_OPTIONS });
	} finally { panel?.dispose(); }
}

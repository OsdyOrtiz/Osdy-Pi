export interface UsageRecord {
	version: 1;
	timestamp: number;
	sessionId: string;
	entryId: string;
	profile: string | null;
	provider: string;
	model: string;
	input: number;
	output: number;
	cacheRead: number;
	cacheWrite: number;
	estimatedCost: number | null;
}

function text(value: unknown): value is string {
	return typeof value === "string" && value.length > 0 && value.length <= 256 && !/[\p{Cc}\p{Cf}]/u.test(value);
}
function identifier(value: unknown): value is string {
	return text(value) && !value.includes("/") && !value.includes("\\");
}
function count(value: unknown): value is number {
	return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}
function validProfile(value: unknown): value is string | null {
	return value === null || (
		typeof value === "string" &&
		/^[A-Za-z0-9][A-Za-z0-9-]{0,62}$/.test(value) &&
		!["default", "profiles", "auth.json"].includes(value.toLowerCase())
	);
}

/** Narrow unknown input and copy only approved metadata; absent cost means unavailable. */
export function parseUsageRecord(value: unknown): UsageRecord | null {
	if (typeof value !== "object" || value === null) return null;
	if (
		!("version" in value) || value.version !== 1 ||
		!("timestamp" in value) || !count(value.timestamp) || value.timestamp > 8.64e15
	) return null;
	if (
		!("sessionId" in value) || !identifier(value.sessionId) ||
		!("entryId" in value) || !identifier(value.entryId)
	) return null;
	if (
		!("profile" in value) || !validProfile(value.profile) ||
		!("provider" in value) || !text(value.provider) ||
		!("model" in value) || !text(value.model)
	) return null;
	if (
		!("input" in value) || !count(value.input) ||
		!("output" in value) || !count(value.output) ||
		!("cacheRead" in value) || !count(value.cacheRead) ||
		!("cacheWrite" in value) || !count(value.cacheWrite)
	) return null;
	const cost = "estimatedCost" in value ? value.estimatedCost : null;
	if (cost !== null && cost !== undefined && (
		typeof cost !== "number" || !Number.isFinite(cost) || cost < 0 || cost > Number.MAX_SAFE_INTEGER
	)) return null;
	return {
		version: 1,
		timestamp: value.timestamp,
		sessionId: value.sessionId,
		entryId: value.entryId,
		profile: value.profile,
		provider: value.provider,
		model: value.model,
		input: value.input,
		output: value.output,
		cacheRead: value.cacheRead,
		cacheWrite: value.cacheWrite,
		estimatedCost: cost ?? null,
	};
}

/** Tagged keys prevent a named "unmanaged" profile colliding with missing attribution. */
export function profileKey(profile: string | null): string {
	if (!validProfile(profile)) throw new Error("Invalid profile label");
	return profile === null ? "unmanaged:" : `profile:${profile.toLowerCase()}`;
}

export type UsagePeriodKind = "day" | "week" | "month";
export interface UsagePeriod { kind: UsagePeriodKind; start: number; end: number }

function civilMidnight(year: number, month: number, day: number): Date {
	// Build each boundary independently: a skipped midnight may normalize to 01:00,
	// but that hour must not carry into the next civil date. setFullYear handles 0–99.
	const boundary = new Date(0);
	boundary.setFullYear(year, month, day);
	boundary.setHours(0, 0, 0, 0);
	return boundary;
}

export function usagePeriod(kind: UsagePeriodKind, anchor: Date): UsagePeriod {
	if (!["day", "week", "month"].includes(kind) || !Number.isFinite(anchor.getTime())) throw new Error("Invalid calendar period");
	const year = anchor.getFullYear();
	const month = anchor.getMonth();
	const day = kind === "month" ? 1 : anchor.getDate() - (kind === "week" ? (anchor.getDay() + 6) % 7 : 0);
	const start = civilMidnight(year, month, day);
	const end = kind === "month" ? civilMidnight(year, month + 1, 1) : civilMidnight(year, month, day + (kind === "week" ? 7 : 1));
	if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) throw new Error("Calendar period out of range");
	return { kind, start: start.getTime(), end: end.getTime() };
}
function validatePeriod(period: UsagePeriod): void {
	const canonical = usagePeriod(period.kind, new Date(period.start));
	if (canonical.start !== period.start || canonical.end !== period.end) throw new Error("Invalid calendar period boundaries");
}
export function adjacentPeriod(period: UsagePeriod, direction: -1 | 1): UsagePeriod {
	validatePeriod(period);
	if (direction !== -1 && direction !== 1) throw new Error("Invalid navigation direction");
	const anchor = new Date(period.start);
	if (period.kind === "month") anchor.setMonth(anchor.getMonth() + direction);
	else anchor.setDate(anchor.getDate() + direction * (period.kind === "week" ? 7 : 1));
	return usagePeriod(period.kind, anchor);
}

export interface UsageTotals {
	records: number;
	input: number;
	output: number;
	cacheRead: number;
	cacheWrite: number;
	/** Recorded estimates, never authoritative billing or subscription quota. */
	estimatedCost: number;
	unavailableCostRecords: number;
}
export interface UsageBucket { start: number; end: number; totals: UsageTotals }
export interface UsageProfileGroup { key: string; profile: string | null; totals: UsageTotals }
export interface UsageModelGroup { provider: string; model: string; totals: UsageTotals }
export interface UsageFilter { profile?: string | null; provider?: string; model?: string }
export interface UsageAggregation {
	period: UsagePeriod;
	totals: UsageTotals;
	buckets: UsageBucket[];
	profiles: UsageProfileGroup[];
	models: UsageModelGroup[];
}
function emptyTotals(): UsageTotals {
	return { records: 0, input: 0, output: 0, cacheRead: 0, cacheWrite: 0, estimatedCost: 0, unavailableCostRecords: 0 };
}
function add(totals: UsageTotals, record: UsageRecord): void {
	totals.records++;
	totals.input += record.input;
	totals.output += record.output;
	totals.cacheRead += record.cacheRead;
	totals.cacheWrite += record.cacheWrite;
	if (record.estimatedCost === null) totals.unavailableCostRecords++;
	else totals.estimatedCost += record.estimatedCost;
	for (const value of [totals.records, totals.input, totals.output, totals.cacheRead, totals.cacheWrite, totals.estimatedCost]) {
		if (!Number.isFinite(value) || value > Number.MAX_SAFE_INTEGER) throw new Error("Usage totals exceed safe numeric range");
	}
}
function compare(left: string, right: string): number { return left < right ? -1 : left > right ? 1 : 0; }

/** Local timezone calendar boundaries, half-open intervals, and explicit empty buckets.
 * Repeated fall-back hours are separate timestamped buckets; missing spring hours are absent.
 */
export function aggregateUsage(records: readonly UsageRecord[], period: UsagePeriod, filter: UsageFilter = {}): UsageAggregation {
	validatePeriod(period);
	if (filter.profile !== undefined) profileKey(filter.profile);
	if ((filter.provider !== undefined && !text(filter.provider)) || (filter.model !== undefined && !text(filter.model))) throw new Error("Invalid model filter");
	const buckets: UsageBucket[] = [];
	let cursor = period.start;
	while (cursor < period.end) {
		const next = new Date(cursor);
		// Local hour boundaries realign after fractional-hour DST jumps; elapsed hours
		// retain repeated fall-back hours instead of skipping straight to the next label.
		if (period.kind === "day") {
			next.setHours(next.getHours() + 1, 0, 0, 0);
			next.setTime(Math.min(next.getTime(), cursor + 3600000));
		} else next.setTime(civilMidnight(next.getFullYear(), next.getMonth(), next.getDate() + 1).getTime());
		const end = Math.min(next.getTime(), period.end);
		buckets.push({ start: cursor, end, totals: emptyTotals() });
		cursor = end;
	}
	const totals = emptyTotals();
	const profiles = new Map<string, UsageProfileGroup>();
	const models = new Map<string, UsageModelGroup>();
	for (const input of records) {
		const record = parseUsageRecord(input);
		if (!record) throw new Error("Invalid usage record");
		if (record.timestamp < period.start || record.timestamp >= period.end) continue;
		const key = profileKey(record.profile);
		if (filter.profile !== undefined && key !== profileKey(filter.profile)) continue;
		if (filter.provider !== undefined && record.provider !== filter.provider) continue;
		if (filter.model !== undefined && record.model !== filter.model) continue;
		add(totals, record);
		const bucket = buckets.find((item) => record.timestamp >= item.start && record.timestamp < item.end);
		if (bucket) add(bucket.totals, record);
		let profile = profiles.get(key);
		if (!profile) {
			profile = { key, profile: record.profile, totals: emptyTotals() };
			profiles.set(key, profile);
		}
		add(profile.totals, record);
		const modelKey = JSON.stringify([record.provider, record.model]);
		let model = models.get(modelKey);
		if (!model) {
			model = { provider: record.provider, model: record.model, totals: emptyTotals() };
			models.set(modelKey, model);
		}
		add(model.totals, record);
	}
	return {
		period: { ...period }, totals, buckets,
		profiles: [...profiles.values()].sort((a, b) => compare(a.key, b.key)),
		models: [...models.values()].sort((a, b) => compare(a.provider, b.provider) || compare(a.model, b.model)),
	};
}

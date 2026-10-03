import type { ControlCenterService, ControlCenterDetail, ControlCenterRow, ControlCenterUsageAction } from "./control-center.js";
import type { CodexUsageState } from "./types.js";
import type { UsageSnapshot } from "./usage-analytics-store.js";
import { aggregateUsage, usagePeriod, type UsagePeriodKind } from "./usage-analytics-data.js";
import { isProfileName } from "./account-profiles.js";

export interface ControlCenterUsageSources {
	quota(): CodexUsageState;
	history(): Promise<UsageSnapshot>;
	refresh(): Promise<void>;
	active(): string | undefined;
	now?: () => Date;
}

/** Uses owner snapshots; filtering never fetches, writes history, or reads auth. */
export function createControlCenterUsage(sources: ControlCenterUsageSources): ControlCenterService<ControlCenterUsageAction> {
	let range: UsagePeriodKind = "day";
	let currentOnly = false;
	let history: UsageSnapshot | undefined;
	let historyUnavailable = false;
	const readHistory = async (): Promise<void> => {
		try { history = await sources.history(); historyUnavailable = false; }
		catch { history = undefined; historyUnavailable = true; }
	};
	const view = (): ControlCenterDetail => {
		const rows: ControlCenterRow[] = [{ label: "Refresh quota and local history", current: false, action: { kind: "usage-refresh" } }];
		const quota = sources.quota();
		if (quota.kind === "ready") {
			for (const bucket of quota.snapshot.buckets) {
				for (const window of [bucket.primary, bucket.secondary]) {
					if (!window) continue;
					rows.push({ label: `Quota: ${window.usedPercent}% used (${window.windowMinutes ?? "unknown"} min)`, current: false, action: { kind: "usage-detail" },
						details: [`Reset: ${window.resetsAt === undefined ? "unavailable" : new Date(window.resetsAt * 1000).toISOString()}`, `Fetched: ${new Date(quota.snapshot.fetchedAt).toISOString()}`] });
				}
			}
		} else rows.push({ label: quota.kind === "loading" ? "Quota loading" : "Quota unavailable — explicit refresh to retry", current: false, action: { kind: "usage-detail" } });
		for (const option of ["day", "week", "month"] as const) rows.push({ label: `Range: ${option}`, current: range === option, action: { kind: "usage-range", range: option } });
		rows.push({ label: `Accounts: ${currentOnly ? "current" : "all"}`, current: false, action: { kind: "usage-account", current: !currentOnly } });
		const active = sources.active();
		const profile = typeof active === "string" && isProfileName(active) ? active : null;
		const note = "Read-only. Local calendar range; recorded estimates, not billing or subscription quota.";
		if (!history || historyUnavailable) return { summary: `Local history unavailable | ${range}`, note, rows };
		const totals = aggregateUsage(history.records, usagePeriod(range, (sources.now ?? (() => new Date()))()), currentOnly ? { profile } : {});
		const limited = history.limited || history.warnings.length > 0;
		rows.push({ label: totals.totals.records ? `Recorded turns: ${totals.totals.records}` : "No recorded turns in this range", current: false, action: { kind: "usage-detail" }, details: [
			`Input: ${totals.totals.input} | Output: ${totals.totals.output}`,
			`Cache read: ${totals.totals.cacheRead} | Cache write: ${totals.totals.cacheWrite}`,
			`Estimated cost: $${totals.totals.estimatedCost.toFixed(4)} | Cost unavailable: ${totals.totals.unavailableCostRecords} turns`,
		] });
		for (const group of totals.models) rows.push({ label: `${group.provider} / ${group.model}`, current: false, action: { kind: "usage-detail" }, details: [`Turns: ${group.totals.records} | Input: ${group.totals.input} | Output: ${group.totals.output}`] });
		return { summary: `Local analytics | ${range} | ${currentOnly ? profile ?? "unmanaged" : "all accounts"}${limited ? " | Limited/incomplete coverage" : ""}`, note, rows };
	};
	return {
		async read() { if (!history && !historyUnavailable) await readHistory(); return view(); },
		async apply(action) {
			if (action.kind === "usage-detail") return { failed: false, message: "Read-only detail." };
			if (action.kind === "usage-range") range = action.range;
			else if (action.kind === "usage-account") currentOnly = action.current;
			else if (action.kind === "usage-refresh") {
				let quotaUnavailable = false;
				try { await sources.refresh(); } catch { quotaUnavailable = true; }
				await readHistory();
				const failed = quotaUnavailable || historyUnavailable || sources.quota().kind !== "ready";
				return { failed, message: failed ? "Some usage sources are unavailable; retry explicitly." : "Usage refreshed." };
			} else return { failed: true, message: "Usage action unavailable." };
			return { failed: false, message: "Read-only filter applied." };
		},
	};
}

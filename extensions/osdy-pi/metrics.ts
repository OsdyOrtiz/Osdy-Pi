import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { shortNumber } from "./format.js";
import type { AssistantSessionEntry } from "./types.js";

function isAssistantSessionEntry(
	entry: unknown,
): entry is AssistantSessionEntry {
	if (!entry || typeof entry !== "object") return false;
	const candidate = entry as { type?: unknown; message?: unknown };
	if (candidate.type !== "message") return false;
	if (!candidate.message || typeof candidate.message !== "object") return false;
	const message = candidate.message as { role?: unknown };
	return message.role === "assistant";
}

export function modelLabel(ctx: ExtensionContext): string {
	const model = ctx.model;
	if (!model) return "no model";
	return model.provider ? `${model.provider}/${model.id}` : model.id;
}

function getContextLabel(ctx: ExtensionContext): string {
	const context = ctx.getContextUsage();
	const contextWindow = context?.contextWindow ?? ctx.model?.contextWindow;
	const percent = context?.percent ?? null;
	return contextWindow
		? `ctx ${percent === null ? "?" : Math.round(percent)}%/${shortNumber(contextWindow)}`
		: "ctx ?";
}

function getCacheLabel(totals: UsageTotals): string {
	return totals.cacheRead || totals.cacheWrite
		? ` R${shortNumber(totals.cacheRead)} W${shortNumber(totals.cacheWrite)}`
		: "";
}

export function usageLabel(ctx: ExtensionContext): string {
	const totals = collectUsageTotals(ctx);
	const cacheText = getCacheLabel(totals);
	const ctxText = getContextLabel(ctx);
	return ` tok ↑${shortNumber(totals.input)} ↓${shortNumber(totals.output)}${cacheText} · $${totals.cost.toFixed(4)} · ${ctxText} `;
}

type UsageTotals = {
	input: number;
	output: number;
	cacheRead: number;
	cacheWrite: number;
	cost: number;
};

function createUsageTotals(): UsageTotals {
	return {
		input: 0,
		output: 0,
		cacheRead: 0,
		cacheWrite: 0,
		cost: 0,
	};
}

function mergeUsageTotals(
	totals: UsageTotals,
	entry: AssistantSessionEntry,
): UsageTotals {
	const usage = entry.message?.usage;
	if (!usage) return totals;
	return {
		input: totals.input + (usage.input ?? 0),
		output: totals.output + (usage.output ?? 0),
		cacheRead: totals.cacheRead + (usage.cacheRead ?? 0),
		cacheWrite: totals.cacheWrite + (usage.cacheWrite ?? 0),
		cost: totals.cost + (usage.cost?.total ?? 0),
	};
}

function collectUsageTotals(ctx: ExtensionContext): UsageTotals {
	return ctx.sessionManager.getEntries().reduce<UsageTotals>((totals, entry) => {
		return isAssistantSessionEntry(entry)
			? mergeUsageTotals(totals, entry)
			: totals;
	}, createUsageTotals());
}

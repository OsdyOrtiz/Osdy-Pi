import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { resolveActiveProfileLabel } from "./profile-label.js";
import { parseUsageRecord } from "./usage-analytics-data.js";
import { createUsageAnalyticsStore, type UsageAnalyticsStore, type UsageSnapshot } from "./usage-analytics-store.js";
import { showUsageAnalyticsPanel } from "./usage-analytics-ui.js";

export interface UsageAnalyticsOptions {
	/** Must remain false while session settings are loading. */
	isEnabled(): boolean;
	resolveProfile?: () => unknown;
	createStore?: () => UsageAnalyticsStore;
	showPanel?: typeof showUsageAnalyticsPanel;
}
interface StartedTurn { sessionId: string; turnIndex: number; timestamp: number; profile: string | null }
function object(value: unknown): Record<string, unknown> | undefined {
	return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}
function count(value: unknown): value is number {
	return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}
function identifier(value: unknown): value is string {
	return typeof value === "string" && value.length > 0 && value.length <= 256 && !/[\p{Cc}\p{Cf}\\]/u.test(value) && !value.includes("/");
}

/** Observe new turn boundaries only. Never read session entries or import historical usage. */
export function registerUsageAnalytics(pi: ExtensionAPI, options: UsageAnalyticsOptions): void {
	let started: StartedTurn | undefined;
	let store: UsageAnalyticsStore | undefined;
	let warned = false;
	let coverageLost = false;
	// Only a recent delivery guard: persisted reads deduplicate the stable tuple across runtimes.
	const recent = new Set<string>();
	const getStore = (): UsageAnalyticsStore => store ??= (options.createStore ?? createUsageAnalyticsStore)();
	const warn = (ctx: ExtensionContext): void => {
		coverageLost = true;
		if (!warned) ctx.ui.notify("Usage history could not be saved completely; analytics coverage is incomplete.", "warning");
		warned = true;
	};
	const read = async (): Promise<UsageSnapshot> => {
		try {
			const history = getStore();
			// drain remembers prior append errors even if a subsequent append succeeds.
			await history.drain();
			if (coverageLost) throw new Error("Lost usage coverage");
			return await history.read();
		} catch {
			throw new Error("Usage history is unavailable or incomplete after an I/O failure; recorded totals may omit turns.");
		}
	};
	pi.on("turn_start", (event, ctx) => {
		const input = object(event);
		const sessionId: unknown = ctx.sessionManager.getSessionId();
		if (!options.isEnabled() || !identifier(sessionId) || !input || !count(input.turnIndex) || !count(input.timestamp) || input.timestamp > 8.64e15) {
			started = undefined;
			return;
		}
		if (started?.sessionId === sessionId && started.turnIndex === input.turnIndex && started.timestamp === input.timestamp) return;
		const label = (options.resolveProfile ?? resolveActiveProfileLabel)();
		const profile = typeof label === "string" ? resolveActiveProfileLabel({ OSDY_PI_PROFILE_NAME: label }) ?? null : null;
		started = { sessionId, turnIndex: input.turnIndex, timestamp: input.timestamp, profile };
	});
	pi.on("turn_end", async (event, ctx) => {
		const start = started;
		started = undefined;
		const input = object(event);
		if (!start || !options.isEnabled() || start.sessionId !== ctx.sessionManager.getSessionId() || input?.turnIndex !== start.turnIndex) return;
		const message = object(input.message);
		const usage = object(message?.usage);
		if (message?.role !== "assistant" || !usage || !count(message.timestamp) || message.timestamp < start.timestamp) return;
		const cost = object(usage.cost);
		if (usage.cost !== undefined && usage.cost !== null && !cost) return;
		const record = parseUsageRecord({
			version: 1, timestamp: message.timestamp, sessionId: start.sessionId, entryId: input.messageEntryId,
			profile: message.provider === "openai-codex" ? start.profile : null,
			provider: message.provider, model: message.model,
			input: usage.input, output: usage.output, cacheRead: usage.cacheRead, cacheWrite: usage.cacheWrite,
			estimatedCost: cost?.total,
		});
		if (!record) return;
		const identity = JSON.stringify([record.sessionId, record.entryId]);
		if (recent.has(identity)) return;
		recent.add(identity);
		if (recent.size > 256) {
			const oldest = recent.values().next().value;
			if (oldest !== undefined) recent.delete(oldest);
		}
		try {
			await getStore().append(record);
			warned = false;
		} catch { warn(ctx); }
	});
	pi.on("agent_end", () => { started = undefined; });
	pi.on("session_start", () => { started = undefined; recent.clear(); });
	pi.on("session_shutdown", async (_event, ctx) => {
		started = undefined;
		recent.clear();
		if (!store) return;
		try { await store.drain(); } catch { warn(ctx); }
	});
	pi.registerCommand("osdy-usage", {
		description: "Show locally recorded token usage and estimated cost (not subscription quota).",
		handler: async (_args, ctx) => {
			if (ctx.mode !== "tui" || !ctx.hasUI) {
				ctx.ui.notify("Usage analytics charts require interactive terminal mode; no dashboard was opened.", "warning");
				return;
			}
			await (options.showPanel ?? showUsageAnalyticsPanel)(ctx, { read });
		},
	});
}

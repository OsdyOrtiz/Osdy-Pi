import { randomUUID } from "node:crypto";
import type { CodexResetLease, CodexResetRecord, CodexResetStore } from "./codex-reset-store.js";
import { consumeCodexReset } from "./codex-usage.js";
import type { CodexUsageAuth, CodexUsageSnapshot, ConsumeCodexResetCode } from "./codex-usage.js";

/** Snapshot the active auth source, not a profile preview. Increment generation on every switch. */
export type CodexResetContext = { auth: CodexUsageAuth; generation: number; sessionId: string };
export type CodexResetChoice = { creditId: string; expiresAt: number | undefined };
export type CodexResetPrompt = CodexResetChoice & {
	scope: "active-account";
	cancelFirst: true;
} & ({ kind: "new" } | { kind: "recovery"; requestId: string });

/** Opaque IDs are callback plumbing only: render the date/scope, never these IDs. */
export type CodexResetInteraction = {
	choose(choices: readonly CodexResetChoice[]): Promise<string | undefined>;
	confirm(prompt: CodexResetPrompt): Promise<boolean>;
};

export type CodexResetResult =
	| { kind: "busy" }
	| { kind: "cancelled" }
	| { kind: "unavailable" }
	| { kind: "blocked"; journalFailed: boolean }
	| { kind: "unknown"; refreshFailed: boolean; journalFailed: boolean }
	| { kind: "confirmed"; code: ConsumeCodexResetCode; windowsReset: number; refreshFailed: boolean; journalFailed: boolean };

export type CodexResetOptions = {
	store: CodexResetStore;
	/** Resolve the active auth source again at every boundary, including just before dispatch. */
	getContext(): CodexResetContext | undefined | Promise<CodexResetContext | undefined>;
	readQuota(auth: CodexUsageAuth, options: { signal?: AbortSignal }): Promise<CodexUsageSnapshot>;
	consume?: typeof consumeCodexReset;
	/** Must only publish its snapshot if this captured context is still current. */
	refresh(context: CodexResetContext): Promise<void>;
	now?: () => number;
	uuid?: () => string;
};

export type CodexResetWorkflow = {
	run(interaction: CodexResetInteraction, options?: { signal?: AbortSignal }): Promise<CodexResetResult>;
};

const validId = (value: unknown): value is string => typeof value === "string" && value.length <= 512 && !!value.trim() &&
	!Array.from(value).some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127);
const validExpiry = (value: unknown): value is number | undefined => value === undefined ||
	(typeof value === "number" && Number.isSafeInteger(value) && value >= 0);

function eligible(snapshot: CodexUsageSnapshot, now: number): CodexResetChoice[] {
	if (!Number.isSafeInteger(snapshot.bankedResetCount) || (snapshot.bankedResetCount ?? 0) <= 0 ||
		!Array.isArray(snapshot.bankedResetDetails) || !Number.isFinite(now)) return [];
	const choices: CodexResetChoice[] = [];
	const seen = new Set<string>();
	for (const detail of snapshot.bankedResetDetails) {
		if (!detail || !validId(detail.id) || seen.has(detail.id) || !validExpiry(detail.expiresAt) ||
			(detail.expiresAt !== undefined && detail.expiresAt <= now)) continue;
		seen.add(detail.id);
		choices.push({ creditId: detail.id, expiresAt: detail.expiresAt });
	}
	return choices;
}

/** One instance must be shared by /usage and osdyconfig. Construction never reads or sends. */
export function createCodexResetWorkflow(deps: CodexResetOptions): CodexResetWorkflow {
	let busy = false;
	const now = deps.now ?? Date.now;
	const uuid = deps.uuid ?? randomUUID;
	const consume = deps.consume ?? consumeCodexReset;

	return {
		async run(interaction, options = {}) {
			if (busy) return { kind: "busy" };
			busy = true; // Before auth lookup, filesystem I/O, GET, or either dialog.
			const signal = options.signal;
			let lease: CodexResetLease | undefined;
			let result: CodexResetResult = { kind: "blocked", journalFailed: false };
			let context: CodexResetContext | undefined;
			let invoked = false;

			async function sameContext(): Promise<boolean> {
				try {
					const latest = await deps.getContext();
					return !!context && !!latest && context.generation === latest.generation &&
						context.sessionId === latest.sessionId && context.auth.accountId === latest.auth.accountId &&
						context.auth.accessToken === latest.auth.accessToken;
				} catch { return false; }
			}

			const current = async () => {
				const same = await sameContext();
				return !signal?.aborted && same;
			};

			async function resolveNotSent(record: CodexResetRecord): Promise<CodexResetResult> {
				try {
					await lease?.write({ ...record, status: "resolved" });
					return { kind: "cancelled" };
				} catch { return { kind: "blocked", journalFailed: true }; }
			}

			async function attempt(): Promise<CodexResetResult> {
				if (signal?.aborted) return { kind: "cancelled" };
				const active = await deps.getContext();
				if (!active || !validId(active.auth.accountId) || typeof active.auth.accessToken !== "string" || !/^[\x21-\x7e]+$/.test(active.auth.accessToken) ||
					!Number.isSafeInteger(active.generation) || !active.sessionId) return { kind: "unavailable" };
				// Copy values: an in-place auth mutation must not mutate our comparison baseline.
				context = { ...active, auth: { ...active.auth } };
				try { lease = await deps.store.acquire(context.auth.accountId); }
				catch { return { kind: "blocked", journalFailed: true }; }
				if (!(await current())) return { kind: "cancelled" };
				let record: CodexResetRecord | undefined;
				try { record = await lease.read(); }
				catch { return { kind: "blocked", journalFailed: true }; }
				if (!(await current())) return { kind: "cancelled" };

				const recovering = record?.status === "pending";
				if (record?.status === "pending") {
					// No GET/list/count can settle uncertainty. Only explicit same-key POST can.
					const accepted = await interaction.confirm({
						kind: "recovery", scope: "active-account", cancelFirst: true,
						creditId: record.creditId, requestId: record.requestId, expiresAt: record.expiresAt,
					});
					if (!(await current()) || accepted !== true) return { kind: "cancelled" };
				} else {
					const snapshot = await deps.readQuota(context.auth, options);
					if (!(await current())) return { kind: "cancelled" };
					const choices = eligible(snapshot, now());
					if (!choices.length) return { kind: "unavailable" };
					const creditId = await interaction.choose(choices.map((choice) => ({ ...choice })));
					if (!(await current()) || creditId === undefined) return { kind: "cancelled" };
					const selected = choices.find((choice) => choice.creditId === creditId);
					if (!selected) return { kind: "unavailable" };
					const accepted = await interaction.confirm({ ...selected, kind: "new", scope: "active-account", cancelFirst: true });
					if (!(await current()) || accepted !== true) return { kind: "cancelled" };
					const fresh = await deps.readQuota(context.auth, options);
					if (!(await current())) return { kind: "cancelled" };
					const available = eligible(fresh, now()).find((choice) => choice.creditId === selected.creditId);
					// Never silently change the expiry the user just confirmed.
					if (!available || available.expiresAt !== selected.expiresAt) return { kind: "unavailable" };
					record = {
						version: 1, status: "pending", accountId: context.auth.accountId,
						creditId: available.creditId, requestId: uuid(),
						...(available.expiresAt === undefined ? {} : { expiresAt: available.expiresAt }),
					};
					if (!(await current())) return { kind: "cancelled" };
					try { await lease.write(record); }
					catch { return { kind: "blocked", journalFailed: true }; }
					// Persistence is asynchronous: recheck expiry/context after its completion.
					const dispatchCurrent = await current();
					const dispatchNow = now();
					if (!dispatchCurrent || !Number.isFinite(dispatchNow) || (record.expiresAt !== undefined && record.expiresAt <= dispatchNow))
						return resolveNotSent(record);
				}

				// Await the real active auth lookup; no further async work before invocation.
				// Recovery ignores current availability/expiry and uses the stored key.
				if (!(await current())) return recovering ? { kind: "cancelled" } : resolveNotSent(record);
				const finalNow = now();
				if (!recovering && (!Number.isFinite(finalNow) || (record.expiresAt !== undefined && record.expiresAt <= finalNow)))
					return resolveNotSent(record);
				let response: Awaited<ReturnType<typeof consumeCodexReset>>;
				try {
					invoked = true;
					const received = await consume(context.auth, { creditId: record.creditId, requestId: record.requestId }, options);
					if (received.kind === "confirmed" && ["reset", "nothing_to_reset", "no_credit", "already_redeemed"].includes(received.code) &&
						Number.isSafeInteger(received.windowsReset) && received.windowsReset >= 0) {
						response = { kind: "confirmed", code: received.code, windowsReset: received.windowsReset };
					} else if (received.kind === "not-sent") response = { kind: "not-sent", reason: received.reason };
					else response = { kind: "unknown" };
				} catch { response = { kind: "unknown" }; }
				if (response.kind === "not-sent") {
					invoked = false; // The adapter explicitly proved no dispatch in THIS invocation.
					// That says nothing about an earlier pending request's server outcome.
					if (recovering) return response.reason === "aborted" ? { kind: "cancelled" } : { kind: "blocked", journalFailed: false };
					const resolution = await resolveNotSent(record);
					return resolution.kind === "cancelled" && response.reason !== "aborted" ? { kind: "blocked", journalFailed: false } : resolution;
				}

				// Preserve a definite server outcome even if later bookkeeping unexpectedly throws.
				result = response.kind === "confirmed"
					? { kind: "confirmed", code: response.code, windowsReset: response.windowsReset, refreshFailed: true, journalFailed: true }
					: { kind: "unknown", refreshFailed: true, journalFailed: false };
				let journalFailed = false;
				if (response.kind === "confirmed") {
					try { await lease.write({ ...record, status: "resolved", confirmedCode: response.code }); }
					catch { journalFailed = true; }
				}
				let refreshFailed = false;
				try {
					if (!(await sameContext())) refreshFailed = true;
					else { await deps.refresh(context); if (!(await sameContext())) refreshFailed = true; }
				} catch { refreshFailed = true; }
				return response.kind === "confirmed"
					? { kind: "confirmed", code: response.code, windowsReset: response.windowsReset, refreshFailed, journalFailed }
					: { kind: "unknown", refreshFailed, journalFailed };
			}

			try { result = await attempt(); }
			catch {
				if (!invoked) result = { kind: "blocked", journalFailed: false };
				else if (result.kind !== "confirmed") result = { kind: "unknown", refreshFailed: true, journalFailed: false };
			}
			finally {
				try { await lease?.release(); }
				catch {
					result = result.kind === "confirmed" || result.kind === "unknown"
						? { ...result, journalFailed: true } : { kind: "blocked", journalFailed: true };
				} finally { busy = false; }
			}
			return result;
		},
	};
}

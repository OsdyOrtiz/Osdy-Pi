import { arch, platform, release } from "node:os";

export type CodexUsageWindow = {
	usedPercent: number;
	windowMinutes: number | undefined;
	resetsAt: number | undefined;
};

export type CodexUsageBucket = {
	id: string;
	label: string | undefined;
	primary: CodexUsageWindow | undefined;
	secondary: CodexUsageWindow | undefined;
};

export type CodexUsageCredits = {
	hasCredits: boolean;
	unlimited: boolean;
	balance: string | undefined;
	resetCreditCount: number | undefined;
};

export type CodexBankedResetDetail = {
	/** Exact backend identity for actions; never render this value. */
	id: string;
	/** Epoch milliseconds; undefined is unknown, never unlimited validity. */
	expiresAt: number | undefined;
};

export type CodexUsageSnapshot = {
	planType: string | undefined;
	ordinaryUsageAllowed: boolean | undefined;
	buckets: CodexUsageBucket[];
	credits: CodexUsageCredits | undefined;
	bankedResetCount?: number | undefined;
	/** Undefined means unavailable; a successful list may be empty or partial. */
	bankedResetDetails?: CodexBankedResetDetail[] | undefined;
	fetchedAt: number;
};

export type CodexUsageAuth = {
	accessToken: string;
	accountId: string;
};

type FetchCodexUsageOptions = {
	fetch?: typeof globalThis.fetch;
	now?: () => number;
	signal?: AbortSignal;
	timeoutMs?: number;
};

const USAGE_URL = "https://chatgpt.com/backend-api/wham/usage";
const RESET_DETAILS_URL = "https://chatgpt.com/backend-api/wham/rate-limit-reset-credits";
const REQUEST_ABORTED = "Codex usage request timed out or was cancelled";
const MAX_RESPONSE_BYTES = 1_000_000;
const DEFAULT_TIMEOUT_MS = 10_000;

type UnknownRecord = Record<string, unknown>;

function createPiUserAgent(): string {
	return `pi (${platform()} ${release()}; ${arch()})`;
}

function asRecord(value: unknown, label: string): UnknownRecord {
	if (!value || typeof value !== "object" || Array.isArray(value))
		throw new Error(`Codex usage ${label} is invalid`);
	return value as UnknownRecord;
}

function optionalString(value: unknown, label: string): string | undefined {
	if (value === undefined || value === null) return undefined;
	if (typeof value !== "string")
		throw new Error(`Codex usage ${label} is invalid`);
	return value;
}

function optionalBoolean(value: unknown, label: string): boolean | undefined {
	if (value === undefined || value === null) return undefined;
	if (typeof value !== "boolean")
		throw new Error(`Codex usage ${label} is invalid`);
	return value;
}

function optionalNumber(value: unknown, label: string): number | undefined {
	if (value === undefined || value === null) return undefined;
	if (typeof value !== "number" || !Number.isFinite(value))
		throw new Error(`Codex usage ${label} is invalid`);
	return value;
}

function parseBankedResetCount(value: unknown): number | undefined {
	if (value === undefined || value === null) return undefined;
	const summary = asRecord(value, "rate_limit_reset_credits");
	const label = "rate_limit_reset_credits.available_count";
	const count = optionalNumber(summary.available_count, label);
	if (count !== undefined && (!Number.isInteger(count) || count < 0))
		throw new Error(`Codex usage ${label} is invalid`);
	return count;
}

function parseResetExpiry(value: unknown): number | undefined {
	if (typeof value !== "string") return undefined;
	const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|[+-](\d{2}):(\d{2}))$/.exec(value);
	if (!match) return undefined;
	const year = Number(match[1]);
	const month = Number(match[2]);
	const day = Number(match[3]);
	const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
	const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
	// Date.parse rolls some impossible dates forward; never invent an expiry.
	if (month < 1 || month > 12 || day < 1 || day > (days[month - 1] ?? 0) ||
		Number(match[4]) > 23 || Number(match[5]) > 59 || Number(match[6]) > 59 ||
		Number(match[7] ?? 0) > 23 || Number(match[8] ?? 0) > 59) return undefined;
	const expiresAt = Date.parse(value);
	return Number.isFinite(expiresAt) ? expiresAt : undefined;
}

function parseResetDetails(input: unknown): CodexBankedResetDetail[] {
	const payload = asRecord(input, "reset details");
	if (!Array.isArray(payload.credits)) throw new Error("Codex reset details are invalid");
	const details: CodexBankedResetDetail[] = [];
	const seen = new Set<string>();
	for (const entry of payload.credits) {
		if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
		const credit = entry as UnknownRecord;
		if (credit.status !== "available" || credit.reset_type !== "codex_rate_limits" ||
			typeof credit.id !== "string" || !credit.id.trim() || seen.has(credit.id)) continue;
		seen.add(credit.id);
		details.push({ id: credit.id, expiresAt: parseResetExpiry(credit.expires_at) });
	}
	return details;
}

function parseWindow(
	value: unknown,
	label: string,
): CodexUsageWindow | undefined {
	if (value === undefined || value === null) return undefined;
	const window = asRecord(value, label);
	const usedPercent = window.used_percent;
	if (typeof usedPercent !== "number" || !Number.isFinite(usedPercent))
		throw new Error("Codex usage used_percent is invalid");
	if (usedPercent < 0 || usedPercent > 100)
		throw new Error("Codex usage used_percent is out of range");
	const seconds = window.limit_window_seconds;
	if (
		seconds !== undefined &&
		(typeof seconds !== "number" || !Number.isFinite(seconds) || seconds < 0)
	)
		throw new Error("Codex usage limit_window_seconds is invalid");
	const resetAt = window.reset_at;
	if (
		resetAt !== undefined &&
		(typeof resetAt !== "number" || !Number.isFinite(resetAt))
	)
		throw new Error("Codex usage reset_at is invalid");
	return {
		usedPercent,
		windowMinutes:
			typeof seconds === "number" ? Math.round(seconds / 60) : undefined,
		resetsAt: typeof resetAt === "number" ? resetAt : undefined,
	};
}

function parseBucket(value: unknown): CodexUsageBucket | undefined {
	const bucket = asRecord(value, "additional rate limit");
	const id = bucket.metered_feature;
	if (typeof id !== "string" || id.trim().length === 0)
		throw new Error("Codex usage metered_feature is invalid");
	const rateLimit = bucket.rate_limit;
	if (rateLimit === undefined || rateLimit === null) return undefined;
	const rate = asRecord(rateLimit, "additional rate limit");
	const primary = parseWindow(rate.primary_window, "primary_window");
	const secondary = parseWindow(rate.secondary_window, "secondary_window");
	if (!primary && !secondary) return undefined;
	return {
		id,
		label: optionalString(bucket.limit_name, "limit_name"),
		primary,
		secondary,
	};
}

export function parseCodexUsagePayload(
	input: unknown,
	fetchedAt = Date.now(),
): CodexUsageSnapshot {
	const payload = asRecord(input, "payload");
	const rateLimit = asRecord(payload.rate_limit, "rate_limit");
	const primary = parseWindow(rateLimit.primary_window, "primary_window");
	const secondary = parseWindow(rateLimit.secondary_window, "secondary_window");
	if (!primary && !secondary)
		throw new Error("Codex usage does not contain any quota windows");
	const additional = payload.additional_rate_limits;
	if (
		additional !== undefined &&
		additional !== null &&
		!Array.isArray(additional)
	)
		throw new Error("Codex usage additional_rate_limits is invalid");
	const buckets: CodexUsageBucket[] = [
		{ id: "codex", label: undefined, primary, secondary },
	];
	for (const bucket of additional ?? []) {
		const parsed = parseBucket(bucket);
		if (parsed) buckets.push(parsed);
	}
	const creditsValue = payload.credits;
	let credits: CodexUsageCredits | undefined;
	if (creditsValue !== undefined && creditsValue !== null) {
		const rawCredits = asRecord(creditsValue, "credits");
		const hasCredits = optionalBoolean(rawCredits.has_credits, "has_credits");
		const unlimited = optionalBoolean(rawCredits.unlimited, "unlimited");
		if (hasCredits === undefined || unlimited === undefined)
			throw new Error("Codex usage credits are invalid");
		credits = {
			hasCredits,
			unlimited,
			balance: optionalString(rawCredits.balance, "credit balance"),
			resetCreditCount: optionalNumber(
				rawCredits.reset_credit_count,
				"reset_credit_count",
			),
		};
	}
	return {
		planType: optionalString(payload.plan_type, "plan_type"),
		ordinaryUsageAllowed: optionalBoolean(
			payload.ordinary_usage_allowed,
			"ordinary_usage_allowed",
		),
		buckets,
		credits,
		bankedResetCount: parseBankedResetCount(payload.rate_limit_reset_credits),
		fetchedAt,
	};
}

export function extractCodexAccountId(accessToken: string): string {
	const payload = accessToken.split(".")[1];
	if (!payload) throw new Error("Codex account ID is unavailable");
	try {
		const decoded = JSON.parse(
			Buffer.from(payload, "base64url").toString("utf8"),
		) as unknown;
		const token = asRecord(decoded, "token");
		const auth = asRecord(token["https://api.openai.com/auth"], "token auth");
		const accountId = auth.chatgpt_account_id;
		if (typeof accountId !== "string" || accountId.length === 0)
			throw new Error("Codex account ID is unavailable");
		return accountId;
	} catch {
		throw new Error("Codex account ID is unavailable");
	}
}

/** Bound injected transports and body readers even when they ignore abort. */
async function withAbort<T>(pending: Promise<T>, signal: AbortSignal): Promise<T> {
	let onAbort = (): void => {};
	const aborted = new Promise<never>((_resolve, reject) => {
		onAbort = () => reject(new Error(REQUEST_ABORTED));
		signal.addEventListener("abort", onAbort, { once: true });
		if (signal.aborted) onAbort();
	});
	try { return await Promise.race([pending, aborted]); }
	finally { signal.removeEventListener("abort", onAbort); }
}

function cancelUnreadBody(response: Response): void {
	// Never wait on cleanup or replace the original failure.
	try {
		void response.body?.cancel().catch(() => {});
	} catch {
		// Best effort, including injected streams that throw synchronously.
	}
}

async function readBoundedJson(response: Response, signal: AbortSignal): Promise<unknown> {
	const length = response.headers.get("content-length");
	if (
		length !== null &&
		(!/^\d+$/.test(length) || Number(length) > MAX_RESPONSE_BYTES)
	) {
		cancelUnreadBody(response);
		throw new Error("Codex usage response is too large");
	}
	if (!response.body) throw new Error("Codex usage response is unavailable");
	const reader = response.body.getReader();
	const chunks: Uint8Array[] = [];
	let size = 0;
	try {
		while (true) {
			const next = await withAbort(reader.read(), signal);
			if (next.done) break;
			size += next.value.byteLength;
			if (size > MAX_RESPONSE_BYTES)
				throw new Error("Codex usage response is too large");
			chunks.push(next.value);
		}
	} catch (error) {
		// Cancellation must not introduce another wait on an uncooperative stream.
		void reader.cancel().catch(() => {});
		throw error;
	} finally {
		reader.releaseLock();
	}
	const merged = new Uint8Array(size);
	let offset = 0;
	for (const chunk of chunks) {
		merged.set(chunk, offset);
		offset += chunk.byteLength;
	}
	try {
		return JSON.parse(new TextDecoder().decode(merged)) as unknown;
	} catch {
		throw new Error("Codex usage response is invalid");
	}
}

export type ConsumeCodexResetRequest = {
	/** Caller-owned UUID, reused for the same logical attempt. */
	requestId: string;
	/** Exact selected backend ID; never let the backend auto-select. */
	creditId: string;
};

export type ConsumeCodexResetOptions = {
	fetch?: typeof globalThis.fetch;
	signal?: AbortSignal;
	timeoutMs?: number;
};

export type ConsumeCodexResetCode = "reset" | "nothing_to_reset" | "no_credit" | "already_redeemed";

export type ConsumeCodexResetResult =
	| { kind: "not-sent"; reason: "invalid-request-id" | "invalid-credit-id" | "invalid-auth" | "invalid-timeout" | "aborted" }
	| { kind: "unknown" }
	| { kind: "confirmed"; code: ConsumeCodexResetCode; windowsReset: number };

/** One attempt only: dispatch is the boundary beyond which cancellation is uncertain. */
export async function consumeCodexReset(
	auth: CodexUsageAuth,
	request: ConsumeCodexResetRequest,
	options: ConsumeCodexResetOptions = {},
): Promise<ConsumeCodexResetResult> {
	if (typeof request?.requestId !== "string" ||
		!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(request.requestId))
		return { kind: "not-sent", reason: "invalid-request-id" };
	if (typeof request.creditId !== "string" || !request.creditId.trim())
		return { kind: "not-sent", reason: "invalid-credit-id" };
	// Visible ASCII only: reject malformed headers rather than relying on fetch to do so.
	if (typeof auth?.accessToken !== "string" || !/^[\x21-\x7e]+$/.test(auth.accessToken) ||
		typeof auth.accountId !== "string" || !/^[\x21-\x7e]+$/.test(auth.accountId))
		return { kind: "not-sent", reason: "invalid-auth" };
	const timeoutMs = options.timeoutMs === undefined ? DEFAULT_TIMEOUT_MS : options.timeoutMs;
	// Node timers overflow above the signed 32-bit range.
	if (!Number.isInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > 2_147_483_647)
		return { kind: "not-sent", reason: "invalid-timeout" };
	if (options.signal?.aborted) return { kind: "not-sent", reason: "aborted" };
	let headers: Headers;
	try {
		headers = new Headers({
			accept: "application/json",
			"content-type": "application/json",
			authorization: `Bearer ${auth.accessToken}`,
			"chatgpt-account-id": auth.accountId,
			originator: "pi",
			"user-agent": createPiUserAgent(),
		});
	} catch {
		return { kind: "not-sent", reason: "invalid-auth" };
	}
	const timeout = AbortSignal.timeout(timeoutMs);
	const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;
	const init: RequestInit = {
		method: "POST", headers, redirect: "error", signal,
		body: JSON.stringify({ redeem_request_id: request.requestId, credit_id: request.creditId }),
	};
	if (signal.aborted) return { kind: "not-sent", reason: "aborted" };
	const fetcher = options.fetch ?? globalThis.fetch;
	try {
		// Even a synchronous throw from fetch is conservatively post-dispatch.
		const response = await withAbort(fetcher(`${RESET_DETAILS_URL}/consume`, init), signal);
		if (!response.ok || signal.aborted) {
			cancelUnreadBody(response);
			return { kind: "unknown" };
		}
		const payload = asRecord(await readBoundedJson(response, signal), "reset result");
		const code = payload.code;
		if (signal.aborted || (code !== "reset" && code !== "nothing_to_reset" &&
			code !== "no_credit" && code !== "already_redeemed")) return { kind: "unknown" };
		const windowsReset = payload.windows_reset === undefined ? 0 : payload.windows_reset;
		if (typeof windowsReset !== "number" || !Number.isSafeInteger(windowsReset) || windowsReset < 0)
			return { kind: "unknown" };
		return { kind: "confirmed", code, windowsReset };
	} catch {
		// Never expose raw errors/bodies or tell a caller this is safe to repeat.
		return { kind: "unknown" };
	}
}

export async function fetchCodexUsage(
	auth: CodexUsageAuth,
	options: FetchCodexUsageOptions = {},
): Promise<CodexUsageSnapshot> {
	const fetcher = options.fetch ?? globalThis.fetch;
	const timeout = AbortSignal.timeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
	const signal = options.signal
		? AbortSignal.any([options.signal, timeout])
		: timeout;
	const init: RequestInit = {
		method: "GET",
		headers: {
			accept: "application/json",
			authorization: `Bearer ${auth.accessToken}`,
			"chatgpt-account-id": auth.accountId,
			originator: "pi",
			"user-agent": createPiUserAgent(),
		},
		redirect: "error",
		signal,
	};
	if (signal.aborted) throw new Error(REQUEST_ABORTED);
	let response: Response;
	try {
		response = await withAbort(fetcher(USAGE_URL, init), signal);
	} catch (error) {
		if (signal.aborted) throw new Error(REQUEST_ABORTED);
		void error;
		throw new Error("Codex usage is temporarily unavailable");
	}
	if (!response.ok) cancelUnreadBody(response);
	if (response.status === 401)
		throw new Error("Codex session expired; use /login to sign in again");
	if (response.status === 403)
		throw new Error("Codex usage access is unavailable or forbidden");
	if (!response.ok) throw new Error("Codex usage is temporarily unavailable");
	const snapshot = parseCodexUsagePayload(
		await readBoundedJson(response, signal),
		(options.now ?? Date.now)(),
	);
	if ((snapshot.bankedResetCount ?? 0) > 0 && !signal.aborted) {
		try {
			// One timeout budget, headers and redirect policy for both account-bound GETs.
			const details = await withAbort(fetcher(RESET_DETAILS_URL, init), signal);
			if (details.ok) snapshot.bankedResetDetails = parseResetDetails(await readBoundedJson(details, signal));
			else cancelUnreadBody(details);
		} catch {
			// Optional details never replace the authoritative summary or quotas.
		}
	}
	if (options.signal?.aborted) throw new Error(REQUEST_ABORTED);
	return snapshot;
}

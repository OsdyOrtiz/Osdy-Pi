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

export type CodexUsageSnapshot = {
	planType: string | undefined;
	ordinaryUsageAllowed: boolean | undefined;
	buckets: CodexUsageBucket[];
	credits: CodexUsageCredits | undefined;
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

async function readBoundedJson(response: Response): Promise<unknown> {
	const length = response.headers.get("content-length");
	if (
		length !== null &&
		(!/^\d+$/.test(length) || Number(length) > MAX_RESPONSE_BYTES)
	)
		throw new Error("Codex usage response is too large");
	if (!response.body) throw new Error("Codex usage response is unavailable");
	const reader = response.body.getReader();
	const chunks: Uint8Array[] = [];
	let size = 0;
	try {
		while (true) {
			const next = await reader.read();
			if (next.done) break;
			size += next.value.byteLength;
			if (size > MAX_RESPONSE_BYTES)
				throw new Error("Codex usage response is too large");
			chunks.push(next.value);
		}
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

export async function fetchCodexUsage(
	auth: CodexUsageAuth,
	options: FetchCodexUsageOptions = {},
): Promise<CodexUsageSnapshot> {
	const fetcher = options.fetch ?? globalThis.fetch;
	const timeout = AbortSignal.timeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
	const signal = options.signal
		? AbortSignal.any([options.signal, timeout])
		: timeout;
	let response: Response;
	try {
		response = await fetcher(USAGE_URL, {
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
		});
	} catch (error) {
		if (signal.aborted)
			throw new Error("Codex usage request timed out or was cancelled");
		void error;
		throw new Error("Codex usage is temporarily unavailable");
	}
	if (response.status === 401)
		throw new Error("Codex session expired; use /login to sign in again");
	if (response.status === 403)
		throw new Error("Codex usage access is unavailable or forbidden");
	if (!response.ok) throw new Error("Codex usage is temporarily unavailable");
	return parseCodexUsagePayload(
		await readBoundedJson(response),
		(options.now ?? Date.now)(),
	);
}

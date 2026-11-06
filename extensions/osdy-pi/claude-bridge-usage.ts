export type ClaudeBridgeUsageWindow = Readonly<{
	usedPercent: number | undefined;
	resetsAt: number | undefined;
}>;

export type ClaudeBridgeUsageSnapshot = Readonly<{
	session: ClaudeBridgeUsageWindow | undefined;
	weekly: ClaudeBridgeUsageWindow | undefined;
	overageIncluded: ClaudeBridgeUsageWindow | undefined;
	status: string | undefined;
	reset: number | undefined;
	representativeClaim: string | undefined;
	overageStatus: string | undefined;
	overageReset: number | undefined;
	capturedAt: number;
}>;

const PREFIX = "anthropic-ratelimit-unified-";
const MAX_DATE_SECONDS = 8_640_000_000_000;

function parseText(value: unknown): string | undefined {
	if (typeof value !== "string") return undefined;
	return value.trim() || undefined;
}

function parseUtilization(value: unknown): number | undefined {
	if (typeof value !== "string" || !/^(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value)) return undefined;
	const fraction = Number(value);
	if (!Number.isFinite(fraction) || fraction < 0 || fraction > 1) return undefined;
	// An underflowed nonzero number is not a reported zero.
	if (fraction === 0 && /[1-9]/.test(value.split(/[eE]/)[0] ?? "")) return undefined;
	return fraction * 100;
}

function parseReset(value: unknown): number | undefined {
	if (typeof value !== "string" || !/^\d+$/.test(value)) return undefined;
	const seconds = Number(value);
	return Number.isSafeInteger(seconds) && seconds > 0 && seconds <= MAX_DATE_SECONDS ? seconds : undefined;
}

/** Parse normalized bridge headers; reset fields are Unix seconds, capturedAt is milliseconds. */
export function parseClaudeBridgeUsage(
	headers: unknown,
	capturedAt = Date.now(),
): ClaudeBridgeUsageSnapshot {
	const entries = new Map<string, string>();
	if (headers !== null && typeof headers === "object" && !Array.isArray(headers)) {
		for (const [key, value] of Object.entries(headers)) {
			if (typeof value === "string") entries.set(key, value);
		}
	}
	const get = (name: string): string | undefined => entries.get(`${PREFIX}${name}`);
	const window = (name: string): ClaudeBridgeUsageWindow | undefined => {
		const usedPercent = parseUtilization(get(`${name}-utilization`));
		const resetsAt = parseReset(get(`${name}-reset`));
		return usedPercent === undefined && resetsAt === undefined ? undefined : { usedPercent, resetsAt };
	};
	return {
		session: window("5h"),
		weekly: window("7d"),
		overageIncluded: window("7d_oi"),
		status: parseText(get("status")),
		reset: parseReset(get("reset")),
		representativeClaim: parseText(get("representative-claim")),
		overageStatus: parseText(get("overage-status")),
		overageReset: parseReset(get("overage-reset")),
		capturedAt,
	};
}

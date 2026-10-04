import { isProfileName, narrowStoredProfileCodexCredential } from "./account-profiles.js";
import { extractCodexAccountId, fetchCodexUsage, type CodexUsageSnapshot } from "./codex-usage.js";

export type ProfileCodexUsageResult =
	| { status: "ready"; profile: string; quotaSnapshot: CodexUsageSnapshot; checkedAt: number }
	| { status: "unavailable"; profile: string | undefined; checkedAt: number; reason: "invalid-profile" | "stored-credentials-unavailable" | "remote-usage-unavailable" }
	| { status: "cancelled"; profile: string | undefined; checkedAt: number; reason: "cancelled" };

export type ProfileCodexUsageDependencies = {
	/** Must read only the requested profile's stored snapshot, never active auth. */
	readCredentials(profile: string): Promise<unknown>;
	fetch?: typeof globalThis.fetch;
	now?: () => number;
	signal?: AbortSignal;
	timeoutMs?: number;
};

function validateTokenClaims(access: string, now: number): void {
	const parts = access.split(".");
	if (parts.length !== 3 || parts.some((part) => !/^[A-Za-z0-9_-]+$/.test(part))) throw new Error("Invalid token.");
	const header: unknown = JSON.parse(Buffer.from(parts[0] ?? "", "base64url").toString("utf8"));
	const claims: unknown = JSON.parse(Buffer.from(parts[1] ?? "", "base64url").toString("utf8"));
	if (!header || typeof header !== "object" || Array.isArray(header) ||
		!claims || typeof claims !== "object" || Array.isArray(claims)) throw new Error("Invalid token.");
	// These are unverified claims, not proof of identity or server-side validity.
	if ("exp" in claims && (typeof claims.exp !== "number" || !Number.isFinite(claims.exp) || claims.exp * 1000 <= now)) throw new Error("Expired token.");
	if ("nbf" in claims && (typeof claims.nbf !== "number" || !Number.isFinite(claims.nbf) || claims.nbf * 1000 > now)) throw new Error("Token not yet usable.");
}

/** Independent read-only preview: no registry, context, refresh, activation or persistence. */
export async function requestProfileCodexUsage(input: unknown, dependencies: ProfileCodexUsageDependencies): Promise<ProfileCodexUsageResult> {
	const now = dependencies.now ?? Date.now;
	let profile: string | undefined;
	const cancelled = (): ProfileCodexUsageResult => ({ status: "cancelled", profile, checkedAt: now(), reason: "cancelled" });
	const unavailable = (reason: "invalid-profile" | "stored-credentials-unavailable" | "remote-usage-unavailable"): ProfileCodexUsageResult => ({ status: "unavailable", profile, checkedAt: now(), reason });
	if (dependencies.signal?.aborted) return cancelled();
	if (typeof input !== "string" || !isProfileName(input)) return unavailable("invalid-profile");
	let accessToken: string;
	let accountId: string;
	try {
		const raw = await dependencies.readCredentials(input);
		if (dependencies.signal?.aborted) return cancelled();
		const credential = narrowStoredProfileCodexCredential(raw);
		if (!credential || credential.profile.toLowerCase() !== input.toLowerCase()) return unavailable("stored-credentials-unavailable");
		profile = credential.profile;
		const checkedAt = now();
		if (credential.expires <= checkedAt) return unavailable("stored-credentials-unavailable");
		accessToken = credential.access;
		validateTokenClaims(accessToken, checkedAt);
		accountId = extractCodexAccountId(accessToken);
		if (!/^[A-Za-z0-9_-]+$/.test(accountId) || (credential.accountId !== undefined && credential.accountId !== accountId)) return unavailable("stored-credentials-unavailable");
	} catch {
		return dependencies.signal?.aborted ? cancelled() : unavailable("stored-credentials-unavailable");
	}
	if (dependencies.signal?.aborted) return cancelled();
	try {
		const quotaSnapshot = await fetchCodexUsage({ accessToken, accountId }, {
			...(dependencies.fetch ? { fetch: dependencies.fetch } : {}),
			now,
			...(dependencies.signal ? { signal: dependencies.signal } : {}),
			...(dependencies.timeoutMs !== undefined ? { timeoutMs: dependencies.timeoutMs } : {}),
		});
		if (dependencies.signal?.aborted) return cancelled();
		return { status: "ready", profile, quotaSnapshot, checkedAt: quotaSnapshot.fetchedAt };
	} catch {
		// Do not serialize reader/network errors or use another account as fallback.
		return dependencies.signal?.aborted ? cancelled() : unavailable("remote-usage-unavailable");
	}
}

import { createAccountManagementDependencies, isProfileName, readActiveProfileName, readStoredProfileCodexCredential, sharedAgentDir, switchAccountInPlace, type AccountContext, type AccountManagementDependencies } from "./account-profiles.js";
import type { ControlCenterService, ControlCenterRow, ControlCenterAccountAction } from "./control-center.js";
import { requestProfileCodexUsage, type ProfileCodexUsageResult } from "./profile-codex-usage.js";

export interface ControlCenterAccountService extends ControlCenterService<ControlCenterAccountAction> {
	cancelUsage?(): void;
	isCurrent?(): boolean;
}
function localTime(value: number | undefined): string {
	return value !== undefined && Number.isFinite(value) && !Number.isNaN(new Date(value).getTime())
		? new Date(value).toLocaleString() : "unknown";
}
function usageDetails(profile: string, result: ProfileCodexUsageResult): string[] {
	const lines = [`Profile: ${profile}`, `Checked: ${localTime(result.checkedAt)} (local time)`];
	if (result.status !== "ready") return [...lines, result.status === "cancelled" ? "Query cancelled." :
		result.reason === "remote-usage-unavailable" ? "Remote Codex usage unavailable (credentials may be rejected)." : "Stored credentials unavailable (missing, expired or unsupported)."];
	for (const bucket of result.quotaSnapshot.buckets) {
		if (!bucket.primary && !bucket.secondary) lines.push(`${bucket.label ?? bucket.id}: quota and next reset unknown.`);
		for (const [label, window] of [["Session", bucket.primary], ["Weekly", bucket.secondary]] as const) {
			if (window) lines.push(`${bucket.label ?? bucket.id} / ${label}: ${100 - window.usedPercent}% remaining · Next reset: ${localTime(window.resetsAt)}`);
		}
	}
	if (lines.length === 2) lines.push("Quota and next reset: unknown (no quota windows returned).");
	return lines;
}

export interface ControlCenterAccountBackend {
	profiles(): Promise<unknown>;
	active(): string | undefined;
	defaultProfile(): Promise<unknown>;
	switch(profile: string): Promise<boolean>;
	setDefault(profile: string | undefined): Promise<boolean>;
	usage?(profile: string, signal: AbortSignal): Promise<ProfileCodexUsageResult>;
	isCurrent?(): boolean;
}
function names(value: unknown): string[] {
	return Array.isArray(value) ? value.filter((name: unknown): name is string => typeof name === "string" && isProfileName(name)) : [];
}
function safeName(value: unknown): string | undefined {
	return typeof value === "string" && isProfileName(value) ? value : undefined;
}
type DefaultMetadata = { kind: "profile"; name: string } | { kind: "unset" | "unavailable" };
function defaultMetadata(value: unknown): DefaultMetadata {
	if (typeof value !== "object" || value === null || !("code" in value) || value.code !== 0 || !("stdout" in value) || typeof value.stdout !== "string") return { kind: "unavailable" };
	const output = value.stdout.trim();
	if (output === "No default account.") return { kind: "unset" };
	const name = safeName(output);
	return name ? { kind: "profile", name } : { kind: "unavailable" };
}

/** Metadata-only projection. Never interpolate backend stdout/stderr/errors. */
export function createControlCenterAccount(backend: ControlCenterAccountBackend): ControlCenterAccountService {
	let busy = false;
	let controller: AbortController | undefined;
	let preview: { profile: string; details: string[] } | undefined;
	const current = () => backend.isCurrent?.() ?? true;
	const cancelUsage = () => { controller?.abort(); controller = undefined; preview = undefined; };
	return {
		cancelUsage,
		isCurrent: current,
		async read() {
			let profiles: string[];
			try { profiles = names(await backend.profiles()); }
			catch { return { summary: "Account profiles unavailable", note: "Reopen to retry. Login remains Pi-owned (/login).", rows: [] }; }
			const active = safeName(backend.active());
			let metadata: DefaultMetadata = { kind: "unavailable" };
			try { metadata = defaultMetadata(await backend.defaultProfile()); } catch { /* Fixed metadata state only. */ }
			const defaultProfile = metadata.kind === "profile" ? metadata.name : undefined;
			const rows: ControlCenterRow[] = [];
			for (const profile of profiles) {
				rows.push({ label: `View usage: ${profile}`, current: false, action: { kind: "account-usage", profile },
					details: preview?.profile === profile && (backend.isCurrent?.() ?? true) ? preview.details : [`Profile: ${profile}`, "Explicit live Codex query using this profile's stored credentials snapshot; no automatic refresh.", "Missing or expired snapshots are unavailable. Local token history is not quota."] });
				const current = profile.toLowerCase() === active?.toLowerCase();
				if (!current) rows.push({ label: `Switch to ${profile}`, current: false, action: { kind: "account-switch", profile }, details: ["Switch in place after Pi is idle; next request uses this account."] });
				rows.push({ label: `Default: ${profile}`, current: profile.toLowerCase() === defaultProfile?.toLowerCase(), action: { kind: "account-default", profile }, details: [`Profile: ${profile}${current ? " (active)" : ""}`, "Default selects the account for future launcher startup."] });
			}
			rows.push({ label: "Clear default", current: false, action: { kind: "account-default", profile: undefined } });
			return { summary: `Current: ${active ?? "unmanaged"} | Default: ${defaultProfile ?? metadata.kind} | Profiles: ${profiles.length}`,
				note: "View usage queries Codex only; other actions require confirmation. Login remains Pi-owned (/login).", rows };
		},
		async apply(action) {
			if (action.kind === "account-usage") {
				if (busy || !current() || !backend.usage || !isProfileName(action.profile)) return { failed: true, message: "Profile usage unavailable." };
				cancelUsage();
				const request = new AbortController();
				controller = request;
				try {
					if (!names(await backend.profiles()).includes(action.profile) || request.signal.aborted || !current()) return { failed: true, message: "Profile usage unavailable." };
					const result = await backend.usage(action.profile, request.signal);
					if (controller !== request || request.signal.aborted || !current()) return { failed: true, message: "Query cancelled." };
					preview = { profile: action.profile, details: usageDetails(action.profile, result) };
					return { failed: result.status !== "ready", message: result.status === "ready" ? "Stored-profile Codex usage checked." : "Profile usage unavailable." };
				} catch {
					if (controller === request && !request.signal.aborted && current()) preview = { profile: action.profile, details: [`Profile: ${action.profile}`, "Checked: unknown", "Profile usage unavailable."] };
					return { failed: true, message: "Profile usage unavailable." };
				} finally { if (controller === request) controller = undefined; }
			}
			if (busy || controller || !current() || (action.kind !== "account-switch" && action.kind !== "account-default")) return { failed: true, message: "Account action unavailable." };
			busy = true;
			try {
				const profile = action.profile;
				if (profile !== undefined && (!isProfileName(profile) || !names(await backend.profiles()).includes(profile))) return { failed: true, message: "Profile no longer available. Reopen Account." };
				if (!current()) return { failed: true, message: "Account action unavailable." };
				if (action.kind === "account-switch" && action.profile.toLowerCase() === safeName(backend.active())?.toLowerCase()) return { failed: false, message: "Account already active." };
				const success = action.kind === "account-switch" ? await backend.switch(action.profile) : await backend.setDefault(profile);
				if (!success) return { failed: true, message: "Account operation failed; change not confirmed." };
				const message = action.kind === "account-switch"
					? "Account switched; next request uses it."
					: "Default account saved.";
				return { failed: false, message };
			} catch { return { failed: true, message: "Account operation failed; change not confirmed." }; }
			finally { busy = false; }
		},
	};
}

export function bindControlCenterAccount(ctx: AccountContext, refreshUsage: () => Promise<void>, requestRender: () => void,
	backend: AccountManagementDependencies = createAccountManagementDependencies({ refreshUsage, requestRender }),
	options: { isCurrent?: () => boolean; usage?: ControlCenterAccountBackend["usage"] } = {},
): ControlCenterAccountService {
	return createControlCenterAccount({
		isCurrent: options.isCurrent ?? (() => true),
		usage: options.usage ?? ((profile, signal) => requestProfileCodexUsage(profile, {
			readCredentials: async name => readStoredProfileCodexCredential(await sharedAgentDir(process.env), name), signal,
		})),
		profiles: () => backend.profiles(), active: readActiveProfileName,
		defaultProfile: () => backend.run(["account", "default"]),
		switch: profile => backend.activate ? switchAccountInPlace(ctx, profile, async name => {
			if (!(options.isCurrent?.() ?? true) || !ctx.isIdle()) throw new Error("Account action unavailable.");
			await backend.activate!(name);
		}, refreshUsage, requestRender) : Promise.resolve(false),
		setDefault: async profile => {
			if (!ctx.isIdle()) await ctx.waitForIdle();
			if (!(options.isCurrent?.() ?? true) || !ctx.isIdle()) return false;
			return (await backend.run(["account", "default", profile ?? "--clear"])).code === 0;
		},
	});
}

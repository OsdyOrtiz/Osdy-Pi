import { createAccountManagementDependencies, isProfileName, readActiveProfileName, switchAccountInPlace, type AccountContext, type AccountManagementDependencies } from "./account-profiles.js";
import type { ControlCenterService, ControlCenterRow, ControlCenterAccountAction } from "./control-center.js";

export interface ControlCenterAccountBackend {
	profiles(): Promise<unknown>;
	active(): string | undefined;
	defaultProfile(): Promise<unknown>;
	switch(profile: string): Promise<boolean>;
	setDefault(profile: string | undefined): Promise<boolean>;
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
export function createControlCenterAccount(backend: ControlCenterAccountBackend): ControlCenterService<ControlCenterAccountAction> {
	let busy = false;
	return {
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
				const current = profile.toLowerCase() === active?.toLowerCase();
				if (!current) rows.push({ label: `Switch to ${profile}`, current: false, action: { kind: "account-switch", profile }, details: ["Switch in place after Pi is idle; next request uses this account."] });
				rows.push({ label: `Default: ${profile}`, current: profile.toLowerCase() === defaultProfile?.toLowerCase(), action: { kind: "account-default", profile }, details: [`Profile: ${profile}${current ? " (active)" : ""}`, "Default selects the account for future launcher startup."] });
			}
			rows.push({ label: "Clear default", current: false, action: { kind: "account-default", profile: undefined } });
			return { summary: `Current: ${active ?? "unmanaged"} | Default: ${defaultProfile ?? metadata.kind} | Profiles: ${profiles.length}`,
				note: "Metadata only. Enter requests confirmation. Login remains Pi-owned (/login).", rows };
		},
		async apply(action) {
			if (busy || (action.kind !== "account-switch" && action.kind !== "account-default")) return { failed: true, message: "Account action unavailable." };
			busy = true;
			try {
				const profile = action.profile;
				if (profile !== undefined && (!isProfileName(profile) || !names(await backend.profiles()).includes(profile))) return { failed: true, message: "Profile no longer available. Reopen Account." };
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
): ControlCenterService<ControlCenterAccountAction> {
	return createControlCenterAccount({
		profiles: () => backend.profiles(), active: readActiveProfileName,
		defaultProfile: () => backend.run(["account", "default"]),
		switch: profile => backend.activate ? switchAccountInPlace(ctx, profile, backend.activate, refreshUsage, requestRender) : Promise.resolve(false),
		setDefault: async profile => (await backend.run(["account", "default", profile ?? "--clear"])).code === 0,
	});
}

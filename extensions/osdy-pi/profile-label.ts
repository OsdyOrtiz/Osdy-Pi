const PROFILE_NAME = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,62})$/;
const RESERVED_PROFILE_NAMES = new Set(["default", "profiles", "auth.json"]);

export function resolveActiveProfileLabel(
	env: { OSDY_PI_PROFILE_NAME?: string | undefined } = process.env,
): string | undefined {
	const profileName = env.OSDY_PI_PROFILE_NAME;
	return typeof profileName === "string" &&
		PROFILE_NAME.test(profileName) &&
		!RESERVED_PROFILE_NAMES.has(profileName.toLowerCase())
		? profileName
		: undefined;
}

function isCallable(value: unknown): value is (...args: unknown[]) => unknown {
	return typeof value === "function";
}

async function loadAccountProfiles(): Promise<unknown> {
	const moduleUrl = new URL(
		"../../scripts/osdy-pi-account-profiles.mjs",
		import.meta.url,
	).href;
	return import(moduleUrl);
}

/** Read visual identity only; never activate credentials or consult defaults. */
export async function readLastActiveProfileLabel(
	env: NodeJS.ProcessEnv = process.env,
	loadModule: () => Promise<unknown> = loadAccountProfiles,
): Promise<string | undefined> {
	try {
		const profiles = await loadModule();
		if (
			typeof profiles !== "object" || profiles === null ||
			!("getSharedAgentDir" in profiles) ||
			!isCallable(profiles.getSharedAgentDir) ||
			!("readActiveAccount" in profiles) ||
			!isCallable(profiles.readActiveAccount)
		) return undefined;
		const directory: unknown = profiles.getSharedAgentDir(env);
		if (typeof directory !== "string") return undefined;
		const active: unknown = await profiles.readActiveAccount(directory);
		if (
			typeof active !== "object" || active === null ||
			!("status" in active) || active.status !== "valid" ||
			!("profile" in active) || typeof active.profile !== "string"
		) return undefined;
		return resolveActiveProfileLabel({ OSDY_PI_PROFILE_NAME: active.profile });
	} catch {
		return undefined;
	}
}

export function formatModelMetadata(
	model: string,
	thinkingLevel: string,
	profileName: string | undefined,
): string {
	return profileName === undefined
		? `${model} · think ${thinkingLevel}`
		: `${model} · ${profileName} · think ${thinkingLevel}`;
}

export function resolveEditorTitleLabel(
	profileName: string | undefined,
): string {
	return profileName ?? "Osdy-Pi";
}

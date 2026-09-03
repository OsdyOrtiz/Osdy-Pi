const PROFILE_NAME = /^[a-z0-9](?:[a-z0-9-]{0,62})$/;
const RESERVED_PROFILE_NAMES = new Set(["default", "profiles", "auth.json"]);

export function resolveActiveProfileLabel(
	env: { OSDY_PI_PROFILE_NAME?: string | undefined } = process.env,
): string | undefined {
	const profileName = env.OSDY_PI_PROFILE_NAME;
	return typeof profileName === "string" &&
		PROFILE_NAME.test(profileName) &&
		!RESERVED_PROFILE_NAMES.has(profileName)
		? profileName
		: undefined;
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

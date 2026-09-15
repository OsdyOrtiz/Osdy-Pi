import { spawn as spawnChild } from "node:child_process";
import { fileURLToPath } from "node:url";
import type {
	ExtensionCommandContext,
	ExtensionContext,
} from "@earendil-works/pi-coding-agent";

const PROFILE_NAME = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,62})$/;
const RESERVED_PROFILE_NAMES = new Set(["default", "profiles", "auth.json"]);

function sameProfile(left: string | undefined, right: string | undefined): boolean {
	return left?.toLowerCase() === right?.toLowerCase();
}

export type AccountContext = Pick<
	ExtensionCommandContext,
	"isIdle" | "waitForIdle"
> & {
	shutdown?: ExtensionCommandContext["shutdown"];
	sessionManager?: Pick<
		ExtensionCommandContext["sessionManager"],
		"getSessionFile"
	>;
	ui: Pick<ExtensionContext["ui"], "notify" | "select" | "input">;
};

export interface AccountManagementDependencies {
	profiles(): Promise<string[]>;
	run(args: string[]): Promise<{ code: number; stdout: string; stderr: string }>;
	activeProfile?: string | undefined;
	activate?: (profile: string) => Promise<void>;
	refreshUsage?: (() => Promise<void>) | undefined;
}

export interface AccountProfilesCommandDependencies {
	refreshUsage?: (() => Promise<void>) | undefined;
}

function isProfileName(value: string): boolean {
	return PROFILE_NAME.test(value) && !RESERVED_PROFILE_NAMES.has(value.toLowerCase());
}

export async function sharedAgentDir(env: NodeJS.ProcessEnv): Promise<string> {
	const moduleUrl = new URL(
		"../../scripts/osdy-pi-account-profiles.mjs",
		import.meta.url,
	).href;
	const profiles = (await import(moduleUrl)) as {
		getSharedAgentDir(env: NodeJS.ProcessEnv): string;
	};
	return profiles.getSharedAgentDir(env);
}

export async function availableProfiles(baseDir: string): Promise<string[]> {
	const moduleUrl = new URL(
		"../../scripts/osdy-pi-account-profiles.mjs",
		import.meta.url,
	).href;
	const profiles = (await import(moduleUrl)) as {
		listProfiles(baseDir: string): Promise<string[]>;
	};
	return profiles.listProfiles(baseDir);
}

export async function switchAccountInPlace(
	ctx: AccountContext,
	profile: string,
	activate: (profile: string) => Promise<void>,
	refreshUsage?: () => Promise<void>,
): Promise<void> {
	if (!isProfileName(profile)) {
		ctx.ui.notify(
			"Cannot switch accounts: the selected profile name is invalid.",
			"warning",
		);
		return;
	}
	if (!ctx.isIdle()) await ctx.waitForIdle();
	try {
		await activate(profile);
	} catch {
		ctx.ui.notify(
			"Cannot switch accounts: the account files could not be safely activated.",
			"warning",
		);
		return;
	}
	process.env.OSDY_PI_PROFILE_NAME = profile;
	try {
		await refreshUsage?.();
	} catch {
		// Usage refresh failures must not make a completed account activation appear failed.
	}
	ctx.ui.notify(
		`Switched to ${profile}. Your next request uses this account.`,
		"info",
	);
}

function bundledLauncherPath(): string {
	return fileURLToPath(new URL("../../bin/osdy-pi.mjs", import.meta.url));
}

function validProfileName(value: string): boolean {
	return isProfileName(value);
}

function managementError(result: { code: number; stderr: string }): string {
	return (
		result.stderr
			.replaceAll(/[\r\n]+/g, " ")
			.trim()
			.slice(0, 180) || `command exited ${result.code}`
	);
}

export type DefaultAccountState =
	| { status: "valid"; profile: string }
	| { status: "unset" }
	| { status: "invalid" }
	| { status: "error"; message: string };

export function parseDefaultAccountResult(result: {
	code: number;
	stdout: string;
	stderr: string;
}): DefaultAccountState {
	if (result.code !== 0)
		return { status: "error", message: managementError(result) };
	const output = result.stdout.trim();
	if (output === "No default account.") return { status: "unset" };
	if (output === "Default account metadata is invalid; no account selected.")
		return { status: "invalid" };
	if (isProfileName(output)) return { status: "valid", profile: output };
	return {
		status: "error",
		message: `unexpected default account output: ${output.replaceAll(/[\r\n]+/g, " ").slice(0, 180) || "(empty)"}`,
	};
}

async function runManagementCommand(
	ctx: AccountContext,
	dependencies: AccountManagementDependencies,
	args: string[],
): Promise<{ code: number; stdout: string; stderr: string } | undefined> {
	try {
		return await dependencies.run(args);
	} catch {
		ctx.ui.notify(
			"Account operation failed before it could complete.",
			"warning",
		);
		return undefined;
	}
}

function markedProfiles(
	profiles: string[],
	activeProfile: string | undefined,
	defaultProfile: string | undefined,
): string[] {
	return profiles.map(
		(profile) =>
			`${profile}${sameProfile(profile, activeProfile) ? " (active)" : ""}${sameProfile(profile, defaultProfile) ? " (default)" : ""}`,
	);
}

async function currentDefault(
	dependencies: AccountManagementDependencies,
): Promise<DefaultAccountState> {
	let result: { code: number; stdout: string; stderr: string };
	try {
		result = await dependencies.run(["account", "default"]);
	} catch {
		return { status: "error", message: "account command could not be started" };
	}
	return parseDefaultAccountResult(result);
}

export async function manageAccountProfile(
	ctx: AccountContext,
	mode: "rename" | "remove",
	dependencies: AccountManagementDependencies,
): Promise<void> {
	let profiles: string[];
	try {
		profiles = await dependencies.profiles();
	} catch {
		ctx.ui.notify("Could not list account profiles.", "warning");
		return;
	}
	if (profiles.length === 0) {
		ctx.ui.notify("No account profiles are available.", "warning");
		return;
	}
	const selected = await ctx.ui.select(
		mode === "rename"
			? "Rename OpenAI account"
			: "Remove OpenAI account permanently",
		markedProfiles(profiles, dependencies.activeProfile, undefined),
	);
	if (selected === undefined) return;
	const activeMarker = selected.indexOf(" (");
	const target =
		activeMarker === -1 ? selected : selected.slice(0, activeMarker);
	if (!profiles.includes(target)) return;
	if (sameProfile(target, dependencies.activeProfile)) {
		ctx.ui.notify(
			"Cannot change the active profile. Switch to another profile first.",
			"warning",
		);
		return;
	}
	if (mode === "rename") {
		const newName = await ctx.ui.input("New profile name");
		if (newName === undefined) return;
		if (!validProfileName(newName)) {
			ctx.ui.notify(
				"Profile names use ASCII letters, numbers, and hyphens only.",
				"warning",
			);
			return;
		}
		const result = await runManagementCommand(ctx, dependencies, [
			"account",
			"rename",
			target,
			newName,
		]);
		if (result)
			ctx.ui.notify(
				result.code === 0
					? `Account profile renamed to ${newName}.`
					: `Rename failed: ${managementError(result)}`,
				result.code === 0 ? "info" : "warning",
			);
		return;
	}
	const defaultState = await currentDefault(dependencies);
	if (defaultState.status === "invalid" || defaultState.status === "error") {
		ctx.ui.notify(
			"Cannot safely remove an account while default metadata is unavailable; clear or fix the default account first.",
			"warning",
		);
		return;
	}
	let replacement: string | undefined;
	if (defaultState.status === "valid" && sameProfile(defaultState.profile, target)) {
		replacement = await ctx.ui.select(
			"Choose a new default account",
			profiles.filter((profile) => !sameProfile(profile, target)),
		);
		if (replacement === undefined) return;
	}
	const confirmation = await ctx.ui.input(
		`Type ${target} to permanently remove it`,
	);
	if (confirmation === undefined) return;
	if (confirmation !== target) {
		ctx.ui.notify(
			"Removal cancelled: confirmation did not match the profile name.",
			"warning",
		);
		return;
	}
	const args = ["account", "remove", target, "--confirm", target];
	if (replacement !== undefined) args.push("--replacement", replacement);
	const result = await runManagementCommand(ctx, dependencies, args);
	if (result)
		ctx.ui.notify(
			result.code === 0
				? `Account profile ${target} permanently removed.`
				: `Removal failed: ${managementError(result)}`,
			result.code === 0 ? "info" : "warning",
		);
}

export async function manageAccountProfiles(
	ctx: AccountContext,
	dependencies: AccountManagementDependencies,
): Promise<void> {
	for (;;) {
		let profiles: string[];
		try {
			profiles = await dependencies.profiles();
		} catch {
			ctx.ui.notify("Could not list account profiles.", "warning");
			return;
		}
		const defaultState = await currentDefault(dependencies);
		const defaultProfile =
			defaultState.status === "valid" ? defaultState.profile : undefined;
		const action = await ctx.ui.select("OpenAI account manager", [
			"Switch",
			"Add",
			"Default",
			"Rename",
			"Remove",
			"Account info",
			"Cancel",
		]);
		if (action === undefined || action === "Cancel") return;
		if (action === "Account info") {
			const defaultNote =
				defaultState.status === "invalid"
					? "\nDefault account metadata is invalid; clear or fix the default account."
					: defaultState.status === "error"
						? "\nDefault account unavailable."
						: "";
			ctx.ui.notify(
				`Accounts:\n${markedProfiles(profiles, dependencies.activeProfile, defaultProfile).join("\n") || "No account profiles."}${defaultNote}`,
				"info",
			);
			continue;
		}
		if (action === "Add") {
			const name = await ctx.ui.input("New profile name");
			if (name === undefined) continue;
			if (!validProfileName(name)) {
				ctx.ui.notify(
					"Profile names use ASCII letters, numbers, and hyphens only.",
					"warning",
				);
				continue;
			}
			const result = await runManagementCommand(ctx, dependencies, [
				"account",
				"create",
				name,
			]);
			if (result)
				ctx.ui.notify(
					result.code === 0
						? "Account profile created. Select it later via Switch, then run /login and select ChatGPT Plus/Pro (Codex)."
						: `Create failed: ${managementError(result)}`,
					result.code === 0 ? "info" : "warning",
				);
			continue;
		}
		if (action === "Default") {
			const choice = await ctx.ui.select("Default account", [
				"Show current",
				"Set default",
				"Clear default",
				"Back",
			]);
			if (choice === "Set default") {
				const profile = await ctx.ui.select("Choose default account", profiles);
				if (profile !== undefined) {
					const result = await runManagementCommand(ctx, dependencies, [
						"account",
						"default",
						profile,
					]);
					if (result)
						ctx.ui.notify(
							result.code === 0
								? `Default account set to ${profile}.`
								: `Default failed: ${managementError(result)}`,
							result.code === 0 ? "info" : "warning",
						);
				}
			} else if (choice === "Clear default") {
				const result = await runManagementCommand(ctx, dependencies, [
					"account",
					"default",
					"--clear",
				]);
				if (result)
					ctx.ui.notify(
						result.code === 0
							? "Default account cleared."
							: `Default failed: ${managementError(result)}`,
						result.code === 0 ? "info" : "warning",
					);
			} else if (choice === "Show current") {
				if (defaultState.status === "valid")
					ctx.ui.notify(`Default account: ${defaultState.profile}`, "info");
				else if (defaultState.status === "unset")
					ctx.ui.notify("No default account.", "info");
				else if (defaultState.status === "invalid")
					ctx.ui.notify(
						"Default account metadata is invalid; no account selected.",
						"warning",
					);
				else
					ctx.ui.notify(
						"Default account is unavailable; clear or fix the default account before continuing.",
						"warning",
					);
			}
			continue;
		}
		if (action === "Rename" || action === "Remove") {
			await manageAccountProfile(
				ctx,
				action.toLowerCase() as "rename" | "remove",
				dependencies,
			);
			continue;
		}
		if (profiles.length === 0) {
			ctx.ui.notify("No account profiles are available.", "warning");
			continue;
		}
		const target = await ctx.ui.select(
			"Switch OpenAI account",
			markedProfiles(
				profiles,
				dependencies.activeProfile,
				defaultProfile ?? undefined,
			),
		);
		if (target === undefined) continue;
		const marker = target.indexOf(" (");
		const profile = marker === -1 ? target : target.slice(0, marker);
		if (!profiles.includes(profile)) continue;
		if (sameProfile(profile, dependencies.activeProfile)) {
			ctx.ui.notify("That account is already active.", "info");
			continue;
		}
		if (dependencies.activate)
			await switchAccountInPlace(
				ctx,
				profile,
				dependencies.activate,
				dependencies.refreshUsage,
			);
		return;
	}
}

function runBundledCommand(
	args: string[],
): Promise<{ code: number; stdout: string; stderr: string }> {
	return new Promise((resolveResult, rejectResult) => {
		const child = spawnChild(process.execPath, [bundledLauncherPath(), ...args], {
			stdio: ["ignore", "pipe", "pipe"],
		});
		let stdout = "";
		let stderr = "";
		const append = (current: string, chunk: Buffer): string =>
			(current + chunk.toString("utf8")).slice(-1024);
		child.stdout?.on("data", (chunk: Buffer) => {
			stdout = append(stdout, chunk);
		});
		child.stderr?.on("data", (chunk: Buffer) => {
			stderr = append(stderr, chunk);
		});
		child.once("error", rejectResult);
		child.once("exit", (code) =>
			resolveResult({ code: code ?? 1, stdout, stderr }),
		);
	});
}

export function registerAccountProfilesCommand(
	pi: {
		registerCommand(
			name: string,
			options: {
				description: string;
				handler: (args: string, ctx: ExtensionCommandContext) => Promise<void>;
			},
		): void;
	},
	commandDependencies: AccountProfilesCommandDependencies = {},
): void {
	pi.registerCommand("osdy-account", {
		description: "Switch the active OpenAI account without restarting Pi.",
		handler: async (args, ctx) => {
			const mode = args.trim();
			if ((ctx as ExtensionCommandContext & { hasUI?: boolean }).hasUI === false) {
				ctx.ui.notify("Account manager requires an interactive Pi UI.", "warning");
				return;
			}
			const dependencies: AccountManagementDependencies = {
				profiles: async () => availableProfiles(await sharedAgentDir(process.env)),
				run: runBundledCommand,
				activeProfile: process.env.OSDY_PI_PROFILE_NAME,
				refreshUsage: commandDependencies.refreshUsage,
				activate: async (profile) => {
					const moduleUrl = new URL(
						"../../scripts/osdy-pi-account-profiles.mjs",
						import.meta.url,
					).href;
					const profiles = (await import(moduleUrl)) as {
						switchAccountAuth(baseDir: string, name: string): Promise<void>;
					};
					await profiles.switchAccountAuth(await sharedAgentDir(process.env), profile);
				},
			};
			if (mode === "rename" || mode === "remove") {
				await manageAccountProfile(ctx, mode, dependencies);
				return;
			}
			if (mode) {
				ctx.ui.notify("Usage: /osdy-account [rename|remove]", "warning");
				return;
			}
			await manageAccountProfiles(ctx, dependencies);
		},
	});
}

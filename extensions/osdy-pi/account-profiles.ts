import { spawn as spawnChild } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { readdir } from "node:fs/promises";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import { isAbsolute, join, resolve } from "node:path";
import type {
	ExtensionCommandContext,
	ExtensionContext,
} from "@earendil-works/pi-coding-agent";

const PROFILE_NAME = /^[a-z0-9](?:[a-z0-9-]{0,62})$/;
const RESERVED_PROFILE_NAMES = new Set(["default", "profiles", "auth.json"]);

export type AccountContext = Pick<
	ExtensionCommandContext,
	"isIdle" | "waitForIdle" | "shutdown"
> & {
	sessionManager: Pick<
		ExtensionCommandContext["sessionManager"],
		"getSessionFile"
	>;
	ui: Pick<ExtensionContext["ui"], "notify" | "select" | "input">;
};

export interface AccountHandoffDependencies {
	spawn(command: string, args: string[]): Promise<void>;
	launcher?: string;
}

export type StartupAccountContext = Pick<
	ExtensionContext,
	"hasUI" | "shutdown"
> & {
	sessionManager: Pick<ExtensionContext["sessionManager"], "getSessionFile">;
	ui: Pick<ExtensionContext["ui"], "notify">;
};

export interface StartupAccountHandoffDependencies {
	activeProfile?: string | undefined;
	run?(args: string[]): Promise<{ code: number; stdout: string; stderr: string }>;
	spawn?(command: string, args: string[]): Promise<void>;
	launcher?: string;
}

export interface AccountManagementDependencies {
	profiles(): Promise<string[]>;
	run(args: string[]): Promise<{ code: number; stdout: string; stderr: string }>;
	activeProfile?: string | undefined;
	handoff?: (profile: string) => Promise<void>;
}

type LauncherMessage =
	| { type: "osdy-pi-ready" }
	| { type: "osdy-pi-error"; message: string };

type ScheduleTimeout = (callback: () => void, delay: number) => NodeJS.Timeout;

const LAUNCHER_READY_TIMEOUT_MS = 10_000;

function isProfileName(value: string): boolean {
	return PROFILE_NAME.test(value) && !RESERVED_PROFILE_NAMES.has(value);
}

function sharedAgentDir(env: NodeJS.ProcessEnv): string {
	return resolve(
		env.OSDY_PI_SHARED_AGENT_DIR ??
			env.PI_CODING_AGENT_DIR ??
			join(homedir(), ".pi", "agent"),
	);
}

async function availableProfiles(baseDir: string): Promise<string[]> {
	try {
		const entries = await readdir(join(baseDir, "osdy-pi", "profiles"), {
			withFileTypes: true,
		});
		const profiles: string[] = [];
		for (const entry of entries) {
			if (entry.isDirectory() && isProfileName(entry.name))
				profiles.push(entry.name);
		}
		return profiles.sort(compareStrings);
	} catch (error: unknown) {
		if (isErrorCode(error, "ENOENT")) return [];
		throw error;
	}
}

function isErrorCode(error: unknown, code: string): boolean {
	return (
		typeof error === "object" &&
		error !== null &&
		"code" in error &&
		error.code === code
	);
}

function compareStrings(left: string, right: string): number {
	return left < right ? -1 : left > right ? 1 : 0;
}

export async function handoffToAccount(
	ctx: AccountContext,
	profile: string,
	dependencies: AccountHandoffDependencies,
): Promise<void> {
	if (!isProfileName(profile)) {
		ctx.ui.notify(
			"Cannot switch accounts: the selected profile name is invalid.",
			"warning",
		);
		return;
	}
	const sessionPath = ctx.sessionManager.getSessionFile();
	if (!sessionPath || !isAbsolute(sessionPath)) {
		ctx.ui.notify(
			"Cannot switch accounts: the current session has not been saved yet.",
			"warning",
		);
		return;
	}
	if (!ctx.isIdle()) await ctx.waitForIdle();
	const launcher = dependencies.launcher ?? "osdy-pi";
	try {
		await dependencies.spawn(launcher, [
			"account",
			"use",
			profile,
			"--",
			"--session",
			sessionPath,
		]);
	} catch {
		ctx.ui.notify(
			"Cannot switch accounts: unable to start the replacement Pi process.",
			"warning",
		);
		return;
	}
	ctx.shutdown();
}

function isLauncherMessage(message: unknown): message is LauncherMessage {
	if (typeof message !== "object" || message === null || !("type" in message))
		return false;
	if (message.type === "osdy-pi-ready") return true;
	return (
		message.type === "osdy-pi-error" &&
		"message" in message &&
		typeof message.message === "string"
	);
}

export function waitForLauncherReady(
	child: ChildProcess,
	timeoutMs = LAUNCHER_READY_TIMEOUT_MS,
	scheduleTimeout: ScheduleTimeout = setTimeout,
): Promise<void> {
	return new Promise((resolveReady, rejectReady) => {
		let settled = false;
		const cleanup = (): void => {
			clearTimeout(timeout);
			child.removeListener("error", onError);
			child.removeListener("exit", onExit);
			child.removeListener("message", onMessage);
		};
		const fail = (error: Error): void => {
			if (settled) return;
			settled = true;
			cleanup();
			rejectReady(error);
		};
		const onError = (error: Error): void => fail(error);
		const onExit = (): void =>
			fail(new Error("Replacement Pi exited before confirming readiness."));
		const onMessage = (message: unknown): void => {
			if (!isLauncherMessage(message)) return;
			if (message.type === "osdy-pi-error") {
				fail(new Error(message.message));
				return;
			}
			if (settled) return;
			settled = true;
			cleanup();
			child.disconnect();
			child.unref();
			resolveReady();
		};
		const timeout = scheduleTimeout(
			() =>
				fail(new Error("Replacement Pi timed out before confirming readiness.")),
			timeoutMs,
		);
		child.once("error", onError);
		child.once("exit", onExit);
		child.on("message", onMessage);
	});
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

export async function handoffToDefaultAccountOnStartup(
	ctx: StartupAccountContext,
	reason: string,
	dependencies: StartupAccountHandoffDependencies,
): Promise<boolean> {
	if (reason !== "startup" || !ctx.hasUI) return false;
	const activeProfile = dependencies.activeProfile;
	if (activeProfile) {
		if (!isProfileName(activeProfile)) {
			ctx.ui.notify(
				"Osdy Pi did not switch accounts because OSDY_PI_PROFILE_NAME is invalid.",
				"warning",
			);
		}
		return false;
	}
	const sessionPath = ctx.sessionManager.getSessionFile();
	if (!sessionPath || !isAbsolute(sessionPath)) {
		ctx.ui.notify(
			"Osdy Pi cannot switch to the default account because this session is not saved to an absolute path.",
			"warning",
		);
		return false;
	}
	const run = (args: string[]) =>
		dependencies.run ? dependencies.run(args) : runBundledCommand(args);
	const launcher = dependencies.launcher ?? bundledLauncherPath();
	const spawn = (command: string, args: string[]) =>
		dependencies.spawn
			? dependencies.spawn(command, args)
			: waitForLauncherReady(
					spawnChild(process.execPath, [command, ...args], {
						detached: true,
						stdio: ["ignore", "ignore", "ignore", "ipc"],
					}),
				);
	let result: { code: number; stdout: string; stderr: string };
	try {
		result = await run(["account", "default"]);
	} catch {
		ctx.ui.notify(
			"Osdy Pi could not read the default account; keeping this Pi session unmanaged.",
			"warning",
		);
		return false;
	}
	const defaultState = parseDefaultAccountResult(result);
	if (defaultState.status === "unset") return false;
	if (defaultState.status !== "valid") {
		ctx.ui.notify(
			defaultState.status === "invalid"
				? "Osdy Pi could not safely select the default account; use /osdy-account to clear or fix it."
				: "Osdy Pi could not read the default account; keeping this Pi session unmanaged.",
			"warning",
		);
		return false;
	}
	ctx.ui.notify(`Starting default account ${defaultState.profile}…`, "info");
	try {
		await spawn(launcher, [
			"account",
			"use",
			defaultState.profile,
			"--",
			"--session",
			sessionPath,
		]);
	} catch {
		ctx.ui.notify(
			"Cannot switch accounts: unable to start the replacement Pi process.",
			"warning",
		);
		return false;
	}
	ctx.shutdown();
	return true;
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
			`${profile}${profile === activeProfile ? " (active)" : ""}${profile === defaultProfile ? " (default)" : ""}`,
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
	if (target === dependencies.activeProfile) {
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
				"Profile names use lowercase letters, numbers, and hyphens only.",
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
	if (defaultState.status === "valid" && defaultState.profile === target) {
		replacement = await ctx.ui.select(
			"Choose a new default account",
			profiles.filter((profile) => profile !== target),
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
					"Profile names use lowercase letters, numbers, and hyphens only.",
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
		if (profile === dependencies.activeProfile) {
			ctx.ui.notify("That account is already active.", "info");
			continue;
		}
		if (dependencies.handoff) await dependencies.handoff(profile);
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

export function registerAccountProfilesCommand(pi: {
	registerCommand(
		name: string,
		options: {
			description: string;
			handler: (args: string, ctx: ExtensionCommandContext) => Promise<void>;
		},
	): void;
}): void {
	pi.registerCommand("osdy-account", {
		description: "Restart Pi with another isolated OpenAI account profile.",
		handler: async (args, ctx) => {
			const mode = args.trim();
			if ((ctx as ExtensionCommandContext & { hasUI?: boolean }).hasUI === false) {
				ctx.ui.notify("Account manager requires an interactive Pi UI.", "warning");
				return;
			}
			const dependencies: AccountManagementDependencies = {
				profiles: () => availableProfiles(sharedAgentDir(process.env)),
				run: runBundledCommand,
				activeProfile: process.env.OSDY_PI_PROFILE_NAME,
				handoff: (profile) =>
					handoffToAccount(ctx, profile, {
						launcher: bundledLauncherPath(),
						spawn: (command, launchArgs) =>
							waitForLauncherReady(
								spawnChild(process.execPath, [command, ...launchArgs], {
									detached: true,
									stdio: ["ignore", "ignore", "ignore", "ipc"],
								}),
							),
					}),
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

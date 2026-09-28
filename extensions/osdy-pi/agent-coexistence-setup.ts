import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { lstat, readFile, realpath, rename, unlink, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const runFile = promisify(execFile);
const JOKER = "npm:pi-subagents-j0k3r";
const GENTLE_EXCLUSION = "-extensions/gentle-agents.ts";
const JOKER_EXCLUSION = "-./index.ts";
const OWNED = "osdyPiJokerExclusionOwned";

type Settings = Record<string, unknown> & { packages?: unknown[] };

type SetupOptions = {
	agentDir: string;
	home?: string;
	cwd: string;
	env?: NodeJS.ProcessEnv;
	install?: () => Promise<void>;
};

function object(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

function source(entry: unknown): string | undefined {
	if (typeof entry === "string") return entry;
	return object(entry) && typeof entry.source === "string" ? entry.source : undefined;
}

function npmGentle(entry: unknown): boolean {
	return /^npm:gentle-pi(?:@[^\s]+)?$/i.test(source(entry) ?? "");
}

function joker(entry: unknown): boolean {
	return /^npm:pi-subagents-j0k3r(?:@[^\s]+)?$/i.test(source(entry) ?? "");
}

async function gentle(entry: unknown, settingsDir: string, home: string): Promise<boolean> {
	if (npmGentle(entry)) return true;
	const value = source(entry);
	if (!value || /^npm:/i.test(value)) return false;
	if (/^(?:git:|https?:\/\/)/i.test(value)) {
		if (/(?:^|\/)gentle-pi(?:\.git)?(?:[@#?][^\s]*)?$/i.test(value))
			throw new Error("Remote Gentle source unsupported: register a local gentle-pi checkout or npm:gentle-pi in personal Pi, then rerun agents setup.");
		return false;
	}
	let path: string;
	try {
		if (value.startsWith("file:")) path = fileURLToPath(value);
		else if (value === "~" || value.startsWith("~/")) path = resolve(home, value.slice(value === "~" ? 1 : 2));
		else if (!value.includes(":")) path = resolve(settingsDir, value);
		else return false;
	} catch {
		throw new Error(`Gentle source cannot be resolved: ${value}`);
	}
	try {
		const manifest: unknown = JSON.parse(await readFile(join(path, "package.json"), "utf8"));
		return object(manifest) && manifest.name === "gentle-pi";
	} catch {
		if (/(?:^|[\\/])gentle(?:-pi)?$/i.test(path))
			throw new Error(`Gentle source cannot be resolved: ${value}`);
		return false;
	}
}

async function regularSettings(path: string): Promise<Settings> {
	if (!(await lstat(path)).isFile()) throw new Error("Personal settings.json must be a regular file, not a link.");
	let value: unknown;
	try {
		value = JSON.parse(await readFile(path, "utf8"));
	} catch {
		throw new Error("Personal settings.json must contain valid JSON.");
	}
	if (!object(value) || (value.packages !== undefined && !Array.isArray(value.packages)))
		throw new Error("Personal settings.json must have an object root and array packages.");
	return value;
}

async function assertNoProjectGentle(cwd: string, home: string): Promise<void> {
	let directory = resolve(cwd);
	while (true) {
		const local = join(directory, ".pi", "settings.json");
		let text: string;
		try {
			text = await readFile(local, "utf8");
		} catch (error) {
			if (object(error) && error.code === "ENOENT") {
				const parent = dirname(directory);
				if (parent === directory) return;
				directory = parent;
				continue;
			}
			throw error;
		}
		let settings: unknown;
		try { settings = JSON.parse(text); }
		catch { throw new Error(`Project settings invalid at ${local}; cannot guarantee Gentle filtering.`); }
		if (!object(settings) || (settings.packages !== undefined && !Array.isArray(settings.packages)))
			throw new Error(`Project settings invalid at ${local}; cannot guarantee Gentle filtering.`);
		for (const entry of settings.packages ?? []) {
			if (await gentle(entry, dirname(local), home)) throw new Error(`Project-local Gentle package at ${local} can override the personal filter.`);
		}
		const parent = dirname(directory);
		if (parent === directory) return;
		directory = parent;
	}
}

async function installJoker(): Promise<void> {
	await runFile("pi", ["install", JOKER], { cwd: homedir(), maxBuffer: 4096 });
}

export async function inspectJokerAgents(options: Omit<SetupOptions, "install">): Promise<{ jokerInstalled: boolean; gentleCount: number; filtered: boolean; mode: "joker" | "gentle" | "mixed" | "unavailable" }> {
	const target = await validateTarget(options);
	const settings = await regularSettings(join(target, "settings.json"));
	const packages = settings.packages ?? [];
	validatePackages(packages);
	const flags = await Promise.all(packages.map((entry) => gentle(entry, target, options.home ?? homedir())));
	const filtered = flags.every((isGentle, index) => !isGentle || hasFilter(packages[index], GENTLE_EXCLUSION));
	const jokerInstalled = packages.some(joker);
	const jokerDisabled = packages.some((entry) => joker(entry) && hasFilter(entry, JOKER_EXCLUSION));
	const jokerAllowed = packages.some((entry) => joker(entry) && allowsAgent(entry, "./index.ts"));
	const gentleAllowed = flags.every((flag, i) => !flag || allowsAgent(packages[i], "extensions/gentle-agents.ts"));
	return {
		jokerInstalled, gentleCount: flags.filter(Boolean).length, filtered,
		mode: jokerInstalled && !jokerDisabled && jokerAllowed && filtered ? "joker" :
			(!jokerInstalled || jokerDisabled) && flags.some(Boolean) && gentleAllowed && flags.every((flag, i) => !flag || !hasFilter(packages[i], GENTLE_EXCLUSION)) ? "gentle" :
			jokerInstalled || flags.some(Boolean) ? "mixed" : "unavailable",
	};
}

function hasFilter(entry: unknown, filter: string): boolean {
	return object(entry) && Array.isArray(entry.extensions) && entry.extensions.includes(filter);
}

function validatePackages(packages: unknown[]): void {
	if (packages.some((entry) => typeof entry !== "string" && (!object(entry) || typeof entry.source !== "string")))
		throw new Error("Personal settings packages contain an invalid entry.");
	if (packages.filter(joker).length > 1) throw new Error("Personal settings contain duplicate Joker entries.");
	for (const entry of packages) {
		if (object(entry) && entry.extensions !== undefined &&
			(!Array.isArray(entry.extensions) || !entry.extensions.every((value: unknown) => typeof value === "string")))
			throw new Error("Gentle extensions or Joker extensions filter must be an array of strings.");
	}
}

function allowsAgent(entry: unknown, expected: string): boolean {
	if (object(entry) && entry.autoload === false) return false;
	if (!object(entry) || !Array.isArray(entry.extensions)) return true;
	const filters = entry.extensions as string[];
	if (!filters.length) return false;
	// Pi applies plain includes, then ! globs, + exact paths, and finally - exact paths.
	// Refuse uncertain glob matches rather than reporting a provider ready incorrectly.
	const exact = (pattern: string) => pattern.replace(/^\.\//, "") === expected.replace(/^\.\//, "");
	const exclusions = filters.filter((filter) => filter.startsWith("!") || filter.startsWith("-"));
	if (exclusions.some((filter) => filter.slice(1).includes("*") || filter.slice(1).includes("?") || exact(filter.slice(1)))) return false;
	const positives = filters.filter((filter) => !/^[!+-]/.test(filter));
	return !positives.length || positives.some(exact) || filters.some((filter) => filter.startsWith("+") && exact(filter.slice(1)));
}

function assertAgentAllowlists(packages: unknown[], gentleFlags: boolean[], mode: "on" | "off"): void {
	for (const [index, entry] of packages.entries()) {
		// Adding a negative filter to [] makes Pi load every other extension.
		if (((gentleFlags[index] && mode === "on") || (joker(entry) && mode === "off")) &&
			object(entry) && Array.isArray(entry.extensions) && entry.extensions.length === 0)
			throw new Error("Cannot exclude an agent from disabled extensions []; nothing changed.");
		if (!(joker(entry) && mode === "on") && !(gentleFlags[index] && mode === "off")) continue;
		const expected = joker(entry) ? "./index.ts" : "extensions/gentle-agents.ts";
		// The mode switch removes only its own known exclusion before selecting this agent.
		const ownedFilter = joker(entry) ? JOKER_EXCLUSION : GENTLE_EXCLUSION;
		let selected = entry;
		if (object(entry) && Array.isArray(entry.extensions) && entry.extensions.includes(ownedFilter)) {
			const remaining = entry.extensions.filter((value: unknown) => value !== ownedFilter);
			const updated = { ...entry };
			if (remaining.length) updated.extensions = remaining;
			else delete updated.extensions;
			selected = updated;
		}
		if (!allowsAgent(selected, expected))
			throw new Error(`Package autoload or extension allowlist excludes ${expected}; cannot guarantee selected agent mode.`);
	}
}

async function saveSettings(path: string, settings: Settings): Promise<void> {
	const temporary = join(dirname(path), `.settings.${randomUUID()}.tmp`);
	try {
		await writeFile(temporary, `${JSON.stringify(settings, null, 2)}\n`, { flag: "wx", mode: 0o600 });
		await rename(temporary, path);
	} finally {
		await unlink(temporary).catch(() => {});
	}
}

async function validateTarget(options: Omit<SetupOptions, "install">): Promise<string> {
	const home = resolve(options.home ?? homedir());
	const target = resolve(options.agentDir);
	if (options.env?.PI_CODING_AGENT_DIR !== undefined || !isAbsolute(options.agentDir))
		throw new Error("Agents setup requires normal personal Pi; agent directory override or isolated profile is unsupported.");
	let personal: boolean;
	try {
		personal = (await realpath(target)) === (await realpath(join(home, ".pi", "agent")));
	} catch {
		personal = false;
	}
	if (!personal)
		throw new Error("Agents setup requires the normal personal Pi agent directory, not an isolated profile.");
	await assertNoProjectGentle(options.cwd, home);
	return target;
}

export async function setupJokerAgents(options: SetupOptions): Promise<{ installed: boolean; changed: boolean; gentleCount: number }> {
	return switchAgentMode({ ...options, mode: "on" });
}

export async function switchAgentMode(options: SetupOptions & { mode: "on" | "off" }): Promise<{ installed: boolean; changed: boolean; gentleCount: number }> {
	const target = await validateTarget(options);
	const path = join(target, "settings.json");
	const before = await regularSettings(path);
	const original = before.packages ?? [];
	validatePackages(original);
	const initialGentle = await Promise.all(original.map((entry) => gentle(entry, target, options.home ?? homedir())));
	const alreadyJoker = original.some(joker);
	if (options.mode === "off" && !initialGentle.some(Boolean))
		throw new Error("Gentle agents require an eligible personal Gentle package; nothing changed.");
	if (before[OWNED] !== undefined && before[OWNED] !== true)
		throw new Error("Invalid Joker filter ownership marker; nothing changed.");
	if (before[OWNED] === true && !original.some((entry) => joker(entry) && hasFilter(entry, JOKER_EXCLUSION)))
		throw new Error("Joker filter ownership marker does not match settings; nothing changed.");
	if (original.some((entry) => joker(entry) && hasFilter(entry, JOKER_EXCLUSION)) && before[OWNED] !== true)
		throw new Error("Joker extension has an unowned exclusion; cannot change agent mode.");
	assertAgentAllowlists(original, initialGentle, options.mode);
	// All failures known from the original settings must be checked before Pi install can mutate them.
	let installAttempted = false;
	try {
		if (options.mode === "on" && !alreadyJoker) {
			installAttempted = true;
			await (options.install ?? installJoker)();
		}
	// Install owns only Joker. Re-read the latest settings instead of replaying a stale snapshot.
	await assertNoProjectGentle(options.cwd, options.home ?? homedir());
	const latest = await regularSettings(path);
	const packages = latest.packages ?? [];
	validatePackages(packages);
	if (options.mode === "on" && !packages.some(joker)) throw new Error("Joker is not registered in personal settings; no filters were changed.");
	if (latest[OWNED] !== undefined && latest[OWNED] !== true)
		throw new Error("Invalid Joker filter ownership marker; nothing changed.");
	if (packages.some((entry) => joker(entry) && hasFilter(entry, JOKER_EXCLUSION)) && latest[OWNED] !== true)
		throw new Error("Joker extension has an unowned exclusion; cannot change agent mode.");
	if (latest[OWNED] === true && !packages.some((entry) => joker(entry) && hasFilter(entry, JOKER_EXCLUSION)))
		throw new Error("Joker filter ownership marker does not match settings; nothing changed.");
	const gentleFlags = await Promise.all(packages.map((entry) => gentle(entry, target, options.home ?? homedir())));
	assertAgentAllowlists(packages, gentleFlags, options.mode);
	if (options.mode === "off" && !gentleFlags.some(Boolean)) throw new Error("No eligible Gentle package; nothing changed.");
	let changed = false;
	const updated = packages.map((entry, index) => {
		const isGentle = gentleFlags[index];
		if (!isGentle && !joker(entry)) return entry;
		const filter = isGentle ? GENTLE_EXCLUSION : JOKER_EXCLUSION;
		const shouldExclude = isGentle ? options.mode === "on" : options.mode === "off";
		const item = typeof entry === "string" ? { source: entry } : entry as Record<string, unknown>;
		const extensions = item.extensions as string[] | undefined;
		if (shouldExclude === (extensions?.includes(filter) ?? false)) return entry;
		changed = true;
		const next = shouldExclude ? [...(extensions ?? []), filter] : extensions!.filter((value) => value !== filter);
		if (!next.length) {
			const rest = { ...item };
			delete rest.extensions;
			return Object.keys(rest).length === 1 ? rest.source : rest;
		}
		return { ...item, extensions: next };
	});
	const ownershipChanged = (latest[OWNED] === true) !== (options.mode === "off" && packages.some(joker));
	if (changed || ownershipChanged) {
		const saved: Settings = { ...latest, packages: updated };
		if (options.mode === "off" && packages.some(joker)) saved[OWNED] = true;
		else delete saved[OWNED];
		await saveSettings(path, saved);
	}
	return { installed: options.mode === "on" && !alreadyJoker, changed: changed || ownershipChanged, gentleCount: gentleFlags.filter(Boolean).length };
	} catch (error) {
		if (!installAttempted) throw error;
		throw new Error(`Joker may have been installed even though agent setup failed: ${error instanceof Error ? error.message : String(error)} Run /osdy-pi agents status, inspect personal Pi settings.json, and retry /osdy-pi agents on after resolving the issue.`, { cause: error });
	}
}

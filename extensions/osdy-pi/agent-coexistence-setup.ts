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

function validateGentleFilters(entry: unknown): void {
	if (!object(entry) || entry.extensions === undefined) return;
	if (!Array.isArray(entry.extensions) || !entry.extensions.every((value: unknown) => typeof value === "string"))
		throw new Error("Gentle extensions filter must be an array of strings.");
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

export async function inspectJokerAgents(options: Omit<SetupOptions, "install">): Promise<{ jokerInstalled: boolean; gentleCount: number; filtered: boolean }> {
	const target = await validateTarget(options);
	const settings = await regularSettings(join(target, "settings.json"));
	const packages = settings.packages ?? [];
	const flags = await Promise.all(packages.map((entry) => gentle(entry, target, options.home ?? homedir())));
	return {
		jokerInstalled: packages.some(joker),
		gentleCount: flags.filter(Boolean).length,
		filtered: flags.every((isGentle, index) => !isGentle ||
			(object(packages[index]) && Array.isArray(packages[index].extensions) && packages[index].extensions.includes(GENTLE_EXCLUSION))),
	};
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
	const target = await validateTarget(options);
	const path = join(target, "settings.json");
	const before = await regularSettings(path);
	const original = before.packages ?? [];
	if (original.some((entry) => entry !== null && typeof entry !== "string" && !object(entry)))
		throw new Error("Personal settings packages contain an invalid entry.");
	const initialGentle = await Promise.all(original.map((entry) => gentle(entry, target, options.home ?? homedir())));
	if (original.filter(joker).length > 1) throw new Error("Personal settings contain duplicate Joker entries.");
	const alreadyJoker = original.some(joker);
	for (const [index, isGentle] of initialGentle.entries()) {
		if (isGentle) validateGentleFilters(original[index]);
	}
	const filtered = initialGentle.every((isGentle, index) => !isGentle ||
		(object(original[index]) && Array.isArray(original[index].extensions) && original[index].extensions.includes(GENTLE_EXCLUSION)));
	if (alreadyJoker && filtered) return { installed: false, changed: false, gentleCount: initialGentle.filter(Boolean).length };
	if (!alreadyJoker) await (options.install ?? installJoker)();
	// Install owns only Joker. Re-read the latest settings instead of replaying a stale snapshot.
	await assertNoProjectGentle(options.cwd, options.home ?? homedir());
	const latest = await regularSettings(path);
	const packages = latest.packages ?? [];
	if (!packages.some(joker)) throw new Error("Pi install did not register Joker in personal settings; no Gentle filters were changed.");
	if (packages.filter(joker).length > 1) throw new Error("Personal settings contain duplicate Joker entries.");
	const gentleFlags = await Promise.all(packages.map((entry) => gentle(entry, target, options.home ?? homedir())));
	let changed = false;
	const updated = packages.map((entry, index) => {
		if (!gentleFlags[index]) return entry;
		if (typeof entry !== "string" && !object(entry)) throw new Error("Gentle package entry is invalid.");
		const item = typeof entry === "string" ? { source: entry } : entry;
		validateGentleFilters(item);
		const extensions = item.extensions as string[] | undefined;
		if (extensions?.includes(GENTLE_EXCLUSION)) return entry;
		changed = true;
		return { ...item, extensions: [...(extensions ?? []), GENTLE_EXCLUSION] };
	});
	if (changed) {
		const temporary = join(target, `.settings.${randomUUID()}.tmp`);
		try {
			await writeFile(temporary, `${JSON.stringify({ ...latest, packages: updated }, null, 2)}\n`, { flag: "wx", mode: 0o600 });
			await rename(temporary, path);
		} finally {
			await unlink(temporary).catch(() => {});
		}
	}
	return { installed: !alreadyJoker, changed, gentleCount: gentleFlags.filter(Boolean).length };
}

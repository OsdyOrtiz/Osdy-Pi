import { randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { access, lstat, mkdir, readFile, readdir, realpath, rename, stat, symlink, unlink, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, resolve, sep } from "node:path";

const GENTLE_EXTENSIONS = ["gentle-todo.ts", "ask-user-question.ts", "gentle-agents.ts"];
const ISOLATED_NAMES = new Set(["settings.json", "sessions", "pi-crash.log", "run-history.jsonl", ".DS_Store"]);
const ASK_PACKAGE = "npm:@juicesharp/rpiv-ask-user-question";
const AGENT_PACKAGE = "npm:pi-subagents-j0k3r";

function record(value) {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

function packageSource(entry) {
	return typeof entry === "string" ? entry : record(entry) && typeof entry.source === "string" ? entry.source : "";
}

async function settingsFrom(path, label) {
	let settings;
	try {
		settings = JSON.parse(await readFile(path, "utf8"));
	} catch (error) {
		throw new Error(`${label} settings.json must be readable valid JSON: ${error.message}`);
	}
	if (!record(settings) || (settings.packages !== undefined && !Array.isArray(settings.packages)))
		throw new Error(`${label} settings.json must be an object with an array of packages.`);
	return settings;
}

async function validatePackage(path, expected) {
	if (typeof path !== "string" || !isAbsolute(path))
		throw new Error(`${expected} source must be an absolute directory path.`);
	const root = resolve(path);
	try {
		if (!(await stat(root)).isDirectory()) throw new Error("not a directory");
		const manifest = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
		if (!record(manifest) || manifest.name !== expected) throw new Error("wrong package name");
		if (expected === "gentle-pi") {
			for (const file of GENTLE_EXTENSIONS) {
				const extension = join(root, "extensions", file);
				if (!(await stat(extension)).isFile()) throw new Error(`${file} is not a file`);
				await access(extension, constants.R_OK);
			}
		}
	} catch (error) {
		throw new Error(`${expected === "gentle-pi" ? "Gentle" : "Osdy"} source invalid at ${root}: ${error.message}`);
	}
	return root;
}

async function chooseGentleRoot(packages, explicitRoot) {
	if (explicitRoot !== undefined) return validatePackage(explicitRoot, "gentle-pi");
	const candidates = new Set();
	for (const entry of packages) {
		const source = packageSource(entry);
		if (!isAbsolute(source)) continue;
		try {
			candidates.add(await validatePackage(source, "gentle-pi"));
		} catch {
			// Other absolute local packages are not Gentle.
		}
	}
	if (candidates.size !== 1)
		throw new Error("Gentle source must be unique in official settings; set GENTLE_PI_EXTENSION_ROOT to an absolute gentle-pi checkout.");
	return [...candidates][0];
}

function reconciledSettings(official, existing, gentleRoot, osdyRoot) {
	const packages = (official.packages ?? []).filter((entry) => {
		const source = packageSource(entry);
		const lower = source.toLowerCase();
		return source !== gentleRoot && source !== osdyRoot &&
			!/^npm:gentle-pi(?:@[^\s]+)?$/.test(lower) &&
			!/^npm:osdy-pi(?:@[^\s]+)?$/.test(lower) &&
			!/^git:github\.com\/osdyortiz\/osdy-pi(?:@[^\s]+)?$/.test(lower) &&
			lower !== ASK_PACKAGE && lower !== AGENT_PACKAGE;
	});
	const theme = existing?.theme;
	return {
		...official,
		...(typeof theme === "string" && theme ? { theme } : {}),
		packages: [...packages,
			{ source: gentleRoot, extensions: GENTLE_EXTENSIONS.map((name) => `-extensions/${name}`), themes: [] },
			ASK_PACKAGE, AGENT_PACKAGE, { source: osdyRoot },
		],
	};
}

async function optionalEntry(path) {
	try { return await lstat(path); }
	catch (error) {
		if (error.code === "ENOENT") return undefined;
		throw error;
	}
}

export async function resourceLinkType(source, platform = process.platform) {
	if (platform !== "win32") return undefined;
	return (await stat(source)).isDirectory() ? "junction" : "file";
}

async function canonicalDestination(path) {
	try {
		return await realpath(path);
	} catch (error) {
		if (error.code !== "ENOENT") throw error;
		const parent = dirname(path);
		if (parent === path) throw error;
		return join(await canonicalDestination(parent), basename(path));
	}
}

/** Create or reconcile the Osdy-owned settings and links, without writing official Pi state. */
export async function setupOsdyProfile({ officialDir, profileDir, osdyRoot, gentleRoot }) {
	for (const [name, value] of Object.entries({ officialDir, profileDir, osdyRoot })) {
		if (typeof value !== "string" || !isAbsolute(value))
			throw new Error(`${name} must be an absolute path.`);
	}
	const sourceDir = resolve(officialDir);
	const targetDir = resolve(profileDir);
	const canonicalSource = await canonicalDestination(sourceDir);
	const canonicalTarget = await canonicalDestination(targetDir);
	if (canonicalSource === canonicalTarget ||
		canonicalTarget.startsWith(`${canonicalSource}${sep}`) ||
		canonicalSource.startsWith(`${canonicalTarget}${sep}`))
		throw new Error("Official and isolated profile directories must be separate, non-nested paths.");
	const sourceSettings = join(sourceDir, "settings.json");
	if (!(await optionalEntry(sourceSettings))?.isFile())
		throw new Error("Official settings.json must be a regular file, not a symlink.");
	const official = await settingsFrom(sourceSettings, "Official");
	const gentle = await chooseGentleRoot(official.packages ?? [], gentleRoot);
	const osdy = await validatePackage(osdyRoot, "osdy-pi");
	const profileState = await optionalEntry(targetDir);
	if (profileState && !profileState.isDirectory())
		throw new Error("Isolated profile directory must not be a symlink or file.");
	const targetSettings = join(targetDir, "settings.json");
	const settingsState = await optionalEntry(targetSettings);
	if (settingsState && !settingsState.isFile())
		throw new Error("Isolated settings.json must be a regular file, not a symlink.");
	const sessions = join(targetDir, "sessions");
	const sessionsState = await optionalEntry(sessions);
	if (sessionsState && !sessionsState.isDirectory())
		throw new Error("Isolated sessions must be a directory, not a symlink.");
	const existing = settingsState ? await settingsFrom(targetSettings, "Isolated") : undefined;
	const next = `${JSON.stringify(reconciledSettings(official, existing, gentle, osdy), null, 2)}\n`;
	const current = settingsState ? await readFile(targetSettings, "utf8") : undefined;
	const names = await readdir(sourceDir);
	// Validate first: an existing entry always belongs to the user; never replace it.
	const links = [];
	for (const name of names) {
		if (ISOLATED_NAMES.has(name)) continue;
		const destination = join(targetDir, name);
		if (await optionalEntry(destination)) continue;
		const source = join(sourceDir, name);
		links.push({ destination, source, type: await resourceLinkType(source) });
	}
	if (!profileState) await mkdir(targetDir, { recursive: true, mode: 0o700 });
	if (!sessionsState) await mkdir(sessions, { mode: 0o700 });
	for (const { destination, source, type } of links) {
		// Never overwrite a user entry created between validation and linking.
		try { await symlink(source, destination, type); }
		catch (error) { if (error.code !== "EEXIST") throw error; }
	}
	if (current !== next) {
		const temp = join(targetDir, `.settings.${randomUUID()}.tmp`);
		try {
			await writeFile(temp, next, { flag: "wx", mode: 0o600 });
			await rename(temp, targetSettings);
		} finally {
			await unlink(temp).catch(() => {});
		}
	}
	return { status: current === next && links.length === 0 && sessionsState ? "already configured" : "configured", profileDir: targetDir };
}

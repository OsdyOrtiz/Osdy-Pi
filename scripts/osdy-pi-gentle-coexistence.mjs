import {
	access,
	mkdir,
	readFile,
	rename,
 lstat,
	stat,
	writeFile,
} from "node:fs/promises";
import { constants } from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const GENTLE_PACKAGE_NAME = "gentle-pi";
const REQUIRED_EXTENSIONS = [
	"gentle-todo.ts",
	"ask-user-question.ts",
	"gentle-agents.ts",
];
const TODO_FILTER = "-extensions/gentle-todo.ts";
const EXCLUDED_EXTENSIONS = REQUIRED_EXTENSIONS.slice(1).map((extension) => `-extensions/${extension}`);
const OSDY_ONLY_PACKAGE_SOURCES = [
	"npm:@juicesharp/rpiv-ask-user-question",
	"npm:pi-subagents-j0k3r",
];

const nodeFileSystem = { access, mkdir, readFile, rename, lstat, stat, writeFile };

function isRecord(value) {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isGentleNpmSource(value) {
	return typeof value === "string" && /^npm:gentle-pi(?:@[^\s]+)?$/i.test(value);
}

function isOsdyPackageSource(value) {
	return (
		typeof value === "string" &&
		/^(?:git:github\.com\/osdyortiz\/osdy-pi|npm:osdy-pi(?:@[^\s]+)?)$/i.test(
			value.trim(),
		)
	);
}

function packageSource(entry) {
	if (typeof entry === "string") return entry;
	if (isRecord(entry) && typeof entry.source === "string") return entry.source;
	return undefined;
}

function canonicalPackage(sourcePath) {
	return {
		source: sourcePath,
		extensions: [...EXCLUDED_EXTENSIONS],
		themes: [],
	};
}

function canonicalOsdyOnlyPackages() {
	return [...OSDY_ONLY_PACKAGE_SOURCES];
}

export function getPiSettingsPath(env = process.env, home = homedir()) {
	const configuredDir = env.PI_CODING_AGENT_DIR?.trim();
	return join(configuredDir || join(home, ".pi", "agent"), "settings.json");
}

function validatedTodoSelection(settings) {
 if (!isRecord(settings)) throw new Error("settings.json must contain an object.");
 if (settings.packages !== undefined && !Array.isArray(settings.packages)) throw new Error("settings.json packages must be an array.");
 const selected = settings.osdyPiTodoProvider;
 if (selected !== undefined && (!isRecord(selected) || selected.version !== 1 || typeof selected.enabled !== "boolean" || !Array.isArray(selected.ownedExclusions)))
  throw new Error("Invalid Osdy TODO selection; nothing changed.");
 const packages = [...(settings.packages ?? [])];
 const owned = [...(selected?.ownedExclusions ?? [])];
 const seen = new Set();
 for (const item of owned) {
  if (!isRecord(item) || !Number.isSafeInteger(item.index) || item.index < 0 || seen.has(item.index) ||
   typeof item.wasString !== "boolean" || typeof item.hadExtensions !== "boolean" || typeof item.source !== "string" ||
   packageSource(packages[item.index]) !== item.source || !packages[item.index]?.extensions?.includes(TODO_FILTER))
   throw new Error("Invalid TODO exclusion ownership; nothing changed.");
  seen.add(item.index);
 }
 for (const entry of packages) {
  if (!packageSource(entry)) throw new Error("Invalid package entry.");
  if (isRecord(entry) && entry.extensions !== undefined && (!Array.isArray(entry.extensions) || !entry.extensions.every((item) => typeof item === "string")))
   throw new Error("Package extensions must be arrays of strings.");
 }
 return { selected, packages, owned };
}

/** Drop inherited selection only after proving ownership against original package positions. */
export function resetInheritedTodoSelection(settings) {
 const { packages, owned } = validatedTodoSelection(settings);
 for (const item of owned) {
  const sameSource = packages.filter((entry) => packageSource(entry) === item.source);
  if (sameSource.length > 1 && !sameSource.every((entry) => isRecord(entry) && entry.extensions?.includes(TODO_FILTER)))
   throw new Error("Same-source duplicates have ambiguous TODO exclusion ownership; nothing changed.");
 }
 for (const item of owned) {
  const entry = packages[item.index];
  const next = { ...entry, extensions: entry.extensions.filter((filter) => filter !== TODO_FILTER) };
  if (item.wasString && Object.keys(next).every((key) => ["source", "extensions"].includes(key)) && next.extensions.length === 0)
   packages[item.index] = item.source;
  else {
   if (!item.hadExtensions && !next.extensions.length) delete next.extensions;
   packages[item.index] = next;
  }
 }
 const next = { ...settings, ...(settings.packages !== undefined ? { packages } : {}) };
 delete next.osdyPiTodoProvider;
 return next;
}

export function reconcileGentlePackages(settings, sourcePath, gentleSources = []) {
 const { selected, packages, owned } = validatedTodoSelection(settings);
 const isGentle = (entry) => packageSource(entry) === sourcePath || isGentleNpmSource(packageSource(entry)) || gentleSources.includes(packageSource(entry));
 if (!packages.some(isGentle)) {
  // Append rather than shifting existing entries: ownership uses conservative source+position identity.
  const firstOsdy = owned.length ? -1 : packages.findIndex((entry) => isOsdyPackageSource(packageSource(entry)));
  packages.splice(firstOsdy < 0 ? packages.length : firstOsdy, 0, canonicalPackage(sourcePath));
 }
 if (selected?.enabled) {
  for (const entry of packages.filter(isGentle)) {
   const sameSource = packages.filter((item) => packageSource(item) === packageSource(entry));
   const excluded = (item) => isRecord(item) && item.extensions?.includes(TODO_FILTER);
   if (sameSource.length > 1 && sameSource.some(excluded) && !sameSource.every(excluded))
    throw new Error("Same-source duplicates have ambiguous TODO exclusion ownership.");
  }
 }
 const nextPackages = packages.map((entry, index) => {
  if (!isGentle(entry)) return entry;
  const item = typeof entry === "string" ? { source: entry } : entry;
  const filters = item.extensions ?? [];
  if (item.extensions?.length === 0) {
   if (selected?.enabled) throw new Error("Cannot add negative TODO filter to extensions [].");
   return entry;
  }
  const additions = EXCLUDED_EXTENSIONS.filter((filter) => !filters.includes(filter));
  if (selected?.enabled && !filters.includes(TODO_FILTER)) {
   const positives = filters.filter((value) => !/^[!+-]/.test(value));
   if (positives.some((value) => /[*?[{}]/.test(value) && !["extensions/*.ts", "extensions/**", "**/*.ts"].includes(value)))
    throw new Error("Uncertain Gentle extension allowlist glob.");
   additions.push(TODO_FILTER);
   owned.push({ index, source: packageSource(entry), wasString: typeof entry === "string", hadExtensions: item.extensions !== undefined });
   // Setup permanently owns its agents/questionnaire filters; TODO off must retain those.
  }
  return additions.length ? { ...item, extensions: [...filters, ...additions] } : entry;
 });
 for (const required of canonicalOsdyOnlyPackages())
  if (!nextPackages.some((entry) => packageSource(entry)?.toLowerCase() === required)) nextPackages.push(required);
 const nextSettings = { ...settings, packages: nextPackages,
  ...(selected ? { osdyPiTodoProvider: { ...selected, ownedExclusions: owned } } : {}) };
 const changed = JSON.stringify(nextSettings) !== JSON.stringify(settings);
 return { changed, settings: changed ? nextSettings : settings };
}

export async function reconcileGentleSettings(settings, sourcePath, settingsDir, home = homedir(), fileSystem = nodeFileSystem) {
 const sources = [];
 for (const entry of settings.packages ?? []) {
  const value = packageSource(entry);
  if (!value || isGentleNpmSource(value) || /^npm:/i.test(value)) continue;
  if (/^(?:git:|https?:\/\/)/i.test(value)) {
   if (/gentle(?:-pi)?(?:\.git)?(?:[@#?].*)?$/i.test(value)) throw new Error("Remote Gentle identity unsupported.");
   continue;
  }
  if (value.includes(":") && !value.startsWith("file:")) throw new Error("Unsupported package identity.");
  const path = value.startsWith("file:") ? fileURLToPath(value) : value.startsWith("~/") ? resolve(home, value.slice(2)) : resolve(settingsDir, value);
  let manifest;
  try { manifest = JSON.parse(await fileSystem.readFile(join(path, "package.json"), "utf8")); }
  catch { throw new Error(`Local package identity cannot be validated: ${value}`); }
  if (!isRecord(manifest) || typeof manifest.name !== "string") throw new Error("Invalid local package identity.");
  if (manifest.name === "gentle-pi") sources.push(value);
 }
 return reconcileGentlePackages(settings, sourcePath, sources);
}

async function validateGentleSource(sourcePath, fileSystem) {
	if (typeof sourcePath !== "string" || !isAbsolute(sourcePath))
		throw new Error("Gentle source path must be an absolute path.");

	const resolvedSource = resolve(sourcePath);
	let sourceStats;
	try {
		sourceStats = await fileSystem.stat(resolvedSource);
	} catch {
		throw new Error("Gentle source path must be an existing directory.");
	}
	if (!sourceStats.isDirectory())
		throw new Error("Gentle source path must be an existing directory.");

	const packagePath = join(resolvedSource, "package.json");
	let packageContents;
	try {
		await fileSystem.access(packagePath, constants.R_OK);
		packageContents = await fileSystem.readFile(packagePath, "utf8");
	} catch {
		throw new Error("Gentle source package.json must be readable.");
	}
	let packageJson;
	try {
		packageJson = JSON.parse(packageContents);
	} catch {
		throw new Error("Gentle source package.json is not valid JSON.");
	}
	if (!isRecord(packageJson) || packageJson.name !== GENTLE_PACKAGE_NAME)
		throw new Error('Gentle source package name must be exactly "gentle-pi".');

	for (const extension of REQUIRED_EXTENSIONS) {
		const extensionPath = join(resolvedSource, "extensions", extension);
		try {
			await fileSystem.access(extensionPath, constants.R_OK);
			const extensionStats = await fileSystem.stat(extensionPath);
			if (!extensionStats.isFile()) throw new Error("not a file");
		} catch {
			throw new Error(`Gentle extension is not readable: extensions/${extension}`);
		}
	}
	return resolvedSource;
}

async function loadSettings(settingsPath, fileSystem) {
	try {
  if (!(await fileSystem.lstat(settingsPath)).isFile()) throw new Error("settings.json must be a regular file, not a symlink.");
		const contents = await fileSystem.readFile(settingsPath, "utf8");
		try {
			return { exists: true, settings: JSON.parse(contents) };
		} catch {
			throw new Error("settings.json is not valid JSON.");
		}
	} catch (error) {
		if (error && typeof error === "object" && error.code === "ENOENT")
			return { exists: false, settings: {} };
		throw error;
	}
}

async function writeSettingsAtomically(settingsPath, settings, fileSystem) {
	const directory = dirname(settingsPath);
	const temporaryPath = `${settingsPath}.${process.pid}.${Date.now()}.tmp`;
	await fileSystem.mkdir(directory, { recursive: true });
	await fileSystem.writeFile(
		temporaryPath,
		`${JSON.stringify(settings, null, 2)}\n`,
		"utf8",
	);
	await fileSystem.rename(temporaryPath, settingsPath);
}

export async function configureGentleCoexistence(sourcePath, options = {}) {
	const fileSystem = { ...nodeFileSystem, ...options.fileSystem };
	const settingsPath =
		options.settingsPath ?? getPiSettingsPath(options.env, options.home);
	const selectedSource = await validateGentleSource(sourcePath, fileSystem);
	const loaded = await loadSettings(settingsPath, fileSystem);
 const reconciled = await reconcileGentleSettings(loaded.settings, selectedSource, dirname(settingsPath), options.home ?? homedir(), fileSystem);
	if (!reconciled.changed)
		return {
			status: "already configured",
			settingsPath,
			sourcePath: selectedSource,
		};

	await writeSettingsAtomically(settingsPath, reconciled.settings, fileSystem);
	return {
		status: loaded.exists ? "updated" : "configured",
		settingsPath,
		sourcePath: selectedSource,
	};
}

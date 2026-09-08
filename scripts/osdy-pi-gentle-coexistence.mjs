import {
	access,
	mkdir,
	readFile,
	rename,
	stat,
	writeFile,
} from "node:fs/promises";
import { constants } from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";

const GENTLE_PACKAGE_NAME = "gentle-pi";
const CONFLICTING_EXTENSIONS = [
	"gentle-shell.ts",
	"gentle-todo.ts",
	"gentle-agents.ts",
];
const EXCLUDED_EXTENSIONS = CONFLICTING_EXTENSIONS.map(
	(extension) => `-extensions/${extension}`,
);

const nodeFileSystem = { access, mkdir, readFile, rename, stat, writeFile };

function isRecord(value) {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isGentleNpmSource(value) {
	return typeof value === "string" && /^npm:gentle-pi(?:@[^\s]+)?$/.test(value);
}

function packageSource(entry) {
	return typeof entry === "string"
		? entry
		: isRecord(entry) && typeof entry.source === "string"
			? entry.source
			: undefined;
}

function canonicalPackage(sourcePath) {
	return {
		source: sourcePath,
		extensions: [...EXCLUDED_EXTENSIONS],
		themes: [],
	};
}

export function getPiSettingsPath(env = process.env, home = homedir()) {
	const configuredDir = env.PI_CODING_AGENT_DIR?.trim();
	return join(configuredDir || join(home, ".pi", "agent"), "settings.json");
}

export function reconcileGentlePackages(settings, sourcePath) {
	if (!isRecord(settings))
		throw new Error("settings.json must contain an object.");
	if (settings.packages !== undefined && !Array.isArray(settings.packages))
		throw new Error("settings.json packages must be an array.");

	const packages = settings.packages ?? [];
	const retained = packages.filter((entry) => {
		const source = packageSource(entry);
		return source !== sourcePath && !isGentleNpmSource(source);
	});
	const nextSettings = {
		...settings,
		packages: [...retained, canonicalPackage(sourcePath)],
	};
	const changed = JSON.stringify(nextSettings) !== JSON.stringify(settings);
	return { changed, settings: changed ? nextSettings : settings };
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

	for (const extension of CONFLICTING_EXTENSIONS) {
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
	const reconciled = reconcileGentlePackages(loaded.settings, selectedSource);
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

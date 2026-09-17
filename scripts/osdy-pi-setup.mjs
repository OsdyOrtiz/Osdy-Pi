import { access, lstat, mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";

const MAX_CONFIG_BYTES = 1024 * 1024;
const GENTLE_COMMIT = "2b579c80824e83442b8ae9f7bfad629a52f9f711";

const SETUP_PACKAGES = [
	"npm:gentle-engram@0.1.12",
	"npm:pi-intercom@0.13.0",
	"npm:@juicesharp/rpiv-ask-user-question@2.10.1",
	"npm:pi-web-access@0.29.0",
	"npm:pi-lens@4.2.0",
	"npm:pi-btw@0.5.0",
	"npm:@open-pets/pi@3.3.0",
	{
		source: `git:github.com/Gentleman-Programming/gentle-pi@${GENTLE_COMMIT}`,
		extensions: ["-extensions/gentle-todo.ts", "-extensions/gentle-agents.ts"],
		themes: [],
	},
	"npm:pi-playwright@0.1.1",
	"npm:pi-mcp-adapter@2.34.0",
	"npm:osdy-pi@1.2.0",
];

const MODEL_THINKING_LEVELS = {
	"openai-codex/gpt-5.4-mini": "medium",
	"openai-codex/gpt-5.6-luna": "medium",
	"openai-codex/gpt-5.6-sol": "medium",
	"openai-codex/gpt-5.6-terra": "medium",
	"openai-codex/gpt-6-astra": "medium",
};

function routed(model, effort) {
	return effort === undefined ? { model } : { model, effort };
}

const SETUP_MODEL_PROFILES = {
	"context-builder": routed("openai-codex/gpt-5.6-terra"),
	delegate: routed("openai-codex/gpt-5.6-sol", "medium"),
	oracle: routed("openai-codex/gpt-5.6-terra"),
	planner: routed("openai-codex/gpt-5.6-terra"),
	researcher: routed("openai-codex/gpt-5.6-terra"),
	reviewer: routed("openai-codex/gpt-5.6-terra", "medium"),
	scout: routed("openai-codex/gpt-5.6-luna", "medium"),
	worker: routed("openai-codex/gpt-5.6-terra", "medium"),
	"sdd-init": routed("openai-codex/gpt-5.6-luna", "medium"),
	"sdd-onboard": routed("openai-codex/gpt-5.6-terra"),
	"sdd-explore": routed("openai-codex/gpt-5.6-luna", "medium"),
	"sdd-proposal": routed("openai-codex/gpt-5.6-sol", "high"),
	"sdd-spec": routed("openai-codex/gpt-5.6-sol", "medium"),
	"sdd-design": routed("openai-codex/gpt-5.6-sol", "medium"),
	"sdd-tasks": routed("openai-codex/gpt-6-astra", "low"),
	"sdd-status": routed("openai-codex/gpt-5.6-terra", "medium"),
	"sdd-apply": routed("openai-codex/gpt-5.6-terra", "medium"),
	"sdd-verify": routed("openai-codex/gpt-5.6-terra", "medium"),
	"sdd-sync": routed("openai-codex/gpt-5.6-luna", "medium"),
	"sdd-archive": routed("openai-codex/gpt-5.6-luna", "medium"),
	"jd-judge-a": routed("openai-codex/gpt-5.6-terra"),
	"jd-judge-b": routed("openai-codex/gpt-5.6-terra"),
	"jd-fix-agent": routed("openai-codex/gpt-5.6-terra"),
	"review-readability": routed("openai-codex/gpt-5.6-terra"),
	"review-reliability": routed("openai-codex/gpt-5.6-terra"),
	"review-resilience": routed("openai-codex/gpt-5.6-terra"),
	"review-risk": routed("openai-codex/gpt-5.6-terra"),
	"gentle-ai-explore": routed("openai-codex/gpt-5.6-luna", "medium"),
	"gentle-ai-verify": routed("openai-codex/gpt-5.6-terra", "medium"),
	"gentle-ai-worker": routed("openai-codex/gpt-5.6-terra", "medium"),
};

const OSDY_UI_SETTINGS = {
	version: 1,
	enabled: true,
	editorMode: "extended",
	workingTreeEnabled: false,
	headerVariant: "osdy-theme",
	mascot: "current",
};

const SETUP_MCP_SERVERS = {
	codegraph: { command: "codegraph", args: ["serve", "--mcp"] },
	context7: {
		command: "npx",
		args: ["-y", "--package=@upstash/context7-mcp@2.2.5", "--", "context7-mcp"],
	},
	engram: {
		command: "node",
		args: [
			"-e",
			"const { spawn } = require('node:child_process'); const bin = process.env.ENGRAM_BIN || 'engram'; const child = spawn(bin, ['mcp', '--tools=agent'], { stdio: 'inherit' }); child.on('error', () => process.exit(127)); child.on('exit', (code, signal) => { if (typeof code === 'number') process.exit(code); process.kill(process.pid, signal || 'SIGTERM'); });",
		],
		directTools: false,
		lifecycle: "lazy",
	},
};

function isRecord(value) {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function packageSource(entry) {
	if (typeof entry === "string") return entry.trim();
	if (isRecord(entry) && typeof entry.source === "string")
		return entry.source.trim();
	return undefined;
}

function npmPackageName(source) {
	const match = /^npm:(@[^/\s]+\/[^@\s]+|[^@\s]+)(?:@[^\s]+)?$/i.exec(source);
	return match?.[1].toLowerCase();
}

function isManagedPackage(entry) {
	const source = packageSource(entry);
	if (source === undefined) return false;
	const npmName = npmPackageName(source);
	if (
		npmName !== undefined &&
		[
			"gentle-engram",
			"pi-intercom",
			"@juicesharp/rpiv-ask-user-question",
			"pi-web-access",
			"pi-lens",
			"pi-btw",
			"@open-pets/pi",
			"gentle-pi",
			"pi-playwright",
			"pi-mcp-adapter",
			"osdy-pi",
		].includes(npmName)
	)
		return true;
	const pathWithoutRef = source.replace(/@[0-9a-f]{40}$/i, "").replace(/[\\/]+$/, "");
	return /(?:^|[\\/])gentle-pi$/i.test(pathWithoutRef) || /(?:^|[\\/])osdy-pi$/i.test(pathWithoutRef);
}

export function reconcileSetupSettings(settings) {
	if (!isRecord(settings)) throw new Error("settings.json must contain an object.");
	if (settings.packages !== undefined && !Array.isArray(settings.packages))
		throw new Error("settings.json packages must be an array.");
	for (const field of ["terminal", "modelThinkingLevels"])
		if (settings[field] !== undefined && !isRecord(settings[field]))
			throw new Error(`settings.json ${field} must contain an object.`);
	const retainedPackages = (settings.packages ?? []).filter(
		(entry) => !isManagedPackage(entry),
	);
	const existingThinkingLevels = isRecord(settings.modelThinkingLevels)
		? settings.modelThinkingLevels
		: {};
	const existingTerminal = isRecord(settings.terminal) ? settings.terminal : {};
	const next = {
		...settings,
		collapseChangelog: false,
		defaultModel: "gpt-5.6-sol",
		defaultProvider: "openai-codex",
		defaultThinkingLevel: "xhigh",
		hideThinkingBlock: true,
		modelThinkingLevels: {
			...existingThinkingLevels,
			...MODEL_THINKING_LEVELS,
		},
		packages: [...retainedPackages, ...SETUP_PACKAGES],
		showHardwareCursor: true,
		terminal: {
			...existingTerminal,
			showImages: true,
			showTerminalProgress: true,
		},
		theme: "osdy-pi-tokyo-night",
		tuiMode: "fullscreen",
	};
	const changed = JSON.stringify(next) !== JSON.stringify(settings);
	return { changed, settings: changed ? next : settings };
}

function reconcileSubagents(config) {
	if (!isRecord(config)) throw new Error("subagents.json must contain an object.");
	if (config.model_profiles !== undefined && !isRecord(config.model_profiles))
		throw new Error("subagents.json model_profiles must contain an object.");
	return {
		...config,
		model_profiles: {
			...(config.model_profiles ?? {}),
			...SETUP_MODEL_PROFILES,
		},
	};
}

function reconcileOsdyUi(config) {
	if (!isRecord(config))
		throw new Error("extensions/osdy-pi/settings.json must contain an object.");
	return { ...config, ...OSDY_UI_SETTINGS };
}

function reconcileMcp(config) {
	if (!isRecord(config)) throw new Error("mcp.json must contain an object.");
	if (config.mcpServers !== undefined && !isRecord(config.mcpServers))
		throw new Error("mcp.json mcpServers must contain an object.");
	return {
		...config,
		mcpServers: { ...(config.mcpServers ?? {}), ...SETUP_MCP_SERVERS },
	};
}

function isMissing(error) {
	return isRecord(error) && error.code === "ENOENT";
}

async function readConfig(path, label) {
	let stats;
	try {
		stats = await lstat(path);
	} catch (error) {
		if (isMissing(error)) return { exists: false, value: {} };
		throw error;
	}
	if (!stats.isFile() || stats.isSymbolicLink() || stats.size > MAX_CONFIG_BYTES)
		throw new Error(`${label} must be a regular file and not a symbolic link.`);
	let value;
	try {
		value = JSON.parse(await readFile(path, "utf8"));
	} catch (error) {
		if (error instanceof SyntaxError)
			throw new Error(`${label} is not valid JSON.`);
		throw error;
	}
	if (!isRecord(value)) throw new Error(`${label} must contain an object.`);
	return { exists: true, value };
}

function isWithin(path, root) {
	const pathFromRoot = relative(root, path);
	return (
		pathFromRoot === "" ||
		(!pathFromRoot.startsWith("..") && !isAbsolute(pathFromRoot))
	);
}

async function assertPathAncestorsAreReal(path) {
	const resolvedPath = resolve(path);
	const trustedRoot = [resolve(homedir()), resolve(tmpdir())]
		.filter((root) => isWithin(resolvedPath, root))
		.sort((left, right) => right.length - left.length)[0];
	let current = resolvedPath;
	while (true) {
		try {
			const stats = await lstat(current);
			if (stats.isSymbolicLink())
				throw new Error(
					`Configuration path must not contain symbolic links: ${current}`,
				);
		} catch (error) {
			if (!isMissing(error)) throw error;
		}
		if (current === trustedRoot) break;
		const parent = dirname(current);
		if (parent === current) break;
		current = parent;
	}
}

async function assertSafeDirectories(paths) {
	for (const path of paths) {
		try {
			const stats = await lstat(path);
			if (!stats.isDirectory() || stats.isSymbolicLink())
				throw new Error(
					`Configuration directory must not be a symbolic link: ${path}`,
				);
		} catch (error) {
			if (!isMissing(error)) throw error;
		}
	}
}

async function ensureRealDirectory(path) {
	try {
		const stats = await lstat(path);
		if (!stats.isDirectory() || stats.isSymbolicLink())
			throw new Error(`Configuration directory must not be a symbolic link: ${path}`);
	} catch (error) {
		if (!isMissing(error)) throw error;
		const parent = dirname(path);
		if (parent !== path) await ensureRealDirectory(parent);
		await mkdir(path, { mode: 0o700 }).catch((mkdirError) => {
			if (!isRecord(mkdirError) || mkdirError.code !== "EEXIST") throw mkdirError;
		});
		const stats = await lstat(path);
		if (!stats.isDirectory() || stats.isSymbolicLink())
			throw new Error(`Configuration directory must not be a symbolic link: ${path}`);
	}
}

async function writeConfig(path, previous, value) {
	const contents = `${JSON.stringify(value, null, 2)}\n`;
	if (previous.exists) {
		const current = await readFile(path, "utf8");
		if (current === contents) return false;
	}
	await ensureRealDirectory(dirname(path));
	const temporary = join(
		dirname(path),
		`.${basename(path)}.${process.pid}.${Date.now()}.tmp`,
	);
	try {
		await writeFile(temporary, contents, { encoding: "utf8", mode: 0o600, flag: "wx" });
		await rename(temporary, path);
	} catch (error) {
		await unlink(temporary).catch(() => {});
		throw error;
	}
	return true;
}

async function commandExistsOnPath(command, env = process.env) {
	const pathValue = env.PATH;
	if (typeof pathValue !== "string" || pathValue.length === 0) return false;
	for (const directory of pathValue.split(process.platform === "win32" ? ";" : ":")) {
		if (directory.length === 0) continue;
		try {
			await access(join(directory, command), constants.X_OK);
			return true;
		} catch {
			continue;
		}
	}
	return false;
}

export function getSetupAgentDir(env = process.env, home = homedir()) {
	const configured = env.PI_CODING_AGENT_DIR?.trim();
	return resolve(configured || join(home, ".pi", "agent"));
}

export async function configureOsdyPiSetup(options = {}) {
	const agentDir = resolve(options.agentDir ?? getSetupAgentDir(options.env, options.home));
	const paths = {
		settings: join(agentDir, "settings.json"),
		subagents: join(agentDir, "subagents.json"),
		osdy: join(agentDir, "extensions", "osdy-pi", "settings.json"),
		mcp: join(agentDir, "mcp.json"),
	};

	await assertPathAncestorsAreReal(agentDir);
	await assertSafeDirectories([
		agentDir,
		join(agentDir, "extensions"),
		join(agentDir, "extensions", "osdy-pi"),
	]);

	const current = {
		settings: await readConfig(paths.settings, "settings.json"),
		subagents: await readConfig(paths.subagents, "subagents.json"),
		osdy: await readConfig(paths.osdy, "extensions/osdy-pi/settings.json"),
		mcp: options.withMcp ? await readConfig(paths.mcp, "mcp.json") : undefined,
	};
	const next = {
		settings: reconcileSetupSettings(current.settings.value).settings,
		subagents: reconcileSubagents(current.subagents.value),
		osdy: reconcileOsdyUi(current.osdy.value),
		mcp: current.mcp === undefined ? undefined : reconcileMcp(current.mcp.value),
	};

	const writes = [
		await writeConfig(paths.settings, current.settings, next.settings),
		await writeConfig(paths.subagents, current.subagents, next.subagents),
		await writeConfig(paths.osdy, current.osdy, next.osdy),
	];
	if (current.mcp !== undefined && next.mcp !== undefined)
		writes.push(await writeConfig(paths.mcp, current.mcp, next.mcp));

	const warnings = [];
	if (options.withMcp) {
		const commandExists = options.commandExists ?? commandExistsOnPath;
		for (const command of ["codegraph", "npx", "engram"])
			if (!(await commandExists(command)))
				warnings.push(`MCP prerequisite "${command}" was not found on PATH.`);
	}
	return {
		status: writes.some(Boolean) ? "configured" : "already configured",
		agentDir,
		warnings,
	};
}

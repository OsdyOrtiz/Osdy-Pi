import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { EditorMode, GlobalEditorSettings } from "./types.js";

const SUPPORTED_EDITOR_MODES = ["auto", "extended", "simple"] as const satisfies readonly EditorMode[];
const DEFAULT_EDITOR_MODE: EditorMode = "auto";
const EDITOR_SETTINGS_VERSION = 1;
const EDITOR_SETTINGS_FILE_NAME = "settings.json";
const EDITOR_SETTINGS_RELATIVE_DIR = path.join("extensions", "osdy-pi");

export interface EditorSettingsFileSystem {
	mkdir(directory: string): Promise<void>;
	readFile(filePath: string): Promise<string>;
	rename(source: string, destination: string): Promise<void>;
	writeFile(filePath: string, content: string): Promise<void>;
}

function getAgentDir(): string {
	const configuredDir = process.env.PI_CODING_AGENT_DIR?.trim();
	if (configuredDir) return configuredDir;
	return path.join(os.homedir(), ".pi", "agent");
}

function createDefaultEditorSettings(): GlobalEditorSettings {
	return {
		version: EDITOR_SETTINGS_VERSION,
		editorMode: DEFAULT_EDITOR_MODE,
		workingTreeEnabled: true,
	};
}

function isEditorMode(value: unknown): value is EditorMode {
	return typeof value === "string" && SUPPORTED_EDITOR_MODES.some((mode) => mode === value);
}

export function normalizeEditorSettings(value: unknown): GlobalEditorSettings {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		return createDefaultEditorSettings();
	}
	const recordValue = value as Record<string, unknown>;
	if (recordValue.version !== EDITOR_SETTINGS_VERSION) {
		return createDefaultEditorSettings();
	}
	return {
		version: EDITOR_SETTINGS_VERSION,
		editorMode: isEditorMode(recordValue.editorMode)
			? recordValue.editorMode
			: DEFAULT_EDITOR_MODE,
		workingTreeEnabled:
			typeof recordValue.workingTreeEnabled === "boolean"
				? recordValue.workingTreeEnabled
				: true,
	};
}

const nodeEditorSettingsFileSystem: EditorSettingsFileSystem = {
	async mkdir(directory): Promise<void> {
		await mkdir(directory, { recursive: true });
	},
	readFile: (filePath) => readFile(filePath, "utf8"),
	rename,
	writeFile: (filePath, content) => writeFile(filePath, content, "utf8"),
};

export interface EditorSettingsStore {
	readonly path: string;
	load(): Promise<GlobalEditorSettings>;
	save(settings: GlobalEditorSettings): Promise<void>;
}

class FileEditorSettingsStore implements EditorSettingsStore {
	readonly path: string;
	private readonly fileSystem: EditorSettingsFileSystem;

	constructor(filePath: string, fileSystem: EditorSettingsFileSystem) {
		this.path = filePath;
		this.fileSystem = fileSystem;
	}

	async load(): Promise<GlobalEditorSettings> {
		try {
			const content = await this.fileSystem.readFile(this.path);
			return normalizeEditorSettings(JSON.parse(content) as unknown);
		} catch {
			return createDefaultEditorSettings();
		}
	}

	async save(settings: GlobalEditorSettings): Promise<void> {
		const parentDir = path.dirname(this.path);
		const tempPath = `${this.path}.tmp`;
		const normalizedSettings = normalizeEditorSettings(settings);
		await this.fileSystem.mkdir(parentDir);
		await this.fileSystem.writeFile(
			tempPath,
			`${JSON.stringify(normalizedSettings, null, 2)}\n`,
		);
		await this.fileSystem.rename(tempPath, this.path);
	}
}

export function createEditorSettingsStore(
	filePath = path.join(
		getAgentDir(),
		EDITOR_SETTINGS_RELATIVE_DIR,
		EDITOR_SETTINGS_FILE_NAME,
	),
	fileSystem = nodeEditorSettingsFileSystem,
): EditorSettingsStore {
	return new FileEditorSettingsStore(filePath, fileSystem);
}

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
	AUDIO_NOTIFICATION_EVENTS,
	type AudioNotificationConfig,
	type AudioNotificationEvent,
	type GlobalAudioNotificationSettings,
} from "./audio-notification-types.js";

const GLOBAL_SETTINGS_VERSION = 1;
const GLOBAL_SETTINGS_FILE_NAME = "audio-notifications.json";
const GLOBAL_SETTINGS_RELATIVE_DIR = path.join("extensions", "osdy-pi");

function getAgentDir(): string {
	const configuredDir = process.env.PI_CODING_AGENT_DIR?.trim();
	if (configuredDir && configuredDir.length > 0) {
		return configuredDir;
	}
	return path.join(os.homedir(), ".pi", "agent");
}

function createDefaultSettings(): GlobalAudioNotificationSettings {
	return { version: GLOBAL_SETTINGS_VERSION, sounds: {} };
}

function isAudioEvent(value: string): value is AudioNotificationEvent {
	return AUDIO_NOTIFICATION_EVENTS.includes(value as AudioNotificationEvent);
}

function normalizeSounds(value: unknown): AudioNotificationConfig {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		return {};
	}

	const sounds: AudioNotificationConfig = {};
	for (const [key, rawValue] of Object.entries(value)) {
		if (!isAudioEvent(key) || typeof rawValue !== "string") continue;
		const trimmedValue = rawValue.trim();
		if (trimmedValue.length > 0) {
			sounds[key] = trimmedValue;
		}
	}
	return sounds;
}

function normalizeLoadedSettings(
	value: unknown,
): GlobalAudioNotificationSettings {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		return createDefaultSettings();
	}

	const recordValue = value as Record<string, unknown>;
	if (recordValue.version !== GLOBAL_SETTINGS_VERSION) {
		return createDefaultSettings();
	}

	return {
		version: GLOBAL_SETTINGS_VERSION,
		sounds: normalizeSounds(recordValue.sounds),
	};
}

export type AudioSoundSettingsStore = {
	readonly path: string;
	load(): Promise<GlobalAudioNotificationSettings>;
	save(settings: GlobalAudioNotificationSettings): Promise<void>;
};

class FileAudioSoundSettingsStore implements AudioSoundSettingsStore {
	readonly path: string;

	constructor(filePath: string) {
		this.path = filePath;
	}

	async load(): Promise<GlobalAudioNotificationSettings> {
		try {
			const content = await readFile(this.path, "utf8");
			return normalizeLoadedSettings(JSON.parse(content) as unknown);
		} catch {
			return createDefaultSettings();
		}
	}

	async save(settings: GlobalAudioNotificationSettings): Promise<void> {
		const normalizedSettings = normalizeLoadedSettings(settings);
		const parentDir = path.dirname(this.path);
		const tempPath = `${this.path}.tmp`;
		await mkdir(parentDir, { recursive: true });
		await writeFile(
			tempPath,
			`${JSON.stringify(normalizedSettings, null, 2)}\n`,
			"utf8",
		);
		await rename(tempPath, this.path);
	}
}

export function createAudioSoundSettingsStore(): AudioSoundSettingsStore {
	const filePath = path.join(
		getAgentDir(),
		GLOBAL_SETTINGS_RELATIVE_DIR,
		GLOBAL_SETTINGS_FILE_NAME,
	);
	return new FileAudioSoundSettingsStore(filePath);
}

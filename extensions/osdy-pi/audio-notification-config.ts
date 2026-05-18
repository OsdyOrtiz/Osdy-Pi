import { access, constants, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type {
	ExtensionAPI,
	ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import type { AudioSoundSettingsStore } from "./audio-sound-settings.js";
import {
	AUDIO_NOTIFICATION_EVENTS,
	AUDIO_NOTIFICATION_FLAG_NAMES,
	type AudioNotificationConfig,
	type AudioNotificationEvent,
	type AudioPathValidationResult,
	type EffectiveAudioNotificationPath,
	type GlobalAudioNotificationSettings,
	type ResolvedSoundFile,
} from "./audio-notification-types.js";

const SUPPORTED_AUDIO_EXTENSIONS = new Set([".mp3", ".wav"]);

type ValidationMode = "startup-flag" | "global-save" | "global-runtime";

function normalizeConfiguredValue(value: unknown): string | undefined {
	if (typeof value !== "string") return undefined;
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : undefined;
}

function expandHomeDir(inputPath: string): string {
	if (inputPath === "~") return os.homedir();
	if (inputPath.startsWith("~/") || inputPath.startsWith("~\\")) {
		return path.join(os.homedir(), inputPath.slice(2));
	}
	return inputPath;
}

function hasSupportedExtension(filePath: string): boolean {
	return SUPPORTED_AUDIO_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

function resolvePathForMode(
	inputPath: string,
	cwd: string,
	mode: ValidationMode,
): string | undefined {
	const expandedPath = expandHomeDir(inputPath);
	if (path.isAbsolute(expandedPath)) {
		return path.normalize(expandedPath);
	}
	if (mode === "global-runtime") {
		return undefined;
	}
	return path.resolve(cwd, expandedPath);
}

async function checkReadableFile(
	resolvedPath: string,
): Promise<AudioPathValidationResult> {
	if (!hasSupportedExtension(resolvedPath)) {
		return { ok: false, reason: "unsupported-extension" };
	}
	try {
		const fileInfo = await stat(resolvedPath);
		if (!fileInfo.isFile()) {
			return { ok: false, reason: "not-file" };
		}
	} catch {
		return { ok: false, reason: "missing" };
	}
	try {
		await access(resolvedPath, constants.R_OK);
	} catch {
		return { ok: false, reason: "unreadable" };
	}
	return {
		ok: true,
		inputPath: resolvedPath,
		resolvedPath,
		persistedPath: resolvedPath,
	};
}

export async function validateAudioNotificationPath(
	inputPath: string | undefined,
	options: { cwd: string; mode: ValidationMode },
): Promise<AudioPathValidationResult> {
	const normalizedPath = normalizeConfiguredValue(inputPath);
	if (normalizedPath === undefined) {
		return { ok: false, reason: "unconfigured" };
	}
	const resolvedPath = resolvePathForMode(
		normalizedPath,
		options.cwd,
		options.mode,
	);
	if (resolvedPath === undefined) {
		return { ok: false, reason: "relative-global-path" };
	}
	const fileCheck = await checkReadableFile(resolvedPath);
	if (!fileCheck.ok) {
		return fileCheck;
	}
	return {
		ok: true,
		inputPath: normalizedPath,
		resolvedPath,
		persistedPath:
			options.mode === "startup-flag" ? normalizedPath : resolvedPath,
	};
}

function getStartupFlagConfig(pi: ExtensionAPI): AudioNotificationConfig {
	const config: AudioNotificationConfig = {};
	for (const event of AUDIO_NOTIFICATION_EVENTS) {
		const value = normalizeConfiguredValue(
			pi.getFlag(AUDIO_NOTIFICATION_FLAG_NAMES[event]),
		);
		if (value !== undefined) {
			config[event] = value;
		}
	}
	return config;
}

export function registerAudioNotificationFlags(pi: ExtensionAPI): void {
	for (const event of AUDIO_NOTIFICATION_EVENTS) {
		pi.registerFlag(AUDIO_NOTIFICATION_FLAG_NAMES[event], {
			description: `Path to the ${event} notification sound (.mp3 or .wav)`,
			type: "string",
			default: "",
		});
	}
}

export function getEffectiveAudioNotificationPath(
	pi: ExtensionAPI,
	globalSettings: GlobalAudioNotificationSettings,
	event: AudioNotificationEvent,
): EffectiveAudioNotificationPath {
	const startupFlags = getStartupFlagConfig(pi);
	const startupPath = startupFlags[event];
	if (startupPath !== undefined) {
		return { source: "startup-flag", path: startupPath };
	}
	const globalPath = normalizeConfiguredValue(globalSettings.sounds[event]);
	if (globalPath !== undefined) {
		return { source: "global", path: globalPath };
	}
	return { source: "unconfigured" };
}

export async function resolveAudioNotificationSound(
	pi: ExtensionAPI,
	ctx: ExtensionContext,
	event: AudioNotificationEvent,
	settingsStore: AudioSoundSettingsStore,
): Promise<ResolvedSoundFile> {
	const globalSettings = await settingsStore.load();
	const effectivePath = getEffectiveAudioNotificationPath(
		pi,
		globalSettings,
		event,
	);
	if (effectivePath.source === "unconfigured") {
		return { ok: false, event, reason: "unconfigured", source: "unconfigured" };
	}
	const validationMode: ValidationMode =
		effectivePath.source === "startup-flag" ? "startup-flag" : "global-runtime";
	const validatedPath = await validateAudioNotificationPath(
		effectivePath.path,
		{
			cwd: ctx.cwd,
			mode: validationMode,
		},
	);
	if (!validatedPath.ok) {
		return {
			ok: false,
			event,
			reason:
				validatedPath.reason === "unsupported-extension"
					? "unsupported-extension"
					: "missing-or-unreadable",
			source: effectivePath.source,
		};
	}
	return {
		ok: true,
		event,
		path: validatedPath.resolvedPath,
		source: effectivePath.source,
	};
}

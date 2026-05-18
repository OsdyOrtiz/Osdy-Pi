import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import {
	AUDIO_NOTIFICATION_EVENTS,
	type AudioNotificationConfig,
	type AudioNotificationEvent,
	type AudioPathValidationReason,
	type GlobalAudioNotificationSettings,
} from "./audio-notification-types.js";
import type { AudioSoundSettingsStore } from "./audio-sound-settings.js";
import { validateAudioNotificationPath } from "./audio-notification-config.js";

const SKIP_EVENT_OPTION = "Skip";
const CANCEL_SETUP_OPTION = "Cancel setup";
const KEEP_CURRENT_OPTION = "Keep current";
const SET_OR_REPLACE_OPTION = "Set or replace";
const CLEAR_SAVED_OPTION = "Clear saved sound";
const LEAVE_UNCONFIGURED_OPTION = "Leave unconfigured";

function formatValidationReason(reason: AudioPathValidationReason): string {
	switch (reason) {
		case "unsupported-extension":
			return "Use a readable .mp3 or .wav file.";
		case "missing":
			return "The file does not exist.";
		case "unreadable":
			return "The file is not readable.";
		case "not-file":
			return "The selected path is not a regular file.";
		case "relative-global-path":
			return "Saved global sounds must resolve to an absolute path.";
		case "unconfigured":
			return "Enter a sound path or choose a different action.";
	}
}

function createSummary(settings: AudioNotificationConfig): string {
	return AUDIO_NOTIFICATION_EVENTS.map((event) => {
		const value = settings[event] ?? "(unconfigured)";
		return `${event}: ${value}`;
	}).join("\n");
}

function createCurrentValueLabel(
	event: AudioNotificationEvent,
	currentSettings: AudioNotificationConfig,
): string {
	return currentSettings[event] ?? `No saved ${event} sound`;
}

async function chooseEventAction(
	ctx: ExtensionContext,
	event: AudioNotificationEvent,
	currentSettings: AudioNotificationConfig,
): Promise<string | undefined> {
	const options = currentSettings[event]
		? [
				KEEP_CURRENT_OPTION,
				SET_OR_REPLACE_OPTION,
				CLEAR_SAVED_OPTION,
				SKIP_EVENT_OPTION,
				CANCEL_SETUP_OPTION,
			]
		: [
				SET_OR_REPLACE_OPTION,
				LEAVE_UNCONFIGURED_OPTION,
				SKIP_EVENT_OPTION,
				CANCEL_SETUP_OPTION,
			];
	return ctx.ui.select(
		`Osdy Pi sound setup: ${event}`,
		options.map(
			(option) =>
				`${option}${option === KEEP_CURRENT_OPTION ? ` (${createCurrentValueLabel(event, currentSettings)})` : ""}`,
		),
	);
}

async function promptForPath(
	ctx: ExtensionContext,
	event: AudioNotificationEvent,
): Promise<string | undefined> {
	return ctx.ui.input(
		`Sound path for ${event}`,
		"/absolute/path/file.mp3 or .wav",
	);
}

async function stageEventPath(
	ctx: ExtensionContext,
	event: AudioNotificationEvent,
	stagedSettings: AudioNotificationConfig,
): Promise<"continue" | "cancel"> {
	while (true) {
		const enteredPath = await promptForPath(ctx, event);
		if (enteredPath === undefined) return "cancel";
		const validation = await validateAudioNotificationPath(enteredPath, {
			cwd: ctx.cwd,
			mode: "global-save",
		});
		if (validation.ok) {
			stagedSettings[event] = validation.persistedPath;
			ctx.ui.notify(
				`${event} sound set to ${validation.persistedPath}`,
				"info",
			);
			return "continue";
		}
		ctx.ui.notify(
			`Invalid ${event} sound: ${formatValidationReason(validation.reason)}`,
			"warning",
		);
		const nextStep = await ctx.ui.select(`Retry ${event} sound setup?`, [
			"Retry",
			SKIP_EVENT_OPTION,
			CANCEL_SETUP_OPTION,
		]);
		if (nextStep === CANCEL_SETUP_OPTION || nextStep === undefined) {
			return "cancel";
		}
		if (nextStep === SKIP_EVENT_OPTION) {
			return "continue";
		}
	}
}

async function revalidateStagedSettings(
	ctx: ExtensionContext,
	stagedSettings: AudioNotificationConfig,
): Promise<string[]> {
	const errors: string[] = [];
	for (const event of AUDIO_NOTIFICATION_EVENTS) {
		const value = stagedSettings[event];
		if (value === undefined) continue;
		const validation = await validateAudioNotificationPath(value, {
			cwd: ctx.cwd,
			mode: "global-runtime",
		});
		if (!validation.ok) {
			errors.push(`${event}: ${formatValidationReason(validation.reason)}`);
		}
	}
	return errors;
}

function createSettingsPayload(
	stagedSettings: AudioNotificationConfig,
): GlobalAudioNotificationSettings {
	const sounds: AudioNotificationConfig = {};
	for (const event of AUDIO_NOTIFICATION_EVENTS) {
		const value = stagedSettings[event];
		if (typeof value === "string" && value.trim().length > 0) {
			sounds[event] = value;
		}
	}
	return { version: 1, sounds };
}

export async function runSoundSetupWizard(
	ctx: ExtensionContext,
	settingsStore: AudioSoundSettingsStore,
): Promise<void> {
	const currentSettings = (await settingsStore.load()).sounds;
	const stagedSettings: AudioNotificationConfig = { ...currentSettings };
	ctx.ui.notify(
		`Osdy Pi sound setup. Supported formats: .mp3 and .wav. Global config: ${settingsStore.path}`,
		"info",
	);

	for (const event of AUDIO_NOTIFICATION_EVENTS) {
		const selectedAction = await chooseEventAction(ctx, event, currentSettings);
		if (
			selectedAction === undefined ||
			selectedAction === CANCEL_SETUP_OPTION
		) {
			ctx.ui.notify("Osdy Pi sound setup cancelled.", "info");
			return;
		}
		if (
			selectedAction.startsWith(KEEP_CURRENT_OPTION) ||
			selectedAction === SKIP_EVENT_OPTION ||
			selectedAction === LEAVE_UNCONFIGURED_OPTION
		) {
			if (selectedAction === LEAVE_UNCONFIGURED_OPTION) {
				delete stagedSettings[event];
			}
			continue;
		}
		if (selectedAction === CLEAR_SAVED_OPTION) {
			delete stagedSettings[event];
			ctx.ui.notify(`Cleared saved ${event} sound.`, "info");
			continue;
		}
		if (selectedAction === SET_OR_REPLACE_OPTION) {
			const result = await stageEventPath(ctx, event, stagedSettings);
			if (result === "cancel") {
				ctx.ui.notify("Osdy Pi sound setup cancelled.", "info");
				return;
			}
		}
	}

	const summary = createSummary(stagedSettings);
	const confirmed = await ctx.ui.confirm("Save Osdy Pi sounds?", summary);
	if (!confirmed) {
		ctx.ui.notify("Osdy Pi sound setup cancelled.", "info");
		return;
	}

	const validationErrors = await revalidateStagedSettings(ctx, stagedSettings);
	if (validationErrors.length > 0) {
		ctx.ui.notify(
			`Could not save sounds:\n${validationErrors.join("\n")}`,
			"error",
		);
		return;
	}

	await settingsStore.save(createSettingsPayload(stagedSettings));
	ctx.ui.notify("Osdy Pi sound settings saved.", "info");
}

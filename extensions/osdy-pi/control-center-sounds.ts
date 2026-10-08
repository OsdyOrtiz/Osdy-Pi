import { getEffectiveAudioNotificationPath, resolveAudioNotificationSound, validateAudioNotificationPath } from "./audio-notification-config.js";
import { AUDIO_NOTIFICATION_EVENTS } from "./audio-notification-types.js";
import type { AudioNotificationEvent, EffectiveAudioNotificationPath, GlobalAudioNotificationSettings, ResolvedSoundFile } from "./audio-notification-types.js";
import type { AudioSoundSettingsStore } from "./audio-sound-settings.js";
import type { AudioPlaybackAdapter } from "./audio-playback.js";
import type { ControlCenterService, ControlCenterServiceAction } from "./control-center.js";

interface SoundDependencies {
	cwd: string;
	store: AudioSoundSettingsStore;
	playback: AudioPlaybackAdapter;
	effective(settings: GlobalAudioNotificationSettings, event: AudioNotificationEvent): EffectiveAudioNotificationPath;
	resolve(event: AudioNotificationEvent): Promise<ResolvedSoundFile>;
	validate?: typeof validateAudioNotificationPath;
}
const message = (error: unknown): string => error instanceof Error ? error.message : "Unknown error";

/** Path validation, v1 persistence and explicit playback stay outside the renderer. */
export function createControlCenterSounds(dependencies: SoundDependencies): ControlCenterService {
	const { store, playback } = dependencies;
	return {
		async read() {
			const settings = await store.load();
			return {
				summary: `Automatic audio: ${settings.enabled ? "enabled" : "muted"}`,
				note: "Startup flags override saved paths, then the bundled default. Clearing restores the bundled default unless a flag overrides; it does not disable flag-configured playback.",
				rows: [
					{ label: settings.enabled ? "Mute automatic audio" : "Enable automatic audio", current: false,
						details: ["Mute all automatic sounds, including startup flags and the bundled default. Explicit sound tests still play.",
							"Saved paths and visual notifications are unchanged. Applies to the next notification without reload; current playback is not stopped."],
						action: { kind: "sound-enabled" as const, value: !settings.enabled } },
					...AUDIO_NOTIFICATION_EVENTS.flatMap((event) => {
						const effective = dependencies.effective(settings, event);
						const saved = settings.sounds[event];
						const details = [`${event} saved: ${saved ?? "none"}`, `Effective (${effective.source}): ${effective.path ?? "none"}`];
						return [
							{ label: `Configure ${event}`,
								current: false, details, action: { kind: "sound-configure" as const, event, path: saved ?? "" } },
							{ label: `Clear saved ${event}`, current: false, details, action: { kind: "sound-clear" as const, event } },
							{ label: `Test effective ${event}`, current: false, details, action: { kind: "sound-test" as const, event } },
						];
					}),
				],
			};
		},
		async apply(action: ControlCenterServiceAction) {
			if (action.kind === "git-enabled") return { failed: true, message: "Not a sound action" };
			if (action.kind === "sound-test") {
				if (playback.platform === "unsupported") return { failed: true, message: "Test playback unavailable on this platform." };
				try {
					const sound = await dependencies.resolve(action.event);
					if (!sound.ok) return { failed: true, message: `Test unavailable: ${sound.reason} (${sound.source}).` };
					await playback.play(sound.path);
					return { failed: false, message: `Played effective ${action.event} sound (${sound.source}).` };
				} catch (error) {
					return { failed: true, message: `Test playback failed: ${message(error)}` };
				}
			}
			try {
				const settings = await store.load();
				const sounds = { ...settings.sounds };
				if (action.kind === "sound-set") {
					const validation = await (dependencies.validate ?? validateAudioNotificationPath)(action.path, { cwd: dependencies.cwd, mode: "global-save" });
					if (!validation.ok) return { failed: true, message: `Invalid ${action.event} sound: ${validation.reason}. Use a readable .mp3 or .wav file. Not saved.` };
					sounds[action.event] = validation.persistedPath;
				} else if (action.kind === "sound-clear") delete sounds[action.event];
				await store.save({ ...settings, sounds,
					enabled: action.kind === "sound-enabled" ? action.value : settings.enabled });
			} catch (error) {
				return { failed: true, message: `Not saved: ${message(error)}` };
			}
			// Event playback resolves the same store afresh each time; no separate runtime cache.
			try {
				await store.load();
				return { failed: false, message: action.kind === "sound-enabled"
					? `Saved globally: automatic audio ${action.value ? "enabled" : "muted"}. Applies to the next notification; explicit tests still play.`
					: `Saved globally: ${action.event}. Runtime uses current saved paths; startup flags still take precedence.` };
			} catch (error) {
				return { failed: true, message: `Saved globally, but runtime refresh failed: ${message(error)}. Retry refresh by reopening Sounds.` };
			}
		},
	};
}

/** Bind the existing config resolver rather than duplicate startup flag rules. */
export function bindControlCenterSounds(
	pi: Parameters<typeof getEffectiveAudioNotificationPath>[0],
	ctx: Parameters<typeof resolveAudioNotificationSound>[1],
	store: AudioSoundSettingsStore,
	playback: AudioPlaybackAdapter,
): ControlCenterService {
	return createControlCenterSounds({ cwd: ctx.cwd, store, playback,
		effective: (settings, event) => getEffectiveAudioNotificationPath(pi, settings, event),
		resolve: (event) => resolveAudioNotificationSound(pi, ctx, event, store),
	});
}

import type {
	ExtensionAPI,
	ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import type { AudioSoundSettingsStore } from "./audio-sound-settings.js";
import { resolveAudioNotificationSoundFromSettings } from "./audio-notification-config.js";
import type { AudioNotificationEvent } from "./audio-notification-types.js";
import type { AudioPlaybackAdapter } from "./audio-playback.js";

export type AudioNotificationService = {
	notify(event: AudioNotificationEvent, ctx: ExtensionContext): void;
};

class DefaultAudioNotificationService implements AudioNotificationService {
	private readonly inFlightEvents = new Set<AudioNotificationEvent>();

	constructor(
		private readonly pi: ExtensionAPI,
		private readonly playbackAdapter: AudioPlaybackAdapter,
		private readonly settingsStore: AudioSoundSettingsStore,
	) {}

	notify(event: AudioNotificationEvent, ctx: ExtensionContext): void {
		if (this.inFlightEvents.has(event)) return;
		this.inFlightEvents.add(event);
		void this.play(event, ctx)
			.catch(() => undefined)
			.finally(() => {
				this.inFlightEvents.delete(event);
			});
	}

	private async play(
		event: AudioNotificationEvent,
		ctx: ExtensionContext,
	): Promise<void> {
		// One fresh snapshot gates all automatic audio, including startup flags.
		const settings = await this.settingsStore.load();
		if (!settings.enabled) return;
		const resolvedSound = await resolveAudioNotificationSoundFromSettings(
			this.pi,
			ctx,
			event,
			settings,
		);
		if (!resolvedSound.ok) return;
		await this.playbackAdapter.play(resolvedSound.path);
	}
}

export function createAudioNotificationService(
	pi: ExtensionAPI,
	playbackAdapter: AudioPlaybackAdapter,
	settingsStore: AudioSoundSettingsStore,
): AudioNotificationService {
	return new DefaultAudioNotificationService(
		pi,
		playbackAdapter,
		settingsStore,
	);
}

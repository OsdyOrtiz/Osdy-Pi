export const AUDIO_NOTIFICATION_EVENTS = [
	"completion",
	"error",
	"permission",
	"question",
] as const;

export type AudioNotificationEvent = (typeof AUDIO_NOTIFICATION_EVENTS)[number];

export const AUDIO_NOTIFICATION_FLAG_NAMES: Record<
	AudioNotificationEvent,
	string
> = {
	completion: "osdy-pi-sound-completion",
	error: "osdy-pi-sound-error",
	permission: "osdy-pi-sound-permission",
	question: "osdy-pi-sound-question",
};

export type AudioNotificationConfig = Partial<
	Record<AudioNotificationEvent, string>
>;

export type GlobalAudioNotificationSettings = {
	version: 1;
	sounds: AudioNotificationConfig;
};

export type AudioConfigSource = "startup-flag" | "global" | "unconfigured";

export type ResolvedSoundFile =
	| {
			ok: true;
			event: AudioNotificationEvent;
			path: string;
			source: Exclude<AudioConfigSource, "unconfigured">;
	  }
	| {
			ok: false;
			event: AudioNotificationEvent;
			reason:
				| "unconfigured"
				| "unsupported-extension"
				| "missing-or-unreadable";
			source: AudioConfigSource;
	  };

export type AudioPathValidationReason =
	| "unconfigured"
	| "unsupported-extension"
	| "missing"
	| "unreadable"
	| "not-file"
	| "relative-global-path";

export type AudioPathValidationResult =
	| {
			ok: true;
			inputPath: string;
			resolvedPath: string;
			persistedPath: string;
	  }
	| {
			ok: false;
			reason: AudioPathValidationReason;
	  };

export type EffectiveAudioNotificationPath =
	| {
			source: Exclude<AudioConfigSource, "unconfigured">;
			path: string;
	  }
	| {
			source: "unconfigured";
			path?: undefined;
	  };

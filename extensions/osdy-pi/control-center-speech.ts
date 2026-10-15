import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { ControlCenterDetail, ControlCenterService } from "./control-center.js";
import type { ResponseSpeech } from "./response-speech.js";
import type { SpeechSettings } from "./speech-types.js";

export type ControlCenterSpeechAction =
	| { kind: "speech-enabled"; value: boolean }
	| { kind: "speech-last" }
	| { kind: "speech-stop" }
	| { kind: "speech-voice"; voice: string }
	| { kind: "speech-preview"; voice: string };

export interface ControlCenterSpeechService extends ControlCenterService<ControlCenterSpeechAction> {
	moveVoice(direction: -1 | 1): ControlCenterDetail | undefined;
	stopPreview(): void;
}

/** Presentation projection only; the lifecycle owner performs every speech action. */
export function createControlCenterSpeech(speech: ResponseSpeech, ctx: ExtensionContext,
	isCurrent: () => boolean = () => true): ControlCenterSpeechService {
	let settings: SpeechSettings | undefined;
	let voices: readonly string[] = [];
	let savedVoice: string | undefined;
	let draft: string | undefined;
	let voiceNote = "No voices available.";
	const project = (): ControlCenterDetail => {
		if (!settings) return { summary: "Speech unavailable", note: voiceNote, rows: [] };
		return {
			summary: `Speech: ${settings.enabled ? "enabled" : "disabled"} · Saved voice: ${settings.voice} · Rate: ${settings.rate} wpm`,
			note: `Local speech: installed macOS voices or optional Kokoro (requires a separately started local server). Independent of Sounds mute. Read last response uses the saved voice while disabled. ${voiceNote}`,
			rows: [
				{ label: settings.enabled ? "Disable" : "Enable", current: false, action: { kind: "speech-enabled", value: !settings.enabled } },
				{ label: "Read last response", current: false, action: { kind: "speech-last" } },
				{ label: "Stop", current: false, action: { kind: "speech-stop" } },
				...(!voices.length || draft === undefined ? [] : [
					{ label: `Voice: ‹ ${draft} › (${draft === savedVoice ? "saved" : "unsaved"})`, current: draft === savedVoice,
						action: { kind: "speech-voice" as const, voice: draft }, speechSelector: true,
						details: ["←/→ browse draft (wraps); Enter saves. Browsing and saving never play audio.", `Saved voice: ${settings.voice}. Preview voice explicitly plays the draft without saving.`] },
					{ label: "Preview voice", current: false, action: { kind: "speech-preview" as const, voice: draft },
						details: ["Play a fixed sample: Spanish for Kokoro, English for native voices; does not save or enable narration."] },
				]),
			],
		};
	};
	return {
		async read() {
			const nextSettings = await speech.settings();
			let nextVoices: readonly string[] = [];
			voiceNote = "No voices available.";
			try {
				nextVoices = await speech.voices(ctx);
				if (nextVoices.length) voiceNote = "←/→ on Voice browses; Enter saves; Preview voice plays an explicit sample. Tab returns to categories.";
			} catch (error) {
				voiceNote = `Voices unavailable: ${error instanceof Error ? error.message : "Unknown error"}`;
			}
			const nextSaved = nextVoices.find(voice => voice === nextSettings.voice) ??
				nextVoices.find(voice => voice.startsWith(`${nextSettings.voice} (`) && voice.endsWith(")"));
			// Follow external saved changes only while the draft was clean. Never discard an unsaved choice on refresh.
			if (nextVoices.length) {
				if (draft === undefined || draft === savedVoice || !nextVoices.includes(draft)) draft = nextSaved ?? nextVoices[0];
				savedVoice = nextSaved;
			}
			settings = nextSettings;
			voices = nextVoices;
			return project();
		},
		moveVoice(direction) {
			if (!isCurrent() || !voices.length || draft === undefined) return undefined;
			const index = voices.indexOf(draft);
			draft = voices[(index + direction + voices.length) % voices.length];
			return project();
		},
		stopPreview() { speech.stopPreview(ctx); },
		apply(action) {
			if (!isCurrent()) return Promise.resolve({ failed: true, message: "Speech session changed; reopen Control Center." });
			if (action.kind === "speech-preview") return speech.previewVoice(action.voice, ctx);
			if (action.kind === "speech-voice") return speech.selectVoice(action.voice, ctx);
			if (action.kind === "speech-enabled") return speech.command([action.value ? "on" : "off"], ctx);
			return speech.command([action.kind === "speech-last" ? "last" : "stop"], ctx);
		},
	};
}

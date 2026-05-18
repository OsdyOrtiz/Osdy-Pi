import type { AudioPlaybackAdapter } from "./audio-playback.js";

export function createUnsupportedAudioPlaybackAdapter(): AudioPlaybackAdapter {
	return {
		platform: "unsupported",
		play: () => Promise.resolve(),
	};
}

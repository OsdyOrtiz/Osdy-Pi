import { createMacOsAudioPlaybackAdapter } from "./audio-playback-macos.js";
import { createUnsupportedAudioPlaybackAdapter } from "./audio-playback-unsupported.js";
import { createWindowsAudioPlaybackAdapter } from "./audio-playback-windows.js";

export type AudioPlaybackAdapter = {
	readonly platform: "darwin" | "win32" | "unsupported";
	play(path: string): Promise<void>;
};

export function createAudioPlaybackAdapter(): AudioPlaybackAdapter {
	if (process.platform === "darwin") {
		return createMacOsAudioPlaybackAdapter();
	}
	if (process.platform === "win32") {
		return createWindowsAudioPlaybackAdapter();
	}
	return createUnsupportedAudioPlaybackAdapter();
}

import { spawn } from "node:child_process";
import type { AudioPlaybackAdapter } from "./audio-playback.js";

function runProcess(command: string, args: string[]): Promise<void> {
	return new Promise((resolve, reject) => {
		const child = spawn(command, args, {
			stdio: ["ignore", "ignore", "pipe"],
		});

		let stderr = "";
		child.stderr.on("data", (chunk: Buffer | string) => {
			stderr += chunk.toString();
		});
		child.on("error", reject);
		child.on("close", (code) => {
			if (code === 0) {
				resolve();
				return;
			}
			reject(
				new Error(
					stderr.trim() || `${command} exited with code ${code ?? "unknown"}`,
				),
			);
		});
	});
}

export function createMacOsAudioPlaybackAdapter(): AudioPlaybackAdapter {
	return {
		platform: "darwin",
		play(soundPath: string): Promise<void> {
			return runProcess("afplay", [soundPath]);
		},
	};
}

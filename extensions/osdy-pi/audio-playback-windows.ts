import { spawn } from "node:child_process";
import type { AudioPlaybackAdapter } from "./audio-playback.js";

const WINDOWS_AUDIO_TIMEOUT_MS = 15_000;

const WINDOWS_AUDIO_SCRIPT = [
	"$path = $env:OSDY_PI_SOUND_PATH",
	'if ([string]::IsNullOrWhiteSpace($path)) { throw "Missing sound path" }',
	"$player = New-Object -ComObject WMPlayer.OCX",
	"$player.settings.volume = 100",
	"$player.URL = $path",
	"$player.controls.play()",
	"while ($true) {",
	"  $state = $player.playState",
	"  if ($state -eq 1 -or $state -eq 8 -or $state -eq 10) { break }",
	"  Start-Sleep -Milliseconds 100",
	"}",
].join("\n");

function encodePowerShellScript(script: string): string {
	return Buffer.from(script, "utf16le").toString("base64");
}

function runPowerShell(script: string, soundPath: string): Promise<void> {
	return new Promise((resolve, reject) => {
		const child = spawn(
			"powershell.exe",
			[
				"-NoProfile",
				"-NonInteractive",
				"-ExecutionPolicy",
				"Bypass",
				"-EncodedCommand",
				encodePowerShellScript(script),
			],
			{
				stdio: ["ignore", "ignore", "pipe"],
				env: { ...process.env, OSDY_PI_SOUND_PATH: soundPath },
			},
		);

		let stderr = "";
		let settled = false;
		const timeout = setTimeout(() => {
			if (settled) return;
			settled = true;
			child.kill();
			reject(new Error("powershell audio playback timed out"));
		}, WINDOWS_AUDIO_TIMEOUT_MS);
		const finish = (callback: () => void) => {
			if (settled) return;
			settled = true;
			clearTimeout(timeout);
			callback();
		};

		child.stderr.on("data", (chunk: Buffer | string) => {
			stderr += chunk.toString();
		});
		child.on("error", (error) => {
			finish(() => reject(error));
		});
		child.on("close", (code) => {
			finish(() => {
				if (code === 0) {
					resolve();
					return;
				}
				reject(
					new Error(
						stderr.trim() || `powershell exited with code ${code ?? "unknown"}`,
					),
				);
			});
		});
	});
}

export function createWindowsAudioPlaybackAdapter(): AudioPlaybackAdapter {
	return {
		platform: "win32",
		play(soundPath: string): Promise<void> {
			return runPowerShell(WINDOWS_AUDIO_SCRIPT, soundPath);
		},
	};
}

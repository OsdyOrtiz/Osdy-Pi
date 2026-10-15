import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { extractResponseSpeech } from "./speech-text.js";
import type { SpeechResult, SpeechService, SpeechSettings } from "./speech-types.js";

export interface SpeechActionResult { failed: boolean; message: string }
export interface ResponseSpeech {
	settings(): Promise<SpeechSettings>;
	voices(ctx: ExtensionContext): Promise<readonly string[]>;
	selectVoice(voice: string, ctx: ExtensionContext): Promise<SpeechActionResult>;
	previewVoice(voice: string, ctx: ExtensionContext): Promise<SpeechActionResult>;
	stopPreview(ctx: ExtensionContext): void;
	command(args: readonly string[], ctx: ExtensionContext): Promise<SpeechActionResult>;
}
const usage = "Usage: /osdy-pi speech on|off|status|stop|last";
const failure = (error: unknown): SpeechActionResult => ({ failed: true,
	message: `Speech failed: ${error instanceof Error ? error.message : "Unknown error"}` });
function speechResult(result: SpeechResult): SpeechActionResult {
	switch (result.kind) {
		case "started": return { failed: false, message: "Speech started." };
		case "error": return failure(new Error(result.message));
		case "unavailable": return { failed: true, message: "Speech unavailable: requires local macOS and the configured voice; no fallback voice is used." };
		default: return { failed: true, message: `Speech ${result.kind}.` };
	}
}

/** Session-scoped narration owner. UI actions share this owner, never the Sounds router. */
export function registerResponseSpeech(pi: ExtensionAPI, service: SpeechService): ResponseSpeech {
	let session: { manager: ExtensionContext["sessionManager"]; id: string } | undefined;
	let generation = 0;
	let previewGeneration = 0;
	let running = false;
	let candidate: string | undefined;
	let last: string | undefined;
	let suppressed = false;
	let runSignal: AbortSignal | undefined;
	let removeAbort: (() => void) | undefined;
	const current = (ctx: ExtensionContext): boolean => !!session &&
		session.manager === ctx.sessionManager && session.id === ctx.sessionManager.getSessionId();
	const terminal = (ctx: ExtensionContext): boolean => ctx.hasUI && ctx.mode === "tui";
	const cancelPlayback = (): void => { generation++; previewGeneration++; service.stop(); };
	const stop = (): void => { cancelPlayback(); suppressed = true; };
	const clear = (): void => {
		stop(); removeAbort?.(); removeAbort = undefined; runSignal = undefined;
		running = false; candidate = undefined; last = undefined;
	};
	pi.on("session_start", (_event, ctx) => {
		clear(); session = { manager: ctx.sessionManager, id: ctx.sessionManager.getSessionId() };
	});
	pi.on("session_shutdown", (_event, ctx) => { if (current(ctx)) { clear(); session = undefined; } });
	pi.on("input", (_event, ctx) => {
		// Queued input may finish within this run, without another agent_start.
		// Cancel old speech, but only an explicit Stop suppresses future output.
		if (current(ctx)) { cancelPlayback(); candidate = undefined; }
	});
	pi.on("agent_start", (_event, ctx) => {
		if (!current(ctx)) return;
		stop(); removeAbort?.(); candidate = undefined; running = true; suppressed = false;
		runSignal = ctx.signal;
		const abort = (): void => { stop(); candidate = undefined; };
		runSignal?.addEventListener("abort", abort, { once: true });
		const signal = runSignal;
		removeAbort = () => signal?.removeEventListener("abort", abort);
	});
	pi.on("message_start", (event, ctx) => {
		if (current(ctx) && running && event.message.role === "assistant") candidate = undefined;
	});
	pi.on("message_end", (event, ctx) => {
		if (current(ctx) && running && event.message.role === "assistant" && !extractResponseSpeech([event.message])) candidate = undefined;
	});
	pi.on("agent_end", (event, ctx) => {
		if (current(ctx) && running) candidate = extractResponseSpeech(event.messages);
	});
	pi.on("agent_before_settle", (event, ctx) => {
		if (current(ctx) && event.outcome !== "completed") candidate = undefined;
	});
	pi.on("session_compact_failed", (event, ctx) => {
		// The low-level run signal is already detached during post-run compaction.
		if (current(ctx) && running && event.aborted) { stop(); candidate = undefined; }
	});
	pi.on("agent_settled", (_event, ctx) => {
		if (!current(ctx) || !running) return;
		running = false;
		removeAbort?.(); removeAbort = undefined;
		const text = runSignal?.aborted ? undefined : candidate;
		candidate = undefined;
		if (!text) return;
		last = text;
		if (!terminal(ctx) || suppressed) return;
		// speak resolves at launch, not at playback completion. Never delay the agent,
		// and never turn an automatic process failure into a blocking UI notification.
		void service.speak(text, { automatic: true }).catch(() => {});
	});
	const installedVoices = async (ctx: ExtensionContext): Promise<readonly string[]> => {
		if (!terminal(ctx)) throw new Error("Voice selection requires the interactive terminal UI.");
		if (!current(ctx)) throw new Error("Speech session changed; reopen Control Center.");
		const captured = generation;
		const voices = await service.voices();
		if (captured !== generation || !current(ctx)) throw new Error("Voice discovery cancelled: speech context changed.");
		return voices;
	};
	return {
		async previewVoice(voice, ctx) {
			if (!terminal(ctx)) return { failed: true, message: "Voice preview requires the interactive terminal UI." };
			if (!current(ctx)) return { failed: true, message: "Speech session changed; reopen Control Center." };
			const busy = (): boolean => running || !ctx.isIdle();
			const busyResult: SpeechActionResult = { failed: true, message: "Speech preview unavailable while Pi is busy; retry when settled." };
			if (busy()) return busyResult;
			// This token also owns discovery before the service has any sample to stop.
			const token = ++previewGeneration;
			const captured = generation;
			service.stopPreview();
			const fresh = (): boolean => token === previewGeneration && captured === generation && current(ctx) && terminal(ctx);
			const cancelled: SpeechActionResult = { failed: true, message: "Speech cancelled: session or run changed." };
			try {
				const voices = await installedVoices(ctx);
				if (!fresh()) return cancelled;
				if (busy()) return busyResult;
				if (!voices.includes(voice)) return { failed: true, message: "Speech voice is not installed; settings unchanged." };
				const result = await service.preview(voice);
				if (!fresh()) return cancelled;
				if (busy()) { service.stopPreview(); return busyResult; }
				return speechResult(result);
			} catch (error) { return fresh() ? failure(error) : cancelled; }
		},
		stopPreview(ctx) {
			if (!current(ctx)) return;
			previewGeneration++;
			service.stopPreview();
		},
		settings: () => service.settings(),
		voices: installedVoices,
		async selectVoice(voice, ctx) {
			const captured = generation;
			try {
				const voices = await installedVoices(ctx);
				if (captured !== generation || !current(ctx)) throw new Error("Speech context changed; reopen Control Center.");
				if (!voices.includes(voice)) return { failed: true, message: "Speech voice is not installed; settings unchanged." };
				const settings = await service.configure({ voice });
				if (captured !== generation || !current(ctx)) return { failed: true, message: "Speech context changed; check the saved voice in the current session." };
				return { failed: false, message: `Voice saved globally: ${settings.voice}. Applies to the next narration.` };
			} catch (error) { return failure(error); }
		},
		async command(args, ctx) {
			if (args.length > 1 || !["on", "off", "status", "stop", "last"].includes(args[0] ?? "")) return { failed: true, message: usage };
			if (!terminal(ctx)) return { failed: true, message: "Speech requires the interactive terminal UI; RPC, JSON and print modes are unsupported." };
			if (!current(ctx)) return { failed: true, message: "Speech session changed; retry in the current session." };
			const action = args[0];
			if (action === "stop") { stop(); return { failed: false, message: "Speech stopped (including pending starts)." }; }
			if (action === "last" && (running || !ctx.isIdle())) return { failed: true, message: "Speech replay unavailable while Pi is busy; retry when settled." };
			const replay = last;
			if (action === "last" && !replay) return { failed: true, message: "No successful final response in this session yet." };
			if (action === "off") stop();
			const captured = generation;
			const fresh = (): boolean => captured === generation && current(ctx);
			try {
				if (action === "last" && replay) {
					previewGeneration++;
					const result = await service.speak(replay);
					return fresh() ? speechResult(result) : { failed: true, message: "Speech cancelled: session or run changed." };
				}
				const settings = action === "status" ? await service.settings() : await service.configure({ enabled: action === "on" });
				if (!fresh()) return { failed: true, message: "Speech context changed; check status in the current session." };
				return { failed: false, message: `Speech: ${settings.enabled ? "enabled" : "disabled"}; voice: ${settings.voice}; rate: ${settings.rate} wpm.${service.available() ? "" : " Playback unavailable on this platform."}` };
			} catch (error) { return fresh() ? failure(error) : { failed: true, message: "Speech cancelled: session or run changed." }; }
		},
	};
}

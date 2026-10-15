export interface SpeechSettings {
	version: 1;
	enabled: boolean;
	voice: string;
	rate: number;
}

export type SpeechResult =
	| { kind: "started" | "disabled" | "unavailable" | "empty" | "cancelled" }
	| { kind: "error"; message: string };

/** Speech launch and settings boundary; completion never waits for the narration. */
export interface SpeechService {
	settings(): Promise<SpeechSettings>;
	voices(): Promise<readonly string[]>;
	configure(patch: Partial<Pick<SpeechSettings, "enabled" | "voice" | "rate">>): Promise<SpeechSettings>;
	speak(text: string, options?: { automatic?: boolean }): Promise<SpeechResult>;
	preview(voice: string): Promise<SpeechResult>;
	stopPreview(): void;
	stop(): void;
	available(): boolean;
}

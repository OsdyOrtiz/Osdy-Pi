export type GenerationReading =
	| { kind: "idle" | "unavailable" }
	| { kind: "streaming"; tokensPerSecond: number | null }
	| { kind: "complete"; tokensPerSecond: number };

export interface GenerationMeter {
	start(): GenerationReading;
	delta(text: string): GenerationReading;
	finish(output: number | undefined, stopReason: string | undefined): GenerationReading;
	interrupt(): GenerationReading;
	reset(): GenerationReading;
}

/** Volatile, per-message measurement. No partial-message references or timers.
 * Live UTF-16 characters / 4 is a heuristic, never tokenizer/server telemetry.
 */
export function createGenerationMeter(now: () => number = () => performance.now()): GenerationMeter {
	let reading: GenerationReading = { kind: "idle" };
	let firstOutput: number | undefined;
	let lastTime: number | undefined;
	let invalidClock = false;
	let characters = 0;
	const sample = (): number => {
		const time = now();
		if (!Number.isFinite(time) || (lastTime !== undefined && time < lastTime)) invalidClock = true;
		lastTime = time;
		return time;
	};
	const rate = (tokens: number, time: number): number | null => {
		const elapsed = firstOutput === undefined ? 0 : time - firstOutput;
		// Sub-100ms observations are too short to present a useful rate.
		if (invalidClock || elapsed < 100 || !Number.isFinite(elapsed)) return null;
		const value = tokens / (elapsed / 1000);
		return Number.isFinite(value) && value > 0 ? value : null;
	};
	const reset = (): GenerationReading => {
		firstOutput = undefined;
		lastTime = undefined;
		invalidClock = false;
		characters = 0;
		return reading = { kind: "idle" };
	};
	return {
		reset,
		start() {
			reset();
			return reading = { kind: "streaming", tokensPerSecond: null };
		},
		delta(text) {
			if (reading.kind !== "streaming" || !text) return reading;
			const time = sample();
			firstOutput ??= time;
			characters += text.length;
			return reading = { kind: "streaming", tokensPerSecond: rate(characters / 4, time) };
		},
		finish(output, stopReason) {
			if (reading.kind !== "streaming") return reading;
			const time = sample();
			const completed = stopReason === "stop" || stopReason === "length" || stopReason === "toolUse";
			const value = completed && output !== undefined && Number.isSafeInteger(output) && output > 0
				? rate(output, time) : null;
			return reading = value === null ? { kind: "unavailable" } : { kind: "complete", tokensPerSecond: value };
		},
		interrupt() {
			if (reading.kind === "streaming") reading = { kind: "unavailable" };
			return reading;
		},
	};
}

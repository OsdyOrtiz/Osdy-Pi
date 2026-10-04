export interface CodexUsageRefreshTimer { cancel(): void }

export interface CodexUsageRefreshClock {
	setTimeout(callback: () => void, delayMs: number): CodexUsageRefreshTimer;
}

const clock: CodexUsageRefreshClock = {
	setTimeout: (callback, delayMs) => {
		const timer = setTimeout(callback, delayMs);
		timer.unref();
		return { cancel: () => clearTimeout(timer) };
	},
};

const INTERVAL_MS = 60_000;
const MAX_RETRY_MS = 600_000;

/** One session owns one timer; undefined means eligibility skipped the query. */
export function createCodexUsageRefresh(
	refresh: () => Promise<boolean | undefined>,
	timers: CodexUsageRefreshClock = clock,
): { start(): void; stop(): void } {
	let running = false;
	let generation = 0;
	let timer: CodexUsageRefreshTimer | undefined;
	let delayMs = INTERVAL_MS;

	const schedule = (owner: number): void => {
		timer = timers.setTimeout(() => {
			timer = undefined;
			void tick(owner);
		}, delayMs);
	};
	const tick = async (owner: number): Promise<void> => {
		if (!running || owner !== generation) return;
		let result: boolean | undefined;
		try { result = await refresh(); } catch { result = false; }
		if (!running || owner !== generation) return;
		if (result === false) delayMs = Math.min(delayMs * 2, MAX_RETRY_MS);
		else if (result === true) delayMs = INTERVAL_MS;
		schedule(owner);
	};
	return {
		start() {
			if (running) return;
			running = true;
			delayMs = INTERVAL_MS;
			schedule(++generation);
		},
		stop() {
			running = false;
			generation++;
			timer?.cancel();
			timer = undefined;
		},
	};
}

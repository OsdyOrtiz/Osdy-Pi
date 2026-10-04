import assert from "node:assert/strict";
import test from "node:test";
import { registerHooks } from "node:module";
import type { CodexUsageRefreshClock, CodexUsageRefreshTimer } from "./codex-usage-refresh.js";

registerHooks({
	resolve(specifier, context, nextResolve) {
		if (specifier === "./codex-usage-refresh.js") {
			return { shortCircuit: true, url: new URL("./codex-usage-refresh.ts", context.parentURL).href };
		}
		return nextResolve(specifier, context);
	},
});
const { createCodexUsageRefresh } = await import("./codex-usage-refresh.js");

class FakeClock implements CodexUsageRefreshClock {
	now = 0;
	jobs = new Map<CodexUsageRefreshTimer, { at: number; run: () => void }>();
	setTimeout(run: () => void, delay: number): CodexUsageRefreshTimer {
		const handle = { cancel: () => { this.jobs.delete(handle); } };
		this.jobs.set(handle, { at: this.now + delay, run });
		return handle;
	}
	async advance(ms: number): Promise<void> {
		this.now += ms;
		for (const [handle, job] of this.jobs) {
			if (job.at <= this.now) { this.jobs.delete(handle); job.run(); }
		}
		for (let i = 0; i < 8; i++) await Promise.resolve();
	}
}

void test("idle refresh waits 60 seconds and owns one timer and request", async () => {
	const clock = new FakeClock();
	let calls = 0;
	let finish: (value: boolean) => void = () => {};
	const service = createCodexUsageRefresh(() => {
		calls++;
		return new Promise<boolean>(resolve => { finish = resolve; });
	}, clock);
	service.start(); service.start();
	assert.equal(clock.jobs.size, 1);
	await clock.advance(59_999); assert.equal(calls, 0);
	await clock.advance(1); assert.equal(calls, 1);
	await clock.advance(600_000); assert.equal(calls, 1);
	assert.equal(clock.jobs.size, 0);
	finish(true); await clock.advance(0);
	assert.equal(clock.jobs.size, 1);
	await clock.advance(59_999); assert.equal(calls, 1);
	await clock.advance(1); assert.equal(calls, 2);
	service.stop(); finish(true); await clock.advance(0);
	assert.equal(clock.jobs.size, 0);
});

void test("failures increase delay to a bounded ten minutes and success resets it", async () => {
	const clock = new FakeClock();
	let result: boolean | undefined = false;
	let calls = 0;
	const service = createCodexUsageRefresh(() => { calls++; return Promise.resolve(result); }, clock);
	service.start();
	for (const delay of [60_000, 120_000, 240_000, 480_000, 600_000, 600_000]) {
		const before = calls;
		await clock.advance(delay - 1); assert.equal(calls, before);
		await clock.advance(1); assert.equal(calls, before + 1);
	}
	result = true; await clock.advance(600_000);
	const recovered = calls;
	await clock.advance(60_000); assert.equal(calls, recovered + 1);
	result = undefined; await clock.advance(60_000);
	assert.equal(clock.jobs.size, 1, "skipped refresh still retries at normal cadence");
	service.stop();
});

void test("stop and restart isolate both pending timers and pending completions", async () => {
	const clock = new FakeClock();
	const finishes: Array<(value: boolean) => void> = [];
	const service = createCodexUsageRefresh(() => new Promise<boolean>(resolve => finishes.push(resolve)), clock);
	service.start(); service.stop();
	await clock.advance(60_000); assert.equal(finishes.length, 0);
	service.start(); await clock.advance(60_000);
	service.stop(); service.start();
	finishes[0]?.(false); await clock.advance(0);
	assert.equal(clock.jobs.size, 1);
	await clock.advance(60_000); assert.equal(finishes.length, 2);
	service.stop(); finishes[1]?.(true); await clock.advance(0);
	assert.equal(clock.jobs.size, 0);
});

void test("unexpected refresh rejection backs off without an unhandled promise", async () => {
	const clock = new FakeClock(); let calls = 0;
	const service = createCodexUsageRefresh(() => { calls++; return Promise.reject(new Error("offline")); }, clock);
	service.start(); await clock.advance(60_000);
	await clock.advance(119_999); assert.equal(calls, 1);
	await clock.advance(1); assert.equal(calls, 2);
	service.stop();
});

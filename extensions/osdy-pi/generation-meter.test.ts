import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Native test runner resolves TypeScript source imports.
import { createGenerationMeter } from "./generation-meter.ts";

void test("estimates characters, then uses finalized output over first-output-to-end time", () => {
	let now = 0;
	const meter = createGenerationMeter(() => now);
	assert.deepEqual(meter.start(), { kind: "streaming", tokensPerSecond: null });
	now = 5000; // Request latency is not generation time.
	meter.delta("abcd");
	now = 6000;
	assert.deepEqual(meter.delta("abcdefghijkl"), { kind: "streaming", tokensPerSecond: 4 });
	now = 7000;
	assert.deepEqual(meter.finish(100, "stop"), { kind: "complete", tokensPerSecond: 50 });
	now = 9000;
	assert.deepEqual(meter.delta("ignored"), { kind: "complete", tokensPerSecond: 50 });
	assert.deepEqual(meter.start(), { kind: "streaming", tokensPerSecond: null });
	assert.deepEqual(meter.reset(), { kind: "idle" });
	assert.deepEqual(meter.finish(100, "stop"), { kind: "idle" });
});

void test("empty output, short/invalid intervals, invalid usage and interrupted responses are unavailable", () => {
	for (const duration of [0, 99, -1, Number.NaN, Infinity]) {
		let now = 0;
		const meter = createGenerationMeter(() => now);
		meter.start();
		meter.delta("abcd");
		now = duration;
		assert.equal(meter.delta("").kind, "streaming");
		assert.deepEqual(meter.finish(20, "stop"), { kind: "unavailable" });
	}
	for (const output of [undefined, 0, -1, 1.5, Number.NaN, Infinity]) {
		let now = 0;
		const meter = createGenerationMeter(() => now);
		meter.start(); meter.delta("abcd"); now = 1000;
		assert.deepEqual(meter.finish(output, "stop"), { kind: "unavailable" });
	}
	for (const reason of ["aborted", "error", "pending", "deferred", undefined]) {
		let now = 0;
		const meter = createGenerationMeter(() => now);
		meter.start(); meter.delta("abcd"); now = 1000;
		assert.deepEqual(meter.finish(20, reason), { kind: "unavailable" });
	}
	const meter = createGenerationMeter(() => 1000);
	meter.start(); meter.delta("");
	assert.deepEqual(meter.finish(20, "toolUse"), { kind: "unavailable" });
	meter.start();
	assert.deepEqual(meter.interrupt(), { kind: "unavailable" });
});

void test("clock regression invalidates the response, and normal length/tool-use endings are valid", () => {
	for (const reason of ["length", "toolUse"]) {
		let now = 1000;
		const meter = createGenerationMeter(() => now);
		meter.start(); meter.delta("abcd"); now = 2000;
		assert.deepEqual(meter.finish(20, reason), { kind: "complete", tokensPerSecond: 20 });
		assert.deepEqual(meter.interrupt(), { kind: "complete", tokensPerSecond: 20 });
		meter.start(); meter.delta("abcd"); now = 1900; meter.delta("efgh"); now = 3000;
		assert.deepEqual(meter.finish(20, reason), { kind: "unavailable" });
	}
});

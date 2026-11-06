import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import test from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";

registerHooks({
	resolve(specifier, context, nextResolve) {
		if (specifier.startsWith(".") && specifier.endsWith(".js") && context.parentURL?.endsWith(".ts")) {
			const sourceUrl = new URL(`${specifier.slice(0, -3)}.ts`, context.parentURL);
			if (existsSync(fileURLToPath(sourceUrl))) return { shortCircuit: true, url: sourceUrl.href };
		}
		return nextResolve(specifier, context);
	},
	load(url, context, nextLoad) {
		if (url.endsWith(".ts")) {
			return {
				format: "module",
				shortCircuit: true,
				source: ts.transpileModule(readFileSync(fileURLToPath(url), "utf8"), {
					compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
				}).outputText,
			};
		}
		return nextLoad(url, context);
	},
});

const { parseClaudeBridgeUsage } = await import("./claude-bridge-usage.js");
const prefix = "anthropic-ratelimit-unified";
const headers = (values: Record<string, unknown>): Record<string, unknown> =>
	Object.fromEntries(Object.entries(values).map(([key, value]) => [`${prefix}-${key}`, value]));

void test("maps 5h and 7d utilization fractions and Unix reset seconds to display windows", () => {
	const snapshot = parseClaudeBridgeUsage(headers({
		"5h-utilization": "0.25", "5h-reset": "2000000000",
		"7d-utilization": "0.75", "7d-reset": "2000100000",
	}), 1234);
	assert.deepEqual(snapshot.session, { usedPercent: 25, resetsAt: 2_000_000_000 });
	assert.deepEqual(snapshot.weekly, { usedPercent: 75, resetsAt: 2_000_100_000 });
	assert.equal(snapshot.capturedAt, 1234);
});

void test("records the overage-included window separately and never substitutes it for weekly", () => {
	const snapshot = parseClaudeBridgeUsage(headers({
		"7d_oi-utilization": "0.4", "7d_oi-reset": "2000200000",
	}), 1234);
	assert.deepEqual(snapshot.overageIncluded, { usedPercent: 40, resetsAt: 2_000_200_000 });
	assert.equal(snapshot.weekly, undefined);
});

void test("preserves reported status, representative claim, and reset metadata without deriving availability", () => {
	const snapshot = parseClaudeBridgeUsage(headers({
		status: "rejected", reset: "2000000000", "representative-claim": "seven_day",
		"overage-status": "allowed", "overage-reset": "2000100000",
	}), 1234);
	assert.equal(snapshot.status, "rejected");
	assert.equal(snapshot.reset, 2_000_000_000);
	assert.equal(snapshot.representativeClaim, "seven_day");
	assert.equal(snapshot.overageStatus, "allowed");
	assert.equal(snapshot.overageReset, 2_000_100_000);
	assert.equal(snapshot.session, undefined);
	assert.equal(snapshot.weekly, undefined);
});

void test("empty or non-header input never invents quota from a successful response", () => {
	for (const input of [{}, { status: 200, headers: {} }, null, [], "headers"]) {
		const snapshot = parseClaudeBridgeUsage(input, 1234);
		assert.deepEqual(snapshot, {
			session: undefined, weekly: undefined, overageIncluded: undefined,
			status: undefined, reset: undefined, representativeClaim: undefined,
			overageStatus: undefined, overageReset: undefined, capturedAt: 1234,
		});
	}
});

void test("retains sparse windows without inventing usage or reset", () => {
	const snapshot = parseClaudeBridgeUsage(headers({ "5h-reset": "2000000000", "7d-utilization": "0.5" }), 1234);
	assert.deepEqual(snapshot.session, { usedPercent: undefined, resetsAt: 2_000_000_000 });
	assert.deepEqual(snapshot.weekly, { usedPercent: 50, resetsAt: undefined });
});

void test("accepts actual zero and full utilization without treating them as absent", () => {
	const snapshot = parseClaudeBridgeUsage(headers({ "5h-utilization": "0", "7d-utilization": "1" }), 1234);
	assert.equal(snapshot.session?.usedPercent, 0);
	assert.equal(snapshot.weekly?.usedPercent, 100);
});

void test("rejects malformed, non-finite, and out-of-range utilization values", () => {
	for (const value of ["", " ", "-0.1", "1.01", "NaN", "Infinity", "0.5oops", "0x1", "1e-999", 0.5, null]) {
		const snapshot = parseClaudeBridgeUsage(headers({ "5h-utilization": value }), 1234);
		assert.equal(snapshot.session, undefined, `invalid utilization: ${String(value)}`);
	}
});

void test("accepts scientific notation emitted by number-to-string conversion", () => {
	const snapshot = parseClaudeBridgeUsage(headers({ "5h-utilization": "1e-7" }), 1234);
	assert.ok(snapshot.session?.usedPercent !== undefined);
	assert.ok(Math.abs(snapshot.session.usedPercent - 0.00001) < 1e-15);
});

void test("rejects missing, epoch, malformed, and unsafe reset values", () => {
	for (const value of ["", " ", "0", "-1", "1.5", "NaN", "Infinity", "123oops", "9000000000000000", 123, null]) {
		const snapshot = parseClaudeBridgeUsage(headers({ "5h-reset": value, reset: value, "overage-reset": value }), 1234);
		assert.equal(snapshot.session, undefined, `invalid reset: ${String(value)}`);
		assert.equal(snapshot.reset, undefined);
		assert.equal(snapshot.overageReset, undefined);
	}
});

void test("ignores invalid metadata and unknown headers while preserving valid sibling values", () => {
	const snapshot = parseClaudeBridgeUsage(headers({
		status: 200, "representative-claim": " ", "overage-status": null,
		"5h-utilization": "nope", "5h-reset": "2000000000", "unknown-utilization": "0.9",
	}), 1234);
	assert.equal(snapshot.status, undefined);
	assert.equal(snapshot.representativeClaim, undefined);
	assert.equal(snapshot.overageStatus, undefined);
	assert.deepEqual(snapshot.session, { usedPercent: undefined, resetsAt: 2_000_000_000 });
	assert.equal(snapshot.weekly, undefined);
});

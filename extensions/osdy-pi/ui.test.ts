import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
// @ts-expect-error Node's native TypeScript runner resolves test-only TypeScript source imports.
import * as profileLabel from "./profile-label.ts";
// @ts-expect-error Node's native TypeScript runner resolves test-only TypeScript source imports.
import { shouldShowFooterMetadata } from "./types.ts";

void test("footer metadata is shown only when the native editor is effective", () => {
	assert.equal(shouldShowFooterMetadata(false), true);
	assert.equal(shouldShowFooterMetadata(true), false);
});

void test("maximum thinking uses the existing extra-high theme color", () => {
	const source = readFileSync(new URL("./ui.ts", import.meta.url), "utf8");
	assert.match(source, /max:\s*"thinkingXhigh"/);
});

void test("places a managed profile beside the model in simple mode and preserves its fallback", () => {
	assert.equal(
		profileLabel.resolveActiveProfileLabel({ OSDY_PI_PROFILE_NAME: "work" }),
		"work",
	);
	assert.equal(profileLabel.resolveActiveProfileLabel({}), undefined);
	assert.equal(
		profileLabel.formatModelMetadata("gpt-5", "high", "work"),
		"gpt-5 · work · think high",
	);
	assert.equal(
		profileLabel.formatModelMetadata(
			"gpt-5",
			"high",
			profileLabel.resolveActiveProfileLabel({
				OSDY_PI_PROFILE_NAME: "untrusted/profile",
			}),
		),
		"gpt-5 · think high",
	);
});

void test("wires themed Codex quota bars below both native footer and extended editor", () => {
	const source = readFileSync(new URL("./ui.ts", import.meta.url), "utf8");
	assert.match(source, /renderCompactCodexQuotaBars/);
	assert.equal((source.match(/renderCompactCodexQuotaBars\(/g) ?? []).length, 2);
	assert.doesNotMatch(source, /formatCodexUsageMetadata/);
});

void test("replaces the extended editor Osdy-Pi title with a managed profile or preserves its fallback", () => {
	assert.equal(profileLabel.resolveEditorTitleLabel("work"), "work");
	assert.equal(
		profileLabel.resolveEditorTitleLabel(
			profileLabel.resolveActiveProfileLabel({
				OSDY_PI_PROFILE_NAME: "untrusted/profile",
			}),
		),
		"Osdy-Pi",
	);
});

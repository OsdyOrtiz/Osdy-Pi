import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Node's native TypeScript runner resolves test-only TypeScript source imports.
import { DEFAULT_EDITOR_MODE, EDITOR_MODES, resolveEffectiveEditorMode } from "./types.ts";

void test("auto editor mode is the default and small terminals use the native editor", () => {
	assert.equal(DEFAULT_EDITOR_MODE, EDITOR_MODES.AUTO);
	assert.equal(resolveEffectiveEditorMode(DEFAULT_EDITOR_MODE, false), "extended");
	assert.equal(resolveEffectiveEditorMode(DEFAULT_EDITOR_MODE, true), "simple");
	assert.equal(resolveEffectiveEditorMode(EDITOR_MODES.SIMPLE, false), "simple");
	assert.equal(resolveEffectiveEditorMode(EDITOR_MODES.EXTENDED, false), "extended");
	assert.equal(resolveEffectiveEditorMode(EDITOR_MODES.EXTENDED, true), "simple");
});

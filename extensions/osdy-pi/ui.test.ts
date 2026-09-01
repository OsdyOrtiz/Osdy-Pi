import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Node's native TypeScript runner resolves test-only TypeScript source imports.
import { shouldShowFooterMetadata } from "./types.ts";

void test("footer metadata is shown only when the native editor is effective", () => {
	assert.equal(shouldShowFooterMetadata(false), true);
	assert.equal(shouldShowFooterMetadata(true), false);
});

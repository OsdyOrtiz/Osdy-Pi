import assert from "node:assert/strict";
import test from "node:test";
import { visibleWidth } from "@earendil-works/pi-tui";
import type * as TypewriterModule from "./header-typewriter.js";
import type { SimpleTheme } from "./types.js";

// @ts-expect-error Node's native TypeScript runner resolves test-only TypeScript source imports.
const typewriter: typeof TypewriterModule = await import("./header-typewriter.ts");
const { TYPEWRITER_FRAMES, TYPEWRITER_CURSOR, typewriterColumns, typewriterReveal } = typewriter;

const plainTheme: SimpleTheme = { fg: (_token: string, text: string) => text };
const ANSI_RESET = "\u001B[0m";
const strip = (line: string): string => line.split(ANSI_RESET).join("");

void test("typewriter reveals nothing on the first frame and everything on the last", () => {
	assert.equal(typewriterColumns(0, 78), 0);
	assert.equal(typewriterColumns(TYPEWRITER_FRAMES, 78), 78);
	assert.equal(typewriterColumns(TYPEWRITER_FRAMES + 10, 78), 78);
});

void test("typewriter reveal grows monotonically across frames", () => {
	let previous = -1;
	for (let frame = 0; frame <= TYPEWRITER_FRAMES; frame += 1) {
		const columns = typewriterColumns(frame, 78);
		assert.ok(columns >= previous, `frame ${frame} shrank`);
		previous = columns;
	}
});

void test("typewriter shows the revealed prefix followed by the cursor", () => {
	const lines = ["ABCDEFGHIJ", "abcdefghij"];
	const frame = TYPEWRITER_FRAMES / 2;
	const columns = typewriterColumns(frame, 10);
	const revealed = typewriterReveal(lines, frame, 10, plainTheme).map(strip);
	assert.deepEqual(revealed, [
		`${"ABCDEFGHIJ".slice(0, columns)}${TYPEWRITER_CURSOR}`,
		`${"abcdefghij".slice(0, columns)}${TYPEWRITER_CURSOR}`,
	]);
});

void test("typewriter never widens a line beyond the header width", () => {
	const lines = ["ABCDEFGHIJ"];
	for (let frame = 0; frame <= TYPEWRITER_FRAMES; frame += 1) {
		for (const line of typewriterReveal(lines, frame, 10, plainTheme)) {
			assert.ok(visibleWidth(line) <= 10, `frame ${frame} is too wide`);
		}
	}
});

void test("typewriter leaves lines untouched once fully written", () => {
	const lines = ["ABCDEFGHIJ", "abcdefghij"];
	assert.deepEqual(typewriterReveal(lines, TYPEWRITER_FRAMES, 10, plainTheme), lines);
});

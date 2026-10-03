import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { visibleWidth } from "@earendil-works/pi-tui";

registerHooks({
	resolve(specifier, context, nextResolve) {
		if (specifier.startsWith(".") && specifier.endsWith(".js") && context.parentURL?.endsWith(".ts")) {
			const url = new URL(`${specifier.slice(0, -3)}.ts`, context.parentURL);
			if (existsSync(fileURLToPath(url))) return { shortCircuit: true, url: url.href };
		}
		return nextResolve(specifier, context);
	},
});
const { ControlCenter } = await import("./control-center.js");

function fixture(names = ["dark", "light"]) {
	let current = "dark";
	let appearance: "dark" | "light" = "dark";
	let failure: string | undefined;
	let throws = false;
	let disposed = false;
	let closes = 0;
	let renders = 0;
	let height = 18;
	const applied: string[] = [];
	const panel = new ControlCenter({
		theme: () => ({ name: current, appearance,
			fg: (_color, text) => `\x1b[${appearance === "dark" ? 31 : 32}m${text}\x1b[0m`,
		}),
		readThemes: () => names.map((name) => ({ name, path: undefined })),
		applyTheme: (name) => {
			assert.equal(disposed, false);
			applied.push(name);
			if (throws) throw new Error("write failed");
			if (failure) return { success: false, error: failure };
			current = name;
			appearance = "light";
			return { success: true };
		},
		requestRender: () => { assert.equal(disposed, false); renders++; },
		height: () => height,
		close: () => { closes++; },
	});
	return { panel, applied, fail: (message?: string) => { failure = message; },
		throwOnApply: () => { throws = true; },
		dispose: () => { panel.dispose(); disposed = true; },
		closes: () => closes, renders: () => renders,
		resize: (rows: number) => { height = rows; } };
}
const down = "\x1b[B";
const up = "\x1b[A";
const right = "\x1b[C";
const left = "\x1b[D";

void test("categories and detail have separate keyboard focus and honest placeholders", () => {
	const f = fixture();
	assert.match(f.panel.render(80).join("\n"), /Theme/);
	for (const category of ["Header", "Mascot", "Editor", "Git", "Sounds", "Account", "Usage"]) {
		f.panel.handleInput(down);
		assert.match(f.panel.render(80).join("\n"), new RegExp(`${category}: not yet available`));
		f.panel.handleInput(right);
		f.panel.handleInput("\r");
		f.panel.handleInput(left);
	}
	assert.deepEqual(f.applied, []);
	f.panel.handleInput(up);
	assert.match(f.panel.render(80).join("\n"), /Account: not yet available/);
});

void test("empty feedback preserves the current theme summary on short terminals with ANSI colors", () => {
	const f = fixture();
	f.resize(4);
	assert.match(f.panel.render(80).join("\n"), /Current: dark \| Appearance: dark/);
});

void test("empty feedback preserves focus and position with ANSI colors", () => {
	const f = fixture();
	assert.match(f.panel.render(80).join("\n"), /categories: 1\/8/);
	f.panel.handleInput(right);
	assert.match(f.panel.render(80).join("\n"), /detail: 1\/2/);
	f.panel.handleInput(down);
	assert.match(f.panel.render(80).join("\n"), /detail: 2\/2/);
});

void test("nonempty ANSI-colored feedback replaces the short summary and normal position", () => {
	for (const failure of [undefined, "invalid theme"]) {
		const f = fixture();
		f.fail(failure);
		f.panel.handleInput(right);
		f.panel.handleInput(down);
		f.panel.handleInput("\r");
		const feedback = failure ? "Theme failed: invalid theme" : "Saved globally: light";
		const color = failure ? 31 : 32;
		for (const height of [4, 18]) {
			f.resize(height);
			const text = f.panel.render(80).join("\n");
			assert.ok(text.includes(`\x1b[${color}m${feedback}\x1b[0m`));
			assert.doesNotMatch(text, /detail: 2\/2/);
			if (height === 4) assert.doesNotMatch(text, /Current:/);
		}
	}
});

void test("Theme applies named selection immediately and updates current appearance", () => {
	const f = fixture();
	assert.match(f.panel.render(80).join("\n"), /dark.*current/);
	f.panel.handleInput("\t");
	f.panel.handleInput(down);
	f.panel.handleInput("\r");
	assert.deepEqual(f.applied, ["light"]);
	const text = f.panel.render(80).join("\n");
	assert.match(text, /light.*current/);
	assert.match(text, /Appearance: light/);
	assert.ok(text.includes("\x1b[32m"));
	assert.ok(!text.includes("\x1b[31m"));
	assert.match(text, /Saved globally/);
	assert.match(text, /project settings.*startup/);
	f.panel.handleInput("\x1b");
	assert.equal(f.closes(), 1);
	assert.deepEqual(f.applied, ["light"]);
	f.panel.handleInput("\x1b");
	assert.equal(f.closes(), 1);
});

void test("failed and thrown theme actions never report success or change current indication", () => {
	const f = fixture();
	f.panel.handleInput(right);
	f.panel.handleInput(down);
	f.fail("invalid theme");
	f.panel.handleInput("\r");
	assert.match(f.panel.render(80).join("\n"), /invalid theme/);
	assert.match(f.panel.render(80).join("\n"), /dark.*current/);
	assert.doesNotMatch(f.panel.render(80).join("\n"), /Saved globally/);
	f.fail();
	f.throwOnApply();
	f.panel.handleInput("\r");
	assert.match(f.panel.render(80).join("\n"), /write failed/);
});

void test("narrow dimensions stay bounded and scrolling reaches the last theme", () => {
	const names = Array.from({ length: 40 }, (_, index) => `Theme-${index}-界🙂`);
	const f = fixture(names);
	f.panel.handleInput(right);
	f.panel.handleInput("\x1b[F");
	for (const height of [0, 1, 2, 4, 7, 9, 18]) {
		f.resize(height);
		for (const width of [0, 1, 2, 8, 24, 48, 96]) {
			const lines = f.panel.render(width);
			assert.ok(lines.length <= height);
			assert.ok(lines.every((line) => visibleWidth(line) <= width));
		}
	}
	assert.match(f.panel.render(80).join("\n"), /Theme-39/);
	f.panel.handleInput("\r");
	assert.deepEqual(f.applied, [names[39]]);
	f.panel.handleInput("\x1b[H");
	f.panel.handleInput("\x1b[6~");
	f.panel.handleInput("\x1b[5~");
	assert.match(f.panel.render(80).join("\n"), /Theme-0/);
});

void test("empty and failed theme reads are safe; disposal ignores input and invalidation", () => {
	const f = fixture([]);
	assert.match(f.panel.render(80).join("\n"), /No themes available/);
	f.panel.handleInput(right);
	f.panel.handleInput("\r");
	assert.deepEqual(f.applied, []);
	f.dispose();
	const before = f.renders();
	f.panel.handleInput(down);
	f.panel.handleInput("\r");
	f.panel.invalidate();
	assert.equal(f.renders(), before);
	const panel = new ControlCenter({
		theme: () => ({ appearance: "dark", fg: (_color, text) => text }),
		readThemes: () => { throw new Error("themes unavailable"); },
		applyTheme: () => { throw new Error("must not apply"); },
		requestRender: () => {}, height: () => 4, close: () => {},
	});
	assert.ok(panel.render(30).length <= 4);
	assert.match(panel.render(80).join("\n"), /themes unavailable/);
});

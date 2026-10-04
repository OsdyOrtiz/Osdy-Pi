import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { CURSOR_MARKER, visibleWidth } from "@earendil-works/pi-tui";
import type { ControlCenterDependencies, ControlCenterServiceAction, ControlCenterAccountAction } from "./control-center.js";
import type { ControlCenterPreferences, VisualPreferenceAction } from "./control-center-preferences.js";

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

void test("TODO confirmation is Cancel-first, blocks navigation while saving, and completes with typed reload", async () => {
	let calls = 0;
	let complete: (result: { kind: "reload"; message: string }) => void = () => {};
	let result: unknown;
	const panel = new ControlCenter({
		theme: () => ({ name: "dark", appearance: "dark", fg: (_color, text) => text }),
		readThemes: () => [], applyTheme: () => ({ success: true }), requestRender: () => {}, height: () => 24,
		close: () => {}, reload: value => { result = value; },
		todo: { read: () => Promise.resolve({ summary: "TODO status", note: "inspection", rows: [
			{ label: "Opt in", current: false, action: { kind: "todo-provider", mode: "on" }, details: ["Owned filters only. Reload follows."] },
		] }), apply: () => { calls++; return new Promise(resolve => { complete = resolve; }); } },
	});
	panel.handleInput("\x1b[F"); await Promise.resolve();
	panel.handleInput(right); panel.handleInput("\r");
	assert.match(panel.render(100).join("\n"), /> Cancel/);
	assert.match(panel.render(100).join("\n"), /Owned filters only.*Reload/);
	panel.handleInput("\r"); assert.equal(calls, 0);
	panel.handleInput("\r"); panel.render(100); panel.handleInput(down); panel.handleInput("\r");
	assert.equal(calls, 1);
	panel.handleInput(left); panel.handleInput(up); panel.handleInput("\r");
	assert.match(panel.render(100).join("\n"), /TODO/);
	assert.equal(calls, 1);
	complete({ kind: "reload", message: "saved" }); await Promise.resolve();
	assert.deepEqual(result, { kind: "reload" });
	panel.dispose();
});

void test("TODO failure stays in-panel and disposed completions never close or reload", async () => {
	for (const disposed of [false, true]) {
		for (const rejects of [false, true]) {
			let resolve: (value: { kind: "rejected"; message: string }) => void = () => {};
			let reject: (error: Error) => void = () => {};
			let reloads = 0;
			const f = fixture(undefined, undefined, { todo: {
				read: () => Promise.resolve({ summary: "TODO", note: "", rows: [
					{ label: "on", current: false, action: { kind: "todo-provider", mode: "on" }, details: ["Reload follows"] },
				] }), apply: () => new Promise((success, fail) => { resolve = success; reject = fail; }),
			} }, () => { reloads++; });
			f.panel.handleInput("\x1b[F"); await Promise.resolve();
			f.panel.handleInput(right); f.panel.handleInput("\r"); f.panel.render(100);
			f.panel.handleInput(down); f.panel.handleInput("\r");
			if (disposed) f.dispose();
			const renders = f.renders();
			if (rejects) reject(new Error("save rejected")); else resolve({ kind: "rejected", message: "save rejected" });
			await Promise.resolve();
			assert.equal(reloads, 0); assert.equal(f.closes(), 0);
			if (disposed) assert.equal(f.renders(), renders);
			else assert.match(f.panel.render(100).join("\n"), /save rejected/);
		}
	}
});

function fixture(names = ["dark", "light"], preferences?: ControlCenterPreferences,
	services?: Pick<ControlCenterDependencies, "git" | "sounds" | "account" | "usage" | "todo">,
	reload?: ControlCenterDependencies["reload"]) {
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
		preferences,
		...(reload ? { reload } : {}),
		...services,
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

function preferenceFixture() {
	const snapshot = { enabled: true, headerVariant: "osdy-theme" as const,
		mascot: "current" as const, editorMode: "auto" as const, editorEffective: false, smallMode: true };
	const applied: VisualPreferenceAction[] = [];
	let complete: (saved: boolean) => void = () => {};
	const preferences: ControlCenterPreferences = {
		snapshot: () => snapshot,
		apply: (action) => {
			applied.push(action);
			return new Promise<boolean>((resolve) => { complete = resolve; });
		},
	};
	return { ...fixture(["dark", "light", "third", "fourth"], preferences), applied,
		complete: (saved: boolean) => complete(saved) };
}

void test("inline preferences show all supported values and live current/effective indicators without saving", () => {
	const f = preferenceFixture();
	for (const [category, choices, current] of [
		["Header", ["osdy-theme", "neon"], "osdy-theme"],
		["Mascot", ["current", "Bts"], "current"],
		["Editor", ["auto", "extended", "simple"], "auto"],
	] as const) {
		f.panel.handleInput(down);
		const text = f.panel.render(100).join("\n");
		assert.match(text, new RegExp(`Current: ${current}`));
		for (const choice of choices) assert.ok(text.includes(choice), `${category}: ${choice}`);
		assert.match(text, /\(current\)/);
		assert.doesNotMatch(text, /not yet available/);
		if (category === "Editor") assert.match(text, /effective: simple\/native.*small terminal/i);
	}
	assert.deepEqual(f.applied, []);
});

void test("changing categories resets selection to their current row, even after a longer theme list", () => {
	const f = preferenceFixture();
	f.panel.handleInput(right);
	f.panel.handleInput("\x1b[F");
	f.panel.handleInput(left);
	f.panel.handleInput(down);
	f.panel.handleInput(right);
	assert.match(f.panel.render(100).join("\n"), /detail: 1\/2/);
	f.panel.handleInput(down);
	f.panel.handleInput("\r");
	assert.deepEqual(f.applied, [{ kind: "header", value: "neon" }]);
});

void test("async preferences show saving, prevent duplicate actions, and distinguish save failure from success", async () => {
	for (const saved of [false, true]) {
		const f = preferenceFixture();
		f.panel.handleInput(down);
		f.panel.handleInput(right);
		f.panel.handleInput(down);
		f.panel.handleInput("\r");
		assert.match(f.panel.render(100).join("\n"), /Saving.*neon/);
		f.panel.handleInput("\r");
		assert.equal(f.applied.length, 1);
		f.complete(saved);
		await Promise.resolve();
		const text = f.panel.render(100).join("\n");
		assert.match(text, saved ? /Saved globally: neon/ : /Applied live.*could not be saved/);
		if (!saved) assert.doesNotMatch(text, /Saved globally/);
	}
});

void test("closing during persistence ignores late success and failure without rolling back", async () => {
	for (const saved of [false, true]) {
		const f = preferenceFixture();
		f.panel.handleInput(down);
		f.panel.handleInput(right);
		f.panel.handleInput("\r");
		f.panel.handleInput("\x1b");
		f.dispose();
		const renders = f.renders();
		f.complete(saved);
		await Promise.resolve();
		assert.equal(f.renders(), renders);
		assert.equal(f.closes(), 1);
		assert.equal(f.applied.length, 1);
		assert.deepEqual(f.panel.render(80), []);
	}
});

void test("preference application errors never claim persistence, including rejection after disposal", async () => {
	for (const synchronous of [true, false]) {
		const f = fixture(undefined, { snapshot: () => ({ enabled: true, headerVariant: "neon", mascot: "bts",
			editorMode: "simple", editorEffective: false, smallMode: false }), apply: () => {
			if (synchronous) throw new Error("UI apply failed");
			return Promise.reject(new Error("UI apply failed"));
		} });
		f.panel.handleInput(down); f.panel.handleInput(right); f.panel.handleInput("\r");
		await Promise.resolve();
		assert.match(f.panel.render(100).join("\n"), /Preference failed: UI apply failed.*Not saved/);
		assert.doesNotMatch(f.panel.render(100).join("\n"), /Saved globally/);
	}
	let reject: (error: Error) => void = () => {};
	const f = fixture(undefined, { snapshot: () => ({ enabled: true, headerVariant: "neon", mascot: "bts",
		editorMode: "simple", editorEffective: false, smallMode: false }),
		apply: () => new Promise<boolean>((_resolve, fail) => { reject = fail; }) });
	f.panel.handleInput(down); f.panel.handleInput(right); f.panel.handleInput("\r");
	f.dispose(); const renders = f.renders();
	reject(new Error("late error")); await Promise.resolve();
	assert.equal(f.renders(), renders);
});

void test("inline preference rendering stays bounded at narrow widths and differing heights", () => {
	const f = preferenceFixture();
	for (let category = 0; category < 3; category++) {
		f.panel.handleInput(down);
		f.panel.handleInput(right);
		f.panel.handleInput("\x1b[F");
		assert.match(f.panel.render(48).join("\n"), new RegExp(`> ${["neon", "Bts", "simple"][category]}`));
		for (const height of [1, 4, 7, 9, 18]) {
			f.resize(height);
			for (const width of [1, 8, 24, 48, 80]) {
				const lines = f.panel.render(width);
				assert.ok(lines.length <= height);
				assert.ok(lines.every((line) => visibleWidth(line) <= width));
			}
		}
		f.panel.handleInput(left);
	}
});

void test("empty feedback preserves the current theme summary on short terminals with ANSI colors", () => {
	const f = fixture();
	f.resize(4);
	assert.match(f.panel.render(80).join("\n"), /Current: dark \| Appearance: dark/);
});

void test("empty feedback preserves focus and position with ANSI colors", () => {
	const f = fixture();
	assert.match(f.panel.render(80).join("\n"), /categories: 1\/9/);
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

function serviceFixture() {
	const actions: ControlCenterServiceAction[] = [];
	let complete: (result: { failed: boolean; message: string }) => void = () => {};
	const service = {
		read: () => Promise.resolve({ summary: "Master unavailable", note: "Flags override saved paths", rows: [
			{ label: "Configure completion", current: false, details: ["Saved: /saved.wav", "Effective (startup-flag): /flag.wav"], action: { kind: "sound-configure" as const, event: "completion" as const, path: "/saved.wav" } },
			{ label: "Clear completion", current: false, action: { kind: "sound-clear" as const, event: "completion" as const } },
			{ label: "Test completion", current: false, action: { kind: "sound-test" as const, event: "completion" as const } },
		] }),
		apply: (action: ControlCenterServiceAction) => {
			actions.push(action);
			return new Promise<{ failed: boolean; message: string }>((resolve) => { complete = resolve; });
		},
	};
	return { ...fixture(undefined, undefined, { sounds: service }), actions,
		complete: (failed: boolean) => complete({ failed, message: failed ? "Not saved" : "Saved globally" }) };
}
const settle = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
async function openSounds(f: ReturnType<typeof serviceFixture>) {
	for (let i = 0; i < 5; i++) f.panel.handleInput(down);
	await settle(); f.panel.handleInput(right);
}

void test("Sounds opening is read-only; inline Input cancel and submit stay in the overlay", async () => {
	const f = serviceFixture(); await openSounds(f);
	assert.match(f.panel.render(100).join("\n"), /Master unavailable/);
	assert.match(f.panel.render(100).join("\n"), /Saved: \/saved.wav/);
	assert.match(f.panel.render(100).join("\n"), /Effective \(startup-flag\): \/flag.wav/);
	assert.deepEqual(f.actions, []);
	f.panel.focused = true;
	f.panel.handleInput("\r");
	assert.match(f.panel.render(100).join("\n"), /Sound path.*completion/);
	assert.ok(f.panel.render(100).join("\n").includes(CURSOR_MARKER));
	for (const width of [1, 8, 24, 48]) assert.ok(f.panel.render(width).every((line) => visibleWidth(line) <= width));
	f.panel.handleInput("\x1b");
	assert.equal(f.closes(), 0); assert.deepEqual(f.actions, []);
	f.panel.handleInput("\r"); f.panel.handleInput("\x01"); f.panel.handleInput("\x0b");
	f.panel.handleInput("/custom.wav"); f.panel.handleInput("\r");
	assert.deepEqual(f.actions, [{ kind: "sound-set", event: "completion", path: "/custom.wav" }]);
	f.panel.handleInput("\r"); assert.equal(f.actions.length, 1);
	f.complete(false); await settle();
	assert.match(f.panel.render(100).join("\n"), /Saved globally/);
});

void test("inline sound failures report Not saved and allow retry", async () => {
	const f = serviceFixture(); await openSounds(f);
	f.panel.handleInput(down); f.panel.handleInput("\r");
	f.complete(true); await settle();
	assert.match(f.panel.render(100).join("\n"), /Not saved/);
	assert.doesNotMatch(f.panel.render(100).join("\n"), /Saved globally/);
	f.panel.handleInput("\r"); assert.equal(f.actions.length, 2);
});

void test("explicit clear/test actions and late service completion preserve disposal and narrow bounds", async () => {
	for (const [index, kind] of [[1, "sound-clear"], [2, "sound-test"]] as const) {
		const f = serviceFixture(); await openSounds(f);
		for (let i = 0; i < index; i++) f.panel.handleInput(down);
		f.panel.handleInput("\r"); assert.equal(f.actions[0]?.kind, kind);
		for (const width of [1, 8, 24, 48]) assert.ok(f.panel.render(width).every((line) => visibleWidth(line) <= width));
		f.dispose(); const renders = f.renders(); f.complete(true); await settle();
		assert.equal(f.renders(), renders);
	}
});

void test("Account switch has inline cancel-default confirmation and busy guarding", async () => {
	const actions: ControlCenterAccountAction[] = [];
	let complete = () => {};
	const f = fixture(undefined, undefined, { account: {
		read: () => Promise.resolve({ summary: "Current: work", note: "Login is Pi-owned", rows: [
			{ label: "Switch to personal", current: false, action: { kind: "account-switch", profile: "personal" } },
		] }),
		apply: action => { actions.push(action); return new Promise(resolve => { complete = () => resolve({ failed: false, message: "Switched" }); }); },
	} });
	for (let i = 0; i < 6; i++) f.panel.handleInput(down);
	await settle();
	assert.match(f.panel.render(100).join("\n"), /Current: work/);
	assert.equal(actions.length, 0);
	f.panel.handleInput(right); f.panel.handleInput("\r");
	assert.match(f.panel.render(100).join("\n"), /Cancel/);
	f.panel.handleInput("\r"); assert.equal(actions.length, 0);
	f.panel.handleInput("\r"); f.panel.handleInput(down); f.panel.handleInput("\r");
	assert.equal(actions.length, 1);
	f.panel.handleInput("\r"); assert.equal(actions.length, 1);
	f.dispose(); const renders = f.renders(); complete(); await settle();
	assert.equal(f.renders(), renders);
});

void test("Usage loading and late results cannot replace a different category", async () => {
	for (const failure of [false, true]) {
		let finish = () => {};
		const f = fixture(undefined, undefined, { usage: {
			read: () => new Promise((resolve, reject) => { finish = () => failure ? reject(new Error("late usage")) : resolve({ summary: "Late quota", note: "Read-only", rows: [] }); }),
			apply: () => Promise.resolve({ failed: false, message: "Refreshed" }),
		} });
		for (let i = 0; i < 7; i++) f.panel.handleInput(down);
		assert.match(f.panel.render(80).join("\n"), /Loading/);
		f.panel.handleInput(up); finish(); await settle();
		assert.doesNotMatch(f.panel.render(80).join("\n"), /late usage|Late quota/);
	}
});

void test("Account default clear confirmation supports Escape and narrow bounded rendering", async () => {
	const actions: ControlCenterAccountAction[] = [];
	const f = fixture(undefined, undefined, { account: {
		read: () => Promise.resolve({ summary: "Default: work", note: "Metadata only", rows: [{ label: "Clear default", current: false, action: { kind: "account-default", profile: undefined } }] }),
		apply: action => { actions.push(action); return Promise.resolve({ failed: false, message: "Default saved" }); },
	} });
	for (let i = 0; i < 6; i++) f.panel.handleInput(down);
	await settle(); f.panel.handleInput(right); f.panel.handleInput("\r");
	for (const width of [1, 8, 24, 48]) assert.ok(f.panel.render(width).every(line => visibleWidth(line) <= width));
	f.panel.handleInput("\x1b"); assert.equal(f.closes(), 0); assert.equal(actions.length, 0);
	f.panel.handleInput("\r"); f.panel.handleInput(down); f.panel.handleInput("\r"); await settle();
	assert.deepEqual(actions, [{ kind: "account-default", profile: undefined }]);
});

void test("late action refresh errors are suppressed after changing categories", async () => {
	let reads = 0;
	let rejectRead = () => {};
	const f = fixture(undefined, undefined, { usage: {
		read: () => ++reads === 1 ? Promise.resolve({ summary: "Quota", note: "Read-only", rows: [{ label: "Refresh", current: false, action: { kind: "usage-refresh" } }] })
			: new Promise((_resolve, reject) => { rejectRead = () => reject(new Error("old refresh")); }),
		apply: () => Promise.resolve({ failed: false, message: "Refreshed" }),
	} });
	for (let i = 0; i < 7; i++) f.panel.handleInput(down);
	await settle(); f.panel.handleInput(right); f.panel.handleInput("\r"); await settle();
	f.panel.handleInput(left); f.panel.handleInput(up); rejectRead(); await settle();
	assert.doesNotMatch(f.panel.render(80).join("\n"), /old refresh/);
});

void test("Account cannot confirm when the terminal hides confirmation choices", async () => {
	let calls = 0;
	const f = fixture(undefined, undefined, { account: {
		read: () => Promise.resolve({ summary: "Accounts", note: "Metadata", rows: [{ label: "Switch", current: false, action: { kind: "account-switch", profile: "long-profile-name" } }] }),
		apply: () => { calls++; return Promise.resolve({ failed: false, message: "Switched" }); },
	} });
	for (let i = 0; i < 6; i++) f.panel.handleInput(down);
	await settle(); f.panel.handleInput(right); f.panel.handleInput("\r");
	f.resize(3); f.panel.render(8); f.panel.handleInput(down); f.panel.handleInput("\r");
	assert.equal(calls, 0);
});

void test("Usage refresh is honestly read-only while pending and cannot duplicate", async () => {
	let calls = 0;
	const f = fixture(undefined, undefined, { usage: {
		read: () => Promise.resolve({ summary: "Local analytics", note: "Read-only", rows: [{ label: "Refresh", current: false, action: { kind: "usage-refresh" } }] }),
		apply: () => { calls++; return new Promise(() => {}); },
	} });
	for (let i = 0; i < 7; i++) f.panel.handleInput(down);
	await settle(); f.panel.handleInput(right); f.panel.handleInput("\r");
	assert.match(f.panel.render(80).join("\n"), /Refreshing usage/);
	assert.doesNotMatch(f.panel.render(80).join("\n"), /Saving globally/);
	f.panel.handleInput("\r"); assert.equal(calls, 1); f.dispose();
});

void test("disposed overlays ignore late category reads, including errors", async () => {
	for (const fails of [true, false]) {
		let finish: () => void = () => {};
		const f = fixture(undefined, undefined, { git: {
			read: () => new Promise((resolve, reject) => { finish = () => fails ? reject(new Error("late")) : resolve({ summary: "Branch main", note: "Read-only", rows: [] }); }),
			apply: () => Promise.resolve({ failed: false, message: "Saved globally" }),
		} });
		for (let i = 0; i < 4; i++) f.panel.handleInput(down);
		f.dispose(); const renders = f.renders(); finish(); await settle();
		assert.equal(f.renders(), renders);
	}
});

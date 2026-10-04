import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { stripVTControlCharacters } from "node:util";
import { CURSOR_MARKER, visibleWidth } from "@earendil-works/pi-tui";
import type { ControlCenterDependencies, ControlCenterServiceAction, ControlCenterAccountAction, ControlCenterRow } from "./control-center.js";
import type { ControlCenterAgentsAction } from "./control-center-agents.js";
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
	for (let i = 0; i < 8; i++) panel.handleInput(down);
	await Promise.resolve();
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
			for (let i = 0; i < 8; i++) f.panel.handleInput(down);
			await Promise.resolve();
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

void test("Agents navigation and Cancel never apply; confirmation freezes input until typed reload", async () => {
	let calls = 0; let finish: (value: { kind: "reload"; message: string }) => void = () => {}; let reloads = 0;
	const f = fixture(undefined, undefined, { agents: {
		read: () => Promise.resolve({ summary: "Agent mode: gentle", note: "Read only", rows: [
			{ label: "Joker", current: false, action: { kind: "agents-provider", mode: "joker" }, details: ["Target: /synthetic/settings.json", "Install Joker if absent; owned filters only. Unrelated resources preserved. Reload; restart if it fails."] },
		] }), apply: () => { calls++; return new Promise(resolve => { finish = resolve; }); },
	} }, () => { reloads++; });
	f.resize(30); f.panel.handleInput("\x1b[F"); await settle();
	assert.match(f.panel.render(120).join("\n"), /Agent mode: gentle/); assert.equal(calls, 0);
	f.panel.handleInput(right); f.panel.handleInput("\r");
	assert.match(f.panel.render(120).join("\n"), /> Cancel/);
	assert.match(f.panel.render(120).join("\n"), /Target: \/synthetic\/settings.json/);
	f.panel.handleInput("\r"); assert.equal(calls, 0);
	f.panel.handleInput("\r"); f.resize(3); f.panel.render(8); f.panel.handleInput(down); f.panel.handleInput("\r");
	assert.equal(calls, 0, "hidden confirmation effects cannot be accepted");
	f.resize(30); f.panel.render(120); f.panel.handleInput("\r");
	assert.equal(calls, 1);
	for (const key of [left, up, "\r", "\x1b", "\t"]) f.panel.handleInput(key);
	assert.match(f.panel.render(120).join("\n"), /Agents/); assert.equal(calls, 1); assert.equal(f.closes(), 0);
	finish({ kind: "reload", message: "saved" }); await settle(); assert.equal(reloads, 1);
	f.dispose();
});

void test("Agents failed, rejected and disposed successful responses never reload", async () => {
	for (const outcome of ["reject", "error", "disposed"] as const) {
		let finish = () => {}; let reloads = 0;
		const f = fixture(undefined, undefined, { agents: {
			read: () => Promise.resolve({ summary: "Agents", note: "", rows: [
				{ label: "Gentle", current: false, action: { kind: "agents-provider", mode: "gentle" }, details: ["Owned filters; reload follows."] },
			] }), apply: () => new Promise((resolve, reject) => { finish = () => outcome === "error" ? reject(new Error("owner failure")) : resolve({ kind: outcome === "disposed" ? "reload" : "rejected", message: "owner failure" }); }),
		} }, () => { reloads++; });
		f.panel.handleInput("\x1b[F"); await settle(); f.panel.handleInput(right); f.panel.handleInput("\r");
		f.panel.render(100); f.panel.handleInput(down); f.panel.handleInput("\r");
		if (outcome === "disposed") f.dispose();
		const renders = f.renders(); finish(); await settle();
		assert.equal(reloads, 0); assert.equal(f.closes(), 0);
		if (outcome === "disposed") assert.equal(f.renders(), renders);
		else assert.match(f.panel.render(100).join("\n"), /owner failure/);
	}
});

function agentRows(): ControlCenterRow[] {
	return (["joker", "gentle"] as const).map(mode => ({ label: mode === "joker" ? "Joker" : "Gentle", current: mode === "gentle",
		action: { kind: "agents-provider", mode }, details: ["Target: /synthetic/settings.json", `${mode} effects: owned filters only; unrelated resources preserved; reload follows.`] }));
}

void test("Agent letters match visible choices, are lowercase-only and retain full Cancel-first effects", async () => {
	for (const [key, mode] of [["g", "gentle"], ["j", "joker"]] as const) {
		const calls: ControlCenterAgentsAction[] = [];
		const f = fixture(undefined, undefined, { agents: {
			read: () => Promise.resolve({ summary: "Agent mode: gentle", note: "Configured, not loaded", rows: agentRows() }),
			apply: action => { calls.push(action); return Promise.resolve({ kind: "rejected", message: "Synthetic rejection" }); },
		} }, () => { throw new Error("No reload on rejection"); });
		f.resize(30); f.panel.handleInput("\x1b[F"); await settle();
		f.panel.handleInput(key); assert.doesNotMatch(plain(f.panel.render(120)), /Confirm Agents/);
		f.panel.handleInput(right);
		const overview = plain(f.panel.render(120));
		assert.match(overview, /g Gentle.*j Joker/);
		assert.match(overview, /\[g\] Gentle/); assert.match(overview, /\[j\] Joker/);
		assert.doesNotMatch(overview, /Target:|effects:/, "brief help names the operation, not dense effect text");
		for (const ignored of [key.toUpperCase(), `\x1b[${key.charCodeAt(0)};2u`, `\x1b[${key.charCodeAt(0)};5u`]) {
			f.panel.handleInput(ignored); assert.doesNotMatch(plain(f.panel.render(120)), /Confirm Agents/);
		}
		f.panel.handleInput(`\x1b[${key.charCodeAt(0)}u`);
		assert.match(plain(f.panel.render(120)), /Confirm Agents/, "Pi's Kitty protocol parser supports unmodified lowercase letters");
		f.panel.handleInput("\x1b"); f.panel.handleInput(key);
		const confirmation = plain(f.panel.render(120));
		assert.match(confirmation, new RegExp(`Select ${mode === "joker" ? "Joker" : "Gentle"} agents`));
		assert.match(confirmation, /> Cancel/); assert.match(confirmation, /Target: \/synthetic\/settings.json/);
		assert.match(confirmation, new RegExp(`${mode} effects: owned filters only; unrelated resources preserved; reload follows`));
		for (const ignored of ["g", "j", "G", "J", "?"]) f.panel.handleInput(ignored);
		assert.equal(plain(f.panel.render(120)), confirmation); assert.deepEqual(calls, []);
		f.panel.handleInput("\r"); assert.deepEqual(calls, []);
		f.panel.handleInput(key); f.panel.render(120); f.panel.handleInput(down); f.panel.handleInput("\r"); await settle();
		assert.deepEqual(calls, [{ kind: "agents-provider", mode }]);
		assert.match(plain(f.panel.render(120)), /Synthetic rejection/);
		f.dispose();
	}
});

void test("Agent bindings derive only from available typed rows and preserve selection across refreshed categories", async () => {
	let rows = agentRows();
	const f = fixture(undefined, undefined, { agents: {
		read: () => Promise.resolve({ summary: "Agents", note: "Read only", rows }),
		apply: () => { throw new Error("Navigation never applies"); },
	} });
	f.panel.handleInput("\x1b[F"); await settle(); f.panel.handleInput(right); f.panel.handleInput(up);
	assert.match(plain(f.panel.render(100)), /> \[j\] Joker/);
	f.panel.handleInput(left); f.panel.handleInput(up); await settle();
	rows = agentRows().reverse();
	f.panel.handleInput(down); await settle(); f.panel.handleInput(right);
	assert.match(plain(f.panel.render(100)), /> \[j\] Joker/, "remember typed selection, not old index/current row");
	f.panel.handleInput(left); f.panel.handleInput(up); await settle(); rows = agentRows().filter(row => row.action.kind === "agents-provider" && row.action.mode === "gentle");
	f.panel.handleInput(down); await settle(); f.panel.handleInput(right);
	assert.match(plain(f.panel.render(100)), /> \[g\] Gentle/);
	assert.doesNotMatch(plain(f.panel.render(100)), /j Joker|\[j\]/);
	f.panel.handleInput("j"); assert.doesNotMatch(plain(f.panel.render(100)), /Confirm Agents/);
	f.panel.handleInput("g"); assert.match(plain(f.panel.render(100)), /Confirm Agents/); f.panel.handleInput("\x1b");
	f.panel.handleInput(left); f.panel.handleInput(up); await settle(); rows = [];
	f.panel.handleInput(down); await settle(); f.panel.handleInput(right);
	for (const key of ["g", "j", "\r"]) f.panel.handleInput(key);
	assert.doesNotMatch(plain(f.panel.render(100)), /Confirm Agents|g Gentle|j Joker/); f.dispose();
});

void test("Ambiguous Agent projections expose no colliding letter or manufactured action", async () => {
	const rows = agentRows(); rows.push({ ...rows[0]! });
	const f = fixture(undefined, undefined, { agents: {
		read: () => Promise.resolve({ summary: "Agents", note: "", rows }),
		apply: () => { throw new Error("Ambiguous binding must not apply"); },
	} });
	f.panel.handleInput("\x1b[F"); await settle(); f.panel.handleInput(right);
	assert.doesNotMatch(plain(f.panel.render(100)), /\[j\]|j Joker/);
	f.panel.handleInput("j"); assert.doesNotMatch(plain(f.panel.render(100)), /Confirm Agents/);
	f.panel.handleInput("g"); assert.match(plain(f.panel.render(100)), /Select Gentle agents/);
	f.panel.handleInput("\x1b"); f.dispose();
});

void test("Profile selection survives category navigation without usage or colliding Agent keys", async () => {
	const { createControlCenterAccount } = await import("./control-center-account.js");
	const account = createControlCenterAccount({ profiles: () => Promise.resolve(["work", "personal"]), active: () => "work",
		defaultProfile: () => Promise.resolve(undefined), switch: () => { throw new Error("No switch"); },
		setDefault: () => { throw new Error("No default write"); }, usage: () => { throw new Error("No query"); } });
	const f = fixture(undefined, undefined, { account });
	for (let i = 0; i < 6; i++) f.panel.handleInput(down);
	await settle(); f.panel.handleInput(right); f.panel.handleInput(down);
	for (const key of ["g", "j"]) f.panel.handleInput(key);
	f.panel.handleInput(left); f.panel.handleInput(down); await settle();
	f.panel.handleInput(up); await settle(); f.panel.handleInput(right);
	assert.match(plain(f.panel.render(100)), /> personal/); f.dispose();
});

void test("Agent hints and navigation stay bounded and keys have no profile/global collisions", async () => {
	const f = fixture(undefined, undefined, { agents: {
		read: () => Promise.resolve({ summary: "Agents", note: "Inspection only", rows: agentRows() }),
		apply: () => { throw new Error("No apply without confirmation"); },
	} });
	f.panel.handleInput("\x1b[F"); await settle(); f.panel.handleInput(right);
	for (const key of ["v", "s", "d", "c", "r", "b"]) f.panel.handleInput(key);
	assert.doesNotMatch(plain(f.panel.render(100)), /Confirm Agents/);
	for (const width of [1, 8, 24, 48, 100]) {
		for (const height of [3, 9, 18]) {
			f.resize(height); const lines = f.panel.render(width);
			assert.ok(lines.length <= height); assert.ok(lines.every(line => visibleWidth(line) <= width));
		}
	}
	f.resize(30); f.panel.handleInput("?");
	assert.match(plain(f.panel.render(120)), /Target: \/synthetic\/settings.json/);
	f.panel.handleInput("?"); f.panel.handleInput(up); f.panel.handleInput("\r");
	assert.match(plain(f.panel.render(120)), /Select Joker agents/); f.panel.handleInput("\x1b"); f.dispose();
});

void test("Agent direct letters never cross loading, query, save or text input boundaries", async () => {
	let finishRead: (view: { summary: string; note: string; rows: ControlCenterRow[] }) => void = () => {};
	let finishSave = () => {}; let calls = 0;
	const agents: NonNullable<ControlCenterDependencies["agents"]> = {
		read: () => new Promise(resolve => { finishRead = resolve; }),
		apply: () => { calls++; return new Promise(resolve => { finishSave = () => resolve({ kind: "rejected", message: "Busy finished" }); }); },
	};
	const f = fixture(undefined, undefined, { agents }, () => {});
	f.panel.handleInput("\x1b[F"); f.panel.handleInput(right);
	for (const key of ["g", "j", "\r"]) f.panel.handleInput(key);
	assert.equal(calls, 0); assert.doesNotMatch(plain(f.panel.render(100)), /Confirm Agents/);
	finishRead({ summary: "Agents", note: "", rows: agentRows() }); await settle();
	f.panel.handleInput("j"); f.panel.render(100); f.panel.handleInput(down); f.panel.handleInput("\r");
	assert.equal(calls, 1);
	for (const key of ["g", "j", "\r", left, up]) f.panel.handleInput(key);
	assert.equal(calls, 1); assert.doesNotMatch(plain(f.panel.render(100)), /Confirm Agents/);
	finishSave(); await settle(); f.dispose();

	const sounds = serviceFixture(); await openSounds(sounds); sounds.panel.handleInput("\r");
	sounds.panel.handleInput("g"); sounds.panel.handleInput("j");
	assert.match(plain(sounds.panel.render(100)), /Sound path/); assert.deepEqual(sounds.actions, []); sounds.dispose();

	const account = fixture(undefined, undefined, { account: {
		read: () => Promise.resolve({ summary: "Accounts", note: "", rows: [{ label: "work", current: false, action: { kind: "account-select", profile: "work" } }] }),
		apply: () => new Promise(() => {}),
	}, agents });
	for (let i = 0; i < 6; i++) account.panel.handleInput(down);
	await settle(); account.panel.handleInput(right); account.panel.handleInput("\r");
	for (const key of ["g", "j"]) account.panel.handleInput(key);
	assert.match(plain(account.panel.render(100)), /Loading stored-profile/); assert.equal(calls, 1); account.dispose();
});

function fixture(names = ["dark", "light"], preferences?: ControlCenterPreferences,
	services?: Pick<ControlCenterDependencies, "git" | "sounds" | "account" | "usage" | "todo" | "agents">,
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
	assert.match(f.panel.render(80).join("\n"), /categories: 1\/10/);
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
	assert.doesNotMatch(text, /project settings.*startup/);
	f.panel.handleInput("?");
	assert.match(f.panel.render(80).join("\n"), /project settings.*startup/);
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
	assert.match(f.panel.render(80).join("\n"), /Page 0\/0/);
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
const plain = (lines: string[]) => stripVTControlCharacters(lines.join("\n"));

void test("compact options precede separate brief help; ? reveals selected details and view notes", async () => {
	const f = serviceFixture(); await openSounds(f); f.resize(30);
	const collapsed = plain(f.panel.render(120));
	assert.ok(collapsed.indexOf("> Configure completion") < collapsed.indexOf("Help: Saved: /saved.wav"));
	assert.doesNotMatch(collapsed, /Effective \(startup-flag\)|Flags override saved paths/);
	assert.match(collapsed, /\? help/);
	f.panel.handleInput("?");
	const expanded = plain(f.panel.render(120));
	assert.match(expanded, /Effective \(startup-flag\): \/flag.wav/);
	assert.match(expanded, /Flags override saved paths/);
	f.panel.handleInput("?"); assert.equal(plain(f.panel.render(120)), collapsed);
	assert.deepEqual(f.actions, []);
});

void test("Config sections have single gaps without spacing every option, and resize rebudgets navigation", () => {
	const f = fixture(Array.from({ length: 40 }, (_, index) => `Palette-${index}`));
	f.resize(30); f.panel.handleInput(right);
	const body = () => f.panel.render(100).slice(1, -1).map(line => stripVTControlCharacters(line).slice(1, -1).trim());
	const lines = body();
	assert.equal(lines[0], "", "heading is separated from summary");
	const summary = lines.findIndex(line => line.startsWith("Current:"));
	const help = lines.findIndex(line => line.startsWith("Help:"));
	assert.equal(lines[summary + 1], ""); assert.equal(lines[help - 1], "");
	assert.equal(lines[help + 1], "");
	const status = lines.findIndex(line => line.startsWith("Page "));
	assert.equal(lines[status + 1], "");
	const options = lines.filter(line => /Palette-\d/.test(line));
	assert.equal(options.length, 8);
	assert.equal(lines.filter(line => line === "").length, 5);
	f.resize(14); f.panel.handleInput("\x1b[6~");
	assert.match(plain(f.panel.render(100)), /> Palette-3/);
	assert.match(plain(f.panel.render(100)), /Page 2\/14/);
	assert.match(plain(f.panel.render(100)), /Enter select/);
	f.resize(9); f.panel.handleInput("\x1b[6~");
	assert.match(plain(f.panel.render(100)), /> Palette-6/);
	assert.match(plain(f.panel.render(100)), /Enter select/);
	f.dispose();
});

void test("Stored-profile view uses dashboard groups, account summary and pinned feedback without querying on render", async () => {
	const { createControlCenterAccount } = await import("./control-center-account.js");
	const requests: string[] = [];
	const account = createControlCenterAccount({ profiles: () => Promise.resolve(["work", "personal"]), active: () => "work",
		defaultProfile: () => Promise.resolve(undefined), switch: () => { throw new Error("No switch"); },
		setDefault: () => { throw new Error("No default write"); }, usage: profile => {
			requests.push(profile); return Promise.resolve({ status: "ready", profile, checkedAt: 1000,
				quotaSnapshot: { fetchedAt: 2000, planType: "plus", ordinaryUsageAllowed: true,
					credits: { hasCredits: true, unlimited: false, balance: "10", resetCreditCount: 2 },
					buckets: [{ id: "codex", label: undefined,
						primary: { usedPercent: 0, windowMinutes: 300, resetsAt: undefined },
						secondary: { usedPercent: 100, windowMinutes: 10080, resetsAt: 0 } },
					{ id: "extra", label: "Additional", primary: undefined, secondary: undefined }] } });
		} });
	const f = fixture(undefined, undefined, { account }); f.resize(100);
	for (let i = 0; i < 6; i++) f.panel.handleInput(down);
	await settle(); f.panel.handleInput(right); f.panel.handleInput(down); f.panel.handleInput("v"); await settle();
	const view = plain(f.panel.render(120));
	for (const text of ["Session", "Weekly", "100% left", "0% left", "Additional [extra]", "Quotas + account", "Credits: 10", "Credit resets: 2", "Plan: plus", "Checked:", "Updated:", "Profile: personal"]) assert.ok(view.includes(text), text);
	assert.doesNotMatch(view, /Profile: work|esc\/q close/);
	for (let width = 1; width <= 120; width++) {
		for (const height of [4, 6, 9, 14, 30]) {
			f.resize(height); const lines = f.panel.render(width);
			assert.ok(lines.length <= height); assert.ok(lines.every(line => visibleWidth(line) <= width));
			if (width >= 70 && height >= 6) {
				assert.match(plain(lines), /Refresh.*Back/); assert.match(plain(lines), /usage checked/);
			}
		}
	}
	f.resize(9); f.panel.render(100); f.panel.handleInput("\x1b[F");
	assert.match(plain(f.panel.render(100)), /Credits: 10/);
	assert.deepEqual(requests, ["personal"]);
	f.panel.handleInput("b"); assert.match(plain(f.panel.render(100)), /> personal/); f.dispose();
});

void test("Theme pages hold at most eight options and cross explicitly with all navigation keys", () => {
	for (const count of [1, 8, 9, 40]) {
		const names = Array.from({ length: count }, (_, index) => `Palette-${index}`);
		const f = fixture(names); f.resize(30); f.panel.handleInput(right);
		const page = () => plain(f.panel.render(100));
		assert.match(page(), new RegExp(`Page 1/${Math.ceil(count / 8)}`));
		assert.equal((page().match(/Palette-\d+/g) ?? []).length, Math.min(8, count));
		f.panel.handleInput("\x1b[6~");
		assert.match(page(), new RegExp(`> Palette-${Math.min(8, count - 1)}`));
		f.panel.handleInput("\x1b[5~"); assert.match(page(), /> Palette-0/);
		f.panel.handleInput("\x1b[F"); assert.match(page(), new RegExp(`> Palette-${count - 1}`));
		f.panel.handleInput("\x1b[H"); assert.match(page(), /> Palette-0/);
		if (count > 8) {
			for (let i = 0; i < 8; i++) f.panel.handleInput(down);
			assert.match(page(), /Page 2\//); assert.match(page(), /> Palette-8/);
			f.panel.handleInput(up); assert.match(page(), /Page 1\//); assert.match(page(), /> Palette-7/);
		}
		assert.deepEqual(f.applied, []);
	}
});

void test("Theme selection and current marker survive category navigation and viewport resizing", () => {
	const names = Array.from({ length: 40 }, (_, index) => index === 18 ? "dark" : `Palette-${index}`);
	const f = fixture(names); f.resize(30); f.panel.handleInput(right);
	assert.match(plain(f.panel.render(100)), /> dark \(current\)/);
	assert.match(plain(f.panel.render(100)), /Page 3\/5/);
	f.panel.handleInput(down);
	f.panel.handleInput(left); f.panel.handleInput(down); f.panel.handleInput(up); f.panel.handleInput(right);
	for (const height of [7, 9, 18, 30]) {
		f.resize(height);
		for (const width of [24, 48, 100]) {
			const lines = f.panel.render(width);
			assert.match(plain(lines), /> Palette-19/);
			assert.ok(lines.length <= height); assert.ok(lines.every(line => visibleWidth(line) <= width));
		}
	}
	f.panel.handleInput("\r"); assert.deepEqual(f.applied, ["Palette-19"]);
});

void test("expanded help, feedback and Theme navigation stay bounded in small viewports", () => {
	const f = fixture(Array.from({ length: 40 }, (_, index) => `Palette-${index}-界🙂`));
	f.resize(30); f.panel.handleInput(right); f.panel.render(100);
	f.resize(9); f.panel.handleInput("\x1b[6~");
	assert.match(plain(f.panel.render(100)), /> Palette-3-/);
	assert.match(plain(f.panel.render(100)), /Page 2\/14/);
	f.panel.handleInput("?");
	for (const height of [0, 1, 2, 4, 6, 7, 9, 18]) {
		f.resize(height);
		for (const width of [0, 1, 8, 24, 48, 100]) {
			const lines = f.panel.render(width);
			assert.ok(lines.length <= height); assert.ok(lines.every(line => visibleWidth(line) <= width));
			if (height >= 4 && width >= 24) assert.match(plain(lines), /> Palette-3-/);
			if (height >= 4 && width === 24) assert.match(plain(lines), /Enter \? Esc Tab/);
		}
	}
	f.fail("invalid theme"); f.panel.handleInput("\r");
	assert.match(plain(f.panel.render(100)), /Page .*Theme failed: invalid theme/);
	f.resize(4); assert.match(plain(f.panel.render(100)), /> Palette-3-.*Theme failed: invalid theme/);
});

void test("help does not intercept confirmation, text input, saving or loading", async () => {
	const f = serviceFixture(); await openSounds(f);
	f.panel.handleInput("\r"); f.panel.handleInput("\x01"); f.panel.handleInput("\x0b");
	f.panel.handleInput("?"); assert.match(plain(f.panel.render(100)), /Path: \?/);
	f.panel.handleInput("\r"); const saving = plain(f.panel.render(100));
	f.panel.handleInput("?"); assert.equal(plain(f.panel.render(100)), saving);
	f.complete(false); await settle();
	const p = fixture(undefined, undefined, { account: {
		read: () => Promise.resolve({ summary: "Accounts", note: "Extra view notes", rows: [
			{ label: "Switch", current: false, action: { kind: "account-switch", profile: "work" }, details: ["Full effect. Preserve unrelated state."] },
		] }), apply: () => Promise.resolve({ failed: false, message: "Switched" }),
	} });
	for (let i = 0; i < 6; i++) p.panel.handleInput(down);
	const loading = plain(p.panel.render(100)); p.panel.handleInput("?"); assert.equal(plain(p.panel.render(100)), loading);
	await settle(); p.panel.handleInput(right); p.panel.handleInput("\r");
	const confirmation = plain(p.panel.render(100));
	p.panel.handleInput("?"); assert.equal(plain(p.panel.render(100)), confirmation);
	assert.match(confirmation, /Full effect\. Preserve unrelated state\./);
	p.panel.handleInput("\x1b"); assert.doesNotMatch(plain(p.panel.render(100)), /Extra view notes/);
});

async function quotaSwitchFixture(initialActive = "work", projection: "available" | "missing" | "no-switch" = "available") {
	const { createControlCenterAccount } = await import("./control-center-account.js");
	const requests: string[] = []; const switches: string[] = [];
	let active = initialActive; let profiles = ["work", "personal"]; let current = true; let reads = 0;
	const account = createControlCenterAccount({ profiles: () => Promise.resolve(profiles), active: () => active,
		defaultProfile: () => Promise.resolve(undefined), isCurrent: () => current,
		switch: profile => { switches.push(profile); active = profile; return Promise.resolve(true); },
		setDefault: () => { throw new Error("No default write"); }, usage: profile => {
			requests.push(profile); return Promise.resolve({ status: "unavailable", profile, checkedAt: 1000, reason: "stored-credentials-unavailable" });
		} });
	const f = fixture(undefined, undefined, { account: { ...account,
		read: async () => {
			reads++;
			const view = await account.read();
			return { ...view, rows: view.rows.map(row => ({ ...row, actions: projection === "no-switch"
				? (row.actions ?? []).filter(choice => choice.action.kind !== "account-switch") : row.actions ?? [],
				// A non-profile row cannot supply a switch for the pinned profile.
				action: projection === "missing" ? { kind: "account-back" } : row.action })) };
		},
		quotaDetails: profile => [`Profile: ${profile}`, "Checked: synthetic", ...Array.from({ length: 30 }, (_, i) => `Quota line ${i}`)],
	} });
	f.resize(18);
	for (let i = 0; i < 6; i++) f.panel.handleInput(down);
	await settle(); f.panel.handleInput(right); f.panel.handleInput(down); f.panel.handleInput("v"); await settle();
	return { ...f, requests, switches, reads: () => reads, setCurrent: (value: boolean) => { current = value; },
		setProfiles: (value: string[]) => { profiles = value; }, setActive: (value: string) => { active = value; } };
}

void test("Quota s confirms the pinned viewed profile, and cancellation preserves scroll and query state", async () => {
	const f = await quotaSwitchFixture();
	f.panel.render(120); f.panel.handleInput("\x1b[F");
	const before = plain(f.panel.render(120));
	assert.match(before, /Profile: personal/); assert.match(before, /\[s\] Switch/);
	assert.match(before, /Quota line 29/);
	for (const cancel of ["\r", "\x1b"]) {
		f.panel.handleInput("s");
		const modal = plain(f.panel.render(120));
		assert.match(modal, /Switch to personal\?/); assert.match(modal, /> Cancel/);
		assert.match(modal, /Switch in place after Pi is idle; next request uses this account\./);
		assert.deepEqual(f.switches, []);
		for (const key of ["s", "r", "b", "v", "?", left]) f.panel.handleInput(key);
		assert.equal(plain(f.panel.render(120)), modal);
		f.panel.handleInput(cancel);
		assert.equal(plain(f.panel.render(120)), before);
		assert.deepEqual(f.requests, ["personal"]); assert.deepEqual(f.switches, []);
	}
	f.panel.handleInput("\x1b[115u"); f.panel.render(120); f.panel.handleInput(down); f.panel.handleInput("\r"); await settle();
	assert.deepEqual(f.switches, ["personal"], "quota row zero is not the overview's active work row");
	assert.deepEqual(f.requests, ["personal"]);
	assert.match(plain(f.panel.render(120)), /Account switched; next request uses it/);
	assert.doesNotMatch(plain(f.panel.render(120)), /\[s\] Switch/);
	f.panel.handleInput("r"); await settle(); assert.deepEqual(f.requests, ["personal", "personal"]);
	f.panel.handleInput("b"); assert.match(plain(f.panel.render(120)), /> personal/); f.dispose();
});

void test("Confirmation groups have single blank separators, which yield before complete safety content", async () => {
	const f = await quotaSwitchFixture();
	f.panel.handleInput("b"); f.panel.handleInput("s");
	const body = () => f.panel.render(120).slice(1, -1).map(line => stripVTControlCharacters(line).slice(1, -1).trim());
	const lines = body();
	assert.deepEqual(lines, ["", "Switch to personal?", "Switch in place after Pi is idle; next request uses this account.", "",
		"> Cancel", "Confirm", "", "↑/↓ choose · Enter select · Esc cancel"]);
	f.resize(7);
	assert.deepEqual(body(), lines.filter(line => line !== ""));
	f.panel.handleInput(down); f.resize(6);
	assert.doesNotMatch(plain(f.panel.render(120)), /> Confirm|Switch in place/);
	f.panel.handleInput("\r"); assert.deepEqual(f.switches, []);
	f.resize(7); assert.match(plain(f.panel.render(120)), /> Confirm/);
	f.panel.handleInput("\r"); await settle(); assert.deepEqual(f.switches, ["personal"]); f.dispose();
});

void test("Quota switch derives availability from the projection and blocks focus and modified letters", async () => {
	for (const [active, projection] of [["personal", "available"], ["work", "missing"], ["work", "no-switch"]] as const) {
		const f = await quotaSwitchFixture(active, projection);
		assert.doesNotMatch(plain(f.panel.render(120)), /\[s\] Switch/);
		for (const key of ["s", "\x1b[115u"]) f.panel.handleInput(key);
		assert.doesNotMatch(plain(f.panel.render(120)), /Confirm account/);
		assert.deepEqual(f.switches, []); assert.deepEqual(f.requests, ["personal"]); f.dispose();
	}
	const f = await quotaSwitchFixture();
	const before = plain(f.panel.render(120)); const reads = f.reads();
	for (const key of ["S", "\x1b[83u", "\x1b[115;2u", "\x1b[115;3u", "\x1b[115;5u", "\x13", "\x1bs"]) {
		f.panel.handleInput(key); assert.equal(plain(f.panel.render(120)), before);
	}
	f.panel.handleInput(left); f.panel.handleInput("s"); assert.doesNotMatch(plain(f.panel.render(120)), /Confirm account/);
	f.panel.handleInput(right); assert.equal(plain(f.panel.render(120)), before);
	f.panel.handleInput("\x1b[6~"); f.panel.render(120); f.panel.handleInput("\x1b[5~"); f.panel.render(120);
	assert.equal(f.reads(), reads); assert.deepEqual(f.requests, ["personal"]); assert.deepEqual(f.switches, []);
	f.setCurrent(false); assert.doesNotMatch(plain(f.panel.render(120)), /\[s\] Switch/);
	f.panel.handleInput("s"); assert.doesNotMatch(plain(f.panel.render(120)), /Confirm account/); f.dispose();
});

void test("Quota confirmation retains the owner's removed, stale and already-active rechecks", async () => {
	for (const boundary of ["removed", "stale", "active"] as const) {
		const f = await quotaSwitchFixture(); f.panel.handleInput("s");
		assert.match(plain(f.panel.render(120)), /> Cancel/);
		if (boundary === "removed") f.setProfiles(["work"]);
		else if (boundary === "stale") f.setCurrent(false);
		else f.setActive("personal");
		f.panel.handleInput(down); f.panel.handleInput("\r"); await settle();
		assert.deepEqual(f.switches, []); assert.deepEqual(f.requests, ["personal"]);
		assert.match(plain(f.panel.render(120)), boundary === "removed" ? /Profile no longer available/
			: boundary === "stale" ? /Account action unavailable/ : /Account already active/);
		f.dispose();
	}
});

void test("Quota switch never crosses loading, query or saving boundaries", async () => {
	const actions: ControlCenterAccountAction[] = [];
	let finishRead = () => {}; let finishUsage = () => {}; let finishSwitch = () => {};
	const rows: ControlCenterRow[] = [{ label: "personal", current: false, action: { kind: "account-select", profile: "personal" }, actions: [
		{ label: "Usage", current: false, action: { kind: "account-usage", profile: "personal" } },
		{ label: "Switch", current: false, action: { kind: "account-switch", profile: "personal" }, details: ["Idle only. Next request uses this account."] },
	] }];
	const f = fixture(undefined, undefined, { account: {
		read: () => new Promise(resolve => { finishRead = () => resolve({ summary: "Synthetic", note: "", rows }); }),
		apply: action => {
			actions.push(action);
			return new Promise(resolve => {
				const finish = () => resolve({ failed: false, message: "Synthetic completion" });
				if (action.kind === "account-usage") finishUsage = finish; else finishSwitch = finish;
			});
		}, quotaDetails: profile => [`Profile: ${profile}`, "Checked: synthetic"],
	} });
	f.resize(30);
	for (let i = 0; i < 6; i++) f.panel.handleInput(down);
	f.panel.handleInput(right); f.panel.handleInput("s"); assert.deepEqual(actions, []);
	assert.doesNotMatch(plain(f.panel.render(120)), /Confirm account/);
	finishRead(); await settle(); f.panel.handleInput("v");
	const querying = plain(f.panel.render(120)); assert.doesNotMatch(querying, /\[s\] Switch/);
	for (const key of ["s", "\x1b[115u", "r", "\r"]) f.panel.handleInput(key);
	assert.equal(plain(f.panel.render(120)), querying);
	finishUsage(); await settle(); f.panel.handleInput("s"); f.panel.render(120);
	f.panel.handleInput(down); f.panel.handleInput("\r");
	const saving = plain(f.panel.render(120)); assert.doesNotMatch(saving, /\[s\] Switch/);
	for (const key of ["s", "\x1b[115u", "r", "b", "\r"]) f.panel.handleInput(key);
	assert.equal(plain(f.panel.render(120)), saving);
	assert.deepEqual(actions, [{ kind: "account-usage", profile: "personal" }, { kind: "account-switch", profile: "personal" }]);
	finishSwitch(); await settle(); finishRead(); await settle(); f.dispose();
});

void test("Spaced confirmations preserve ANSI safety text and fit guard across narrow and short viewports", async () => {
	const safety = "\x1b[31mFull effects: preserve unrelated resources and credentials. Wait until idle; next request uses this account.\x1b[0m";
	for (const width of [1, 8, 11, 24, 48, 120]) {
		for (const height of [1, 3, 7, 12, 30]) {
			let calls = 0;
			const f = fixture(undefined, undefined, { account: {
				read: () => Promise.resolve({ summary: "Synthetic", note: "", rows: [
					{ label: "Switch", current: false, action: { kind: "account-switch", profile: "personal" }, details: [safety] },
				] }), apply: () => { calls++; return Promise.resolve({ failed: true, message: "Synthetic rejection" }); },
			} });
			for (let i = 0; i < 6; i++) f.panel.handleInput(down);
			await settle(); f.panel.handleInput(right); f.panel.handleInput("\r"); f.resize(height);
			const lines = f.panel.render(width);
			assert.ok(lines.length <= height); assert.ok(lines.every(line => visibleWidth(line) <= width));
			const body = lines.slice(1, -1).map(line => stripVTControlCharacters(line).slice(1, -1).trim()).join(" ");
			const compact = body.replace(/\s+/g, "");
			const fits = compact.includes("Cancel") && compact.includes("Confirm") && compact.includes("Esccancel");
			if (fits) assert.ok(compact.includes(stripVTControlCharacters(safety).replace(/\s+/g, "")), `all effects visible at ${width}×${height}`);
			f.panel.handleInput(down); f.panel.handleInput("\r"); await settle();
			assert.equal(calls, fits ? 1 : 0);
			f.panel.handleInput("\x1b"); f.dispose();
		}
	}
});

void test("Account explicit preview precedes independent Cancel-first activation; navigation never queries", async () => {
	const { createControlCenterAccount } = await import("./control-center-account.js");
	const requests: string[] = []; const switches: string[] = [];
	const account = createControlCenterAccount({ profiles: () => Promise.resolve(["work", "personal"]), active: () => undefined,
		defaultProfile: () => Promise.resolve(undefined), switch: profile => { switches.push(profile); return Promise.resolve(true); },
		setDefault: () => Promise.resolve(true), usage: profile => { requests.push(profile); return Promise.resolve({ status: "unavailable", profile, checkedAt: 1000, reason: "stored-credentials-unavailable" }); } });
	const f = fixture(undefined, undefined, { account }); f.resize(30);
	for (let i = 0; i < 6; i++) f.panel.handleInput(down);
	await settle(); f.panel.handleInput(right); f.panel.handleInput(down); f.panel.handleInput(up);
	assert.deepEqual(requests, []); assert.deepEqual(switches, []);
	assert.doesNotMatch(f.panel.render(120).join("\n"), /Actions \/|> View usage|Switch to work/);
	assert.match(f.panel.render(120).join("\n"), /v View usage.*s Switch.*d Set default/);
	f.panel.handleInput("v"); await settle();
	assert.deepEqual(requests, ["work"]); assert.match(f.panel.render(120).join("\n"), /Profile: work.*|Checked:/);
	assert.match(f.panel.render(120).join("\n"), /Refresh/);
	f.panel.handleInput("\x1b"); assert.equal(f.closes(), 0);
	f.panel.handleInput("s");
	assert.match(f.panel.render(120).join("\n"), /> Cancel/);
	assert.match(f.panel.render(120).join("\n"), /Switch in place after Pi is idle/);
	f.panel.handleInput("v"); f.panel.handleInput("d");
	f.panel.handleInput("\r"); assert.deepEqual(switches, []);
	f.panel.handleInput("s"); f.panel.handleInput(down); f.panel.handleInput("\r"); await settle();
	assert.deepEqual(switches, ["work"]); assert.deepEqual(requests, ["work"]);
});

void test("Pending profile reads block duplicate Enter but exit, disposal and stale generation suppress completion", async () => {
	const { createControlCenterAccount } = await import("./control-center-account.js");
	for (const boundary of ["category", "escape", "back", "dispose", "runtime"] as const) {
		let calls = 0; let current = true; let signal: AbortSignal | undefined; let finish = () => {};
		const account = createControlCenterAccount({ profiles: () => Promise.resolve(["work"]), active: () => undefined,
			defaultProfile: () => Promise.resolve(undefined), switch: () => { throw new Error("forbidden"); }, setDefault: () => { throw new Error("forbidden"); },
			isCurrent: () => current, usage: (profile, requestSignal) => { calls++; signal = requestSignal; return new Promise(resolve => {
				finish = () => resolve({ status: "ready", profile, checkedAt: 1000, quotaSnapshot: { fetchedAt: 1000, buckets: [], credits: undefined, planType: undefined, ordinaryUsageAllowed: undefined } });
			}); } });
		const f = fixture(undefined, undefined, { account });
		for (let i = 0; i < 6; i++) f.panel.handleInput(down);
		await settle(); f.panel.handleInput("v"); assert.equal(calls, 0, "category focus owns letter input");
		f.panel.handleInput(right); f.panel.handleInput("v"); await settle();
		for (const key of ["\r", "v", "r", "s", "d", "c"]) f.panel.handleInput(key);
		assert.equal(calls, 1);
		const pending = plain(f.panel.render(120));
		f.panel.handleInput("?"); assert.equal(plain(f.panel.render(120)), pending);
		if (boundary === "category") { f.panel.handleInput(left); f.panel.handleInput(down); await settle(); }
		else if (boundary === "escape" || boundary === "back") { f.panel.handleInput(boundary === "back" ? "b" : "\x1b"); assert.equal(f.closes(), 0); }
		else if (boundary === "dispose") f.dispose();
		else current = false;
		if (boundary !== "runtime") assert.equal(signal?.aborted, true);
		const renders = f.renders(); finish(); await settle();
		assert.equal(f.renders(), renders); assert.doesNotMatch(f.panel.render(120).join("\n"), /usage checked|Checked: .*local time/);
		if (boundary === "category") {
			f.panel.handleInput(up); await settle(); f.panel.handleInput(right); f.panel.handleInput("v"); await settle();
			assert.equal(calls, 2, "reopened category can replace a cancelled query");
			f.dispose(); finish(); await settle();
		}
	}
});
void test("Profile selection survives confirmed operations and quota refresh/back; long quota scrolls within bounds", async () => {
	const { createControlCenterAccount } = await import("./control-center-account.js");
	let active = "work"; let defaultProfile = "work";
	const requests: string[] = [];
	const account = createControlCenterAccount({ profiles: () => Promise.resolve(["work", "personal"]), active: () => active,
		defaultProfile: () => Promise.resolve({ code: 0, stdout: defaultProfile }),
		switch: profile => { active = profile; defaultProfile = profile; return Promise.resolve(true); },
		setDefault: profile => { defaultProfile = profile ?? "No default account."; return Promise.resolve(true); },
		usage: profile => { requests.push(profile); return Promise.resolve({ status: "ready", profile, checkedAt: 1000,
			quotaSnapshot: { fetchedAt: 1000, planType: undefined, ordinaryUsageAllowed: undefined, credits: undefined,
				buckets: Array.from({ length: 20 }, (_, index) => ({ id: `bucket-${index}`, label: undefined,
					primary: { usedPercent: 25, windowMinutes: 300, resetsAt: undefined }, secondary: undefined })) } }); },
	});
	const f = fixture(undefined, undefined, { account }); f.resize(30);
	for (let i = 0; i < 6; i++) f.panel.handleInput(down);
	await settle(); f.panel.handleInput(right); f.panel.handleInput(down);
	assert.deepEqual(requests, []);
	f.panel.handleInput("s"); f.panel.render(120);
	f.panel.handleInput(down); f.panel.handleInput("\r"); await settle();
	assert.match(f.panel.render(120).join("\n"), /> personal · Active · Default/);
	f.panel.handleInput("d"); f.panel.render(120);
	f.panel.handleInput(down); f.panel.handleInput("\r"); await settle();
	assert.match(f.panel.render(120).join("\n"), /> personal · Active · Default/);
	f.panel.handleInput("c"); f.panel.render(120);
	f.panel.handleInput(down); f.panel.handleInput("\r"); await settle();
	assert.match(f.panel.render(120).join("\n"), /> personal · Active/);
	assert.doesNotMatch(f.panel.render(120).join("\n"), /c Clear default/);
	f.panel.handleInput("\r"); await settle();
	f.resize(9);
	assert.match(f.panel.render(100).join("\n"), /Refresh.*Back/);
	const seen: string[] = [];
	for (let i = 0; i < 250; i++) {
		const text = plain(f.panel.render(100));
		seen.push(text);
		assert.match(text, /Refresh.*Back/);
		assert.match(text, /Stored-profile Codex usage checked/);
		if (text.includes("bucket-19")) break;
		f.panel.handleInput("\x1b[6~");
	}
	assert.match(seen.join("\n"), /bucket-19/, "paging reaches the last bucket despite longer detail cards");
	f.panel.handleInput("\x1b[F");
	assert.match(plain(f.panel.render(100)), /bucket-19.*Session/, "End reaches the final quota summary");
	f.panel.handleInput("\x1b[H");
	assert.match(plain(f.panel.render(100)), /Checked:/);
	f.resize(30); f.panel.render(100); f.resize(9);
	f.panel.handleInput("\x1b[F");
	assert.match(plain(f.panel.render(100)), /bucket-19.*Session/, "resize before input recalculates the quota viewport");
	for (const width of [1, 8, 24, 48, 100]) {
		const lines = f.panel.render(width); assert.ok(lines.length <= 9);
		assert.ok(lines.every(line => visibleWidth(line) <= width));
	}
	f.panel.handleInput("r"); await settle(); assert.deepEqual(requests, ["personal", "personal"]);
	f.panel.handleInput("b");
	assert.equal(f.closes(), 0); assert.match(f.panel.render(100).join("\n"), /personal/);
});

void test("Direct profile keys isolate selection and stay blocked during metadata loading and saving", async () => {
	const { createControlCenterAccount } = await import("./control-center-account.js");
	const calls: string[] = [];
	let finishRead: (names: string[]) => void = () => {};
	let finishSwitch: (success: boolean) => void = () => {};
	let firstRead = true;
	let active = "work";
	const account = createControlCenterAccount({
		profiles: () => {
			if (firstRead) { firstRead = false; return new Promise(resolve => { finishRead = resolve; }); }
			return Promise.resolve(["work", "personal"]);
		},
		active: () => active, defaultProfile: () => Promise.resolve({ code: 0, stdout: "work" }),
		switch: profile => { calls.push(`switch:${profile}`); return new Promise(resolve => { finishSwitch = resolve; }); },
		setDefault: profile => { calls.push(`default:${profile ?? "clear"}`); return Promise.resolve(true); },
		usage: profile => { calls.push(`usage:${profile}`); return Promise.resolve({ status: "unavailable", profile, checkedAt: 1000, reason: "stored-credentials-unavailable" }); },
	});
	const f = fixture(undefined, undefined, { account }); f.resize(30);
	for (let i = 0; i < 6; i++) f.panel.handleInput(down);
	f.panel.handleInput(right);
	for (const key of ["v", "s", "d", "c"]) f.panel.handleInput(key);
	assert.deepEqual(calls, []);
	finishRead(["work", "personal"]); await settle();
	f.panel.handleInput(down); f.panel.handleInput("s");
	assert.match(f.panel.render(120).join("\n"), /Switch to personal/);
	for (const key of ["v", "s", "d", "c"]) f.panel.handleInput(key);
	assert.deepEqual(calls, []);
	f.panel.handleInput(down); f.panel.handleInput("\r"); await settle();
	assert.deepEqual(calls, ["switch:personal"]);
	for (const key of ["v", "s", "d", "c", "\r"]) f.panel.handleInput(key);
	assert.deepEqual(calls, ["switch:personal"]);
	active = "personal"; finishSwitch(true); await settle();
	assert.match(f.panel.render(120).join("\n"), /> personal · Active/);
	f.panel.handleInput("s"); assert.doesNotMatch(f.panel.render(120).join("\n"), /Confirm account action/);
	f.panel.handleInput("d");
	assert.match(f.panel.render(120).join("\n"), /Set default: personal.*|Default selects/);
	f.panel.handleInput("\x1b"); assert.deepEqual(calls, ["switch:personal"]);
	f.panel.handleInput("c");
	assert.match(f.panel.render(120).join("\n"), /active account is unchanged/);
	f.panel.handleInput("\x1b");
	f.panel.handleInput("v"); await settle(); assert.deepEqual(calls, ["switch:personal", "usage:personal"]);
	f.panel.handleInput("b"); f.panel.handleInput(up); f.panel.handleInput("v"); await settle();
	assert.deepEqual(calls, ["switch:personal", "usage:personal", "usage:work"]);
});

void test("Usage renders shared cached capacity bars separately from local ranges and totals", async () => {
	const { createControlCenterUsage } = await import("./control-center-usage.js");
	let refreshes = 0;
	const usage = createControlCenterUsage({ quota: () => ({ kind: "ready", snapshot: { fetchedAt: 1000,
		planType: undefined, credits: undefined, ordinaryUsageAllowed: undefined, buckets: [{ id: "codex", label: undefined,
			primary: { usedPercent: 100, windowMinutes: 300, resetsAt: undefined },
			secondary: { usedPercent: 0, windowMinutes: 10080, resetsAt: undefined } }] } }),
		history: () => Promise.resolve({ records: [], warnings: [], limited: false, missing: true }),
		refresh: () => { refreshes++; return Promise.resolve(); }, active: () => "work" });
	const f = fixture(undefined, undefined, { usage }); f.resize(30);
	for (let i = 0; i < 7; i++) f.panel.handleInput(down);
	await settle(); f.panel.handleInput(right);
	const text = plain(f.panel.render(120));
	assert.match(text, /Quota \/ Session 5h 0% left ░+/);
	assert.match(text, /Quota \/ Weekly 7d 100% left █+/);
	assert.match(text, /Local analytics.*day/);
	assert.match(text, /Range: day/);
	assert.match(text, /No recorded turns in this range/);
	for (const width of [1, 8, 24, 48, 100]) assert.ok(f.panel.render(width).every(line => visibleWidth(line) <= width));
	assert.equal(refreshes, 0);
});

async function openSounds(f: ReturnType<typeof serviceFixture>) {
	for (let i = 0; i < 5; i++) f.panel.handleInput(down);
	await settle(); f.panel.handleInput(right);
}

void test("Sounds opening is read-only; inline Input cancel and submit stay in the overlay", async () => {
	const f = serviceFixture(); await openSounds(f);
	assert.match(f.panel.render(100).join("\n"), /Master unavailable/);
	assert.match(f.panel.render(100).join("\n"), /Saved: \/saved.wav/);
	f.panel.handleInput("?");
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

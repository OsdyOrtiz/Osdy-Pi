import assert from "node:assert/strict";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { KeybindingsManager } from "../../node_modules/@earendil-works/pi-coding-agent/dist/core/keybindings.js";
import type { EditorTheme, TUI } from "@earendil-works/pi-tui";
import type { OsdyState } from "./types.js";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { fileURLToPath } from "node:url";
import { visibleWidth } from "@earendil-works/pi-tui";
import ts from "typescript";
import test from "node:test";
// @ts-expect-error Node's native TypeScript runner resolves test-only TypeScript source imports.
import * as profileLabel from "./profile-label.ts";
// @ts-expect-error Node's native TypeScript runner resolves test-only TypeScript source imports.
import { HEADER_VARIANTS, MASCOTS, MASCOT_GAP, STACKED_CONTENT_MAX_ROWS, headerWidth, mascotForChoice, mascotWidthForRows, scaleHeader, scaleMascot } from "./constants.ts";
// @ts-expect-error Node's native TypeScript runner resolves test-only TypeScript source imports.
import { shouldShowFooterMetadata } from "./types.ts";
// @ts-expect-error Node's native TypeScript runner resolves test-only TypeScript source imports.
import { PI_RACCOON_MASCOT_SIZES } from "./pi-raccoon-sprites.ts";
// @ts-expect-error Node's native TypeScript runner resolves test-only TypeScript source imports.
import { pixelGridWidth } from "./pixel-art.ts";

registerHooks({
	resolve(specifier, context, nextResolve) {
		if (specifier.startsWith(".") && specifier.endsWith(".js") && context.parentURL?.endsWith(".ts")) {
			const url = new URL(`${specifier.slice(0, -3)}.ts`, context.parentURL);
			if (existsSync(fileURLToPath(url))) return { shortCircuit: true, url: url.href };
		}
		return nextResolve(specifier, context);
	},
	load(url, context, nextLoad) {
		if (url.endsWith(".ts")) return {
			format: "module",
			shortCircuit: true,
			source: ts.transpileModule(readFileSync(fileURLToPath(url), "utf8"), {
				compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
			}).outputText,
		};
		return nextLoad(url, context);
	},
});

const ui = await import("./ui.js");
const { compactMascotWidthBudget, composeSideBySide } = await import("./utils.js");
const { renderPiMascot } = await import("./pixel-mascot.js");
const { asciiAnimationMode } = await import("./animation.js");

void test("Git summary uses the live theme accent and preserves diff colors and counts", async () => {
	const { createWorkingTreeWidgetFactory } = await import("./working-tree.js");
	let palette = "first";
	const theme = { fg: (token: string, text: string) => `<${palette}:${token}>${text}</>`, bold: (text: string) => text };
	const state = { enabled: true, visible: true, loading: false, snapshot: {
		totalFiles: 3, additions: 7, removals: 2, stagedFiles: 1, unstagedFiles: 2, untrackedFiles: 1,
	} } as Parameters<typeof createWorkingTreeWidgetFactory>[0];
	const widget = createWorkingTreeWidgetFactory(state, { active: false } as Parameters<typeof createWorkingTreeWidgetFactory>[1], "aboveEditor")({} as TUI, theme);
	for (const name of ["first", "second"]) {
		palette = name;
		const output = widget.render(500).join("\n");
		for (const text of ["Git changes · 3 files", "staged 1", "unstaged 2", "new 1"]) assert.ok(output.includes(`<${name}:accent>${text}</>`));
		assert.ok(output.includes(`<${name}:toolDiffAdded>+7</>`));
		assert.ok(output.includes(`<${name}:toolDiffRemoved>-2</>`));
	}
	state.snapshot!.totalFiles = 0;
	assert.ok(widget.render(500).join("").includes("<second:accent>Git changes · working tree clean</>"));
});

void test("active account uses the live theme accent in editor and native footer", (t) => {
	const previous = process.env.OSDY_PI_PROFILE_NAME;
	process.env.OSDY_PI_PROFILE_NAME = "work";
	t.after(() => { if (previous === undefined) delete process.env.OSDY_PI_PROFILE_NAME; else process.env.OSDY_PI_PROFILE_NAME = previous; });
	let palette = "35";
	const accent = (text: string) => `\u001b[${palette}m${text}\u001b[39m`;
	const theme = { fg: (token: string, text: string) => token === "accent" ? accent(text) : text, bold: (text: string) => text };
	const state = { codexUsage: { kind: "idle" }, enabled: true, editorEffective: true, companionEnabled: false } as OsdyState;
	const ctx = { cwd: "/synthetic", ui: { theme }, model: { provider: "test", id: "test", contextWindow: 200000 },
		getContextUsage: () => ({ percent: 60 }), sessionManager: { getEntries: () => [] } } as unknown as ExtensionContext;
	const pi = { getThinkingLevel: () => "off" } as ExtensionAPI;
	const tui = { terminal: { rows: 40, columns: 120 }, requestRender() {} } as unknown as TUI;
	const plain = (text: string) => text;
	const editorTheme: EditorTheme = { borderColor: plain, selectList: { selectedPrefix: plain, selectedText: plain, description: plain, scrollInfo: plain, noMatch: plain } };
	const editor = ui.createEditorComponent(pi, ctx, state)(tui, editorTheme, new KeybindingsManager());
	const footer = ui.createFooterComponent(pi, ctx, state, { getGitBranch: () => null, getExtensionStatuses: () => new Map(), getAvailableProviderCount: () => 1, onBranchChange: () => () => {} }, theme);
	for (const color of ["35", "36"]) {
		palette = color;
		state.editorEffective = true;
		assert.ok(editor.render(120).join("\n").includes(accent(" work ")));
		state.editorEffective = false;
		assert.ok(footer.render(120).join("\n").includes(accent("work")));
	}
});

void test("header version occupies a blank leading row at the right edge without moving art", () => {
	const art = ["\u001b[31m    \u001b[0m", "  mascot logo  "];
	const result = ui.decorateHeaderVersion(art, 40, "2.3.4");
	assert.equal(result.length, art.length);
	assert.equal(result[0], `${" ".repeat(26)}osdy-pi v2.3.4`);
	assert.equal(visibleWidth(result[0] ?? ""), 40);
	assert.equal(result[1], art[1]);
	assert.deepEqual(art, ["\u001b[31m    \u001b[0m", "  mascot logo  "]);
});

void test("header version follows the active accent on each render without changing visible alignment", () => {
	const art = ["", "  mascot logo  "];
	let accent = "\u001b[31m";
	const calls: string[] = [];
	const theme = {
		fg(color: string, text: string): string {
			calls.push(color);
			return `${accent}${text}\u001b[0m`;
		},
	};
	const render = () => ui.decorateHeaderVersion(art, 40, "2.3.4", theme);
	const first = render();
	assert.equal(first[0], `${" ".repeat(26)}\u001b[31mosdy-pi v2.3.4\u001b[0m`);
	accent = "\u001b[34m";
	const second = render();
	assert.equal(second[0], `${" ".repeat(26)}\u001b[34mosdy-pi v2.3.4\u001b[0m`);
	for (const result of [first, second]) {
		assert.equal(visibleWidth(result[0] ?? ""), 40);
		assert.equal(result[1], art[1]);
	}
	assert.deepEqual(ui.decorateHeaderVersion(art, 12, "2.3.4", theme), art);
	assert.deepEqual(ui.decorateHeaderVersion(art, 40, undefined, theme), art);
	assert.deepEqual(calls, ["accent", "accent"]);
	assert.deepEqual(art, ["", "  mascot logo  "]);
});

void test("header version gets a separate row when art starts immediately", () => {
	const art = ["  logo  ", " mascot "];
	const result = ui.decorateHeaderVersion(art, 14, "2.3.4");
	assert.deepEqual(result, ["osdy-pi v2.3.4", ...art]);
	assert.deepEqual(ui.decorateHeaderVersion([], 14, "2.3.4"), ["osdy-pi v2.3.4"]);
});

void test("header version is omitted at narrow widths or without a version", () => {
	const art = ["", "art"];
	for (const width of [0, 1, 12, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
		assert.deepEqual(ui.decorateHeaderVersion(art, width, "2.3.4"), art);
	}
	assert.deepEqual(ui.decorateHeaderVersion(art, 80, undefined), art);
	assert.equal(visibleWidth(ui.decorateHeaderVersion(art, 40, "1.2.3-beta.1+build.7")[0] ?? ""), 40);
});

void test("installed version comes from the module-relative package manifest", () => {
	const manifestUrl = new URL("../../package.json", new URL("./ui.ts", import.meta.url));
	const manifest: unknown = JSON.parse(readFileSync(manifestUrl, "utf8"));
	assert.ok(typeof manifest === "object" && manifest !== null && "version" in manifest);
	assert.equal(ui.loadInstalledPackageVersion(), manifest.version);
	assert.equal(ui.loadInstalledPackageVersion((url) => {
		assert.equal(url.href, manifestUrl.href);
		return '{"name":"osdy-pi","version":"9.8.7-rc.1+build.2"}';
	}), "9.8.7-rc.1+build.2");
});

void test("missing and untrusted manifests never throw or inject terminal content", () => {
	assert.equal(ui.loadInstalledPackageVersion(() => { throw new Error("missing"); }), undefined);
	for (const text of ["{", "null", "[]", "{}", '{"version":123}', '{"name":"pi","version":"1.2.3"}',
		...['', '1.2', '1x2x3', '01.2.3', '1.2.3-01', '1.2.3\n', '\u001b[31m1.2.3', '1.2.3 bad', '1.2.3+', 'x'.repeat(200)].map((version) => JSON.stringify({ name: "osdy-pi", version }))]) {
		assert.equal(ui.loadInstalledPackageVersion(() => text), undefined, text);
	}
});

void test("version decoration is wired only to the artwork header, not the editor", () => {
	const source = readFileSync(new URL("./ui.ts", import.meta.url), "utf8");
	const header = source.slice(source.indexOf("export function createHeaderComponent"), source.indexOf("export function createFooterComponent"));
	assert.match(header, /const installedVersion = loadInstalledPackageVersion\(\);/);
	assert.match(header, /return decorateHeaderVersion\(lines, width, installedVersion, theme\);/);
	assert.doesNotMatch(source.slice(source.indexOf("export function createEditorComponent")), /installedVersion|decorateHeaderVersion/);
});

function plainHeader(lines: readonly string[]): string[] {
	return lines.map((line) => line.replace(new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, "g"), ""));
}

function renderHeader(
	headerVariant: keyof typeof HEADER_VARIANTS,
	mascot: keyof typeof MASCOTS | "pi",
	width: number,
	rows: number,
	columns = width,
): string[] {
	// Layout tests compare finished artwork, so they skip the startup typewriter.
	const previous = process.env.OSDY_PI_ANIMATION;
	process.env.OSDY_PI_ANIMATION = "off";
	type Factory = ReturnType<typeof ui.createHeaderComponent>;
	const component = ui.createHeaderComponent(
		{} as Parameters<typeof ui.createHeaderComponent>[0],
		{} as Parameters<typeof ui.createHeaderComponent>[1],
		{ headerVariant, mascot } as Parameters<typeof ui.createHeaderComponent>[2],
	)(
		{ terminal: { columns, rows }, requestRender() {} } as unknown as Parameters<Factory>[0],
		{ fg: (_color: string, text: string) => text },
	);
	try {
		return plainHeader(component.render(width));
	} finally {
		component.dispose();
		if (previous === undefined) delete process.env.OSDY_PI_ANIMATION;
		else process.env.OSDY_PI_ANIMATION = previous;
	}
}

for (const headerVariant of Object.keys(HEADER_VARIANTS) as (keyof typeof HEADER_VARIANTS)[]) {
	for (const mascot of Object.keys(MASCOTS) as (keyof typeof MASCOTS)[]) {
		const variant = HEADER_VARIANTS[headerVariant];
		const art = MASCOTS[mascot].art;
		const fullWidth = (rows: number) => headerWidth(headerVariant) + MASCOT_GAP + mascotWidthForRows(art, rows);
		const decorated = (lines: string[], width: number) => plainHeader(
			ui.decorateHeaderVersion(lines, width, ui.loadInstalledPackageVersion()),
		);

		void test(`${headerVariant}/${mascot}: full layout at exact width and height boundaries`, () => {
			for (const rows of [40, variant.header.length]) {
				const width = fullWidth(rows);
				const scaled = scaleMascot(art, width - headerWidth(headerVariant) - MASCOT_GAP, rows);
				const expected = composeSideBySide(
					[...scaled.mascot], Math.max(...scaled.mascot.map(visibleWidth)),
					[...variant.header], width, headerWidth(headerVariant),
				);
				assert.deepEqual(renderHeader(headerVariant, mascot, width, rows), decorated(expected, width));
			}
		});

		for (const [scenario, width, rows, columns] of [
			["former intermediate width", 100, 40, 100],
			["narrow width", 40, 40, 40],
			["minimum width", 1, 1, 1],
			["below former logo threshold", 71, 40, 71],
			["one column below full fit", fullWidth(40) - 1, 40, fullWidth(40) - 1],
			["one row below full fit", fullWidth(variant.header.length - 1), variant.header.length - 1, 300],
			["capped content rows", 100, 100, 300],
			["render width narrower than terminal", fullWidth(12) - 1, 12, 300],
		] as const) {
			void test(`${headerVariant}/${mascot}: ${scenario} renders only a centered bounded mascot`, () => {
				const rowBudget = Math.min(rows, STACKED_CONTENT_MAX_ROWS);
				const widthBudget = compactMascotWidthBudget(width);
				const scaled = scaleMascot(art, widthBudget, rowBudget);
				const centered = scaled.mascot.map((line) => `${" ".repeat(Math.floor((width - visibleWidth(line)) / 2))}${line}`);
				const actual = renderHeader(headerVariant, mascot, width, rows, columns);
				// Exact artwork equality excludes any extra stacked or scaled logo rows.
				assert.deepEqual(actual, decorated(centered, width));
				assert.ok(scaled.mascot.length <= rowBudget);
				assert.ok(scaled.mascot.every((line) => visibleWidth(line) <= widthBudget));
				assert.ok(actual.every((line) => visibleWidth(line) <= width));
			});
		}
	}
}

/** Renders a pi/text header through a fake clock; returns the frames seen after each requested number of ticks. */
function headerAfterTicks(
	t: test.TestContext,
	mascot: keyof typeof MASCOTS | "pi",
	ticks: readonly number[],
	mode: string,
): { renders: string[]; requestedRenders: number } {
	const previous = process.env.OSDY_PI_ANIMATION;
	process.env.OSDY_PI_ANIMATION = mode;
	t.after(() => {
		if (previous === undefined) delete process.env.OSDY_PI_ANIMATION;
		else process.env.OSDY_PI_ANIMATION = previous;
	});
	t.mock.timers.enable({ apis: ["setInterval"] });
	type Factory = ReturnType<typeof ui.createHeaderComponent>;
	let requestedRenders = 0;
	const component = ui.createHeaderComponent(
		{} as Parameters<typeof ui.createHeaderComponent>[0],
		{} as Parameters<typeof ui.createHeaderComponent>[1],
		{ headerVariant: "osdy-theme", mascot } as Parameters<typeof ui.createHeaderComponent>[2],
	)({ terminal: { columns: 100, rows: 40 }, requestRender() { requestedRenders += 1; } } as unknown as Parameters<Factory>[0],
		{ fg: (_color: string, text: string) => text });
	const renders: string[] = [];
	let elapsed = 0;
	try {
		for (const tick of ticks) {
			t.mock.timers.tick((tick - elapsed) * 30);
			elapsed = tick;
			renders.push(component.render(100).join("\n"));
		}
		return { renders, requestedRenders };
	} finally {
		component.dispose();
		t.mock.timers.reset();
	}
}

void test("hoodie pi waves at startup in intro mode, then returns to the neutral pose", (t) => {
	const off = headerAfterTicks(t, "pi", [0], "off").renders[0];
	const intro = headerAfterTicks(t, "pi", [0, 5, 10, 39, 40, 60], "intro");
	assert.ok(off);
	for (const waving of intro.renders.slice(0, 4)) assert.notEqual(waving, off, "waving differs from neutral");
	assert.ok(new Set(intro.renders.slice(0, 4)).size === 4, "wave cycles frames");
	assert.equal(intro.renders[4], intro.renders[5], "after the wave the static neutral pose holds");
	assert.equal(intro.requestedRenders, 40, "intro timer runs long enough for the wave, then stops");
});

void test("hoodie pi never waves when animation is off and waves only once in continuous mode", (t) => {
	const off = headerAfterTicks(t, "pi", [0, 10, 100], "off").renders;
	assert.equal(new Set(off).size, 1, "off stays on the static neutral pose");
	const continuous = headerAfterTicks(t, "pi", [0, 39, 40, 41, 100], "continuous");
	assert.equal(continuous.requestedRenders, 100, "continuous keeps ticking");
	assert.notEqual(continuous.renders[0], off[0]);
});

void test("the wordmark types itself in at startup, then stays fully written", (t) => {
	const previous = process.env.OSDY_PI_ANIMATION;
	process.env.OSDY_PI_ANIMATION = "intro";
	t.after(() => {
		if (previous === undefined) delete process.env.OSDY_PI_ANIMATION;
		else process.env.OSDY_PI_ANIMATION = previous;
	});
	t.mock.timers.enable({ apis: ["setInterval"] });
	const art = MASCOTS.current.art;
	const width = headerWidth("osdy-theme") + MASCOT_GAP + mascotWidthForRows(art, 40);
	type Factory = ReturnType<typeof ui.createHeaderComponent>;
	const component = ui.createHeaderComponent(
		{} as Parameters<typeof ui.createHeaderComponent>[0],
		{} as Parameters<typeof ui.createHeaderComponent>[1],
		{ headerVariant: "osdy-theme", mascot: "current" } as Parameters<typeof ui.createHeaderComponent>[2],
	)({ terminal: { columns: width, rows: 40 }, requestRender() {} } as unknown as Parameters<Factory>[0],
		{ fg: (_color: string, text: string) => text });
	const written = (): number => plainHeader(component.render(width)).join("").replace(/[\s▌]/g, "").length;
	try {
		const start = plainHeader(component.render(width)).join("\n");
		const atStart = written();
		t.mock.timers.tick(12 * 30);
		const halfway = written();
		t.mock.timers.tick(12 * 30);
		const done = plainHeader(component.render(width));
		assert.ok(start.includes("▌"), "the caret shows while typing");
		assert.ok(atStart < halfway, "more of the wordmark is written halfway");
		assert.ok(halfway < written(), "the wordmark finishes after the typewriter");
		assert.ok(!done.join("\n").includes("▌"), "the caret is gone once written");
		assert.deepEqual(done, renderHeader("osdy-theme", "current", width, 40), "the finished header matches the static one");
	} finally {
		component.dispose();
		t.mock.timers.reset();
	}
});

void test("text mascots keep the 28-frame intro and ignore the wave", (t) => {
	const intro = headerAfterTicks(t, "current", [0, 27, 28, 60], "intro");
	assert.equal(intro.requestedRenders, 28);
	assert.equal(intro.renders[2], intro.renders[3]);
});

void test("pi mascot renders the generated half-block raccoon at the largest size that fits", () => {
	const raw = (width: number, rows: number): string[] => {
		type Factory = ReturnType<typeof ui.createHeaderComponent>;
		const component = ui.createHeaderComponent(
			{} as Parameters<typeof ui.createHeaderComponent>[0],
			{} as Parameters<typeof ui.createHeaderComponent>[1],
			{ headerVariant: "osdy-theme", mascot: "pi" } as Parameters<typeof ui.createHeaderComponent>[2],
		)({ terminal: { columns: width, rows }, requestRender() {} } as unknown as Parameters<Factory>[0],
			{ fg: (_color: string, text: string) => text });
		try { return component.render(width); } finally { component.dispose(); }
	};
	const largest = PI_RACCOON_MASCOT_SIZES[0];
	const smallest = PI_RACCOON_MASCOT_SIZES.at(-1);
	assert.ok(largest && smallest);
	assert.ok(PI_RACCOON_MASCOT_SIZES.every((grid, index, all) => index === 0 || grid.length < (all[index - 1]?.length ?? 0)));

	const fullWidth = headerWidth("osdy-theme") + MASCOT_GAP + pixelGridWidth(largest);
	const full = raw(fullWidth, 40);
	assert.ok(full.join("\n").includes("\u001b[38;2;"), "pixel mascot uses truecolor half blocks");
	const style = asciiAnimationMode() === "off" ? "static" : "animated";
	const waveFrame = style === "animated" ? 0 : undefined;
	const mascotLines = renderPiMascot(fullWidth - headerWidth("osdy-theme") - MASCOT_GAP, 40,
		{ frame: 0, theme: { fg: (_color: string, text: string) => text }, style, waveFrame });
	assert.equal(mascotLines.length, Math.ceil(largest.length / 2));
	assert.deepEqual(plainHeader(full), plainHeader(ui.decorateHeaderVersion(composeSideBySide(
		mascotLines, pixelGridWidth(largest),
		[...HEADER_VARIANTS["osdy-theme"].header], fullWidth, headerWidth("osdy-theme"),
	), fullWidth, ui.loadInstalledPackageVersion())));

	for (const [width, rows] of [[40, 40], [fullWidth - 1, 40], [100, 12], [1, 1]] as const) {
		const lines = raw(width, rows);
		assert.ok(lines.every(line => visibleWidth(line) <= width), `${width}x${rows} stays in bounds`);
		const fits = PI_RACCOON_MASCOT_SIZES.find(grid =>
			pixelGridWidth(grid) <= compactMascotWidthBudget(width) && Math.ceil(grid.length / 2) <= Math.min(rows, STACKED_CONTENT_MAX_ROWS));
		const pixelRows = lines.filter(line => line.includes("\u001b[38;2;")).length;
		assert.ok(pixelRows <= Math.ceil((fits?.length ?? 0) / 2), `${width}x${rows} picks the largest fitting size`);
		if (fits) assert.ok(pixelRows > 0, `${width}x${rows} shows the raccoon`);
	}
	assert.ok(smallest.length <= 16);
});

void test("footer metadata is shown only when the native editor is effective", () => {
	assert.equal(shouldShowFooterMetadata(false), true);
	assert.equal(shouldShowFooterMetadata(true), false);
});

void test("neon header keeps the parsed 129 by 13 transparent tone structure", () => {
	assert.deepEqual(Object.keys(HEADER_VARIANTS), ["osdy-theme", "neon", "block-shadow", "slanted"]);
	const neon = scaleHeader("neon", 1_000, 100);
	assert.equal(neon.header.length, 13);
	const toneMap = neon.toneMap;
	assert.ok(toneMap);
	assert.equal(toneMap.length, 13);
	assert.equal(Array.from(neon.header[0] ?? "").length, 129);
	assert.equal(
		neon.header.reduce(
			(count, row) =>
				count + Array.from(row).filter((character) => character !== " ").length,
			0,
		),
		1121,
	);
	for (let row = 0; row < neon.header.length; row += 1) {
		const glyphs = Array.from(neon.header[row] ?? "");
		const tones: string[] = Array.from(toneMap[row] ?? "");
		assert.equal(glyphs.length, tones.length);
		for (let column = 0; column < glyphs.length; column += 1)
			if (glyphs[column] === " ") assert.equal(tones[column], " ");
	}
});

void test("neon header keeps white and black fixed while pink follows accent", () => {
	assert.deepEqual(HEADER_VARIANTS.neon.headerTonePalette, {
		b: "#FFFFFF",
		h: { kind: "theme", token: "accent" },
		l: { kind: "theme", token: "accent", dimmed: true },
		m: { kind: "theme", token: "accent", dimmed: true },
		d: "#12011B",
		p: { kind: "theme", token: "accent", dimmed: true },
		c: "#FFFFFF",
		v: "#FFFFFF",
	});
});

void test("selected headers render through foreground-only tone-map animation", () => {
	const ui = readFileSync(new URL("./ui.ts", import.meta.url), "utf8");
	const animation = readFileSync(new URL("./animation.ts", import.meta.url), "utf8");
	assert.match(ui, /const variant = HEADER_VARIANTS\[state\.headerVariant\];/);
	assert.match(ui, /variant\.headerMap,/);
	assert.match(ui, /variant\.headerTonePalette/);
	assert.match(animation, /return `\\u001B\[38;2;/);
	assert.doesNotMatch(animation, /\[48;/);
});

void test("mascot selection wires Bts art through the responsive renderer", () => {
	const ui = readFileSync(new URL("./ui.ts", import.meta.url), "utf8");

	assert.deepEqual(Object.keys(MASCOTS), ["current", "bts", "osdy-halloween"]);
	assert.ok(mascotForChoice("bts"));
	assert.match(ui, /const mascot = mascotForChoice\(choice\);/);
	assert.match(ui, /scaleMascot\(\s*mascot\.art,/);
});

void test("Current and Bts retain their original glyphs, tone maps, and palettes", () => {
	for (const [choice, fingerprint] of [
		["current", "5d399dc6d6cf7f88dce300ca224d157e23e21186b1991a4f57b65fe60c34d8ac"],
		["bts", "e2040efe00cf709b799834d5183ddae3273cfb515b8dfa0f63ae1b9c5def71ec"],
	] as const) {
		assert.equal(createHash("sha256").update(JSON.stringify(MASCOTS[choice])).digest("hex"), fingerprint);
	}
});

void test("Osdy-Halloween preserves Current's muzzle and tail beneath a fang-free cape", () => {
	const { art, tonePalette } = mascotForChoice("osdy-halloween");
	const current = MASCOTS.current.art;
	assert.deepEqual(art.mascot.slice(0, 17), current.mascot.slice(0, 17), "same ears, mask, eyes and snout");
	for (let row = 21; row < current.mascot.length; row++) {
		assert.equal(art.mascot[row]?.slice(44), current.mascot[row]?.slice(44), "original striped tail");
	}
	assert.notDeepEqual(art.mascot.slice(17), current.mascot.slice(17));
	assert.doesNotMatch(art.mascot.join("\n"), /▼/, "no fang tips");
	assert.doesNotMatch(art.mascot.slice(17, 20).join("\n"), /█/, "no fang stems on the muzzle");
	for (const row of [18, 19]) {
		for (const column of [22, 33]) {
			assert.equal(art.mascot[row]?.[column], current.mascot[row]?.[column], "original muzzle at removed fang positions");
		}
	}
	assert.equal(art.mascot.length, current.mascot.length);
	assert.deepEqual(art.mascot.map((row) => row.length), current.mascot.map((row) => row.length));
	assert.equal(art.mascot[17]?.[8], "▓", "raised collar stays in place");
	assert.equal(art.toneMap[17]?.[8], "d", "raised collar has a dark outer edge");
	assert.equal(art.mascot[20]?.[12], "▒", "collar lining stays in place");
	assert.equal(art.toneMap[20]?.[12], "b", "collar has crimson lining");
	assert.equal(tonePalette.b, "#9F2342");
	assert.equal(tonePalette.d, MASCOTS.current.tonePalette.d);
	for (const [width, rows] of [[100, 100], [48, 28], [32, 20], [1, 1]] as const) {
		const scaled = scaleMascot(art, width, rows);
		assert.ok(scaled.mascot.length <= rows);
		assert.equal(scaled.mascot.length, scaled.toneMap.length);
		assert.doesNotMatch(scaled.mascot.join("\n"), /▼/, "responsive art has no fang tips");
		if (width >= 32) {
			assert.ok(scaled.mascot.some((line, row) => [...line].some((glyph, column) => glyph === "▓" && scaled.toneMap[row]?.[column] === "d")), "dark cape survives responsive sampling");
			assert.ok(scaled.mascot.some((line, row) => [...line].some((glyph, column) => glyph === "▒" && scaled.toneMap[row]?.[column] === "b")), "crimson lining survives responsive sampling");
		}
		for (let row = 0; row < scaled.mascot.length; row++) {
			const glyphs = Array.from(scaled.mascot[row] ?? "");
			const tones = Array.from(scaled.toneMap[row] ?? "");
			assert.ok(visibleWidth(scaled.mascot[row] ?? "") <= width);
			assert.equal(glyphs.length, tones.length);
			for (let column = 0; column < glyphs.length; column++) {
				if (glyphs[column] !== " ") assert.ok(Object.keys(tonePalette).includes(tones[column] ?? ""));

			}
		}
	}
});

void test("Bts retains the 60 by 26 raccoon glyph structure and transparent tone cells", () => {
	const art = MASCOTS.bts.art;
	assert.equal(art.mascot.length, 26);
	assert.equal(Array.from(art.mascot[0] ?? "").length, 60);
	assert.equal(
		art.mascot.reduce(
			(count, row) =>
				count + Array.from(row).filter((character) => character !== " ").length,
			0,
		),
		682,
	);
	for (let row = 0; row < art.mascot.length; row += 1)
		for (
			let column = 0;
			column < Array.from(art.mascot[row] ?? "").length;
			column += 1
		)
			if (Array.from(art.mascot[row] ?? "")[column] === " ")
				assert.equal(Array.from(art.toneMap[row] ?? "")[column], " ");
});

void test("Bts receives the original right-edge glow", () => {
	const art = MASCOTS.bts.art;
	for (let row = 0; row < art.mascot.length; row += 1) {
		const glyphs = Array.from(art.mascot[row] ?? "");
		const tones = Array.from(art.toneMap[row] ?? "");
		const rightmost = glyphs
			.map((glyph, column) => ({ glyph, column }))
			.filter(({ glyph }) => glyph !== " ")
			.slice(-3)
			.reverse();
		assert.deepEqual(
			rightmost.map(({ column }) => tones[column]),
			["p", "c", "v"].slice(0, rightmost.length),
		);
	}
});

void test("mascot tone rendering never emits terminal background sequences", () => {
	const animation = readFileSync(
		new URL("./animation.ts", import.meta.url),
		"utf8",
	);

	assert.match(animation, /return `\\u001B\[38;2;/);
	assert.doesNotMatch(animation, /\[48;/);
});

void test("maximum thinking uses the existing extra-high theme color", () => {
	const source = readFileSync(new URL("./ui.ts", import.meta.url), "utf8");
	assert.match(source, /max:\s*"thinkingXhigh"/);
});

void test("renders the extended editor thinking level in bold", () => {
	const source = readFileSync(new URL("./ui.ts", import.meta.url), "utf8");
	assert.match(source, /theme\.bold\(thinkingLevel\)/);
});

void test("places a managed profile beside the model in simple mode and preserves its fallback", () => {
	assert.equal(
		profileLabel.resolveActiveProfileLabel({ OSDY_PI_PROFILE_NAME: "work" }),
		"work",
	);
	assert.equal(
		profileLabel.resolveActiveProfileLabel({ OSDY_PI_PROFILE_NAME: "WORK" }),
		"WORK",
	);
	assert.equal(
		profileLabel.resolveActiveProfileLabel({ OSDY_PI_PROFILE_NAME: "DEFAULT" }),
		undefined,
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

void test("extended editor shows the companion raccoon in its own accent box only when it fits and is enabled", (t) => {
	const color = (text: string) => `\u001b[33m${text}\u001b[39m`;
	const accent = (text: string) => `\u001b[35m${text}\u001b[39m`;
	const theme = {
		fg: (name: string, text: string) => name === "accent" ? accent(text) : color(text),
		bold: (text: string) => text,
	};
	const state: OsdyState = {
		codexUsage: { kind: "idle" }, enabled: true, editorEffective: true, editorMode: "extended",
		fallbackEditorFactory: undefined, headerVariant: "osdy-theme", mascot: "current", smallMode: false,
		tui: undefined, workingTreeEnabled: false, workingTreePlacement: "aboveEditor",
		working: { active: false, activity: "thinking", frame: 0 },
	};
	const ctx = { cwd: "/synthetic", ui: { theme }, model: { provider: "test", id: "test", contextWindow: 200000 },
		getContextUsage: () => ({ percent: 60 }), sessionManager: { getEntries: () => [] },
	} as unknown as ExtensionContext;
	const pi = { getThinkingLevel: () => "off" } as ExtensionAPI;
	const terminal = { rows: 40, columns: 120 };
	const tui = { terminal, requestRender: () => {} } as unknown as TUI;
	const editorTheme: EditorTheme = { borderColor: color, selectList: {
		selectedPrefix: color, selectedText: color, description: color, scrollInfo: color, noMatch: color,
	} };
	const editor = ui.createEditorComponent(pi, ctx, state)(tui, editorTheme, new KeybindingsManager());
	const hasCompanion = (lines: readonly string[]): boolean => lines.join("\n").includes("\u001b[38;2;");
	const compact = editor.render(40);

	const wide = editor.render(120);
	assert.ok(hasCompanion(wide));
	assert.ok(wide.every(line => visibleWidth(line) <= 120));
	assert.ok(wide[0]?.includes(accent("✦")), "companion frame starts its theme gradient at accent with a sparkle corner");
	assert.ok(wide[0]?.includes(accent("Pixel Pal")), "companion name tab uses the theme accent");
	assert.ok(wide[0]?.trimEnd().endsWith(accent("✦")), "both top corners are sparkles");
	const editorTop = wide.findIndex(line => line.includes(color("╭")));
	const editorBottom = wide.findIndex(line => line.includes(color("╰")));
	assert.ok(editorTop > 0, "the taller companion box starts above the editor frame");
	assert.ok(wide[editorBottom]?.includes(color("╰")) && wide[editorBottom]?.endsWith(color("╯")), "both frames share the bottom row");
	assert.ok(visibleWidth((wide[editorTop] ?? "").split(color("╮"))[0] ?? "") < 120 - 26);

	const idleFrame = editor.render(120).join("\n");
	const busyFrames = new Set(
		Array.from({ length: 12 }, (_, frame) => {
			state.working = { active: true, activity: "working", frame };
			return editor.render(120).join("\n");
		}),
	);
	assert.ok(busyFrames.size > 1);
	assert.ok(!busyFrames.has(idleFrame));

	state.working = { active: false, activity: "thinking", frame: 0 };
	const original = editor.render(120).join("\n");
	state.companionStyle = "drawn";
	const drawn = editor.render(120).join("\n");
	assert.ok(hasCompanion(drawn.split("\n")));
	assert.notEqual(drawn, original, "the Hand-drawn style swaps the raccoon");
	delete state.companionStyle;
	terminal.rows = 27;
	assert.ok(!hasCompanion(editor.render(120)));
	terminal.rows = 28;
	assert.ok(hasCompanion(editor.render(74)));
	assert.ok(!hasCompanion(editor.render(73)));
	assert.ok(!hasCompanion(editor.render(60)), "narrow terminals keep the plain editor");
	terminal.rows = 20;
	assert.ok(!hasCompanion(editor.render(120)), "short terminals keep the plain editor");
	terminal.rows = 40;
	state.companionEnabled = false;
	assert.ok(!hasCompanion(editor.render(120)));
	assert.equal(editor.render(40).join("\n"), compact.join("\n"));
	state.companionEnabled = true;
	state.smallMode = true;
	assert.ok(!hasCompanion(editor.render(120)));
	state.smallMode = false;
	assert.ok(hasCompanion(editor.render(120)));
	t.mock.method(editor, "isShowingAutocomplete", () => true);
	assert.ok(!hasCompanion(editor.render(120)), "autocomplete keeps the native full-width editor");
});

void test("one real editor instance and native footer read live/final speed with ANSI-safe resizing", () => {
	const color = (text: string) => `\u001b[33m${text}\u001b[39m`;
	const theme = { fg: (_name: string, text: string) => color(text), bold: (text: string) => text };
	const state: OsdyState = {
		codexUsage: { kind: "idle" }, enabled: true, editorEffective: true, editorMode: "extended",
		fallbackEditorFactory: undefined, headerVariant: "osdy-theme", mascot: "current", smallMode: false,
		tui: undefined, workingTreeEnabled: false, workingTreePlacement: "aboveEditor",
		generation: { kind: "streaming", tokensPerSecond: 42.3 },
	};
	const ctx = { cwd: "/synthetic", ui: { theme }, model: { provider: "test", id: "test", contextWindow: 200000 },
		getContextUsage: () => ({ percent: 60 }), sessionManager: { getEntries: () => [] },
	} as unknown as ExtensionContext;
	const pi = { getThinkingLevel: () => "off" } as ExtensionAPI;
	const tui = { terminal: { rows: 40, columns: 120 }, requestRender: () => {} } as unknown as TUI;
	const editorTheme: EditorTheme = { borderColor: color, selectList: {
		selectedPrefix: color, selectedText: color, description: color, scrollInfo: color, noMatch: color,
	} };
	const editor = ui.createEditorComponent(pi, ctx, state)(tui, editorTheme, new KeybindingsManager());
	for (const reading of [
		{ kind: "streaming", tokensPerSecond: 42.3 }, { kind: "complete", tokensPerSecond: 50 },
		{ kind: "streaming", tokensPerSecond: null }, { kind: "unavailable" },
	] as const) {
		state.generation = reading;
		const expected = reading.kind === "complete" ? "50.0 tok/s" : reading.kind === "unavailable" ? "tok/s —"
			: reading.tokensPerSecond === null ? "tok/s …" : "≈42.3 tok/s";
		assert.ok(editor.render(120).join("\n").includes(expected));
		for (const width of [4, 15, 30, 48, 80, 120]) {
			assert.ok(editor.render(width).every(line => visibleWidth(line) <= width));
		}
		state.editorEffective = false;
		const footer = ui.createFooterComponent(pi, ctx, state, {
			getGitBranch: () => null, getExtensionStatuses: () => new Map(),
			getAvailableProviderCount: () => 1, onBranchChange: () => () => {},
		}, theme);
		assert.ok(footer.render(120).join("\n").includes(expected));
		assert.doesNotMatch(footer.render(120).join("\n"), /tok ↑/);
		assert.ok(footer.render(30).every(line => visibleWidth(line) <= 30));
		state.editorEffective = true;
	}
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

void test("header and mascot keep four blank columns between them", () => {
	assert.deepEqual(composeSideBySide(["AA", "AA"], 2, ["BB", "BB"], 8, 2), ["AA    BB", "AA    BB"]);
	// Without room for the gap, only the mascot remains, as before.
	assert.deepEqual(composeSideBySide(["AA"], 2, ["BB"], 7, 2), ["BB"]);
});

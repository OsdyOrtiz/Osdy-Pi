import assert from "node:assert/strict";
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
	mascot: keyof typeof MASCOTS,
	width: number,
	rows: number,
	columns = width,
): string[] {
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

void test("footer metadata is shown only when the native editor is effective", () => {
	assert.equal(shouldShowFooterMetadata(false), true);
	assert.equal(shouldShowFooterMetadata(true), false);
});

void test("neon header keeps the parsed 129 by 13 transparent tone structure", () => {
	assert.deepEqual(Object.keys(HEADER_VARIANTS), ["osdy-theme", "neon"]);
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
	assert.match(ui, /const mascot = mascotForChoice\(state\.mascot\);/);
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

void test("Osdy-Halloween preserves Current's face and tail beneath a bounded vampire costume", () => {
	const { art, tonePalette } = mascotForChoice("osdy-halloween");
	const current = MASCOTS.current.art;
	assert.deepEqual(art.mascot.slice(0, 17), current.mascot.slice(0, 17), "same ears, mask, eyes and snout");
	for (let row = 21; row < current.mascot.length; row++) {
		assert.equal(art.mascot[row]?.slice(44), current.mascot[row]?.slice(44), "original striped tail");
	}
	assert.notDeepEqual(art.mascot.slice(17), current.mascot.slice(17));
	const fangs = art.mascot.slice(17, 20).join("\n");
	assert.match(fangs, /▼[^▼\n]+▼/, "two ivory fang tips separated by the original muzzle");
	assert.equal([...fangs].filter((glyph) => glyph === "▼").length, 2, "one-column fang tips");
	assert.equal([...fangs].filter((glyph) => glyph === "█").length, 2, "one-column stems keep fangs two rows tall");
	assert.equal(art.mascot.length, current.mascot.length);
	assert.deepEqual(art.mascot.map((row) => row.length), current.mascot.map((row) => row.length));
	assert.equal(art.toneMap[17]?.[8], "d", "raised collar has a dark outer edge");
	assert.equal(art.toneMap[20]?.[12], "b", "collar has crimson lining");
	assert.equal(tonePalette.b, "#9F2342");
	assert.equal(tonePalette.d, MASCOTS.current.tonePalette.d);
	for (const [width, rows] of [[100, 100], [48, 28], [32, 20], [1, 1]] as const) {
		const scaled = scaleMascot(art, width, rows);
		assert.ok(scaled.mascot.length <= rows);
		assert.equal(scaled.mascot.length, scaled.toneMap.length);
		if (width >= 32) assert.match(scaled.mascot.join("\n"), /▼+[^▼\n]+▼+/, "both fangs survive responsive sampling");
		for (let row = 0; row < scaled.mascot.length; row++) {
			const glyphs = Array.from(scaled.mascot[row] ?? "");
			const tones = Array.from(scaled.toneMap[row] ?? "");
			assert.ok(visibleWidth(scaled.mascot[row] ?? "") <= width);
			assert.equal(glyphs.length, tones.length);
			for (let column = 0; column < glyphs.length; column++) {
				if (glyphs[column] !== " ") assert.ok(Object.keys(tonePalette).includes(tones[column] ?? ""));
				if (glyphs[column] === "▼") assert.equal(tones[column], "h", "fangs retain ivory rather than glow/lining tones");
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

import assert from "node:assert/strict";
import test from "node:test";
import {
	createEditorSettingsStore,
	normalizeEditorSettings,
	type EditorSettingsFileSystem,
	// @ts-expect-error Node's native TypeScript runner resolves test-only TypeScript source imports.
} from "./editor-settings.ts";
import {
	EDITOR_MODES,
	HEADER_VARIANT_CHOICES,
	MASCOT_CHOICES,
	// @ts-expect-error Node's native TypeScript runner resolves test-only TypeScript source imports.
} from "./types.ts";

class MemoryEditorSettingsFileSystem implements EditorSettingsFileSystem {
	content: string | undefined;
	mkdirPaths: string[] = [];
	writePaths: string[] = [];
	renameCalls: Array<[string, string]> = [];

	mkdir(directory: string): Promise<void> {
		this.mkdirPaths.push(directory);
		return Promise.resolve();
	}

	readFile(): Promise<string> {
		return this.content === undefined
			? Promise.reject(new Error("missing settings"))
			: Promise.resolve(this.content);
	}

	rename(source: string, destination: string): Promise<void> {
		this.renameCalls.push([source, destination]);
		this.content = this.pendingContent;
		return Promise.resolve();
	}

	writeFile(filePath: string, content: string): Promise<void> {
		this.writePaths.push(filePath);
		this.pendingContent = content;
		return Promise.resolve();
	}

	private pendingContent = "";
}

void test("visual-only preference defaults on for old v1 files and round-trips independently of legacy master", async () => {
	for (const value of [undefined, null, "false", 0]) {
		assert.equal(normalizeEditorSettings({ version: 1, visualsEnabled: value }).visualsEnabled ?? true, true);
	}
	const fs = new MemoryEditorSettingsFileSystem();
	const store = createEditorSettingsStore("/agent/extensions/osdy-pi/settings.json", fs);
	for (const enabled of [true, false]) for (const visualsEnabled of [true, false]) {
		const settings = { ...normalizeEditorSettings({ version: 1 }), enabled, visualsEnabled, headerVariant: "neon" as const, mascot: "bts" as const };
		await store.save(settings);
		assert.deepEqual(await store.load(), settings);
	}
});

void test("companion preference is kept only when boolean and round-trips false", async () => {
	for (const value of [undefined, null, "false", 0]) {
		assert.equal("companionEnabled" in normalizeEditorSettings({ version: 1, companionEnabled: value }), false);
	}
	const fs = new MemoryEditorSettingsFileSystem();
	const store = createEditorSettingsStore("/agent/extensions/osdy-pi/settings.json", fs);
	for (const companionEnabled of [true, false]) {
		const settings = { ...normalizeEditorSettings({ version: 1 }), companionEnabled };
		await store.save(settings);
		assert.deepEqual(await store.load(), settings);
	}
});

void test("companion style is kept only when known and round-trips", async () => {
	for (const value of [undefined, null, "pixel", "simple", 1]) {
		assert.equal("companionStyle" in normalizeEditorSettings({ version: 1, companionStyle: value }), false);
	}
	const fs = new MemoryEditorSettingsFileSystem();
	const store = createEditorSettingsStore("/agent/extensions/osdy-pi/settings.json", fs);
	for (const companionStyle of ["original", "drawn", "rounded", "terminal", "slim", "slim-small"] as const) {
		const settings = { ...normalizeEditorSettings({ version: 1 }), companionStyle };
		await store.save(settings);
		assert.deepEqual(await store.load(), settings);
	}
});

void test("withdrawn companion style falls back to Original without writes or changing sibling settings", async () => {
	for (const [companionEnabled, withdrawn] of [
		[true, "simple"], [false, "simple"], [true, "mini"], [false, "micro"], [true, "terminal-mini"],
	] as const) {
		const expected = {
			version: 1, enabled: true, visualsEnabled: false, editorMode: "simple" as const,
			workingTreeEnabled: false, headerVariant: "neon" as const, mascot: "pi" as const, companionEnabled,
		};
		const raw = { ...expected, companionStyle: withdrawn };
		const fs = new MemoryEditorSettingsFileSystem();
		fs.content = JSON.stringify(raw);
		const before = fs.content;
		const store = createEditorSettingsStore("/agent/extensions/osdy-pi/settings.json", fs);
		const loaded = await store.load();
		assert.equal(loaded.companionStyle ?? "original", "original");
		assert.deepEqual(loaded, expected);
		assert.deepEqual(normalizeEditorSettings(raw), expected);
		assert.equal(loaded.companionEnabled, companionEnabled);
		assert.equal(fs.content, before);
		assert.deepEqual(fs.writePaths, []);
		assert.deepEqual(fs.renameCalls, []);
	}
});

void test("failed visual preference replacement preserves persisted settings", async () => {
	const fs = new MemoryEditorSettingsFileSystem();
	const store = createEditorSettingsStore("/agent/extensions/osdy-pi/settings.json", fs);
	const before = { ...normalizeEditorSettings({ version: 1 }), visualsEnabled: true };
	await store.save(before);
	fs.rename = () => Promise.reject(new Error("disk full"));
	await assert.rejects(store.save({ ...before, visualsEnabled: false }), /disk full/);
	assert.deepEqual(await store.load(), before);
});

void test("editor settings preserve version-one header choices and fall back safely", async () => {
	assert.deepEqual(HEADER_VARIANT_CHOICES, ["osdy-theme", "neon", "block-shadow", "slanted"]);
	assert.equal(
		normalizeEditorSettings({ version: 1 }).headerVariant,
		"slanted",
	);
	assert.equal(
		normalizeEditorSettings({ version: 1, headerVariant: "classic" })
			.headerVariant,
		"slanted",
	);
	assert.equal(
		normalizeEditorSettings({ version: 1, headerVariant: "invalid" })
			.headerVariant,
		"slanted",
	);

	const fileSystem = new MemoryEditorSettingsFileSystem();
	const store = createEditorSettingsStore(
		"/agent/extensions/osdy-pi/settings.json",
		fileSystem,
	);
	await store.save({
		version: 1,
		enabled: true,
		editorMode: EDITOR_MODES.AUTO,
		workingTreeEnabled: true,
		headerVariant: "neon",
		mascot: "current",
	});
	assert.equal((await store.load()).headerVariant, "neon");
	await store.save({ ...(await store.load()), headerVariant: "block-shadow" });
	assert.equal((await store.load()).headerVariant, "block-shadow");
	assert.equal(
		normalizeEditorSettings({ version: 1, headerVariant: "block-shadow" }).headerVariant,
		"block-shadow",
	);
	await store.save({ ...(await store.load()), headerVariant: "slanted" });
	assert.equal((await store.load()).headerVariant, "slanted");
	assert.equal(
		normalizeEditorSettings({ version: 1, headerVariant: "slanted" }).headerVariant,
		"slanted",
	);
});

void test("editor settings normalize only supported versioned modes", () => {
	for (const [input, editorMode] of [
		[{ version: 1, editorMode: "simple" }, EDITOR_MODES.SIMPLE],
		[{ version: 1, editorMode: "invalid" }, EDITOR_MODES.AUTO],
		[{ version: 2, editorMode: "extended" }, EDITOR_MODES.AUTO],
		[null, EDITOR_MODES.AUTO],
	] as const) {
		assert.deepEqual(normalizeEditorSettings(input), {
			version: 1,
			enabled: true,
			editorMode,
			workingTreeEnabled: true,
			headerVariant: "slanted",
			mascot: "pi",
		});
	}
});

void test("Slanted header and Hoodie Pi are the defaults while saved choices are kept", () => {
	const defaults = normalizeEditorSettings({ version: 1 });
	assert.equal(defaults.headerVariant, "slanted");
	assert.equal(defaults.mascot, "pi");
	assert.equal(defaults.companionEnabled, undefined, "companion stays on by default");
	assert.equal(defaults.companionStyle, undefined, "companion stays Pixel Pal by default");
	assert.equal(normalizeEditorSettings({ version: 1, headerVariant: "invalid" }).headerVariant, "slanted");
	const saved = normalizeEditorSettings({ version: 1, headerVariant: "osdy-theme", mascot: "current" });
	assert.equal(saved.headerVariant, "osdy-theme");
	assert.equal(saved.mascot, "current");
});

void test("mascot choices default to Hoodie Pi, migrate raccoon to Bts, and persist Bts", async () => {
	assert.deepEqual(MASCOT_CHOICES, ["current", "bts", "osdy-halloween", "pi"]);
	assert.equal(normalizeEditorSettings({ version: 1, mascot: "pi" }).mascot, "pi");
	assert.equal(
		normalizeEditorSettings({ version: 1, mascot: "invalid" }).mascot,
		"pi",
	);
	assert.equal(
		normalizeEditorSettings({ version: 1, mascot: "raccoon" }).mascot,
		"bts",
	);
	for (const mascot of ["detective", "explorer"] as const) {
		assert.equal(
			normalizeEditorSettings({ version: 1, mascot }).mascot,
			"pi",
		);
	}

	const fileSystem = new MemoryEditorSettingsFileSystem();
	const store = createEditorSettingsStore(
		"/agent/extensions/osdy-pi/settings.json",
		fileSystem,
	);
	await store.save({
		version: 1,
		enabled: true,
		editorMode: EDITOR_MODES.AUTO,
		workingTreeEnabled: true,
		headerVariant: "neon",
		mascot: "bts",
	});
	assert.equal((await store.load()).mascot, "bts");
});

void test("Osdy-Halloween round-trips through a fresh version-one settings store", async () => {
	const fileSystem = new MemoryEditorSettingsFileSystem();
	const path = "/agent/extensions/osdy-pi/settings.json";
	const settings = normalizeEditorSettings({ version: 1, mascot: "osdy-halloween" });
	assert.equal(settings.mascot, "osdy-halloween");
	await createEditorSettingsStore(path, fileSystem).save(settings);
	const persisted: unknown = JSON.parse(fileSystem.content ?? "{}");
	assert.deepEqual(persisted, { ...settings, version: 1 });
	assert.deepEqual(await createEditorSettingsStore(path, fileSystem).load(), settings);
	assert.equal(normalizeEditorSettings({ version: 2, mascot: "osdy-halloween" }).mascot, "pi");
});

void test("enabled defaults safely and persists globally", async () => {
	assert.equal(
		normalizeEditorSettings({ version: 1, editorMode: "simple" }).enabled,
		true,
	);
	assert.equal(
		normalizeEditorSettings({ version: 1, enabled: "no" }).enabled,
		true,
	);

	const fileSystem = new MemoryEditorSettingsFileSystem();
	const store = createEditorSettingsStore(
		"/agent/extensions/osdy-pi/settings.json",
		fileSystem,
	);
	await store.save({
		version: 1,
		enabled: false,
		editorMode: EDITOR_MODES.SIMPLE,
		workingTreeEnabled: false,
		headerVariant: "osdy-theme",
		mascot: "current",
	});
	assert.deepEqual(await store.load(), {
		version: 1,
		enabled: false,
		editorMode: EDITOR_MODES.SIMPLE,
		workingTreeEnabled: false,
		headerVariant: "osdy-theme",
		mascot: "current",
	});
});

void test("working-tree visibility defaults safely and persists globally", async () => {
	assert.equal(
		normalizeEditorSettings({
			version: 1,
			editorMode: "auto",
			workingTreeEnabled: false,
		}).workingTreeEnabled,
		false,
	);
	assert.equal(
		normalizeEditorSettings({
			version: 1,
			editorMode: "auto",
			workingTreeEnabled: "disabled",
		}).workingTreeEnabled,
		true,
	);

	const fileSystem = new MemoryEditorSettingsFileSystem();
	const firstStore = createEditorSettingsStore(
		"/agent/extensions/osdy-pi/settings.json",
		fileSystem,
	);
	await firstStore.save({
		version: 1,
		enabled: true,
		editorMode: EDITOR_MODES.AUTO,
		workingTreeEnabled: false,
		headerVariant: "osdy-theme",
		mascot: "current",
	});
	const reloadedStore = createEditorSettingsStore(
		"/agent/extensions/osdy-pi/settings.json",
		fileSystem,
	);
	assert.equal((await reloadedStore.load()).workingTreeEnabled, false);
});

void test("editor settings load safely and save atomically", async () => {
	const fileSystem = new MemoryEditorSettingsFileSystem();
	const store = createEditorSettingsStore(
		"/agent/extensions/osdy-pi/settings.json",
		fileSystem,
	);

	assert.equal((await store.load()).editorMode, EDITOR_MODES.AUTO);
	assert.equal((await store.load()).workingTreeEnabled, true);
	fileSystem.content = JSON.stringify({ version: 1, editorMode: "extended" });
	assert.equal((await store.load()).editorMode, EDITOR_MODES.EXTENDED);
	assert.equal((await store.load()).workingTreeEnabled, true);
	fileSystem.content = "{ invalid JSON";
	assert.equal((await store.load()).workingTreeEnabled, true);

	await store.save({
		version: 1,
		enabled: true,
		editorMode: EDITOR_MODES.SIMPLE,
		workingTreeEnabled: true,
		headerVariant: "osdy-theme",
		mascot: "current",
	});
	assert.deepEqual(fileSystem.mkdirPaths, ["/agent/extensions/osdy-pi"]);
	assert.deepEqual(fileSystem.writePaths, [
		"/agent/extensions/osdy-pi/settings.json.tmp",
	]);
	assert.deepEqual(fileSystem.renameCalls, [
		[
			"/agent/extensions/osdy-pi/settings.json.tmp",
			"/agent/extensions/osdy-pi/settings.json",
		],
	]);
	assert.equal((await store.load()).editorMode, EDITOR_MODES.SIMPLE);
});

void test("new editor settings stores load their own persisted mode", async () => {
	const fileSystem = new MemoryEditorSettingsFileSystem();
	fileSystem.content = JSON.stringify({ version: 1, editorMode: "auto" });
	const firstStore = createEditorSettingsStore(
		"/agent/extensions/osdy-pi/settings.json",
		fileSystem,
	);
	assert.equal((await firstStore.load()).editorMode, EDITOR_MODES.AUTO);

	await firstStore.save({
		version: 1,
		enabled: true,
		editorMode: EDITOR_MODES.EXTENDED,
		workingTreeEnabled: true,
		headerVariant: "osdy-theme",
		mascot: "current",
	});
	const reloadedStore = createEditorSettingsStore(
		"/agent/extensions/osdy-pi/settings.json",
		fileSystem,
	);
	assert.equal((await reloadedStore.load()).editorMode, EDITOR_MODES.EXTENDED);
});

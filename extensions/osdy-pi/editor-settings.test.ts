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

void test("editor settings preserve version-one header choices and fall back safely", async () => {
	assert.deepEqual(HEADER_VARIANT_CHOICES, ["osdy-theme", "neon"]);
	assert.equal(
		normalizeEditorSettings({ version: 1 }).headerVariant,
		"osdy-theme",
	);
	assert.equal(
		normalizeEditorSettings({ version: 1, headerVariant: "classic" })
			.headerVariant,
		"osdy-theme",
	);
	assert.equal(
		normalizeEditorSettings({ version: 1, headerVariant: "invalid" })
			.headerVariant,
		"osdy-theme",
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
			headerVariant: "osdy-theme",
			mascot: "current",
		});
	}
});

void test("mascot choices preserve the version-one current default, migrate raccoon to Bts, and persist Bts", async () => {
	assert.deepEqual(MASCOT_CHOICES, ["current", "bts"]);
	assert.equal(
		normalizeEditorSettings({ version: 1, mascot: "invalid" }).mascot,
		"current",
	);
	assert.equal(
		normalizeEditorSettings({ version: 1, mascot: "raccoon" }).mascot,
		"bts",
	);
	for (const mascot of ["detective", "explorer"] as const) {
		assert.equal(
			normalizeEditorSettings({ version: 1, mascot }).mascot,
			"current",
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

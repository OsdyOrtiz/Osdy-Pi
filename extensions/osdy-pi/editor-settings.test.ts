import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Node's native TypeScript runner resolves test-only TypeScript source imports.
import { createEditorSettingsStore, normalizeEditorSettings, type EditorSettingsFileSystem } from "./editor-settings.ts";
// @ts-expect-error Node's native TypeScript runner resolves test-only TypeScript source imports.
import { EDITOR_MODES } from "./types.ts";

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

void test("editor settings normalize only supported versioned modes", () => {
	assert.deepEqual(normalizeEditorSettings({ version: 1, editorMode: "simple" }), {
		version: 1,
		editorMode: EDITOR_MODES.SIMPLE,
	});
	assert.deepEqual(normalizeEditorSettings({ version: 1, editorMode: "invalid" }), {
		version: 1,
		editorMode: EDITOR_MODES.AUTO,
	});
	assert.deepEqual(normalizeEditorSettings({ version: 2, editorMode: "extended" }), {
		version: 1,
		editorMode: EDITOR_MODES.AUTO,
	});
	assert.deepEqual(normalizeEditorSettings(null), {
		version: 1,
		editorMode: EDITOR_MODES.AUTO,
	});
});

void test("editor settings load safely and save atomically", async () => {
	const fileSystem = new MemoryEditorSettingsFileSystem();
	const store = createEditorSettingsStore("/agent/extensions/osdy-pi/settings.json", fileSystem);

	assert.equal((await store.load()).editorMode, EDITOR_MODES.AUTO);
	fileSystem.content = JSON.stringify({ version: 1, editorMode: "extended" });
	assert.equal((await store.load()).editorMode, EDITOR_MODES.EXTENDED);

	await store.save({ version: 1, editorMode: EDITOR_MODES.SIMPLE });
	assert.deepEqual(fileSystem.mkdirPaths, ["/agent/extensions/osdy-pi"]);
	assert.deepEqual(fileSystem.writePaths, ["/agent/extensions/osdy-pi/settings.json.tmp"]);
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
	const firstStore = createEditorSettingsStore("/agent/extensions/osdy-pi/settings.json", fileSystem);
	assert.equal((await firstStore.load()).editorMode, EDITOR_MODES.AUTO);

	await firstStore.save({ version: 1, editorMode: EDITOR_MODES.EXTENDED });
	const reloadedStore = createEditorSettingsStore(
		"/agent/extensions/osdy-pi/settings.json",
		fileSystem,
	);
	assert.equal((await reloadedStore.load()).editorMode, EDITOR_MODES.EXTENDED);
});

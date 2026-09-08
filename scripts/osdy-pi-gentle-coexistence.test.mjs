import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
	configureGentleCoexistence,
	reconcileGentlePackages,
} from "./osdy-pi-gentle-coexistence.mjs";

const REQUIRED_EXTENSIONS = ["gentle-todo.ts", "gentle-agents.ts"];

async function createGentleSource(root) {
	const source = join(root, "gentle-pi");
	await mkdir(join(source, "extensions"), { recursive: true });
	await writeFile(
		join(source, "package.json"),
		JSON.stringify({ name: "gentle-pi" }),
	);
	await Promise.all(
		REQUIRED_EXTENSIONS.map((extension) =>
			writeFile(join(source, "extensions", extension), "export {};\n"),
		),
	);
	return source;
}

test("reconciles Gentle before the first Osdy package while preserving unrelated package order", async () => {
	const root = await mkdtemp(join(tmpdir(), "osdy-pi-gentle-"));
	const source = await createGentleSource(root);
	const result = reconcileGentlePackages(
		{
			theme: "osdy-pi-dark",
			packages: [
				"npm:pi-subagents-j0k3r",
				"npm:gentle-pi@2.5.0",
				{ source: "npm:gentle-pi@2.5.0" },
				{ source, extensions: ["extensions/gentle-shell.ts"] },
				"npm:@juicesharp/rpiv-todo",
				"GIT:github.com/OsdyOrtiz/Osdy-Pi",
				"npm:@juicesharp/rpiv-ask-user-question",
				{ source: "npm:OSDY-PI@1.2.0" },
			],
		},
		source,
	);

	assert.equal(result.changed, true);
	assert.deepEqual(result.settings, {
		theme: "osdy-pi-dark",
		packages: [
			"npm:pi-subagents-j0k3r",
			"npm:@juicesharp/rpiv-todo",
			{
				source,
				extensions: ["-extensions/gentle-todo.ts", "-extensions/gentle-agents.ts"],
				themes: [],
			},
			"GIT:github.com/OsdyOrtiz/Osdy-Pi",
			"npm:@juicesharp/rpiv-ask-user-question",
			{ source: "npm:OSDY-PI@1.2.0" },
		],
	});
});

test("places Gentle before a case-insensitive npm Osdy package", () => {
	const source = "/absolute/gentle-pi";
	const result = reconcileGentlePackages(
		{ packages: ["npm:pi-subagents-j0k3r", "NPM:OSDY-PI@1.2.0"] },
		source,
	);

	assert.deepEqual(result.settings.packages, [
		"npm:pi-subagents-j0k3r",
		{
			source,
			extensions: ["-extensions/gentle-todo.ts", "-extensions/gentle-agents.ts"],
			themes: [],
		},
		"NPM:OSDY-PI@1.2.0",
	]);
});

test("appends Gentle when no Osdy package is configured", () => {
	const source = "/absolute/gentle-pi";
	const result = reconcileGentlePackages(
		{ packages: ["npm:pi-subagents-j0k3r"] },
		source,
	);

	assert.deepEqual(result.settings.packages, [
		"npm:pi-subagents-j0k3r",
		{
			source,
			extensions: ["-extensions/gentle-todo.ts", "-extensions/gentle-agents.ts"],
			themes: [],
		},
	]);
});

test("does not require a rewrite when settings are already canonical", () => {
	const source = "/absolute/gentle-pi";
	const settings = {
		packages: [
			"npm:pi-subagents-j0k3r",
			{
				source,
				extensions: ["-extensions/gentle-todo.ts", "-extensions/gentle-agents.ts"],
				themes: [],
			},
			"npm:osdy-pi",
		],
	};

	const result = reconcileGentlePackages(settings, source);
	assert.equal(result.changed, false);
	assert.equal(result.settings, settings);
});

test("creates missing settings atomically after validating the Gentle source", async () => {
	const root = await mkdtemp(join(tmpdir(), "osdy-pi-gentle-"));
	const source = await createGentleSource(root);
	const settingsPath = join(root, "agent", "settings.json");

	const result = await configureGentleCoexistence(source, { settingsPath });

	assert.equal(result.status, "configured");
	const settings = JSON.parse(await readFile(settingsPath, "utf8"));
	assert.deepEqual(settings.packages.at(-1), {
		source,
		extensions: ["-extensions/gentle-todo.ts", "-extensions/gentle-agents.ts"],
		themes: [],
	});
	assert.equal(
		(await configureGentleCoexistence(source, { settingsPath })).status,
		"already configured",
	);
});

test("rejects malformed settings without overwriting them", async () => {
	const root = await mkdtemp(join(tmpdir(), "osdy-pi-gentle-"));
	const source = await createGentleSource(root);
	const settingsPath = join(root, "settings.json");
	await writeFile(settingsPath, "{ invalid json");

	await assert.rejects(
		configureGentleCoexistence(source, { settingsPath }),
		/settings.json is not valid JSON/,
	);
	assert.equal(await readFile(settingsPath, "utf8"), "{ invalid json");
});

test("rejects non-object roots and non-array packages without overwriting", async () => {
	const root = await mkdtemp(join(tmpdir(), "osdy-pi-gentle-"));
	const source = await createGentleSource(root);
	for (const [name, content, message] of [
		["array.json", "[]", /must contain an object/],
		["packages.json", '{"packages":{}}', /packages must be an array/],
	]) {
		const settingsPath = join(root, name);
		await writeFile(settingsPath, content);
		await assert.rejects(
			configureGentleCoexistence(source, { settingsPath }),
			message,
		);
		assert.equal(await readFile(settingsPath, "utf8"), content);
	}
});

test("rejects a source missing a required extension before settings mutation", async () => {
	const root = await mkdtemp(join(tmpdir(), "osdy-pi-gentle-"));
	const source = await createGentleSource(root);
	const settingsPath = join(root, "settings.json");
	await writeFile(settingsPath, '{"packages":[]}\n');

	await assert.rejects(
		configureGentleCoexistence(source, {
			settingsPath,
			fileSystem: {
				access: async (filePath) => {
					if (filePath.endsWith("gentle-todo.ts")) throw new Error("not readable");
				},
			},
		}),
		/Gentle extension is not readable/,
	);
	assert.equal(await readFile(settingsPath, "utf8"), '{"packages":[]}\n');
});

import assert from "node:assert/strict";
import {
	lstat,
	mkdir,
	mkdtemp,
	readFile,
	realpath,
	symlink,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
	configureOsdyPiSetup,
	reconcileSetupSettings,
} from "./osdy-pi-setup.mjs";

const EXPECTED_PACKAGES = [
	"npm:gentle-engram@0.1.12",
	"npm:pi-intercom@0.13.0",
	"npm:@juicesharp/rpiv-ask-user-question@2.10.1",
	"npm:pi-web-access@0.29.0",
	"npm:pi-lens@4.2.0",
	"npm:pi-btw@0.5.0",
	"npm:@open-pets/pi@3.3.0",
	{
		source:
			"git:github.com/Gentleman-Programming/gentle-pi@2b579c80824e83442b8ae9f7bfad629a52f9f711",
		extensions: ["-extensions/gentle-todo.ts", "-extensions/gentle-agents.ts"],
		themes: [],
	},
	"npm:pi-playwright@0.1.1",
	"npm:pi-mcp-adapter@2.34.0",
	"npm:osdy-pi@1.2.0",
];

test("normalizes managed packages while preserving unrelated settings and packages", () => {
	const unrelatedPackage = { source: "npm:team-tools@4.0.0", skills: [] };
	const existing = {
		quietStartup: true,
		terminal: { clearOnShrink: true },
		packages: [
			"npm:team-before@1.0.0",
			"npm:gentle-engram",
			"npm:gentle-engram@0.1.11",
			{ source: "/local/gentle-pi" },
			unrelatedPackage,
			"git:github.com/OsdyOrtiz/Osdy-Pi",
		],
	};

	const result = reconcileSetupSettings(existing);

	assert.equal(result.changed, true);
	assert.equal(result.settings.quietStartup, true);
	assert.deepEqual(result.settings.terminal, {
		clearOnShrink: true,
		showImages: true,
		showTerminalProgress: true,
	});
	assert.deepEqual(result.settings.packages, [
		"npm:team-before@1.0.0",
		unrelatedPackage,
		...EXPECTED_PACKAGES,
	]);
	assert.equal(result.settings.defaultProvider, "openai-codex");
	assert.equal(result.settings.defaultModel, "gpt-5.6-sol");
	assert.equal(result.settings.defaultThinkingLevel, "xhigh");
	assert.equal(result.settings.theme, "osdy-pi-tokyo-night");
	assert.equal(result.settings.tuiMode, "fullscreen");
});

test("creates only portable configuration and is byte-idempotent", async () => {
	const root = await mkdtemp(join(tmpdir(), "osdy-pi-setup-"));
	const agentDir = join(root, "agent");

	const first = await configureOsdyPiSetup({ agentDir });
	const paths = {
		settings: join(agentDir, "settings.json"),
		subagents: join(agentDir, "subagents.json"),
		osdy: join(agentDir, "extensions", "osdy-pi", "settings.json"),
	};
	const before = await Promise.all(
		Object.values(paths).map((path) => readFile(path, "utf8")),
	);
	const second = await configureOsdyPiSetup({ agentDir });
	const after = await Promise.all(
		Object.values(paths).map((path) => readFile(path, "utf8")),
	);

	assert.equal(first.status, "configured");
	assert.equal(second.status, "already configured");
	assert.deepEqual(after, before);
	assert.equal(JSON.parse(before[1]).model_profiles.worker.model, "openai-codex/gpt-5.6-terra");
	assert.deepEqual(JSON.parse(before[2]), {
		version: 1,
		enabled: true,
		editorMode: "extended",
		workingTreeEnabled: false,
		headerVariant: "osdy-theme",
		mascot: "current",
	});
	for (const excluded of [
		"auth.json",
		"sessions",
		"trust.json",
		"models-store.json",
		"mcp-cache.json",
		"audio-notifications.json",
		"osdy-pi",
	]) {
		await assert.rejects(lstat(join(agentDir, excluded)), /ENOENT/);
	}
});

test("rejects malformed settings without mutation", async () => {
	const root = await mkdtemp(join(tmpdir(), "osdy-pi-setup-"));
	const agentDir = join(root, "agent");
	await mkdir(agentDir, { recursive: true });
	const settingsPath = join(agentDir, "settings.json");
	await writeFile(settingsPath, "{ invalid json");

	await assert.rejects(
		configureOsdyPiSetup({ agentDir }),
		/settings.json is not valid JSON/,
	);
	assert.equal(await readFile(settingsPath, "utf8"), "{ invalid json");
});

test("refuses a symlinked configuration target before mutation", async () => {
	const root = await mkdtemp(join(tmpdir(), "osdy-pi-setup-"));
	const agentDir = join(root, "agent");
	const target = join(root, "outside.json");
	await mkdir(agentDir, { recursive: true });
	await writeFile(target, '{"quietStartup":true}\n');
	await symlink(target, join(agentDir, "settings.json"));

	await assert.rejects(
		configureOsdyPiSetup({ agentDir }),
		/settings.json must be a regular file and not a symbolic link/,
	);
	assert.equal(await readFile(target, "utf8"), '{"quietStartup":true}\n');
});

test("refuses a symlinked configuration directory before any write", async () => {
	const root = await mkdtemp(join(tmpdir(), "osdy-pi-setup-"));
	const agentDir = join(root, "agent");
	const outside = join(root, "outside");
	await mkdir(agentDir, { recursive: true });
	await mkdir(outside, { recursive: true });
	const original = '{"quietStartup":true}\n';
	await writeFile(join(agentDir, "settings.json"), original);
	await symlink(outside, join(agentDir, "extensions"));

	await assert.rejects(
		configureOsdyPiSetup({ agentDir }),
		/Configuration directory must not be a symbolic link/,
	);
	assert.equal(await readFile(join(agentDir, "settings.json"), "utf8"), original);
});

test("refuses an agent directory reached through a symlinked ancestor", async () => {
	const temporary = await mkdtemp(join(tmpdir(), "osdy-pi-setup-"));
	const root = await realpath(temporary);
	const outside = join(root, "outside");
	const linkedParent = join(root, "linked-parent");
	const agentDir = join(linkedParent, "agent");
	await mkdir(join(outside, "agent"), { recursive: true });
	await symlink(outside, linkedParent);

	await assert.rejects(
		configureOsdyPiSetup({ agentDir }),
		/Configuration path must not contain symbolic links/,
	);
	await assert.rejects(lstat(join(agentDir, "settings.json")), /ENOENT/);
});

test("rejects incompatible nested settings before mutation", async () => {
	for (const [field, value] of [
		["terminal", "fullscreen"],
		["modelThinkingLevels", []],
	]) {
		const temporary = await mkdtemp(join(tmpdir(), "osdy-pi-setup-"));
		const root = await realpath(temporary);
		const agentDir = join(root, "agent");
		await mkdir(agentDir, { recursive: true });
		const settingsPath = join(agentDir, "settings.json");
		const original = `${JSON.stringify({ quietStartup: true, [field]: value })}\n`;
		await writeFile(settingsPath, original);

		await assert.rejects(
			configureOsdyPiSetup({ agentDir }),
			new RegExp(`settings\\.json ${field} must contain an object`),
		);
		assert.equal(await readFile(settingsPath, "utf8"), original);
	}
});

test("optional MCP setup preserves unrelated servers and reports prerequisites", async () => {
	const root = await mkdtemp(join(tmpdir(), "osdy-pi-setup-"));
	const agentDir = join(root, "agent");
	await mkdir(agentDir, { recursive: true });
	await writeFile(
		join(agentDir, "mcp.json"),
		JSON.stringify({ mcpServers: { existing: { command: "team-mcp" } } }),
	);

	const result = await configureOsdyPiSetup({
		agentDir,
		withMcp: true,
		commandExists: async (command) => command === "node",
	});
	const mcp = JSON.parse(await readFile(join(agentDir, "mcp.json"), "utf8"));

	assert.deepEqual(Object.keys(mcp.mcpServers), [
		"existing",
		"codegraph",
		"context7",
		"engram",
	]);
	assert.equal(mcp.mcpServers.context7.command, "npx");
	assert.equal(mcp.mcpServers.engram.command, "node");
	assert.deepEqual(result.warnings, [
		'MCP prerequisite "codegraph" was not found on PATH.',
		'MCP prerequisite "npx" was not found on PATH.',
		'MCP prerequisite "engram" was not found on PATH.',
	]);
});

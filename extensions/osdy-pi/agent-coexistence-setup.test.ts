import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { registerHooks } from "node:module";
import test from "node:test";

registerHooks({ resolve(specifier, context, nextResolve) {
	if (specifier === "./agent-coexistence-setup.js" && context.parentURL?.endsWith(".test.ts"))
		return { shortCircuit: true, url: new URL("./agent-coexistence-setup.ts", context.parentURL).href };
	return nextResolve(specifier, context);
} });
const { setupJokerAgents } = await import("./agent-coexistence-setup.js");

async function fixture() {
	const root = await mkdtemp(join(tmpdir(), "osdy-joker-"));
	const agentDir = join(root, ".pi", "agent");
	const gentle = join(root, "gentle");
	await mkdir(agentDir, { recursive: true });
	await mkdir(gentle);
	await writeFile(join(gentle, "package.json"), '{"name":"gentle-pi"}');
	const settingsPath = join(agentDir, "settings.json");
	const packages = ["npm:other", { source: gentle, extensions: ["-extensions/gentle-todo.ts"], themes: [], skills: ["skills/*"] }, "npm:gentle-pi@1.2.0", { source: "npm:gentle-pi", extensions: ["-extensions/gentle-agents.ts"] }];
	await writeFile(settingsPath, JSON.stringify({ theme: "dark", packages }));
	return { root, agentDir, gentle, settingsPath, packages };
}

const base = (f: Awaited<ReturnType<typeof fixture>>) => ({
	agentDir: f.agentDir, home: f.root, cwd: f.root, env: {},
});

void test("installs Joker then narrowly reconciles every Gentle entry using latest settings", async () => {
	const f = await fixture();
	let calls = 0;
	const install = async () => {
		calls++;
		const latest = JSON.parse(await readFile(f.settingsPath, "utf8")) as { packages: unknown[] };
		latest.packages.push("npm:pi-subagents-j0k3r", "npm:newly-added");
		await writeFile(f.settingsPath, JSON.stringify(latest));
	};
	await setupJokerAgents({ ...base(f), install });
	const settings = JSON.parse(await readFile(f.settingsPath, "utf8")) as { packages: unknown[]; theme: string };
	assert.equal(calls, 1);
	assert.deepEqual(settings.packages, [
		"npm:other",
		{ source: f.gentle, extensions: ["-extensions/gentle-todo.ts", "-extensions/gentle-agents.ts"], themes: [], skills: ["skills/*"] },
		{ source: "npm:gentle-pi@1.2.0", extensions: ["-extensions/gentle-agents.ts"] },
		{ source: "npm:gentle-pi", extensions: ["-extensions/gentle-agents.ts"] },
		"npm:pi-subagents-j0k3r", "npm:newly-added",
	]);
	assert.equal(settings.theme, "dark");
	await setupJokerAgents({ ...base(f), install: () => Promise.reject(new Error("duplicate install")) });
	assert.equal((await readFile(f.settingsPath, "utf8")).includes("duplicate"), false);
});

void test("relative Gentle sources resolve from settings and project overrides fail closed", async () => {
	const f = await fixture();
	const local = join(f.agentDir, "gentle-local");
	await mkdir(local);
	await writeFile(join(local, "package.json"), '{"name":"gentle-pi"}');
	await writeFile(f.settingsPath, '{"packages":["./gentle-local","npm:pi-subagents-j0k3r"]}');
	await setupJokerAgents({ ...base(f), install: () => Promise.reject(new Error("should skip")) });
	const result = JSON.parse(await readFile(f.settingsPath, "utf8")) as { packages: unknown[] };
	assert.deepEqual(result.packages[0], { source: "./gentle-local", extensions: ["-extensions/gentle-agents.ts"] });
	const project = join(f.root, "project");
	await mkdir(join(project, ".pi", "gentle"), { recursive: true });
	await writeFile(join(project, ".pi", "gentle", "package.json"), '{"name":"gentle-pi"}');
	await writeFile(join(project, ".pi", "settings.json"), '{"packages":["./gentle"]}');
	await assert.rejects(setupJokerAgents({ ...base(f), cwd: project }), /project-local Gentle/i);
});

void test("bare, tilde, and file URL local Gentle entries get the narrow personal filter", async () => {
	const f = await fixture();
	const bare = join(f.agentDir, "gentle");
	await mkdir(bare);
	await writeFile(join(bare, "package.json"), '{"name":"gentle-pi"}');
	await writeFile(f.settingsPath, JSON.stringify({ packages: ["gentle", "~/gentle", pathToFileURL(f.gentle).href, "npm:pi-subagents-j0k3r"] }));
	const result = await setupJokerAgents({ ...base(f), install: () => Promise.reject(new Error("no install")) });
	assert.equal(result.gentleCount, 3);
	const settings = JSON.parse(await readFile(f.settingsPath, "utf8")) as { packages: Array<{ source: string; extensions: string[] }> };
	assert.deepEqual(settings.packages.slice(0, 3).map((entry) => entry.extensions), Array(3).fill(["-extensions/gentle-agents.ts"]));
});

void test("bare project Gentle override and ambiguous Gentle local path fail before install", async () => {
	const f = await fixture();
	const project = join(f.root, "project");
	await mkdir(join(project, ".pi", "gentle"), { recursive: true });
	await writeFile(join(project, ".pi", "gentle", "package.json"), '{"name":"gentle-pi"}');
	await writeFile(join(project, ".pi", "settings.json"), '{"packages":["gentle"]}');
	let calls = 0;
	const install = () => { calls++; return Promise.resolve(); };
	await assert.rejects(setupJokerAgents({ ...base(f), cwd: project, install }), /project-local Gentle/i);
	await writeFile(join(project, ".pi", "settings.json"), '{"packages":[]}');
	await writeFile(f.settingsPath, '{"packages":["gentle","npm:pi-subagents-j0k3r"]}');
	await assert.rejects(setupJokerAgents({ ...base(f), install }), /Gentle.*resolve|Gentle.*source/i);
	assert.equal(calls, 0);
});

void test("recognizable remote Gentle sources fail closed before install, but unrelated Git packages remain", async () => {
	const f = await fixture();
	let calls = 0;
	const install = () => { calls++; return Promise.resolve(); };
	for (const remote of [
		"git:github.com/Gentleman-Programming/gentle-pi",
		"https://github.com/Gentleman-Programming/gentle-pi.git",
	]) {
		await writeFile(f.settingsPath, JSON.stringify({ packages: [remote, "git:github.com/owner/other-package"] }));
		await assert.rejects(setupJokerAgents({ ...base(f), install }), /remote Gentle.*local.*npm/i);
		const project = join(f.root, "project");
		await mkdir(join(project, ".pi"), { recursive: true });
		await writeFile(join(project, ".pi", "settings.json"), JSON.stringify({ packages: [remote] }));
		await writeFile(f.settingsPath, '{"packages":["npm:pi-subagents-j0k3r"]}');
		await assert.rejects(setupJokerAgents({ ...base(f), cwd: project, install }), /remote Gentle.*local.*npm/i);
		await writeFile(join(project, ".pi", "settings.json"), '{"packages":[]}');
	}
	assert.equal(calls, 0);
	await writeFile(f.settingsPath, '{"packages":["git:github.com/owner/other-package","npm:pi-subagents-j0k3r"]}');
	const result = await setupJokerAgents({ ...base(f), install });
	assert.equal(result.gentleCount, 0);
});

void test("invalid Gentle filters or duplicate Joker declarations block setup before further writes", async () => {
	const f = await fixture();
	let calls = 0;
	const install = () => { calls++; return Promise.resolve(); };
	await writeFile(f.settingsPath, '{"packages":[{"source":"npm:gentle-pi","extensions":false}]}');
	await assert.rejects(setupJokerAgents({ ...base(f), install }), /Gentle extensions/i);
	await writeFile(f.settingsPath, '{"packages":["npm:pi-subagents-j0k3r","npm:pi-subagents-j0k3r"]}');
	await assert.rejects(setupJokerAgents({ ...base(f), install }), /duplicate Joker/i);
	assert.equal(calls, 0);
});

void test("without Gentle, only Joker installation changes settings", async () => {
	const f = await fixture();
	await writeFile(f.settingsPath, '{"packages":["npm:other"]}');
	await setupJokerAgents({ ...base(f), install: async () => {
		await writeFile(f.settingsPath, '{"packages":["npm:other","npm:pi-subagents-j0k3r"]}');
	} });
	assert.deepEqual(JSON.parse(await readFile(f.settingsPath, "utf8")) as unknown, { packages: ["npm:other", "npm:pi-subagents-j0k3r"] });
});

void test("rejects alternate agent directories and project-local Gentle overrides before install", async () => {
	const f = await fixture();
	let calls = 0;
	const install = () => { calls++; return Promise.resolve(); };
	await assert.rejects(setupJokerAgents({ ...base(f), agentDir: join(f.root, "isolated"), install }), /personal|agent/i);
	await assert.rejects(setupJokerAgents({ ...base(f), env: { PI_CODING_AGENT_DIR: f.agentDir }, install }), /override|normal/i);
	const project = join(f.root, "project");
	await mkdir(join(project, ".pi"), { recursive: true });
	await writeFile(join(project, ".pi", "settings.json"), '{"packages":["npm:gentle-pi"]}');
	await assert.rejects(setupJokerAgents({ ...base(f), cwd: project, install }), /project|Gentle/i);
	assert.equal(calls, 0);
});

void test("failed installer or malformed latest settings cannot rewrite personal settings", async () => {
	const f = await fixture();
	const original = await readFile(f.settingsPath, "utf8");
	await assert.rejects(setupJokerAgents({ ...base(f), install: () => Promise.reject(new Error("install failed")) }), /install failed/);
	assert.equal(await readFile(f.settingsPath, "utf8"), original);
	await assert.rejects(setupJokerAgents({ ...base(f), install: async () => { await writeFile(f.settingsPath, "{bad"); } }), /settings/i);
	assert.equal(await readFile(f.settingsPath, "utf8"), "{bad");
});

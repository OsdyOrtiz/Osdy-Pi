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
const { setupJokerAgents, switchAgentMode, inspectJokerAgents } = await import("./agent-coexistence-setup.js");

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

void test("off filters only Joker's extension and enables Gentle; on reverses, both idempotently", async () => {
	const f = await fixture();
	await writeFile(f.settingsPath, JSON.stringify({ packages: [...f.packages, { source: "npm:pi-subagents-j0k3r", skills: ["skills/*"], extensions: ["-other.ts"] }] }));
	await switchAgentMode({ ...base(f), mode: "off" });
	const off = JSON.parse(await readFile(f.settingsPath, "utf8")) as { packages: Array<unknown>; osdyPiJokerExclusionOwned: boolean };
	assert.equal(off.osdyPiJokerExclusionOwned, true);
	assert.deepEqual(off.packages.at(-1), { source: "npm:pi-subagents-j0k3r", skills: ["skills/*"], extensions: ["-other.ts", "-./index.ts"] });
	assert.deepEqual(off.packages.slice(1, 4), [
		{ source: f.gentle, extensions: ["-extensions/gentle-todo.ts"], themes: [], skills: ["skills/*"] },
		"npm:gentle-pi@1.2.0", "npm:gentle-pi",
	]);
	assert.equal((await inspectJokerAgents(base(f))).mode, "gentle");
	assert.equal((await switchAgentMode({ ...base(f), mode: "off" })).changed, false);
	await switchAgentMode({ ...base(f), mode: "on", install: () => Promise.reject(new Error("should not install")) });
	assert.equal((await inspectJokerAgents(base(f))).mode, "joker");
	assert.equal((await switchAgentMode({ ...base(f), mode: "on" })).changed, false);
	const on = JSON.parse(await readFile(f.settingsPath, "utf8")) as { packages: Array<unknown>; osdyPiJokerExclusionOwned?: boolean };
	assert.equal(on.osdyPiJokerExclusionOwned, undefined);
	assert.deepEqual(on.packages.at(-1), { source: "npm:pi-subagents-j0k3r", skills: ["skills/*"], extensions: ["-other.ts"] });
});

void test("off refuses without Gentle and unowned Joker filters without writes", async () => {
	const f = await fixture();
	await writeFile(f.settingsPath, '{"packages":["npm:pi-subagents-j0k3r"]}');
	const original = await readFile(f.settingsPath, "utf8");
	await assert.rejects(switchAgentMode({ ...base(f), mode: "off" }), /Gentle/i);
	assert.equal(await readFile(f.settingsPath, "utf8"), original);
	await writeFile(f.settingsPath, '{"packages":["npm:gentle-pi",{"source":"npm:pi-subagents-j0k3r","extensions":["-./index.ts"]}]}');
	const existing = await readFile(f.settingsPath, "utf8");
	await assert.rejects(switchAgentMode({ ...base(f), mode: "on" }), /unowned|ownership/i);
	await assert.rejects(switchAgentMode({ ...base(f), mode: "off" }), /unowned|ownership/i);
	assert.equal(await readFile(f.settingsPath, "utf8"), existing);
});

void test("off enables Gentle without installing an absent Joker", async () => {
	const f = await fixture();
	const result = await switchAgentMode({ ...base(f), mode: "off", install: () => Promise.reject(new Error("must not install")) });
	assert.equal(result.installed, false);
	assert.equal((await inspectJokerAgents(base(f))).mode, "gentle");
	const settings = JSON.parse(await readFile(f.settingsPath, "utf8")) as { packages: unknown[]; osdyPiJokerExclusionOwned?: boolean };
	assert.equal(settings.osdyPiJokerExclusionOwned, undefined);
	assert.equal(settings.packages.at(-1), "npm:gentle-pi");
});

void test("off restores string and object Gentle registrations without leaving empty filters", async () => {
	const f = await fixture();
	await writeFile(f.settingsPath, JSON.stringify({ theme: "dark", packages: [
		{ source: "npm:gentle-pi@1.2.0", extensions: ["-extensions/gentle-agents.ts"] },
		{ source: "npm:gentle-pi", skills: ["skills/*"], extensions: ["-extensions/gentle-agents.ts"] },
		"npm:pi-subagents-j0k3r",
	] }));
	await switchAgentMode({ ...base(f), mode: "off" });
	const settings = JSON.parse(await readFile(f.settingsPath, "utf8")) as { theme: string; packages: unknown[] };
	assert.equal(settings.theme, "dark");
	assert.deepEqual(settings.packages.slice(0, 2), [
		"npm:gentle-pi@1.2.0",
		{ source: "npm:gentle-pi", skills: ["skills/*"] },
	]);
	assert.equal((await inspectJokerAgents(base(f))).mode, "gentle");
});

void test("empty extension arrays disable selected agents, including Joker, without writes", async () => {
	const f = await fixture();
	for (const [mode, packages] of [
		["off", [{ source: "npm:gentle-pi", extensions: [] }, "npm:pi-subagents-j0k3r"]],
		["on", ["npm:gentle-pi", { source: "npm:pi-subagents-j0k3r", extensions: [] }]],
	] as const) {
		await writeFile(f.settingsPath, JSON.stringify({ packages }));
		const before = await readFile(f.settingsPath, "utf8");
		assert.notEqual((await inspectJokerAgents(base(f))).mode, mode === "off" ? "gentle" : "joker");
		await assert.rejects(switchAgentMode({ ...base(f), mode }), /allowlist/i);
		assert.equal(await readFile(f.settingsPath, "utf8"), before);
	}
});

void test("mode switches do not turn disabled extension arrays into all-but-agent filters", async () => {
	const f = await fixture();
	for (const [mode, packages] of [
		["on", [{ source: "npm:gentle-pi", extensions: [] }, "npm:pi-subagents-j0k3r", "npm:other"]],
		["off", ["npm:gentle-pi", { source: "npm:pi-subagents-j0k3r", extensions: [] }, "npm:other"]],
	] as const) {
		await writeFile(f.settingsPath, JSON.stringify({ theme: "dark", packages }));
		const before = await readFile(f.settingsPath, "utf8");
		let installs = 0;
		await assert.rejects(switchAgentMode({ ...base(f), mode, install: () => { installs++; return Promise.resolve(); } }), /disabled|empty|extensions/i);
		assert.equal(installs, 0);
		assert.equal(await readFile(f.settingsPath, "utf8"), before);
	}
});

void test("autoload disabled and Pi exclusion patterns cannot select an agent", async () => {
	const f = await fixture();
	for (const [mode, packages] of [
		["off", [{ source: "npm:gentle-pi", autoload: false }, "npm:pi-subagents-j0k3r"]],
		["on", ["npm:gentle-pi", { source: "npm:pi-subagents-j0k3r", autoload: false }]],
		["off", [{ source: "npm:gentle-pi", extensions: ["extensions/gentle-agents.ts", "!extensions/gentle-agents.ts"] }, "npm:pi-subagents-j0k3r"]],
		["on", ["npm:gentle-pi", { source: "npm:pi-subagents-j0k3r", extensions: ["./index.ts", "!./index.ts"] }]],
		["on", ["npm:gentle-pi", { source: "npm:pi-subagents-j0k3r", extensions: ["./index.ts", "!*.ts"] }]],
	] as const) {
		await writeFile(f.settingsPath, JSON.stringify({ packages }));
		const before = await readFile(f.settingsPath, "utf8");
		assert.notEqual((await inspectJokerAgents(base(f))).mode, mode === "off" ? "gentle" : "joker");
		await assert.rejects(switchAgentMode({ ...base(f), mode }), /autoload|allowlist/i);
		assert.equal(await readFile(f.settingsPath, "utf8"), before);
	}
});

void test("prevalidates known failures before install and reports partial installation on later failure", async () => {
	const f = await fixture();
	let calls = 0;
	const install = async () => { calls++; await writeFile(f.settingsPath, '{"packages":["npm:pi-subagents-j0k3r"]}'); };
	await writeFile(f.settingsPath, '{"packages":["npm:gentle-pi"],"osdyPiJokerExclusionOwned":false}');
	await assert.rejects(switchAgentMode({ ...base(f), mode: "on", install }), /ownership|marker/i);
	assert.equal(calls, 0);
	await writeFile(f.settingsPath, '{"packages":["npm:gentle-pi"]}');
	await assert.rejects(switchAgentMode({ ...base(f), mode: "on", install: async () => {
		await install();
		await writeFile(f.settingsPath, "{bad");
	} }), /Joker may have been installed.*agents status/is);
	assert.equal(calls, 1);
});

void test("off retains remaining positive and negative Gentle filters", async () => {
	const f = await fixture();
	await writeFile(f.settingsPath, JSON.stringify({ packages: [
		{ source: "npm:gentle-pi", skills: ["skills/*"], extensions: ["extensions/gentle-agents.ts", "-extensions/gentle-todo.ts", "-extensions/gentle-agents.ts"] },
		"npm:pi-subagents-j0k3r",
	] }));
	await switchAgentMode({ ...base(f), mode: "off" });
	const settings = JSON.parse(await readFile(f.settingsPath, "utf8")) as { packages: unknown[] };
	assert.deepEqual(settings.packages[0], {
		source: "npm:gentle-pi", skills: ["skills/*"], extensions: ["extensions/gentle-agents.ts", "-extensions/gentle-todo.ts"],
	});
	assert.equal((await inspectJokerAgents(base(f))).mode, "gentle");
});

void test("off validates project override and malformed filters before touching settings", async () => {
	const f = await fixture();
	const project = join(f.root, "project");
	await mkdir(join(project, ".pi"), { recursive: true });
	await writeFile(join(project, ".pi", "settings.json"), '{"packages":["npm:gentle-pi"]}');
	await assert.rejects(switchAgentMode({ ...base(f), cwd: project, mode: "off" }), /project-local Gentle/i);
	await writeFile(f.settingsPath, '{"packages":["npm:gentle-pi",{"source":"npm:pi-subagents-j0k3r","extensions":false}]}');
	const previous = await readFile(f.settingsPath, "utf8");
	await assert.rejects(switchAgentMode({ ...base(f), mode: "off" }), /extensions filter/i);
	assert.equal(await readFile(f.settingsPath, "utf8"), previous);
});

void test("positive extension allowlists that omit selected agents fail closed", async () => {
	const f = await fixture();
	for (const [mode, packages] of [
		["on", ["npm:gentle-pi", { source: "npm:pi-subagents-j0k3r", extensions: ["./other.ts"] }]],
		["off", [{ source: "npm:gentle-pi", extensions: ["extensions/gentle-todo.ts"] }, "npm:pi-subagents-j0k3r"]],
	] as const) {
		await writeFile(f.settingsPath, JSON.stringify({ packages }));
		const previous = await readFile(f.settingsPath, "utf8");
		await assert.rejects(switchAgentMode({ ...base(f), mode }), /allowlist/i);
		assert.equal(await readFile(f.settingsPath, "utf8"), previous);
	}
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

import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import test from "node:test";
import { fileURLToPath } from "node:url";
registerHooks({ resolve(specifier, context, next) {
	if (specifier.startsWith(".") && specifier.endsWith(".js") && context.parentURL?.endsWith(".ts")) {
		const url = new URL(`${specifier.slice(0, -3)}.ts`, context.parentURL);
		if (existsSync(fileURLToPath(url))) return { shortCircuit: true, url: url.href };
	}
	return next(specifier, context);
} });
const { createControlCenterAccount, bindControlCenterAccount } = await import("./control-center-account.js");

void test("Account projects validated metadata, never output or credential fields", async () => {
	const service = createControlCenterAccount({
		profiles: () => Promise.resolve(["work", "personal", "../auth.json", { token: "secret" }]),
		active: () => "work", defaultProfile: () => Promise.resolve({ code: 0, stdout: "personal", stderr: "secret" }),
		switch: () => Promise.resolve(true), setDefault: () => Promise.resolve(true),
	});
	const view = await service.read();
	assert.match(view.summary, /Current: work.*Default: personal/);
	assert.equal(JSON.stringify(view).includes("secret"), false);
	assert.equal(JSON.stringify(view).includes("auth.json"), false);
	assert.equal(view.rows.some(row => row.label === "Switch to personal"), true);
});

void test("Account revalidates membership and uses real switch/default adapters", async () => {
	const calls: string[] = [];
	const service = createControlCenterAccount({ profiles: () => Promise.resolve(["work"]), active: () => undefined,
		defaultProfile: () => Promise.resolve({ code: 1, stdout: "secret", stderr: "secret" }),
		switch: name => { calls.push(`switch:${name}`); return Promise.resolve(true); },
		setDefault: name => { calls.push(`default:${name ?? "clear"}`); return Promise.resolve(true); },
	});
	assert.equal((await service.read()).summary.includes("secret"), false);
	assert.equal((await service.apply({ kind: "account-switch", profile: "missing" })).failed, true);
	assert.equal((await service.apply({ kind: "account-switch", profile: "work" })).failed, false);
	assert.equal((await service.apply({ kind: "account-default", profile: "work" })).failed, false);
	assert.deepEqual(calls, ["switch:work", "default:work"]);
});

void test("Unavailable default metadata cannot mark a profile named unavailable as default", async () => {
	const service = createControlCenterAccount({ profiles: () => Promise.resolve(["unavailable"]), active: () => undefined,
		defaultProfile: () => Promise.resolve({ code: 1, stdout: "", stderr: "" }),
		switch: () => Promise.resolve(true), setDefault: () => Promise.resolve(true) });
	assert.equal((await service.read()).rows.some(row => row.current), false);
});

void test("Bound Account reuses idle switching, quota refresh, and authoritative default commands", async () => {
	const previous = process.env.OSDY_PI_PROFILE_NAME;
	process.env.OSDY_PI_PROFILE_NAME = "personal";
	const events: string[] = [];
	const commands: string[][] = [];
	const service = bindControlCenterAccount({ isIdle: () => false,
		waitForIdle: () => { events.push("idle"); return Promise.resolve(); },
		ui: { notify: text => events.push(text), select: () => Promise.reject(new Error("old dialog forbidden")), input: () => Promise.reject(new Error("old dialog forbidden")) } },
		() => { events.push("refresh"); return Promise.resolve(); }, () => { events.push("render"); },
		{ profiles: () => Promise.resolve(["work", "personal"]), activate: name => { events.push(`activate:${name}`); return Promise.resolve(); },
			run: args => { commands.push(args); return Promise.resolve({ code: 0, stdout: "work", stderr: "secret" }); } });
	try {
		await service.read();
		assert.equal((await service.apply({ kind: "account-switch", profile: "work" })).failed, false);
		assert.deepEqual(events.slice(0, 4), ["idle", "activate:work", "render", "refresh"]);
		assert.equal(process.env.OSDY_PI_PROFILE_NAME, "work");
		await service.apply({ kind: "account-default", profile: "work" });
		await service.apply({ kind: "account-default", profile: undefined });
		assert.deepEqual(commands, [["account", "default"], ["account", "default", "work"], ["account", "default", "--clear"]]);
		assert.equal(events.join(" ").includes("secret"), false);
	} finally {
		if (previous === undefined) delete process.env.OSDY_PI_PROFILE_NAME;
		else process.env.OSDY_PI_PROFILE_NAME = previous;
	}
});

void test("Bound Account validates live external active names without rendering unsafe metadata", async () => {
	const previous = process.env.OSDY_PI_PROFILE_NAME;
	const service = bindControlCenterAccount({ isIdle: () => true, waitForIdle: () => Promise.resolve(),
		ui: { notify: () => {}, select: () => Promise.resolve(undefined), input: () => Promise.resolve(undefined) } },
		() => Promise.resolve(), () => {},
		{ profiles: () => Promise.resolve(["work"]), run: () => Promise.resolve({ code: 0, stdout: "No default account.", stderr: "" }) });
	try {
		for (const value of [undefined, "", "../auth.json", "auth.json", "DEFAULT", "token-secret\n", "x".repeat(64)]) {
			if (value === undefined) delete process.env.OSDY_PI_PROFILE_NAME;
			else process.env.OSDY_PI_PROFILE_NAME = value;
			const view = await service.read();
			assert.match(view.summary, /Current: unmanaged/);
			assert.equal(view.rows.some(row => row.label === "Switch to work"), true);
			assert.equal(JSON.stringify(view).includes("token-secret"), false);
			assert.equal(JSON.stringify(view).includes("auth.json"), false);
		}
		process.env.OSDY_PI_PROFILE_NAME = "Work";
		assert.match((await service.read()).summary, /Current: Work/);
		assert.equal((await service.read()).rows.some(row => row.label === "Switch to work"), false);
	} finally {
		if (previous === undefined) delete process.env.OSDY_PI_PROFILE_NAME;
		else process.env.OSDY_PI_PROFILE_NAME = previous;
	}
});

void test("Account busy guarding rejects overlap without cancelling the first operation", async () => {
	let finish: (value: boolean) => void = () => {};
	let switches = 0;
	const service = createControlCenterAccount({ profiles: () => Promise.resolve(["work"]), active: () => undefined,
		defaultProfile: () => Promise.resolve(undefined), setDefault: () => Promise.resolve(true),
		switch: () => { switches++; return new Promise(resolve => { finish = resolve; }); } });
	const first = service.apply({ kind: "account-switch", profile: "work" });
	await Promise.resolve(); await Promise.resolve();
	assert.equal((await service.apply({ kind: "account-switch", profile: "work" })).failed, true);
	assert.equal(switches, 1); finish(true); assert.equal((await first).failed, false);
});

void test("Account errors are fixed messages and never leak backend errors", async () => {
	const service = createControlCenterAccount({ profiles: () => Promise.resolve(["work"]), active: () => "work",
		defaultProfile: () => Promise.reject(new Error("token-secret")),
		switch: () => Promise.reject(new Error("token-secret")), setDefault: () => Promise.resolve(false),
	});
	assert.equal(JSON.stringify(await service.read()).includes("token-secret"), false);
	const result = await service.apply({ kind: "account-default", profile: "work" });
	assert.equal(result.failed, true);
	assert.equal(result.message.includes("token-secret"), false);
});

import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import test from "node:test";
import type { ProfileCodexUsageResult } from "./profile-codex-usage.js";
import { fileURLToPath } from "node:url";
registerHooks({ resolve(specifier, context, next) {
	if (specifier.startsWith(".") && specifier.endsWith(".js") && context.parentURL?.endsWith(".ts")) {
		const url = new URL(`${specifier.slice(0, -3)}.ts`, context.parentURL);
		if (existsSync(fileURLToPath(url))) return { shortCircuit: true, url: url.href };
	}
	return next(specifier, context);
} });
const { createControlCenterAccount, bindControlCenterAccount } = await import("./control-center-account.js");

void test("Profile preview is explicit, independently selected and never activates", async () => {
	const requests: string[] = [];
	const service = createControlCenterAccount({
		profiles: () => Promise.resolve(["work", "personal"]), active: () => "work",
		defaultProfile: () => Promise.resolve(undefined),
		switch: () => { throw new Error("activation forbidden"); }, setDefault: () => { throw new Error("write forbidden"); },
		usage: profile => {
			requests.push(profile);
			return Promise.resolve({ status: "ready", profile, checkedAt: 1000, quotaSnapshot: { fetchedAt: 1000,
				planType: undefined, ordinaryUsageAllowed: undefined, credits: undefined,
				buckets: [
					{ id: "codex", label: undefined, primary: { usedPercent: 25, windowMinutes: 300, resetsAt: 2000 }, secondary: { usedPercent: 80, windowMinutes: 10080, resetsAt: undefined } },
					{ id: "extra", label: "Extra bucket", primary: { usedPercent: 10, windowMinutes: undefined, resetsAt: undefined }, secondary: undefined },
				] } });
		},
	});
	const initial = await service.read();
	assert.deepEqual(requests, []);
	assert.equal(initial.rows.length, 2);
	assert.equal(initial.rows[0]?.label, "work · Active");
	assert.equal(initial.rows[1]?.action.kind, "account-select");
	assert.equal(initial.rows[1]?.actions?.[0]?.label, "View usage");
	for (const profile of ["work", "personal"]) {
		assert.equal((await service.apply({ kind: "account-usage", profile })).failed, false);
		const row = { details: service.quotaDetails?.(profile) };
		assert.match(row?.details?.join(" ") ?? "", /75% left/);
		assert.match(row?.details?.join(" ") ?? "", /Weekly 7d 20% left.*Next reset: unknown/);
		assert.match(row?.details?.join(" ") ?? "", /Extra bucket.*90% left.*Next reset: unknown/);
		assert.ok(row?.details?.includes(`Profile: ${profile}`));
		assert.equal(service.quotaSnapshot("personal"), profile === "personal" ? service.quotaSnapshot(profile) : undefined);
		assert.equal(service.quotaSnapshot(profile)?.buckets.length, 2);
		assert.ok(row?.details?.some(line => line.startsWith("Window: 300 minutes")));
		assert.ok(row?.details?.some(line => line.startsWith("Window: unknown")));
		assert.ok(row?.details?.includes(`Checked: ${new Date(1000).toLocaleString()} (local time)`));
		assert.ok(row?.details?.some(line => line.endsWith(`Next reset: ${new Date(2000 * 1000).toLocaleString()}`)));
	}
	assert.deepEqual(requests, ["work", "personal"]);
});

void test("Profile preview preserves timestamp units and marks missing or invalid resets unknown", async () => {
	const checkedAt = 1_780_000_000_123;
	for (const resetsAt of [1_780_000_000, 0, undefined, NaN, Infinity, -Infinity, Number.MAX_VALUE]) {
		const service = createControlCenterAccount({
			profiles: () => Promise.resolve(["work"]), active: () => "work",
			defaultProfile: () => Promise.resolve(undefined),
			switch: () => { throw new Error("activation forbidden"); },
			setDefault: () => { throw new Error("write forbidden"); },
			usage: profile => Promise.resolve({ status: "ready", profile, checkedAt,
				quotaSnapshot: { fetchedAt: checkedAt, planType: undefined, ordinaryUsageAllowed: undefined, credits: undefined,
					buckets: [{ id: "codex", label: undefined,
						primary: { usedPercent: 25, windowMinutes: 300, resetsAt },
						secondary: { usedPercent: 80, windowMinutes: 10080, resetsAt } }] } }),
		});
		await service.apply({ kind: "account-usage", profile: "work" });
		const details = service.quotaDetails?.("work") ?? [];
		assert.ok(details.includes(`Checked: ${new Date(checkedAt).toLocaleString()} (local time)`));
		const expectedReset = resetsAt === 1_780_000_000 || resetsAt === 0
			? new Date(resetsAt * 1000).toLocaleString() : "unknown";
		assert.match(details.join(" "), /Session 5h 75% left/);
		assert.match(details.join(" "), /Weekly 7d 20% left/);
		assert.equal(details.filter(line => line.endsWith(`Next reset: ${expectedReset}`)).length, 2);
	}
});

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
	assert.equal(view.rows.some(row => row.actions?.some(action => action.label === "Switch to personal")), true);
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
	let idle = false;
	const service = bindControlCenterAccount({ isIdle: () => idle,
		waitForIdle: () => { events.push("idle"); idle = true; return Promise.resolve(); },
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

void test("Bound base-context Account mutations refuse busy Pi and work when idle", async () => {
	const previous = process.env.OSDY_PI_PROFILE_NAME;
	try {
		for (const idle of [false, true]) {
			process.env.OSDY_PI_PROFILE_NAME = "personal";
			const events: string[] = [];
			const commands: string[][] = [];
			const ctx = { isIdle: () => idle, ui: {
				notify: (text: string) => events.push(text),
				select: () => Promise.reject(new Error("dialog forbidden")), input: () => Promise.reject(new Error("dialog forbidden")),
			} };
			assert.equal("waitForIdle" in ctx, false);
			const service = bindControlCenterAccount(ctx,
				() => { events.push("refresh"); return Promise.resolve(); }, () => { events.push("render"); },
				{ profiles: () => Promise.resolve(["work", "personal"]),
					activate: name => { events.push(`activate:${name}`); return Promise.resolve(); },
					run: args => { commands.push(args); return Promise.resolve({ code: 0, stdout: "No default account.", stderr: "" }); } });
			assert.equal((await service.apply({ kind: "account-switch", profile: "work" })).failed, !idle);
			assert.equal((await service.apply({ kind: "account-default", profile: "work" })).failed, !idle);
			assert.equal((await service.apply({ kind: "account-default", profile: undefined })).failed, !idle);
			assert.deepEqual(commands, idle ? [["account", "default", "work"], ["account", "default", "--clear"]] : []);
			assert.equal(events.includes("activate:work"), idle);
			assert.equal(events.includes("render"), idle);
			assert.equal(events.includes("refresh"), idle);
			assert.equal(process.env.OSDY_PI_PROFILE_NAME, idle ? "work" : "personal");
		}
	} finally {
		if (previous === undefined) delete process.env.OSDY_PI_PROFILE_NAME;
		else process.env.OSDY_PI_PROFILE_NAME = previous;
	}
});

void test("Bound command Account defaults wait for idle and recheck idle and runtime freshness", async () => {
	for (const outcome of ["idle", "busy", "stale", "rejected"] as const) {
		let idle = false;
		let current = true;
		const events: string[] = [];
		const service = bindControlCenterAccount({ isIdle: () => idle,
			waitForIdle: () => {
				events.push("wait");
				idle = outcome !== "busy";
				current = outcome !== "stale";
				return outcome === "rejected" ? Promise.reject(new Error("wait failed")) : Promise.resolve();
			},
			ui: { notify: () => {}, select: () => Promise.resolve(undefined), input: () => Promise.resolve(undefined) },
		}, () => { throw new Error("refresh forbidden"); }, () => {},
		{ profiles: () => Promise.resolve(["work"]), run: args => {
			events.push(args.join(" ")); return Promise.resolve({ code: 0, stdout: "", stderr: "" });
		} }, { isCurrent: () => current });
		assert.equal((await service.apply({ kind: "account-default", profile: "work" })).failed, outcome !== "idle");
		assert.deepEqual(events, outcome === "idle" ? ["wait", "account default work"] : ["wait"]);
	}
});

void test("Bound base-context Account rechecks idle after asynchronous profile validation", async () => {
	const previous = process.env.OSDY_PI_PROFILE_NAME;
	process.env.OSDY_PI_PROFILE_NAME = "personal";
	let idle = true;
	let finish: (profiles: string[]) => void = () => {};
	const events: string[] = [];
	const service = bindControlCenterAccount({ isIdle: () => idle,
		ui: { notify: () => {}, select: () => Promise.resolve(undefined), input: () => Promise.resolve(undefined) },
	}, () => { events.push("refresh"); return Promise.resolve(); }, () => { events.push("render"); },
	{ profiles: () => new Promise(resolve => { finish = resolve; }),
		activate: () => { events.push("activate"); return Promise.resolve(); },
		run: () => { events.push("default"); return Promise.resolve({ code: 0, stdout: "", stderr: "" }); } });
	try {
		for (const kind of ["account-switch", "account-default"] as const) {
			idle = true;
			const applying = service.apply({ kind, profile: "work" });
			idle = false;
			finish(["work"]);
			assert.equal((await applying).failed, true);
		}
		assert.deepEqual(events, []);
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
			assert.equal(view.rows.some(row => row.actions?.some(action => action.label === "Switch to work")), true);
			assert.equal(JSON.stringify(view).includes("token-secret"), false);
			assert.equal(JSON.stringify(view).includes("auth.json"), false);
		}
		process.env.OSDY_PI_PROFILE_NAME = "Work";
		assert.match((await service.read()).summary, /Current: Work/);
		assert.equal((await service.read()).rows.some(row => row.actions?.some(action => action.label === "Switch to work")), false);
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

void test("Profile preview cancellation, supersession and stale runtime discard ignored-abort results", async () => {
	const requests: { signal: AbortSignal; finish: (result: ProfileCodexUsageResult) => void }[] = [];
	let current = true;
	const service = createControlCenterAccount({ profiles: () => Promise.resolve(["work", "personal"]), active: () => "work",
		defaultProfile: () => Promise.resolve(undefined), switch: () => { throw new Error("forbidden"); }, setDefault: () => { throw new Error("forbidden"); },
		isCurrent: () => current, usage: (_profile, signal) => new Promise(finish => requests.push({ signal, finish })),
	});
	const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
	const first = service.apply({ kind: "account-usage", profile: "work" }); await flush();
	assert.equal((await service.apply({ kind: "account-default", profile: undefined })).failed, true);
	const second = service.apply({ kind: "account-usage", profile: "personal" }); await flush();
	assert.equal(requests[0]?.signal.aborted, true);
	requests[1]?.finish({ status: "unavailable", profile: "personal", checkedAt: 1000, reason: "remote-usage-unavailable" });
	await second;
	requests[0]?.finish({ status: "unavailable", profile: "work", checkedAt: 1000, reason: "stored-credentials-unavailable" }); await first;
	assert.match(JSON.stringify(service.quotaDetails?.("personal")), /Remote Codex usage unavailable/);
	assert.doesNotMatch(JSON.stringify(service.quotaDetails?.("personal")), /Stored credentials unavailable \(missing/);
	const third = service.apply({ kind: "account-usage", profile: "work" }); await flush();
	service.cancelUsage?.(); assert.equal(requests[2]?.signal.aborted, true);
	requests[2]?.finish({ status: "unavailable", profile: "work", checkedAt: 1000, reason: "stored-credentials-unavailable" }); await third;
	assert.doesNotMatch(JSON.stringify(service.quotaDetails?.("work")), /Checked: .*local time/);
	const fourth = service.apply({ kind: "account-usage", profile: "work" }); await flush(); current = false;
	requests[3]?.finish({ status: "unavailable", profile: "work", checkedAt: 1000, reason: "stored-credentials-unavailable" }); await fourth;
	assert.doesNotMatch(JSON.stringify(service.quotaDetails?.("work")), /Checked: .*local time/);
	assert.equal((await service.apply({ kind: "account-switch", profile: "personal" })).failed, true);
});

void test("Unavailable, cancelled, absent quota and unexpected errors never fabricate zero or leak raw errors", async () => {
	for (const outcome of ["stored-credentials-unavailable", "remote-usage-unavailable", "cancelled", "empty", "error"] as const) {
		const service = createControlCenterAccount({ profiles: () => Promise.resolve(["work"]), active: () => "work",
			defaultProfile: () => Promise.resolve(undefined), switch: () => Promise.resolve(true), setDefault: () => Promise.resolve(true),
			usage: profile => {
				if (outcome === "error") throw new Error("/private/auth.json token-secret");
				if (outcome === "empty") return Promise.resolve({ status: "ready", profile, checkedAt: 1000,
					quotaSnapshot: { fetchedAt: 1000, buckets: [], credits: undefined, planType: undefined, ordinaryUsageAllowed: undefined } });
				if (outcome === "cancelled") return Promise.resolve({ status: "cancelled", profile, checkedAt: 1000, reason: "cancelled" });
				return Promise.resolve({ status: "unavailable", profile, checkedAt: 1000, reason: outcome });
			},
		});
		await service.apply({ kind: "account-usage", profile: "work" });
		const text = JSON.stringify(service.quotaDetails?.("work"));
		assert.doesNotMatch(text, /0%|token-secret|private\/auth/);
		assert.match(text, outcome === "empty" ? /unknown/ : /unavailable|cancelled/);
	}
});

void test("A mismatched profile result cannot publish another profile's quota snapshot", async () => {
	const service = createControlCenterAccount({ profiles: () => Promise.resolve(["work", "personal"]), active: () => "work",
		defaultProfile: () => Promise.resolve(undefined), switch: () => Promise.resolve(true), setDefault: () => Promise.resolve(true),
		usage: () => Promise.resolve({ status: "ready", profile: "work", checkedAt: 1000,
			quotaSnapshot: { fetchedAt: 1000, buckets: [], credits: undefined, planType: undefined, ordinaryUsageAllowed: undefined } }),
	});
	assert.equal((await service.apply({ kind: "account-usage", profile: "personal" })).failed, true);
	assert.equal(service.quotaSnapshot("personal"), undefined);
	assert.doesNotMatch(service.quotaDetails("personal").join(" "), /local time/);
});

void test("Bound preview uses injected service independently of active refresh and queued stale activation", async () => {
	let current = true; let release = () => {}; const names: string[] = [];
	const service = bindControlCenterAccount({ isIdle: () => false, waitForIdle: () => new Promise<void>(resolve => { release = resolve; }),
		ui: { notify: () => {}, select: () => Promise.resolve(undefined), input: () => Promise.resolve(undefined) } },
		() => { throw new Error("active quota forbidden"); }, () => {},
		{ profiles: () => Promise.resolve(["work"]), activate: () => { throw new Error("stale activation forbidden"); }, run: () => Promise.resolve({ code: 0, stdout: "", stderr: "" }) },
		{ isCurrent: () => current, usage: (profile, signal) => { names.push(profile); assert.equal(signal.aborted, false);
			return Promise.resolve({ status: "unavailable", profile, checkedAt: 1000, reason: "stored-credentials-unavailable" }); } });
	await service.apply({ kind: "account-usage", profile: "work" }); assert.deepEqual(names, ["work"]);
	const switching = service.apply({ kind: "account-switch", profile: "work" });
	for (let i = 0; i < 8; i++) await Promise.resolve();
	current = false; release(); assert.equal((await switching).failed, true);
});

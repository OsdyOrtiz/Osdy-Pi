import assert from "node:assert/strict";
import { mkdtemp, mkdir, realpath, symlink } from "node:fs/promises";
import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import { fileURLToPath } from "node:url";
import type { ProfileCodexUsageResult } from "./profile-codex-usage.js";
import type { ExtensionContext, Theme } from "@earendil-works/pi-coding-agent";
import { type Component, type TUI } from "@earendil-works/pi-tui";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
registerHooks({ resolve(specifier, context, next) {
	if (specifier.startsWith(".") && specifier.endsWith(".js") && context.parentURL?.endsWith(".ts")) {
		const url = new URL(`${specifier.slice(0, -3)}.ts`, context.parentURL);
		if (existsSync(fileURLToPath(url))) return { shortCircuit: true, url: url.href };
	}
	return next(specifier, context);
} });
const {
	availableProfiles,
	manageAccountProfile,
	manageAccountProfiles,
	narrowStoredProfileCodexCredential,
	readStoredProfileCodexCredential,
	parseDefaultAccountResult,
	sharedAgentDir,
	switchAccountInPlace,
	// eslint-disable-next-line @typescript-eslint/ban-ts-comment
	// @ts-ignore Node's native TypeScript runner resolves test-only TypeScript source imports.
} = await import("./account-profiles.ts");

const down = "\u001b[B";
const escape = "\u001b";

function customHarness(exercise: (panel: Component) => void): ExtensionContext["ui"]["custom"] {
	return (factory) => new Promise(resolve => {
		let completed = false;
		let renders = 0;
		const panel = factory(
			{ terminal: { rows: 30 }, requestRender: () => { renders++; } } as unknown as TUI,
			{ fg: (_color: string, text: string) => text } as unknown as Theme,
			{} as Parameters<typeof factory>[2],
			value => { completed = true; resolve(value); },
		);
		assert(!(panel instanceof Promise));
		exercise(panel);
		assert(completed, "custom selector must finish through done");
		assert(renders > 0, "input changes request a render");
	});
}

void test("Switch previews every profile but lists only names and markers, with quota details through V", async () => {
	const previous = process.env.OSDY_PI_PROFILE_NAME;
	const profiles = ["Work", "work-alt", "expired", "unsupported", "failed"];
	const requests: string[] = [];
	const activated: string[] = [];
	const switchEffects: string[] = [];
	const usage = async (profile: string): Promise<ProfileCodexUsageResult> => {
		requests.push(profile);
		await Promise.resolve();
		if (profile === "failed") throw new Error("private auth token");
		if (profile === "expired" || profile === "unsupported")
			return { status: "unavailable", profile, checkedAt: 0, reason: "stored-credentials-unavailable" };
		return { status: "ready", profile, checkedAt: 0, quotaSnapshot: {
			fetchedAt: 0, planType: undefined, credits: undefined, ordinaryUsageAllowed: undefined,
			buckets: [{ id: "codex", label: undefined,
				primary: { usedPercent: 25, windowMinutes: 300, resetsAt: 3600 },
				secondary: { usedPercent: 60, windowMinutes: 10080, resetsAt: 86400 } }],
		} };
	};
	try {
		await manageAccountProfiles({ isIdle: () => true, ui: {
			notify: () => undefined, input: () => Promise.resolve(undefined),
			select: title => {
				assert.equal(title, "OpenAI account manager", "profile picker must use custom UI");
				return Promise.resolve("Switch");
			},
			custom: customHarness(panel => {
				assert.deepEqual(requests, profiles);
				const rows = panel.render(300);
				assert.deepEqual(rows.slice(1, -1), [
					"> Work (active) (default)", "  work-alt", "  expired", "  unsupported", "  failed",
				]);
				assert.doesNotMatch(rows.join("\n"), /%|resets|unavailable|private|token/);
				panel.handleInput?.(down);
				panel.handleInput?.("v");
				assert.match(panel.render(100).join("\n"), /work-alt/);
				const details = panel.render(100).join("\n");
				assert.match(details, /Session/);
				assert.match(details, /75%/);
				assert.match(details, /Weekly/);
				assert.match(details, /40%/);
				assert.match(details, /reset/i);
				panel.handleInput?.("\r");
				panel.handleInput?.("r");
				panel.handleInput?.("u");
				assert.deepEqual(activated, []);
				assert.deepEqual(switchEffects, []);
				assert.equal(process.env.OSDY_PI_PROFILE_NAME, previous);
				assert.deepEqual(requests, profiles);
				panel.handleInput?.(escape);
				assert.match(panel.render(300).join("\n"), /> work-alt/);
				panel.handleInput?.("\r");
			}),
		} }, { profiles: () => Promise.resolve(profiles), activeProfile: "WORK",
			run: () => Promise.resolve({ code: 0, stdout: "work", stderr: "" }),
			previewUsage: usage, activate: profile => { activated.push(profile); return Promise.resolve(); },
			refreshUsage: () => { switchEffects.push("refresh"); return Promise.resolve(); },
			requestRender: () => { switchEffects.push("active render"); },
		});
		assert.deepEqual(activated, ["work-alt"]);
		assert.deepEqual(switchEffects, ["active render", "refresh"]);
	} finally {
		if (previous === undefined) delete process.env.OSDY_PI_PROFILE_NAME;
		else process.env.OSDY_PI_PROFILE_NAME = previous;
	}
});

void test("Switch cancellation never activates; unavailable details stay safe and selectable", async () => {
	const previous = process.env.OSDY_PI_PROFILE_NAME;
	try {
		for (const choice of ["cancel", "unavailable"] as const) {
			let menus = 0;
			const activated: string[] = [];
			await manageAccountProfiles({ isIdle: () => true, ui: {
				notify: () => undefined, input: () => Promise.resolve(undefined),
				select: () => Promise.resolve(menus++ === 0 ? "Switch" : "Cancel"),
				custom: customHarness(panel => {
					assert.deepEqual(panel.render(100).slice(1, -1), ["> Work"]);
					assert.doesNotMatch(panel.render(100).join("\n"), /%|resets|unavailable/);
					panel.handleInput?.("v");
					assert.match(panel.render(100).join("\n"), /Work/);
					assert.match(panel.render(100).join("\n"), /usage unavailable/i);
					panel.handleInput?.("\r");
					assert.deepEqual(activated, []);
					panel.handleInput?.("b");
					assert.deepEqual(panel.render(100).slice(1, -1), ["> Work"]);
					panel.handleInput?.(choice === "cancel" ? escape : "\r");
				}),
			} }, { profiles: () => Promise.resolve(["Work"]),
				run: () => Promise.resolve({ code: 0, stdout: "No default account.", stderr: "" }),
				previewUsage: profile => Promise.resolve({ status: "unavailable", profile, checkedAt: 0, reason: "remote-usage-unavailable" }),
				activate: profile => { activated.push(profile); return Promise.resolve(); },
				refreshUsage: () => { assert.equal(choice, "unavailable"); return Promise.resolve(); },
			});
			assert.deepEqual(activated, choice === "unavailable" ? ["Work"] : []);
		}
	} finally {
		if (previous === undefined) delete process.env.OSDY_PI_PROFILE_NAME;
		else process.env.OSDY_PI_PROFILE_NAME = previous;
	}
});

void test("Switch bounds concurrent previews and safely handles empty, cancelled and mismatched results", async () => {
	const profiles = ["one", "two", "three", "four", "five"];
	const pending: (() => void)[] = [];
	let active = 0;
	let maximum = 0;
	let queried = 0;
	let menu = 0;
	const work = manageAccountProfiles({ isIdle: () => true, ui: {
		notify: () => undefined, input: () => Promise.resolve(undefined),
		select: () => Promise.resolve(menu++ === 0 ? "Switch" : "Cancel"),
		custom: customHarness(panel => {
			assert.equal(queried, profiles.length);
			assert.equal(active, 0);
			const rows = panel.render(100);
			assert.deepEqual(rows.slice(1, -1), profiles.map((profile, index) => `${index === 0 ? ">" : " "} ${profile}`));
			assert.doesNotMatch(rows.join("\n"), /%|resets|unavailable/);
			panel.handleInput?.(down);
			panel.handleInput?.("v");
			assert.match(panel.render(100).join("\n"), /usage unavailable/i);
			assert.doesNotMatch(panel.render(100).join("\n"), /other/);
			panel.handleInput?.(escape);
			panel.handleInput?.(escape);
		}),
	} }, { profiles: () => Promise.resolve(profiles),
		run: () => Promise.resolve({ code: 0, stdout: "No default account.", stderr: "" }),
		activate: () => Promise.resolve(assert.fail("preview/cancel cannot activate")),
		previewUsage: profile => new Promise<ProfileCodexUsageResult>(resolve => {
			queried++;
			maximum = Math.max(maximum, ++active);
			pending.push(() => {
				active--;
				resolve(profile === "one" ? { status: "cancelled", profile, checkedAt: 0, reason: "cancelled" }
					: { status: "ready", profile: profile === "two" ? "other" : profile, checkedAt: 0,
						quotaSnapshot: { fetchedAt: 0, buckets: [], planType: undefined, credits: undefined, ordinaryUsageAllowed: undefined } });
			});
		}),
	});
	for (let i = 0; i < 8; i++) await Promise.resolve();
	assert.equal(queried, 4);
	while (pending.length) {
		pending.shift()!();
		for (let i = 0; i < 8; i++) await Promise.resolve();
	}
	await work;
	assert.equal(maximum, 4);
});

void test("Switch details remain read-only while busy and confirmation retains idle guarding", async () => {
	let menu = 0;
	let waits = 0;
	const notices: string[] = [];
	await manageAccountProfiles({ isIdle: () => false,
		waitForIdle: () => { waits++; return Promise.resolve(); }, ui: {
			notify: message => notices.push(message), input: () => Promise.resolve(undefined),
			select: () => Promise.resolve(menu++ === 0 ? "Switch" : "Cancel"),
			custom: customHarness(panel => {
				panel.handleInput?.("v");
				panel.handleInput?.("\r");
				assert.equal(waits, 0);
				panel.handleInput?.(escape);
				panel.handleInput?.("\r");
			}),
		} }, { profiles: () => Promise.resolve(["Work"]),
			run: () => Promise.resolve({ code: 0, stdout: "No default account.", stderr: "" }),
			activate: () => Promise.resolve(assert.fail("busy confirmation cannot activate")),
			refreshUsage: () => Promise.resolve(assert.fail("busy confirmation cannot refresh")),
		});
	assert.equal(waits, 1);
	assert.match(notices.join(" "), /require Pi to be idle/);
});

void test("non-terminal Switch is rejected before reading preview snapshots", async () => {
	let menu = 0;
	const notices: string[] = [];
	await manageAccountProfiles({ mode: "rpc", isIdle: () => true, ui: {
		notify: message => notices.push(message), input: () => Promise.resolve(undefined),
		select: () => Promise.resolve(menu++ === 0 ? "Switch" : "Cancel"),
		custom: () => Promise.resolve(assert.fail("RPC cannot open custom UI")),
	} }, { profiles: () => Promise.resolve(["Work"]),
		run: () => Promise.resolve({ code: 0, stdout: "No default account.", stderr: "" }),
		previewUsage: () => Promise.resolve(assert.fail("RPC cannot query previews")),
	});
	assert.match(notices.join(" "), /terminal UI/);
});

void test("stored credential adapter narrows unknown data and conceals reader paths", async () => {
	const credential = { profile: "Work", access: "synthetic", expires: 2_000_000_000_000 };
	assert.deepEqual(narrowStoredProfileCodexCredential({ ...credential, refresh: "SECRET", raw: "SECRET" }), credential);
	for (const value of [null, [], {}, { ...credential, profile: "../Work" }, { ...credential, expires: NaN }, { ...credential, accountId: null }]) {
		assert.equal(narrowStoredProfileCodexCredential(value), undefined);
	}
	const root = await mkdtemp(join(tmpdir(), "osdy-quota-adapter-SECRET-"));
	await assert.rejects(readStoredProfileCodexCredential(root, "Work"), (error: unknown) => {
		assert(error instanceof Error);
		assert.equal(error.message, "Stored profile credentials are unavailable.");
		assert.doesNotMatch(JSON.stringify(error), /SECRET|auth.json/);
		return true;
	});
});

void test("uses the account resolver for split-agent roots and explicit overrides", async () => {
	const candidate = await mkdtemp(join(tmpdir(), "osdy-pi-extension-agent-test-"));
	const managedParent = await mkdtemp(join(tmpdir(), "osdy-pi-extension-managed-test-"));
	await mkdir(join(managedParent, "osdy-pi"));
	await symlink(join(managedParent, "osdy-pi"), join(candidate, "osdy-pi"));
	assert.equal(
		await sharedAgentDir({ PI_CODING_AGENT_DIR: candidate }),
		await realpath(managedParent),
	);
	const explicit = await mkdtemp(join(tmpdir(), "osdy-pi-extension-explicit-test-"));
	assert.equal(
		await sharedAgentDir({
			OSDY_PI_SHARED_AGENT_DIR: explicit,
			PI_CODING_AGENT_DIR: candidate,
		}),
		explicit,
	);
});

void test("does not traverse malformed agent roots during extension profile discovery", async () => {
	const validCandidate = await mkdtemp(join(tmpdir(), "osdy-pi-extension-list-valid-test-"));
	const managedParent = await mkdtemp(join(tmpdir(), "osdy-pi-extension-list-managed-test-"));
	await mkdir(join(managedParent, "osdy-pi", "profiles", "work"), {
		recursive: true,
	});
	await symlink(join(managedParent, "osdy-pi"), join(validCandidate, "osdy-pi"));
	assert.deepEqual(
		await availableProfiles(await sharedAgentDir({ PI_CODING_AGENT_DIR: validCandidate })),
		["work"],
	);

	const malformedCandidate = await mkdtemp(join(tmpdir(), "osdy-pi-extension-list-malformed-test-"));
	const wrongChild = await mkdtemp(join(tmpdir(), "osdy-pi-extension-list-wrong-child-test-"));
	await mkdir(join(wrongChild, "profiles", "private"), { recursive: true });
	await symlink(wrongChild, join(malformedCandidate, "osdy-pi"));
	assert.deepEqual(
		await availableProfiles(await sharedAgentDir({ PI_CODING_AGENT_DIR: malformedCandidate })),
		[],
	);
});

void test("parses default account command output without treating status text as a profile", () => {
	assert.deepEqual(
		parseDefaultAccountResult({ code: 0, stdout: "work\n", stderr: "" }),
		{ status: "valid", profile: "work" },
	);
	assert.deepEqual(
		parseDefaultAccountResult({
			code: 0,
			stdout: "No default account.\n",
			stderr: "",
		}),
		{ status: "unset" },
	);
	assert.deepEqual(
		parseDefaultAccountResult({
			code: 0,
			stdout: "Default account metadata is invalid; no account selected.\n",
			stderr: "",
		}),
		{ status: "invalid" },
	);
	assert.deepEqual(
		parseDefaultAccountResult({
			code: 0,
			stdout: "unexpected output",
			stderr: "",
		}),
		{
			status: "error",
			message: "unexpected default account output: unexpected output",
		},
	);
	assert.deepEqual(
		parseDefaultAccountResult({
			code: 1,
			stdout: "",
			stderr: "command failed\n",
		}),
		{ status: "error", message: "command failed" },
	);
});

void test("shows parsed default status and account info accurately", async (t) => {
	await t.test(
		"Show current distinguishes valid, unset, invalid, and unavailable defaults",
		async () => {
			for (const [result, expected] of [
				[{ code: 0, stdout: "work\n", stderr: "" }, "Default account: work"],
				[
					{ code: 0, stdout: "No default account.\n", stderr: "" },
					"No default account.",
				],
				[
					{
						code: 0,
						stdout: "Default account metadata is invalid; no account selected.\n",
						stderr: "",
					},
					"Default account metadata is invalid; no account selected.",
				],
				[
					{ code: 0, stdout: "bad status", stderr: "" },
					"Default account is unavailable; clear or fix the default account before continuing.",
				],
			] as const) {
				const notices: string[] = [];
				const answers = ["Default", "Show current", "Cancel"];
				await manageAccountProfiles(
					{
						isIdle: () => true,
						waitForIdle: () => Promise.resolve(),
						shutdown: () => undefined,
						sessionManager: { getSessionFile: () => undefined },
						ui: {
							notify: (message: string) => notices.push(message),
							select: () => Promise.resolve(answers.shift()),
							input: () => Promise.resolve(undefined),
						},
					},
					{
						profiles: () => Promise.resolve(["work"]),
						run: () => Promise.resolve(result),
					},
				);
				assert.deepEqual(notices, [expected]);
			}
		},
	);
	await t.test(
		"Show current warns when the default command cannot start",
		async () => {
			const notices: string[] = [];
			const answers = ["Default", "Show current", "Cancel"];
			await manageAccountProfiles(
				{
					isIdle: () => true,
					waitForIdle: () => Promise.resolve(),
					shutdown: () => undefined,
					sessionManager: { getSessionFile: () => undefined },
					ui: {
						notify: (message: string) => notices.push(message),
						select: () => Promise.resolve(answers.shift()),
						input: () => Promise.resolve(undefined),
					},
				},
				{
					profiles: () => Promise.resolve(["work"]),
					run: () => Promise.reject(new Error("spawn failed")),
				},
			);
			assert.deepEqual(notices, [
				"Default account is unavailable; clear or fix the default account before continuing.",
			]);
		},
	);
	await t.test(
		"Account info marks only valid defaults and explains invalid metadata",
		async () => {
			const notices: string[] = [];
			const answers = ["Account info", "Cancel"];
			await manageAccountProfiles(
				{
					isIdle: () => true,
					waitForIdle: () => Promise.resolve(),
					shutdown: () => undefined,
					sessionManager: { getSessionFile: () => undefined },
					ui: {
						notify: (message: string) => notices.push(message),
						select: () => Promise.resolve(answers.shift()),
						input: () => Promise.resolve(undefined),
					},
				},
				{
					profiles: () => Promise.resolve(["work"]),
					run: () =>
						Promise.resolve({
							code: 0,
							stdout: "Default account metadata is invalid; no account selected.\n",
							stderr: "",
						}),
				},
			);
			assert.deepEqual(notices, [
				"Accounts:\nwork\nDefault account metadata is invalid; clear or fix the default account.",
			]);
		},
	);
	await t.test(
		"Account info notes an unavailable default without marking a profile",
		async () => {
			const notices: string[] = [];
			const answers = ["Account info", "Cancel"];
			await manageAccountProfiles(
				{
					isIdle: () => true,
					waitForIdle: () => Promise.resolve(),
					shutdown: () => undefined,
					sessionManager: { getSessionFile: () => undefined },
					ui: {
						notify: (message: string) => notices.push(message),
						select: () => Promise.resolve(answers.shift()),
						input: () => Promise.resolve(undefined),
					},
				},
				{
					profiles: () => Promise.resolve(["work"]),
					run: () => Promise.resolve({ code: 1, stdout: "", stderr: "failed" }),
				},
			);
			assert.deepEqual(notices, ["Accounts:\nwork\nDefault account unavailable."]);
		},
	);
});

void test("protects removal when the default metadata is invalid or unavailable", async () => {
	for (const result of [
		{
			code: 0,
			stdout: "Default account metadata is invalid; no account selected.\n",
			stderr: "",
		},
		{ code: 0, stdout: "bad status", stderr: "" },
	]) {
		const calls: string[][] = [];
		const notices: string[] = [];
		await manageAccountProfile(
			{
				isIdle: () => true,
				waitForIdle: () => Promise.resolve(),
				shutdown: () => undefined,
				sessionManager: { getSessionFile: () => undefined },
				ui: {
					notify: (message: string) => notices.push(message),
					select: () => Promise.resolve("work"),
					input: () => Promise.resolve("work"),
				},
			},
			"remove",
			{
				profiles: () => Promise.resolve(["work", "other"]),
				run: (args) => {
					calls.push(args);
					return Promise.resolve(result);
				},
			},
		);
		assert.deepEqual(calls, [["account", "default"]]);
		assert.match(notices[0] ?? "", /clear or fix the default account/);
	}
});

void test("opens a looped account manager and exits cleanly on Cancel", async () => {
	const calls: string[][] = [];
	const notices: string[] = [];
	const answers = ["Account info", "Cancel"];
	await manageAccountProfiles(
		{
			isIdle: () => true,
			waitForIdle: () => Promise.resolve(),
			shutdown: () => assert.fail("must not close"),
			sessionManager: { getSessionFile: () => undefined },
			ui: {
				notify: (message: string) => notices.push(message),
				select: () => Promise.resolve(answers.shift()),
				input: () => Promise.resolve(undefined),
			},
		},
		{
			profiles: () => Promise.resolve(["work"]),
			run: (args) => {
				calls.push(args);
				return Promise.resolve({ code: 0, stdout: "work\n", stderr: "" });
			},
		},
	);
	assert.deepEqual(calls, [
		["account", "default"],
		["account", "default"],
	]);
	assert.deepEqual(notices, ["Accounts:\nwork (default)"]);
});

void test("marks active and default profiles case-insensitively while preserving stored spelling", async () => {
	const notices: string[] = [];
	const answers = ["Account info", "Cancel"];
	await manageAccountProfiles(
		{
			isIdle: () => true,
			waitForIdle: () => Promise.resolve(),
			ui: {
				notify: (message: string) => notices.push(message),
				select: () => Promise.resolve(answers.shift()),
				input: () => Promise.resolve(undefined),
			},
		},
		{
			profiles: () => Promise.resolve(["Work"]),
			activeProfile: "WORK",
			run: () => Promise.resolve({ code: 0, stdout: "work\n", stderr: "" }),
		},
	);
	assert.deepEqual(notices, ["Accounts:\nWork (active) (default)"]);
});

void test("manages profile rename and permanent removal prompts through authoritative subprocess commands", async (t) => {
	await t.test("rename sequences target and new name", async () => {
		const calls: string[][] = [];
		const notices: string[] = [];
		const answers = ["work", "renamed"];
		await manageAccountProfile(
			{
				isIdle: () => true,
				waitForIdle: () => Promise.resolve(),
				shutdown: () => undefined,
				sessionManager: { getSessionFile: () => undefined },
				ui: {
					notify: (message: string) => notices.push(message),
					select: () => Promise.resolve(answers.shift()),
					input: () => Promise.resolve(answers.shift()),
				},
			},
			"rename",
			{
				profiles: () => Promise.resolve(["active", "work"]),
				activeProfile: "active",
				run: (args) => {
					calls.push(args);
					return Promise.resolve({ code: 0, stdout: "", stderr: "" });
				},
			},
		);
		assert.deepEqual(calls, [["account", "rename", "work", "renamed"]]);
		assert.deepEqual(notices, ["Account profile renamed to renamed."]);
	});
	await t.test(
		"default removal selects replacement and cancellation is a no-op",
		async () => {
			const calls: string[][] = [];
			const answers = ["work", "other", "work"];
			await manageAccountProfile(
				{
					isIdle: () => true,
					waitForIdle: () => Promise.resolve(),
					shutdown: () => undefined,
					sessionManager: { getSessionFile: () => undefined },
					ui: {
						notify: () => undefined,
						select: () => Promise.resolve(answers.shift()),
						input: () => Promise.resolve(answers.shift()),
					},
				},
				"remove",
				{
					profiles: () => Promise.resolve(["active", "work", "other"]),
					activeProfile: "active",
					run: (args) => {
						calls.push(args);
						return Promise.resolve(
							args[1] === "default"
								? { code: 0, stdout: "work\n", stderr: "" }
								: { code: 0, stdout: "", stderr: "" },
						);
					},
				},
			);
			assert.deepEqual(calls, [
				["account", "default"],
				[
					"account",
					"remove",
					"work",
					"--confirm",
					"work",
					"--replacement",
					"other",
				],
			]);
		},
	);
	await t.test(
		"cancellation is a no-op and failures notify without closing Pi",
		async () => {
			const notices: string[] = [];
			await manageAccountProfile(
				{
					isIdle: () => true,
					waitForIdle: () => Promise.resolve(),
					shutdown: () => assert.fail("must not close"),
					sessionManager: { getSessionFile: () => undefined },
					ui: {
						notify: (message: string) => notices.push(message),
						select: () => Promise.resolve(undefined),
						input: () => Promise.resolve(undefined),
					},
				},
				"remove",
				{
					profiles: () => Promise.resolve(["work"]),
					run: () => Promise.resolve({ code: 1, stdout: "", stderr: "unused" }),
				},
			);
			assert.equal(notices.length, 0);
			const answers: string[] = ["work", "renamed"];
			await manageAccountProfile(
				{
					isIdle: () => true,
					waitForIdle: () => Promise.resolve(),
					shutdown: () => assert.fail("must not close"),
					sessionManager: { getSessionFile: () => undefined },
					ui: {
						notify: (message: string) => notices.push(message),
						select: () => Promise.resolve(answers.shift()),
						input: () => Promise.resolve(answers.shift()),
					},
				},
				"rename",
				{
					profiles: () => Promise.resolve(["work"]),
					run: () => Promise.resolve({ code: 1, stdout: "", stderr: "failed" }),
				},
			);
			assert.deepEqual(notices, ["Rename failed: failed"]);
		},
	);
});

void test("switches in place after idle without spawning or shutting down", async () => {
	const events: string[] = [];
	let idle = false;
	await switchAccountInPlace(
		{
			isIdle: () => idle,
			waitForIdle: () =>
				Promise.resolve().then(() => {
					events.push("idle");
					idle = true;
				}),
			ui: {
				notify: (message: string) => events.push(message),
				select: () => Promise.resolve(undefined),
				input: () => Promise.resolve(undefined),
			},
		},
		"work",
		(profile) =>
			Promise.resolve().then(() => {
				events.push(`activate ${profile}`);
			}),
		() =>
			Promise.resolve().then(() => {
				events.push("refresh");
			}),
		() => {
			events.push(`render ${process.env.OSDY_PI_PROFILE_NAME}`);
		},
	);
	assert.deepEqual(events, [
		"idle",
		"activate work",
		"render work",
		"refresh",
		"Switched to work. Your next request uses this account.",
	]);
});

void test("base-context account switches require idle without a command wait hook", async () => {
	const previous = process.env.OSDY_PI_PROFILE_NAME;
	try {
		for (const idle of [false, true]) {
			process.env.OSDY_PI_PROFILE_NAME = "personal";
			const events: string[] = [];
			const notices: string[] = [];
			const ctx = { isIdle: () => idle, ui: {
				notify: (message: string) => notices.push(message),
				select: () => Promise.resolve(undefined), input: () => Promise.resolve(undefined),
			} };
			assert.equal("waitForIdle" in ctx, false);
			const switched = await switchAccountInPlace(ctx, "work",
				profile => { events.push(`activate:${profile}`); return Promise.resolve(); },
				() => { events.push("refresh"); return Promise.resolve(); },
				() => { events.push("render"); });
			assert.equal(switched, idle);
			assert.deepEqual(events, idle ? ["activate:work", "render", "refresh"] : []);
			assert.equal(process.env.OSDY_PI_PROFILE_NAME, idle ? "work" : "personal");
			assert.match(notices.join(" "), idle ? /Switched to work/ : /require Pi to be idle/);
		}
	} finally {
		if (previous === undefined) delete process.env.OSDY_PI_PROFILE_NAME;
		else process.env.OSDY_PI_PROFILE_NAME = previous;
	}
});

void test("a command wait hook cannot activate an account if Pi remains busy", async () => {
	const events: string[] = [];
	const switched = await switchAccountInPlace({ isIdle: () => false,
		waitForIdle: () => { events.push("wait"); return Promise.resolve(); },
		ui: { notify: message => events.push(message), select: () => Promise.resolve(undefined), input: () => Promise.resolve(undefined) },
	}, "work", () => { events.push("activate"); return Promise.resolve(); },
	() => { events.push("refresh"); return Promise.resolve(); }, () => { events.push("render"); });
	assert.equal(switched, false);
	assert.equal(events[0], "wait");
	assert.match(events[1] ?? "", /require Pi to be idle/);
	assert.equal(events.length, 2);
});

void test("keeps the current account when in-place activation fails", async () => {
	const notices: string[] = [];
	let renderRequested = false;
	await switchAccountInPlace(
		{
			isIdle: () => true,
			waitForIdle: () => Promise.resolve(),
			ui: {
				notify: (message: string) => notices.push(message),
				select: () => Promise.resolve(undefined),
				input: () => Promise.resolve(undefined),
			},
		},
		"work",
		() => Promise.reject(new Error("unsafe auth")),
		() => Promise.resolve(assert.fail("must not refresh")),
		() => {
			renderRequested = true;
		},
	);
	assert.equal(renderRequested, false);
	assert.deepEqual(notices, [
		"Cannot switch accounts: the account files could not be safely activated.",
	]);
});

void test("reports a successful switch when usage refresh rejects unexpectedly", async () => {
	const notices: string[] = [];
	let refreshAttempted = false;
	await switchAccountInPlace(
		{
			isIdle: () => true,
			waitForIdle: () => Promise.resolve(),
			ui: {
				notify: (message: string) => notices.push(message),
				select: () => Promise.resolve(undefined),
				input: () => Promise.resolve(undefined),
			},
		},
		"work",
		() => Promise.resolve(),
		() => {
			refreshAttempted = true;
			return Promise.reject(new Error("unexpected refresh failure"));
		},
	);
	assert.equal(refreshAttempted, true);
	assert.deepEqual(notices, [
		"Switched to work. Your next request uses this account.",
	]);
});

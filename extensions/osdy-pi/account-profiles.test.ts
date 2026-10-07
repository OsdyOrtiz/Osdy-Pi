import assert from "node:assert/strict";
import { mkdtemp, mkdir, realpath, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
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
} from "./account-profiles.ts";

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

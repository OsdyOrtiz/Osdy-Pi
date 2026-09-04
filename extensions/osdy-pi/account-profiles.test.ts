import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import type { ChildProcess } from "node:child_process";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore Node's native TypeScript runner resolves test-only TypeScript source imports.
import { handoffToAccount, manageAccountProfile, manageAccountProfiles, parseDefaultAccountResult, waitForLauncherReady } from "./account-profiles.ts";

class FakeLauncher extends EventEmitter {
	disconnected = false;
	unreferenced = false;

	disconnect(): void {
		this.disconnected = true;
	}

	unref(): void {
		this.unreferenced = true;
	}

	asChildProcess(): ChildProcess {
		return this as unknown as ChildProcess;
	}
}

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

void test("waits for the Pi-ready IPC message before disconnecting the launcher", async () => {
	const launcher = new FakeLauncher();
	const ready = waitForLauncherReady(launcher.asChildProcess());
	assert.equal(launcher.disconnected, false);
	launcher.emit("spawn");
	assert.equal(launcher.disconnected, false);
	launcher.emit("message", { type: "osdy-pi-ready" });
	await ready;
	assert.equal(launcher.disconnected, true);
	assert.equal(launcher.unreferenced, true);
});

void test("rejects launcher error, early exit, and timeout before readiness", async (t) => {
	await t.test("error message", async () => {
		const launcher = new FakeLauncher();
		const ready = waitForLauncherReady(launcher.asChildProcess());
		launcher.emit("message", {
			type: "osdy-pi-error",
			message: "Pi spawn failed",
		});
		await assert.rejects(ready, /Pi spawn failed/);
	});
	await t.test("early exit", async () => {
		const launcher = new FakeLauncher();
		const ready = waitForLauncherReady(launcher.asChildProcess());
		launcher.emit("exit", 1, null);
		await assert.rejects(ready, /exited before confirming readiness/);
	});
	await t.test("timeout", async () => {
		const launcher = new FakeLauncher();
		let expire: (() => void) | undefined;
		const ready = waitForLauncherReady(
			launcher.asChildProcess(),
			10,
			(callback) => {
				expire = callback;
				return setTimeout(() => undefined, 60_000);
			},
		);
		expire?.();
		await assert.rejects(ready, /timed out/);
	});
});

void test("account handoff waits for idle, starts the launcher with the current session, then shuts down", async () => {
	const events: string[] = [];
	await handoffToAccount(
		{
			isIdle: () => false,
			waitForIdle: () =>
				Promise.resolve().then(() => {
					events.push("idle");
				}),
			shutdown: () => events.push("shutdown"),
			sessionManager: { getSessionFile: () => "/tmp/current.jsonl" },
			ui: {
				notify: (message: string) => events.push(message),
				select: () => Promise.resolve(undefined),
				input: () => Promise.resolve(undefined),
			},
		},
		"work",
		{
			spawn: (command, args) =>
				Promise.resolve().then(() => {
					events.push(`${command} ${args.join(" ")}`);
					events.push("spawned");
				}),
		},
	);
	assert.deepEqual(events, [
		"idle",
		"osdy-pi account use work -- --session /tmp/current.jsonl",
		"spawned",
		"shutdown",
	]);
});

void test("account handoff keeps the current Pi session running when its session cannot be safely resumed", async () => {
	const notices: string[] = [];
	await handoffToAccount(
		{
			isIdle: () => true,
			waitForIdle: () => Promise.resolve(),
			shutdown: () => assert.fail("must not shut down"),
			sessionManager: { getSessionFile: () => undefined },
			ui: {
				notify: (message: string) => notices.push(message),
				select: () => Promise.resolve(undefined),
				input: () => Promise.resolve(undefined),
			},
		},
		"work",
		{ spawn: () => Promise.resolve().then(() => assert.fail("must not launch")) },
	);
	assert.deepEqual(notices, [
		"Cannot switch accounts: the current session has not been saved yet.",
	]);
});

void test("account handoff keeps the current Pi session running when the launcher fails asynchronously", async () => {
	const events: string[] = [];
	await handoffToAccount(
		{
			isIdle: () => true,
			waitForIdle: () => Promise.resolve(),
			shutdown: () => events.push("shutdown"),
			sessionManager: { getSessionFile: () => "/tmp/current.jsonl" },
			ui: {
				notify: (message: string) => events.push(message),
				select: () => Promise.resolve(undefined),
				input: () => Promise.resolve(undefined),
			},
		},
		"work",
		{
			spawn: () =>
				Promise.resolve().then(() => {
					events.push("launch attempted");
					throw new Error("not found");
				}),
		},
	);
	assert.deepEqual(events, [
		"launch attempted",
		"Cannot switch accounts: unable to start the replacement Pi process.",
	]);
});

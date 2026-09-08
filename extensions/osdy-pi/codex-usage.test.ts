import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import test from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";

registerHooks({
	resolve(specifier, context, nextResolve) {
		if (
			specifier.startsWith(".") &&
			specifier.endsWith(".js") &&
			context.parentURL?.endsWith(".ts")
		) {
			const sourceUrl = new URL(`${specifier.slice(0, -3)}.ts`, context.parentURL);
			if (existsSync(fileURLToPath(sourceUrl))) {
				return { shortCircuit: true, url: sourceUrl.href };
			}
		}
		return nextResolve(specifier, context);
	},
	load(url, context, nextLoad) {
		if (url.endsWith(".ts")) {
			const source = readFileSync(fileURLToPath(url), "utf8");
			return {
				format: "module",
				shortCircuit: true,
				source: ts.transpileModule(source, {
					compilerOptions: {
						module: ts.ModuleKind.ESNext,
						target: ts.ScriptTarget.ES2022,
					},
				}).outputText,
			};
		}
		return nextLoad(url, context);
	},
});

const { extractCodexAccountId, fetchCodexUsage, parseCodexUsagePayload } =
	await import("./codex-usage.js");

function codexToken(accountId: string): string {
	const encode = (value: unknown): string =>
		Buffer.from(JSON.stringify(value)).toString("base64url");
	return `${encode({ alg: "none" })}.${encode({
		"https://api.openai.com/auth": { chatgpt_account_id: accountId },
	})}.signature`;
}

const payload = {
	plan_type: "plus",
	ordinary_usage_allowed: true,
	rate_limit: {
		primary_window: {
			used_percent: 37,
			limit_window_seconds: 18_000,
			reset_at: 2_000_000_000,
		},
		secondary_window: {
			used_percent: 71,
			limit_window_seconds: 604_800,
			reset_at: 2_000_100_000,
		},
	},
	credits: {
		has_credits: true,
		unlimited: false,
		balance: "12.50",
		reset_credit_count: 3,
	},
	additional_rate_limits: [
		{
			metered_feature: "codex_spark",
			limit_name: "Spark",
			rate_limit: {
				primary_window: {
					used_percent: 12,
					limit_window_seconds: 3_600,
					reset_at: 2_000_200_000,
				},
			},
		},
	],
};

void test("parses subscription windows, credits, and additional buckets", () => {
	const snapshot = parseCodexUsagePayload(payload, 1_900_000_000_000);

	assert.equal(snapshot.planType, "plus");
	assert.equal(snapshot.ordinaryUsageAllowed, true);
	assert.equal(snapshot.fetchedAt, 1_900_000_000_000);
	assert.deepEqual(snapshot.buckets[0], {
		id: "codex",
		label: undefined,
		primary: {
			usedPercent: 37,
			windowMinutes: 300,
			resetsAt: 2_000_000_000,
		},
		secondary: {
			usedPercent: 71,
			windowMinutes: 10_080,
			resetsAt: 2_000_100_000,
		},
	});
	assert.equal(snapshot.buckets[1]?.id, "codex_spark");
	assert.equal(snapshot.buckets[1]?.label, "Spark");
	assert.deepEqual(snapshot.credits, {
		hasCredits: true,
		unlimited: false,
		balance: "12.50",
		resetCreditCount: 3,
	});
});

void test("accepts null additional rate limits as no additional buckets", () => {
	const snapshot = parseCodexUsagePayload(
		{ ...payload, additional_rate_limits: null },
		1_900_000_000_000,
	);

	assert.deepEqual(snapshot.buckets, [
		{
			id: "codex",
			label: undefined,
			primary: {
				usedPercent: 37,
				windowMinutes: 300,
				resetsAt: 2_000_000_000,
			},
			secondary: {
				usedPercent: 71,
				windowMinutes: 10_080,
				resetsAt: 2_000_100_000,
			},
		},
	]);
});

void test("skips valid additional buckets without nested rate limits", () => {
	for (const rate_limit of [undefined, null]) {
		const snapshot = parseCodexUsagePayload({
			...payload,
			additional_rate_limits: [{ metered_feature: "codex_spark", rate_limit }],
		});

		assert.equal(snapshot.buckets.length, 1);
	}
});

void test("rejects invalid additional rate limit containers", () => {
	for (const additional_rate_limits of ["invalid", {}, 1, ["invalid"]]) {
		assert.throws(
			() => parseCodexUsagePayload({ ...payload, additional_rate_limits }),
			/additional(?:_| )rate.limit/i,
		);
	}
});

void test("rejects additional buckets without a non-empty metered feature", () => {
	for (const entry of [
		{},
		{ metered_feature: null },
		{ metered_feature: "" },
		{ metered_feature: 1 },
		{ metered_feature: {} },
	]) {
		assert.throws(
			() =>
				parseCodexUsagePayload({
					...payload,
					additional_rate_limits: [entry],
				}),
			/metered_feature/i,
		);
	}
});

void test("rejects malformed quota payloads without guessing", () => {
	assert.throws(
		() => parseCodexUsagePayload({ plan_type: "plus", rate_limit: {} }),
		/does not contain any quota windows/i,
	);
	assert.throws(
		() =>
			parseCodexUsagePayload({
				plan_type: "plus",
				rate_limit: { primary_window: { used_percent: "37" } },
			}),
		/used_percent/i,
	);
});

void test("extracts the current ChatGPT account id without exposing the token", () => {
	assert.equal(extractCodexAccountId(codexToken("acct_123")), "acct_123");
	assert.throws(() => extractCodexAccountId("not-a-token"), /account id/i);
});

void test("fetches usage with bounded, non-redirecting authenticated request", async () => {
	const accessToken = codexToken("acct_123");
	let receivedUrl: string | undefined;
	let receivedInit: RequestInit | undefined;
	const fakeFetch: typeof fetch = (url, init) => {
		receivedUrl =
			typeof url === "string"
				? url
				: url instanceof URL
					? url.toString()
					: url.url;
		receivedInit = init;
		return Promise.resolve(
			new Response(JSON.stringify(payload), {
				status: 200,
				headers: { "content-type": "application/json" },
			}),
		);
	};

	const snapshot = await fetchCodexUsage(
		{ accessToken, accountId: "acct_123" },
		{ fetch: fakeFetch, now: () => 1_900_000_000_000 },
	);

	assert.equal(receivedUrl, "https://chatgpt.com/backend-api/wham/usage");
	assert.equal(receivedInit?.method, "GET");
	assert.equal(receivedInit?.redirect, "error");
	const headers = new Headers(receivedInit?.headers);
	assert.equal(headers.get("authorization"), `Bearer ${accessToken}`);
	assert.equal(headers.get("chatgpt-account-id"), "acct_123");
	assert.equal(headers.get("originator"), "pi");
	assert.equal(headers.get("accept"), "application/json");
	assert.match(headers.get("user-agent") ?? "", /^pi \(.+; .+\)$/);
	assert.equal(snapshot.planType, "plus");
});

void test("reports expired Codex sessions on 401 without exposing response bodies or tokens", async () => {
	const accessToken = "secret-access-token";
	const fakeFetch: typeof fetch = () =>
		Promise.resolve(new Response("sensitive upstream response", { status: 401 }));

	await assert.rejects(
		fetchCodexUsage({ accessToken, accountId: "acct_123" }, { fetch: fakeFetch }),
		(error: unknown) => {
			assert(error instanceof Error);
			assert.match(
				error.message,
				/session expired.*\/login|\/login.*session expired/i,
			);
			assert.doesNotMatch(
				error.message,
				/sensitive upstream response|secret-access-token/i,
			);
			return true;
		},
	);
});

void test("reports unavailable usage access on 403 without claiming the session is logged out", async () => {
	const accessToken = "secret-access-token";
	const fakeFetch: typeof fetch = () =>
		Promise.resolve(new Response("sensitive upstream response", { status: 403 }));

	await assert.rejects(
		fetchCodexUsage({ accessToken, accountId: "acct_123" }, { fetch: fakeFetch }),
		(error: unknown) => {
			assert(error instanceof Error);
			assert.match(error.message, /usage access.*unavailable|forbidden/i);
			assert.doesNotMatch(
				error.message,
				/login|logged out|sensitive upstream response|secret-access-token/i,
			);
			return true;
		},
	);
});

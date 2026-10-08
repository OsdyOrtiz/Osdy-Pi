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

const { consumeCodexReset, extractCodexAccountId, fetchCodexUsage, parseCodexUsagePayload } =
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

for (const available_count of [3, 0]) {
	void test(`parses ${available_count} banked resets independently of paid credits`, () => {
		for (const credits of [payload.credits, undefined, null]) {
			const snapshot = parseCodexUsagePayload({
				...payload, credits, rate_limit_reset_credits: { available_count },
			});
			assert.equal(snapshot.bankedResetCount, available_count);
			assert.equal(snapshot.credits?.resetCreditCount, credits?.reset_credit_count);
		}
	});
}

void test("treats missing or null banked reset summaries and counts as unknown", () => {
	for (const rate_limit_reset_credits of [undefined, null, {}, { available_count: null }]) {
		const snapshot = parseCodexUsagePayload({ ...payload, rate_limit_reset_credits });
		assert.equal(snapshot.bankedResetCount, undefined);
		assert.equal(snapshot.credits?.resetCreditCount, 3);
	}
	assert.equal(parseCodexUsagePayload(payload).bankedResetCount, undefined);
});

void test("rejects malformed banked reset summaries", () => {
	for (const rate_limit_reset_credits of ["invalid", 3, false, []]) {
		assert.throws(
			() => parseCodexUsagePayload({ ...payload, rate_limit_reset_credits }),
			/rate_limit_reset_credits.*invalid/i,
		);
	}
});

void test("rejects banked reset counts that are not finite nonnegative integers", () => {
	for (const available_count of [-1, 1.5, NaN, Infinity, -Infinity, "3", false, {}, []]) {
		assert.throws(
			() => parseCodexUsagePayload({ ...payload, rate_limit_reset_credits: { available_count } }),
			/available_count.*invalid/i,
		);
	}
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

const resetDetailsUrl = "https://chatgpt.com/backend-api/wham/rate-limit-reset-credits";
const bankedPayload = { ...payload, rate_limit_reset_credits: { available_count: 5 } };
const resetCredit = (expires_at: unknown, overrides: Record<string, unknown> = {}) => ({
	id: "opaque", status: "available", reset_type: "codex_rate_limits", expires_at, ...overrides,
});
const jsonResponse = (value: unknown) => new Response(JSON.stringify(value));
const detailsFetcher = (details: typeof fetch): typeof fetch => (url, init) =>
	url === resetDetailsUrl ? details(url, init) : Promise.resolve(jsonResponse(bankedPayload));
const syntheticAuth = { accessToken: "synthetic-token", accountId: "acct_fixture" };

void test("normalizes multiple reset identities and expiries without titles or replacing summary count", async () => {
	const valid = ["2026-07-17T00:00:00Z", "2026-07-18T02:00:00+02:00", "2028-02-29T12:34:56.123Z"];
	const expiries = [...valid, null, undefined, "invalid", "2026-02-30T00:00:00Z", "2026-02-29T00:00:00Z",
		"2026-07-17T00:00:00", "2026-07-17", "2026-07-17T24:00:00Z", "2026-07-17T00:60:00Z",
		"2026-07-17T00:00:60Z", "2026-07-17T00:00:00+24:00", "2026-07-17T00:00:00+02:60", 123];
	const snapshot = await fetchCodexUsage(syntheticAuth, { fetch: detailsFetcher(() => Promise.resolve(jsonResponse({
		available_count: 99, credits: expiries.map((value, index) => resetCredit(value, { id: `opaque-${index}`, title: "external title", description: "external description" })),
	}))) });
	assert.equal(snapshot.bankedResetCount, 5);
	assert.deepEqual(snapshot.bankedResetDetails, expiries.map((_, index) => ({ id: `opaque-${index}`, expiresAt: index < valid.length
		? Date.parse(valid[index] ?? "") : undefined })));
	assert.doesNotMatch(JSON.stringify(snapshot), /external title|external description/);
});

void test("keeps valid siblings while filtering malformed, unidentified, wrong-type and unavailable resets", async () => {
	const snapshot = await fetchCodexUsage(syntheticAuth, { fetch: detailsFetcher(() => Promise.resolve(jsonResponse({ credits: [
		null, [], "invalid", {}, resetCredit(null, { id: undefined }), resetCredit(null, { id: " " }),
		resetCredit(null, { id: 1 }), resetCredit(null, { status: "consumed" }), resetCredit(null, { status: "expired" }),
		resetCredit(null, { status: "AVAILABLE" }),
		resetCredit(null, { reset_type: "other" }), resetCredit(null, { reset_type: "CODEX_RATE_LIMITS" }), resetCredit(null),
	] }))) });
	assert.deepEqual(snapshot.bankedResetDetails, [{ id: "opaque", expiresAt: undefined }]);
	assert.equal(snapshot.bankedResetCount, 5);
	const empty = await fetchCodexUsage(syntheticAuth, { fetch: detailsFetcher(() => Promise.resolve(jsonResponse({ credits: [] }))) });
	assert.deepEqual(empty.bankedResetDetails, []);
	assert.equal(empty.bankedResetCount, 5);
});

void test("deduplicates exact reset identities while retaining opaque IDs unchanged", async () => {
	const snapshot = await fetchCodexUsage(syntheticAuth, { fetch: detailsFetcher(() => Promise.resolve(jsonResponse({ credits: [
		resetCredit(null, { id: " exact/+é " }), resetCredit("2026-07-17T00:00:00Z", { id: " exact/+é " }),
		resetCredit(null, { id: "exact/+é" }),
	] }))) });
	assert.deepEqual(snapshot.bankedResetDetails, [{ id: " exact/+é ", expiresAt: undefined }, { id: "exact/+é", expiresAt: undefined }]);
	assert.equal(snapshot.bankedResetCount, 5);
});

const consumeRequest = { creditId: " exact-selected/+é-id ", requestId: "12345678-1234-4abc-8def-123456789abc" };
const consumeUrl = `${resetDetailsUrl}/consume`;

for (const code of ["reset", "nothing_to_reset", "no_credit", "already_redeemed"]) {
	void test(`consume confirms ${code} with one exact account-bound POST and no ID generation`, async () => {
		for (const windows_reset of [undefined, 0, 2]) {
			const requests: { url: unknown; init: RequestInit | undefined }[] = [];
			const result = await consumeCodexReset(syntheticAuth, consumeRequest, { fetch: (url, init) => {
				requests.push({ url, init });
				return Promise.resolve(jsonResponse({ code, windows_reset, windowsReset: 99, message: "raw backend message",
					credit_id: consumeRequest.creditId, redeem_request_id: consumeRequest.requestId, account_id: syntheticAuth.accountId }));
			} });
			assert.deepEqual(result, { kind: "confirmed", code, windowsReset: windows_reset ?? 0 });
			assert.equal(requests.length, 1);
			assert.equal(requests[0]?.url, consumeUrl);
			const init = requests[0]?.init;
			assert.equal(init?.method, "POST"); assert.equal(init?.redirect, "error");
			assert.equal(init?.body, JSON.stringify({ redeem_request_id: consumeRequest.requestId, credit_id: consumeRequest.creditId }));
			const headers = new Headers(init?.headers);
			assert.deepEqual([...headers.keys()].sort(), ["accept", "authorization", "chatgpt-account-id", "content-type", "originator", "user-agent"]);
			assert.equal(headers.get("authorization"), `Bearer ${syntheticAuth.accessToken}`);
			assert.equal(headers.get("chatgpt-account-id"), syntheticAuth.accountId);
			assert.equal(headers.get("content-type"), "application/json"); assert.equal(headers.get("accept"), "application/json");
			assert.equal(headers.get("originator"), "pi"); assert.match(headers.get("user-agent") ?? "", /^pi \(.+; .+\)$/);
			assert.equal(init?.signal?.aborted, false);
		}
	});
}

void test("invalid consume parameters and malformed auth headers never dispatch or echo inputs", async () => {
	const cases: { auth?: unknown; request?: unknown; timeoutMs?: unknown; reason: string }[] = [
		...[null, {}, { ...consumeRequest, requestId: "" }, { ...consumeRequest, requestId: "raw-private-request-id" },
			{ ...consumeRequest, requestId: ` ${consumeRequest.requestId}` }, { ...consumeRequest, requestId: `${consumeRequest.requestId}\n` },
			{ ...consumeRequest, requestId: 123 }]
			.map(request => ({ request, reason: "invalid-request-id" })),
		...[null, "", " ", 1, {}].map(creditId => ({ request: { ...consumeRequest, creditId }, reason: "invalid-credit-id" })),
		...[null, {}, { ...syntheticAuth, accessToken: "" }, { ...syntheticAuth, accountId: " " },
			{ ...syntheticAuth, accessToken: "raw-private-token\nheader" }, { ...syntheticAuth, accountId: "raw-private-account\rheader" },
			{ ...syntheticAuth, accessToken: "raw-private-token\t" }, { ...syntheticAuth, accountId: "non-byte-🙂" }]
			.map(auth => ({ auth, reason: "invalid-auth" })),
		...[0, -1, 0.5, NaN, Infinity, 2 ** 31, "10", null].map(timeoutMs => ({ timeoutMs, reason: "invalid-timeout" })),
	];
	for (const entry of cases) {
		let calls = 0;
		const result: unknown = await Reflect.apply(consumeCodexReset, undefined, [
			"auth" in entry ? entry.auth : syntheticAuth, "request" in entry ? entry.request : consumeRequest,
			{ timeoutMs: entry.timeoutMs, fetch: () => { calls++; return Promise.resolve(jsonResponse({ code: "reset" })); } },
		]);
		assert.deepEqual(result, { kind: "not-sent", reason: entry.reason });
		assert.equal(calls, 0);
	}
	const controller = new AbortController(); controller.abort("raw-private-abort");
	assert.deepEqual(await consumeCodexReset(syntheticAuth, consumeRequest, { signal: controller.signal,
		fetch: () => { assert.fail("pre-aborted consume must not dispatch"); },
	}), { kind: "not-sent", reason: "aborted" });
});

void test("every consume HTTP, network, response shape and body failure after dispatch is unknown without retries or leaks", async () => {
	const privateMessage = [consumeRequest.creditId, consumeRequest.requestId, syntheticAuth.accessToken, syntheticAuth.accountId, "raw backend message"].join(" ");
	const failures: (typeof fetch)[] = [
		...[301, 302, 400, 401, 403, 409, 429, 500].map(status => () => Promise.resolve(new Response(privateMessage, { status }))),
		() => { throw new Error(privateMessage); }, () => Promise.reject(new TypeError(`redirect ${privateMessage}`)),
		() => Promise.resolve(new Response(privateMessage)), () => Promise.resolve(new Response(null)),
		...[null, [], {}, { code: "future_code", message: privateMessage }, { code: "RESET" }, { code: 1 },
			...[-1, 1.5, null, "2", Number.MAX_SAFE_INTEGER + 1].map(windows_reset => ({ code: "reset", windows_reset }))]
			.map(value => () => Promise.resolve(jsonResponse(value))),
		...["invalid", "1000001"].map(length => () => Promise.resolve(new Response(privateMessage, { headers: { "content-length": length } }))),
		() => Promise.resolve(new Response("x".repeat(1_000_001))),
		() => Promise.resolve(new Response(new ReadableStream({ start(controller) { controller.error(new Error(privateMessage)); } }))),
	];
	for (const failure of failures) {
		let calls = 0;
		const result = await consumeCodexReset(syntheticAuth, consumeRequest, { fetch: (url, init) => { calls++; return failure(url, init); } });
		assert.deepEqual(result, { kind: "unknown" });
		assert.equal(calls, 1);
	}
});

for (const cause of ["timeout", "abort"] as const) {
	for (const stage of ["fetch", "body"] as const) {
		void test(`consume ${cause} during ignored-abort ${stage} is bounded unknown, not safe cancellation`, async () => {
			const controller = new AbortController(); let calls = 0; let cancelled = false;
			let timer: ReturnType<typeof setTimeout> | undefined;
			const deadline = new Promise<never>((_resolve, reject) => { timer = setTimeout(() => reject(new Error("unbounded consume")), 250); });
			try {
				const result = await Promise.race([deadline, consumeCodexReset(syntheticAuth, consumeRequest, {
					timeoutMs: cause === "timeout" ? 20 : 10_000, signal: controller.signal, fetch: () => {
						calls++;
						if (cause === "abort") setImmediate(() => controller.abort("raw-private-abort"));
						return stage === "fetch" ? new Promise<Response>(() => {})
							: Promise.resolve(new Response(new ReadableStream({ cancel() { cancelled = true; } })));
					},
				})]);
				assert.deepEqual(result, { kind: "unknown" }); assert.equal(calls, 1); assert.equal(cancelled, stage === "body");
			} finally { clearTimeout(timer); }
		});
	}
}

void test("consume cancels unread rejected responses without waiting on cleanup or leaking its errors", async () => {
	for (const init of [ { status: 500 }, { headers: { "content-length": "invalid" } }, { headers: { "content-length": "1000001" } } ]) {
		for (const cleanup of ["resolved", "rejected", "pending"]) {
			let cancelled = false; let timer: ReturnType<typeof setTimeout> | undefined;
			const deadline = new Promise<never>((_resolve, reject) => { timer = setTimeout(() => reject(new Error("unbounded consume cleanup")), 250); });
			try {
				assert.deepEqual(await Promise.race([deadline, consumeCodexReset(syntheticAuth, consumeRequest, { fetch: () =>
					Promise.resolve(new Response(new ReadableStream({ cancel() {
						cancelled = true;
						if (cleanup === "rejected") return Promise.reject(new Error("raw cleanup message"));
						if (cleanup === "pending") return new Promise<void>(() => {});
					} }), init)),
				})]), { kind: "unknown" });
				assert.equal(cancelled, true);
			} finally { clearTimeout(timer); }
		}
	}
});

void test("consume keeps caller-owned keys unchanged across explicit recovery and different accounts, never retries itself", async () => {
	const requests: { auth: string | null; body: unknown }[] = [];
	const fakeFetch: typeof fetch = (_url, init) => {
		requests.push({ auth: new Headers(init?.headers).get("chatgpt-account-id"), body: init?.body });
		return Promise.resolve(jsonResponse({ code: requests.length === 1 ? "future-code" : "already_redeemed" }));
	};
	assert.deepEqual(await consumeCodexReset(syntheticAuth, consumeRequest, { fetch: fakeFetch }), { kind: "unknown" });
	await new Promise<void>(resolve => setImmediate(resolve));
	assert.equal(requests.length, 1);
	assert.deepEqual(await consumeCodexReset(syntheticAuth, consumeRequest, { fetch: fakeFetch }),
		{ kind: "confirmed", code: "already_redeemed", windowsReset: 0 });
	const next = { requestId: "ABCDEF12-3456-4ABC-8DEF-123456789ABC", creditId: "other-exact-id" };
	await consumeCodexReset({ accessToken: "other-synthetic-token", accountId: "acct_other" }, next, { fetch: fakeFetch });
	assert.deepEqual(requests, [
		...Array.from({ length: 2 }, () => ({ auth: syntheticAuth.accountId,
			body: JSON.stringify({ redeem_request_id: consumeRequest.requestId, credit_id: consumeRequest.creditId }) })),
		{ auth: "acct_other", body: JSON.stringify({ redeem_request_id: next.requestId, credit_id: next.creditId }) },
	]);
});

void test("consume abort after invocation cannot confirm even when fetch resolves a definite response", async () => {
	const controller = new AbortController(); let calls = 0;
	const result = await consumeCodexReset(syntheticAuth, consumeRequest, { signal: controller.signal, fetch: () => {
		calls++; controller.abort("raw backend cancellation");
		return Promise.resolve(jsonResponse({ code: "reset", windows_reset: 2 }));
	} });
	assert.deepEqual(result, { kind: "unknown" }); assert.equal(calls, 1);
});

void test("requests details only for positive summary counts and reuses exact account-bound GET transport", async () => {
	for (const count of [undefined, 0, 2]) {
		for (const accountId of ["acct_first", "acct_second"]) {
			const requests: { url: unknown; init: RequestInit | undefined }[] = [];
			const accessToken = `synthetic-${accountId}`;
			const snapshot = await fetchCodexUsage({ accessToken, accountId }, { fetch: (url, init) => {
				requests.push({ url, init });
				return Promise.resolve(jsonResponse(url === resetDetailsUrl ? { credits: [] }
					: { ...payload, rate_limit_reset_credits: { available_count: count } }));
			} });
			assert.deepEqual(requests.map(request => request.url), ["https://chatgpt.com/backend-api/wham/usage", ...(count ? [resetDetailsUrl] : [])]);
			for (const { init } of requests) {
				assert.equal(init?.method, "GET");
				assert.equal(init?.redirect, "error");
				const headers = new Headers(init?.headers);
				assert.deepEqual([...headers.keys()].sort(), ["accept", "authorization", "chatgpt-account-id", "originator", "user-agent"]);
				assert.equal(headers.get("authorization"), `Bearer ${accessToken}`);
				assert.equal(headers.get("chatgpt-account-id"), accountId);
				assert.equal(headers.get("accept"), "application/json");
				assert.equal(headers.get("originator"), "pi");
				assert.match(headers.get("user-agent") ?? "", /^pi \(.+; .+\)$/);
				assert.equal(init?.signal, requests[0]?.init?.signal);
			}
			assert.equal(snapshot.bankedResetCount, count);
			assert.equal(snapshot.bankedResetDetails === undefined, !count);
		}
	}
});

void test("detail HTTP, network, JSON, shape and body-limit failures preserve summary quota", async () => {
	const failures: (typeof fetch)[] = [
		...[401, 403, 500, 302].map(status => () => Promise.resolve(new Response("sensitive detail", { status }))),
		() => Promise.reject(new Error("sensitive detail")),
		() => Promise.resolve(new Response("invalid sensitive JSON")),
		...[null, {}, { credits: {} }].map(value => () => Promise.resolve(jsonResponse(value))),
		() => Promise.resolve(new Response("x", { headers: { "content-length": "1000001" } })),
		() => Promise.resolve(new Response("x".repeat(1_000_001))),
		() => Promise.resolve(new Response(null)),
		() => Promise.resolve(new Response(new ReadableStream({ start(controller) { controller.error(new Error("sensitive detail")); } }))),
	];
	for (const failure of failures) {
		const snapshot = await fetchCodexUsage(syntheticAuth, { fetch: detailsFetcher(failure), now: () => 123 });
		assert.deepEqual(snapshot, parseCodexUsagePayload(bankedPayload, 123));
		assert.equal(snapshot.bankedResetDetails, undefined);
	}
});

const unreadRejections: [string, ResponseInit][] = [
	["non-OK HTTP", { status: 500 }],
	["invalid content-length", { headers: { "content-length": "invalid" } }],
	["oversized content-length", { headers: { "content-length": "1000001" } }],
];

for (const [label, init] of unreadRejections) {
	for (const cleanup of ["resolved", "rejected", "pending"]) {
		void test(`cancels unread ${label} details with ${cleanup} cleanup without losing summary or hanging`, async (t) => {
			const cancel = t.mock.fn(() => {
				if (cleanup === "rejected") return Promise.reject(new Error("synthetic cleanup failure"));
				if (cleanup === "pending") return new Promise<void>(() => {});
			});
			const response = new Response(new ReadableStream({ cancel }), init);
			let timer: ReturnType<typeof setTimeout> | undefined;
			const deadline = new Promise<never>((_resolve, reject) => {
				timer = setTimeout(() => reject(new Error("unbounded response cleanup")), 250);
			});
			try {
				const snapshot = await Promise.race([deadline, fetchCodexUsage(syntheticAuth, {
					fetch: detailsFetcher(() => Promise.resolve(response)), now: () => 123,
				})]);
				assert.deepEqual(snapshot, parseCodexUsagePayload(bankedPayload, 123));
				assert.equal(snapshot.bankedResetCount, 5);
				assert.equal(snapshot.bankedResetDetails, undefined);
				assert.equal(cancel.mock.callCount(), 1);
			} finally { clearTimeout(timer); }
		});
	}
}

void test("cancels unread rejected summaries without waiting or replacing original errors", async (t) => {
	const cases: [ResponseInit, RegExp][] = [
		[{ status: 401 }, /session expired; use \/login/],
		[{ status: 403 }, /usage access is unavailable or forbidden/],
		[{ status: 500 }, /usage is temporarily unavailable/],
		[{ status: 302 }, /usage is temporarily unavailable/],
		...unreadRejections.slice(1).map(([, init]): [ResponseInit, RegExp] => [init, /response is too large/]),
	];
	for (const [init, message] of cases) {
		const cancel = t.mock.fn(() => new Promise<void>(() => {}));
		const response = new Response(new ReadableStream({ cancel }), init);
		let timer: ReturnType<typeof setTimeout> | undefined;
		const deadline = new Promise<never>((_resolve, reject) => {
			timer = setTimeout(() => reject(new Error("unbounded response cleanup")), 250);
		});
		try {
			await assert.rejects(Promise.race([deadline, fetchCodexUsage(syntheticAuth, {
				fetch: () => Promise.resolve(response),
			})]), message);
			assert.equal(cancel.mock.callCount(), 1);
		} finally { clearTimeout(timer); }
	}
});

void test("details share the bounded timeout even when injected fetch or body ignores abort", async () => {
	for (const stage of ["fetch", "body"]) {
		// Keep timeout's unref'ed timer alive, but bound a broken implementation too.
		let keepAlive: ReturnType<typeof setTimeout> | undefined;
		const deadline = new Promise<never>((_resolve, reject) => { keepAlive = setTimeout(() => reject(new Error("unbounded detail wait")), 250); });
		let bodyCancelled = false;
		try {
			const snapshot = await Promise.race([deadline, fetchCodexUsage(syntheticAuth, { timeoutMs: 20,
				fetch: detailsFetcher(() => stage === "fetch" ? new Promise<Response>(() => {})
					: Promise.resolve(new Response(new ReadableStream({ cancel() { bodyCancelled = true; } })))),
			})]);
			assert.equal(snapshot.bankedResetCount, 5);
			assert.equal(snapshot.bankedResetDetails, undefined);
			assert.equal(bodyCancelled, stage === "body");
		} finally { clearTimeout(keepAlive); }
	}
});

void test("explicit caller cancellation during detail fetch or body rejects instead of returning summary", async () => {
	for (const stage of ["fetch", "body"]) {
		const controller = new AbortController();
		await assert.rejects(fetchCodexUsage(syntheticAuth, { signal: controller.signal, fetch: detailsFetcher(() => {
			setImmediate(() => controller.abort("sensitive reason"));
			if (stage === "fetch") return new Promise<Response>(() => {});
			return Promise.resolve(new Response(new ReadableStream()));
		}) }), (error: unknown) => {
			assert(error instanceof Error);
			assert.match(error.message, /cancel/i);
			assert.doesNotMatch(error.message, /sensitive/);
			return true;
		});
	}
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

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { registerHooks } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

registerHooks({
	resolve(specifier, context, nextResolve) {
		if (specifier.startsWith(".") && specifier.endsWith(".js") && context.parentURL?.endsWith(".ts")) {
			const url = new URL(`${specifier.slice(0, -3)}.ts`, context.parentURL);
			if (existsSync(fileURLToPath(url))) return { shortCircuit: true, url: url.href };
		}
		return nextResolve(specifier, context);
	},
});
const { requestProfileCodexUsage } = await import("./profile-codex-usage.js");
const { readStoredProfileCodexCredential } = await import("./account-profiles.js");
const now = 1_900_000_000_000;
const sentinel = "SECRET-SENTINEL /private/fixture/auth.json";
function token(claims: unknown = { "https://api.openai.com/auth": { chatgpt_account_id: "acct_stored" } }): string {
	return `eyJhbGciOiJub25lIn0.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.signature`;
}
function credential(overrides: Record<string, unknown> = {}) {
	return { profile: "Work", access: token(), expires: now + 60_000, ...overrides };
}
const payload = { rate_limit: { primary_window: { used_percent: 37 } } };
const okFetch: typeof fetch = () => Promise.resolve(new Response(JSON.stringify(payload)));

void test("stored profile quota uses only its snapshot and leaves auth, metadata, settings, models and env unchanged", async () => {
	const root = await mkdtemp(join(tmpdir(), "osdy-profile-quota-"));
	const profileDir = join(root, "osdy-pi", "profiles", "Work");
	await mkdir(profileDir, { recursive: true });
	const paths = [
		join(profileDir, "auth.json"),
		join(root, "auth.json"),
		join(root, "osdy-pi", "active-account.json"),
		join(root, "osdy-pi", "default-account.json"),
		join(root, "settings.json"),
		join(root, "models.json"),
	];
	const storedAuth = JSON.stringify({
		"openai-codex": {
			type: "oauth", access: token(), refresh: sentinel,
			expires: now + 60_000, accountId: "acct_stored",
		},
	});
	for (const path of paths) await writeFile(path, path === paths[0] ? storedAuth : sentinel);
	const hashes = async () => Promise.all(paths.map(async (path) => createHash("sha256").update(await readFile(path)).digest("hex")));
	const before = await hashes();
	const environmentHash = () => createHash("sha256").update(JSON.stringify([
		process.env.OSDY_PI_PROFILE_NAME, process.env.OSDY_PI_SHARED_AGENT_DIR,
		process.env.PI_CODING_AGENT_DIR, process.env.PI_CODING_AGENT_SESSION_DIR,
	])).digest("hex");
	const env = environmentHash();
	let calls = 0;
	const result = await requestProfileCodexUsage("work", {
		readCredentials: (name) => readStoredProfileCodexCredential(root, name),
		now: () => now,
		fetch: async (url, init) => {
			calls++;
			assert.equal(url, "https://chatgpt.com/backend-api/wham/usage");
			assert.equal(init?.redirect, "error");
			assert.equal(init?.method, "GET");
			const headers = new Headers(init?.headers);
			assert.equal(headers.get("authorization"), `Bearer ${token()}`);
			assert.equal(headers.get("chatgpt-account-id"), "acct_stored");
			return okFetch(url, init);
		},
	});
	assert.equal(result.status, "ready");
	assert.equal(result.profile, "Work");
	if (result.status === "ready") assert.equal(result.quotaSnapshot.buckets[0]?.primary?.usedPercent, 37);
	assert.equal(result.checkedAt, now);
	assert.equal(calls, 1);
	assert.doesNotMatch(JSON.stringify(result), /SECRET-SENTINEL|signature|acct_stored|auth.json/);
	assert.deepEqual(await hashes(), before);
	assert.equal(environmentHash(), env);
});

void test("stored profile passes through optional reset details using only that profile's transport and cancellation", async () => {
	for (const outcome of ["success", "failure", "cancelled"]) {
		const controller = new AbortController();
		const urls: unknown[] = [];
		let reads = 0;
		const result = await requestProfileCodexUsage("Work", {
			readCredentials: name => { reads++; assert.equal(name, "Work"); return Promise.resolve(credential()); },
			now: () => now, signal: controller.signal,
			fetch: (url, init) => {
				urls.push(url);
				assert.equal(init?.method, "GET"); assert.equal(init?.redirect, "error");
				const headers = new Headers(init?.headers);
				assert.equal(headers.get("authorization"), `Bearer ${token()}`);
				assert.equal(headers.get("chatgpt-account-id"), "acct_stored");
				if (urls.length === 1) return Promise.resolve(new Response(JSON.stringify({ ...payload, rate_limit_reset_credits: { available_count: 2 } })));
				if (outcome === "cancelled") controller.abort(sentinel);
				if (outcome !== "success") return Promise.reject(new Error(sentinel));
				return Promise.resolve(new Response(JSON.stringify({ available_count: 1, credits: [
					{ id: "opaque", status: "available", reset_type: "codex_rate_limits", expires_at: "2030-07-17T00:00:00Z" },
				] })));
			},
		});
		assert.equal(reads, 1);
		assert.deepEqual(urls, ["https://chatgpt.com/backend-api/wham/usage", "https://chatgpt.com/backend-api/wham/rate-limit-reset-credits"]);
		assert.equal(result.status, outcome === "cancelled" ? "cancelled" : "ready");
		if (result.status === "ready") {
			assert.equal(result.quotaSnapshot.bankedResetCount, 2);
			assert.deepEqual(result.quotaSnapshot.bankedResetDetails, outcome === "success" ? [{ id: "opaque", expiresAt: Date.parse("2030-07-17T00:00:00Z") }] : undefined);
		}
		// Backend identity is internal action data, not a rendered label or credential.
		assert.doesNotMatch(JSON.stringify(result), /SECRET-SENTINEL|signature|acct_stored/);
	}
});

void test("invalid profile inputs never read or fetch and never echo input", async () => {
	for (const name of ["../escape", "default", "Profiles", "auth.json", sentinel, "", null]) {
		const result = await requestProfileCodexUsage(name, {
			readCredentials: () => { assert.fail("must not read"); },
			fetch: () => { assert.fail("must not fetch"); },
			now: () => now,
		});
		assert.equal(result.status, "unavailable");
		assert.equal(result.profile, undefined);
		assert.doesNotMatch(JSON.stringify(result), /SECRET-SENTINEL|escape/);
	}
});

void test("malformed, expired, mismatched and hijacked credential snapshots never fetch", async () => {
	const authClaim = { "https://api.openai.com/auth": { chatgpt_account_id: "acct_stored" } };
	for (const value of [
		null, {},
		credential({ access: "bad" }),
		credential({ access: "a.b" }),
		credential({ access: token({}) }),
		credential({ expires: undefined }),
		credential({ expires: "later" }),
		credential({ expires: now }),
		credential({ accountId: "other" }),
		credential({ accountId: null }),
		credential({ profile: "Other" }),
		credential({ access: token({ ...authClaim, exp: now / 1000 - 1 }) }),
		credential({ access: token({ ...authClaim, exp: "later" }) }),
		credential({ access: token({ ...authClaim, nbf: now / 1000 + 60 }) }),
	]) {
		const result = await requestProfileCodexUsage("Work", {
			readCredentials: () => Promise.resolve(value),
			fetch: () => { assert.fail("must not fetch"); },
			now: () => now,
		});
		assert.equal(result.status, "unavailable");
	}
});

for (const malformedPart of ["header", "payload"] as const) {
	void test(`malformed decoded JWT ${malformedPart} JSON resolves safely without fetching or falling back`, async () => {
		const malformedJson = `{"secret":${JSON.stringify(sentinel)}`;
		const validHeader = JSON.stringify({ alg: "none" });
		const validPayload = JSON.stringify({ "https://api.openai.com/auth": { chatgpt_account_id: "acct_stored" } });
		const header = malformedPart === "header" ? malformedJson : validHeader;
		const claims = malformedPart === "payload" ? malformedJson : validPayload;
		const parts = [header, claims, "synthetic-signature"].map((part) => Buffer.from(part).toString("base64url"));
		const access = parts.join(".");
		assert.equal(parts.length, 3);
		for (const part of parts) assert.match(part, /^[A-Za-z0-9_-]+$/);
		const decoded = parts.slice(0, 2).map((part) => Buffer.from(part, "base64url").toString("utf8"));
		assert.throws(() => JSON.parse(decoded[malformedPart === "header" ? 0 : 1] ?? ""), SyntaxError);
		assert.doesNotThrow(() => JSON.parse(decoded[malformedPart === "header" ? 1 : 0] ?? ""));
		const stored = Object.freeze(credential({ access, accountId: "acct_stored", refresh: sentinel }));
		const before = JSON.stringify(stored);
		const reads: string[] = [];
		let fetchCalls = 0;
		const result = await requestProfileCodexUsage("Work", {
			readCredentials: (profile) => {
				reads.push(profile);
				assert.equal(profile, "Work", "must not read active auth or another profile");
				return Promise.resolve(stored);
			},
			fetch: () => { fetchCalls++; assert.fail("must not fetch invalid credentials"); },
			now: () => now,
		});
		assert.deepEqual(result, {
			status: "unavailable", profile: "Work", checkedAt: now, reason: "stored-credentials-unavailable",
		});
		assert.deepEqual(reads, ["Work"]);
		assert.equal(fetchCalls, 0);
		assert.equal(JSON.stringify(stored), before);
		const serialized = JSON.stringify(result);
		assert.doesNotMatch(serialized, /SECRET-SENTINEL|private|auth.json|acct_stored|refresh|access|quotaSnapshot/);
		for (const secret of [malformedJson, access, sentinel]) assert.equal(serialized.includes(secret), false);
	});
}

void test("reader and transport errors never serialize external secrets or filesystem paths", async () => {
	for (const source of ["reader", "fetch"]) {
		const result = await requestProfileCodexUsage("Work", {
			readCredentials: () => source === "reader" ? Promise.reject(new Error(sentinel)) : Promise.resolve(credential()),
			fetch: () => Promise.reject(new Error(sentinel)),
			now: () => now,
		});
		assert.equal(result.status, "unavailable");
		assert.doesNotMatch(JSON.stringify(result), /SECRET-SENTINEL|private|auth.json/);
	}
});

void test("abort before or after credential read skips fetch; in-flight abort is cancelled, not zero quota", async () => {
	for (const stage of ["before", "after", "fetch"]) {
		const controller = new AbortController();
		let reads = 0;
		let calls = 0;
		if (stage === "before") controller.abort(sentinel);
		const result = await requestProfileCodexUsage("Work", {
			signal: controller.signal,
			readCredentials: () => { reads++; if (stage === "after") controller.abort(sentinel); return Promise.resolve(credential()); },
			fetch: (_url, init) => {
				calls++;
				controller.abort(sentinel);
				assert.equal(init?.signal?.aborted, true);
				return Promise.reject(new Error(sentinel));
			},
			now: () => now,
		});
		assert.equal(result.status, "cancelled");
		assert.equal(reads, stage === "before" ? 0 : 1);
		assert.equal(calls, stage === "fetch" ? 1 : 0);
		assert.doesNotMatch(JSON.stringify(result), /SECRET-SENTINEL|quotaSnapshot/);
	}
});

void test("remote rejection, redirect failure, oversized or invalid payload and timeout become safe unavailable", async () => {
	const fetchers: (typeof fetch)[] = [
		() => Promise.resolve(new Response(sentinel, { status: 401 })),
		() => Promise.resolve(new Response(sentinel, { status: 403 })),
		() => Promise.reject(new TypeError(`redirect ${sentinel}`)),
		() => Promise.resolve(new Response(sentinel, { headers: { "content-length": "1000001" } })),
		() => Promise.resolve(new Response("x".repeat(1_000_001))),
		() => Promise.resolve(new Response(sentinel)),
		() => Promise.resolve(new Response(JSON.stringify({ rate_limit: {} }))),
		async (_url, init) => new Promise((_resolve, reject) => {
			init?.signal?.addEventListener("abort", () => reject(new Error(sentinel)), { once: true });
			// Keep the fixture alive: AbortSignal.timeout itself is unref'ed.
			setTimeout(() => reject(new Error(sentinel)), 25);
		}),
	];
	for (const fetch of fetchers) {
		const result = await requestProfileCodexUsage("Work", { readCredentials: () => Promise.resolve(credential()), fetch, now: () => now, timeoutMs: 1 });
		assert.equal(result.status, "unavailable");
		assert.doesNotMatch(JSON.stringify(result), /SECRET-SENTINEL|private|auth.json|signature|quotaSnapshot/);
	}
});

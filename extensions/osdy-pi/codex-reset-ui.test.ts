import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import test from "node:test";
import { fileURLToPath } from "node:url";
import type { CodexResetResult } from "./codex-reset.js";
registerHooks({ resolve(specifier, context, next) {
	if (specifier.startsWith(".") && specifier.endsWith(".js") && context.parentURL?.endsWith(".ts")) {
		const url = new URL(`${specifier.slice(0, -3)}.ts`, context.parentURL);
		if (existsSync(fileURLToPath(url))) return { shortCircuit: true, url: url.href };
	}
	return next(specifier, context);
} });

void test("choice labels map indexed local expiry to exact IDs, never render opaque identities", async () => {
	const { createCodexResetInteraction } = await import("./codex-reset-ui.js");
	const expiry = Date.parse("2030-07-17T12:30:00Z");
	const choices = [{ creditId: "opaque-first", expiresAt: expiry }, { creditId: "opaque-second", expiresAt: undefined }];
	let answer: number | string | undefined = 1;
	const interaction = createCodexResetInteraction({ select: (_title, options) => {
		assert.deepEqual(options, [`Reset 1 — expires ${new Date(expiry).toLocaleString()} (local time)`, "Reset 2 — Expiry not provided"]);
		assert.doesNotMatch(options.join(""), /opaque-/);
		return Promise.resolve(typeof answer === "number" ? options[answer] : answer);
	} });
	assert.equal(await interaction.choose(choices), "opaque-second");
	for (answer of [undefined, "invented", "opaque-first"]) assert.equal(await interaction.choose(choices), undefined);
});

void test("new and recovery confirmation use Cancel-first select with honest scope/effects/date", async () => {
	const { createCodexResetInteraction } = await import("./codex-reset-ui.js");
	for (const kind of ["new", "recovery"] as const) {
		for (const accept of [false, true, undefined]) {
			const interaction = createCodexResetInteraction({ select: (title, options) => {
				assert.match(title, /active Codex account/);
				assert.match(title, /Expiry not provided/);
				assert.doesNotMatch(title, /opaque-/);
				assert.deepEqual(options, ["Cancel", kind === "new" ? "Use reset" : "Check pending attempt"]);
				if (kind === "new") assert.match(title, /one banked reset/);
				else assert.match(title, /same previous request.*may finish.*not a new attempt/i);
				return Promise.resolve(accept === undefined ? undefined : options[accept ? 1 : 0]);
			} });
			const base = { scope: "active-account", cancelFirst: true, creditId: "opaque-credit", expiresAt: undefined } as const;
			const prompt = kind === "recovery" ? { ...base, kind, requestId: "opaque-request" } : { ...base, kind };
			assert.equal(await interaction.confirm(prompt), accept === true);
		}
	}
});

void test("confirmed codes remain definite and distinguish refresh/journal failures", async () => {
	const { notifyCodexResetResult } = await import("./codex-reset-ui.js");
	for (const code of ["reset", "already_redeemed", "no_credit", "nothing_to_reset"] as const) {
		const notices: string[] = [];
		notifyCodexResetResult({ notify: text => { notices.push(text); } }, { kind: "confirmed", code, windowsReset: 2, refreshFailed: true, journalFailed: true });
		assert.match(notices[0] ?? "", code === "reset" ? /consumed.*2.*windows/i : code === "already_redeemed" ? /previous.*succeeded/i : /not consumed/i);
		assert.match(notices[0] ?? "", /Quota refresh failed/);
		assert.match(notices[0] ?? "", /Local attempt bookkeeping failed/);
		assert.doesNotMatch(notices[0] ?? "", /reset failed|Outcome unknown/i);
	}
});

void test("unknown and blocked feedback never suggests another reset or automatic lock cleanup", async () => {
	const { notifyCodexResetResult } = await import("./codex-reset-ui.js");
	const results: CodexResetResult[] = [{ kind: "unknown", refreshFailed: false, journalFailed: false },
		{ kind: "blocked", journalFailed: true }, { kind: "busy" }, { kind: "unavailable" }, { kind: "cancelled" }];
	const notices: string[] = [];
	for (const result of results) notifyCodexResetResult({ notify: text => { notices.push(text); } }, result);
	assert.equal(notices[0], "Outcome unknown; do not start another reset. Use check to confirm the same pending attempt.");
	assert.match(notices[1] ?? "", /blocked.*manual verification/i);
	assert.doesNotMatch(notices.join(""), /opaque|token|\.json|auto.*reclaim/i);
});

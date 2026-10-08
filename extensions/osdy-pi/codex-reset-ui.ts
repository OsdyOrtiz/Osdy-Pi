import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { CodexResetInteraction, CodexResetResult } from "./codex-reset.js";

export type CodexResetAction = () => Promise<boolean>;
const expiryLabel = (expiresAt: number | undefined): string => expiresAt === undefined
	? "Expiry not provided" : `expires ${new Date(expiresAt).toLocaleString()} (local time)`;

/** Presentation only. Opaque IDs stay in the indexed mapping, not dialog text. */
export function createCodexResetInteraction(ui: Pick<ExtensionContext["ui"], "select">): CodexResetInteraction {
	return {
		async choose(choices) {
			const labels = choices.map((choice, index) => `Reset ${index + 1} — ${expiryLabel(choice.expiresAt)}`);
			const selected = await ui.select("Choose a banked reset for the active Codex account", labels);
			const index = selected === undefined ? -1 : labels.indexOf(selected);
			return choices[index]?.creditId;
		},
		async confirm(prompt) {
			const recovery = prompt.kind === "recovery";
			const effect = recovery
				? "Check the same previous request; this may finish the previous unconfirmed reset, not a new attempt."
				: "Use one banked reset; one banked reset will be consumed if rate limits are reset.";
			const accept = recovery ? "Check pending attempt" : "Use reset";
			return await ui.select(`For the active Codex account: ${effect}\nReset ${expiryLabel(prompt.expiresAt)}.`, ["Cancel", accept]) === accept;
		},
	};
}

/** Definite server outcomes are never relabelled as failures by later local work. */
export function notifyCodexResetResult(ui: Pick<ExtensionContext["ui"], "notify">, result: CodexResetResult): void {
	let message: string;
	switch (result.kind) {
		case "busy": message = "A banked reset action is already in progress."; break;
		case "cancelled": message = "Banked reset action cancelled; no new reset was sent."; break;
		case "unavailable": message = "No currently available banked reset could be selected. Refresh usage to check availability."; break;
		case "blocked": message = "Banked reset action blocked. Local attempt storage or its lock is unavailable; manual verification is required. No automatic cleanup or retry."; break;
		case "unknown": message = "Outcome unknown; do not start another reset. Use check to confirm the same pending attempt."; break;
		case "confirmed":
			switch (result.code) {
				case "reset": message = `Banked reset consumed; ${result.windowsReset} rate-limit windows reset.`; break;
				case "already_redeemed": message = "The previous reset already succeeded; this check did not consume another reset."; break;
				case "no_credit": message = "No banked reset was available; a reset was not consumed."; break;
				case "nothing_to_reset": message = "No rate limits needed resetting; a banked reset was not consumed."; break;
			}
	}
	if (result.kind === "unknown" || result.kind === "confirmed") {
		if (result.refreshFailed) message += " Quota refresh failed; the consumption outcome above is unchanged.";
		if (result.journalFailed) message += " Local attempt bookkeeping failed; do not start another reset before manual verification.";
	}
	const warning = result.kind === "unknown" || result.kind === "blocked" || result.kind === "busy" || result.kind === "unavailable" ||
		(result.kind === "confirmed" && (result.refreshFailed || result.journalFailed));
	ui.notify(message, warning ? "warning" : "info");
}

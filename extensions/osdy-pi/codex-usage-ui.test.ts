import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
	visibleWidth,
	type Component,
	type TUI,
} from "@earendil-works/pi-tui";
import type { SimpleTheme } from "./types.js";
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

const {
	CODEX_USAGE_OVERLAY_OPTIONS,
	formatCodexUsageMetadata,
	formatCodexUsageWindow,
	renderCompactCodexQuotaBars,
	formatRemainingPercent,
	renderCodexUsageDashboardLines,
	renderCodexUsagePanelLines,
	renderCodexUsageReadyLines,
	resolveCodexUsageLayout,
	showCodexUsagePanel,
} = await import("./codex-usage-ui.js");

const stripLabelSgr = (text: string): string =>
	text.replaceAll("\u001B[1m", "").replaceAll("\u001B[22m", "");

void test("formats cached Codex quota metadata without session token activity", () => {
	const snapshot = {
		planType: "plus",
		ordinaryUsageAllowed: true,
		buckets: [
			{
				id: "codex",
				label: undefined,
				primary: { usedPercent: 37, windowMinutes: 300, resetsAt: undefined },
				secondary: { usedPercent: 71, windowMinutes: 10_080, resetsAt: undefined },
			},
		],
		credits: undefined,
		fetchedAt: 1_900_000_000_000,
	};

	assert.equal(formatRemainingPercent(37), "63% left");
	assert.equal(
		formatCodexUsageMetadata("openai-codex/gpt-5.6-sol", "medium", snapshot),
		"openai-codex/gpt-5.6-sol · think medium · 5h 63% left · 7d 29% left",
	);
});

void test("formats quota resets with an injected relative clock and stable UTC fallback", () => {
	assert.equal(
		formatCodexUsageWindow(
			{ usedPercent: 37, windowMinutes: 300, resetsAt: 1_893_463_200 },
			1_893_456_000_000,
		),
		"5h 63% left · resets in 2h (2030-01-01 02:00 UTC)",
	);
});

void test("renders reset timing for every dashboard quota window", () => {
	const theme = { fg: (_name: string, text: string): string => text };
	const lines = renderCodexUsageReadyLines(
		theme,
		{
			planType: "plus",
			ordinaryUsageAllowed: true,
			buckets: [
				{
					id: "codex",
					label: undefined,
					primary: { usedPercent: 37, windowMinutes: 300, resetsAt: 1_893_463_200 },
					secondary: {
						usedPercent: 71,
						windowMinutes: 10_080,
						resetsAt: 1_893_455_940,
					},
				},
				{
					id: "additional",
					label: "Additional",
					primary: { usedPercent: 25, windowMinutes: 60, resetsAt: undefined },
					secondary: {
						usedPercent: 50,
						windowMinutes: 120,
						resetsAt: 1_893_456_030,
					},
				},
			],
			credits: undefined,
			fetchedAt: 1_900_000_000_000,
		},
		1_893_456_000_000,
	);

	assert.deepEqual(
		lines
			.map(stripLabelSgr)
			.filter((line) => line.startsWith("Session:") || line.startsWith("Weekly:")),
		[
			"Session: ██████░░░░ 63% left · resets in 2h (2030-01-01 02:00 UTC)",
			"Weekly: ███░░░░░░░ 29% left · reset time passed (2029-12-31 23:59 UTC)",
			"Session: ████████░░ 75% left",
			"Weekly: █████░░░░░ 50% left · resets in 30s (2030-01-01 00:00 UTC)",
		],
	);
});

void test("renders Session and Weekly window cards side-by-side in a wide single-bucket dashboard", () => {
	const theme = { fg: (_name: string, text: string): string => text };
	const lines = renderCodexUsageDashboardLines(
		theme,
		{
			planType: "plus",
			ordinaryUsageAllowed: true,
			buckets: [
				{
					id: "codex",
					label: undefined,
					primary: { usedPercent: 37, windowMinutes: 300, resetsAt: 1_893_463_200 },
					secondary: {
						usedPercent: 71,
						windowMinutes: 10_080,
						resetsAt: 1_893_463_200,
					},
				},
			],
			credits: {
				hasCredits: true,
				unlimited: false,
				balance: "12.50",
				resetCreditCount: 2,
			},
			fetchedAt: 1_893_456_000_000,
		},
		{ profile: "work", provider: "openai-codex", model: "openai-codex/gpt-5.6" },
		1_893_456_000_000,
		100,
	);

	assert.ok(
		lines.some((line) => line.includes("Session") && line.includes("Weekly")),
	);
	assert.ok(lines.includes("Codex [codex]"));
	assert.deepEqual(
		lines.filter(
			(line) =>
				line.includes("Plan:") ||
				line.includes("Profile:") ||
				line.includes("Credits:"),
		),
		[
			"Profile: work · Provider: openai-codex · Model: openai-codex/gpt-5.6",
			"Plan: plus · Availability: allowed",
			"Credits: 12.50 · Credit resets: 2",
		],
	);
	assert.ok(
		lines.some(
			(line) =>
				stripLabelSgr(line).includes("Codex Session") &&
				line.includes("63% left") &&
				line.includes("37% used"),
		),
	);
	assert.ok(lines.some((line) => line.includes("Window: 5h")));
	assert.ok(lines.some((line) => line.includes("Local:")));
	assert.ok(lines.some((line) => line.includes("UTC: 2030-01-01 02:00 UTC")));
	const mainDetailLines = lines.slice(0, lines.indexOf("Quotas + account"));
	assert.ok(
		!mainDetailLines.some(
			(line) => line.includes("% used") || line.includes("█"),
		),
	);
	assert.equal(lines.at(-1)?.trim(), "r refresh · esc/q close");
});

void test("omits unavailable account fields while preserving defined false and zero values", () => {
	const theme = { fg: (_name: string, text: string): string => text };
	const baseSnapshot = {
		planType: undefined,
		ordinaryUsageAllowed: undefined,
		buckets: [],
		credits: {
			hasCredits: true,
			unlimited: false,
			balance: "12.50",
			resetCreditCount: undefined,
		},
		fetchedAt: 1_893_456_000_000,
	};
	const unavailableLines = renderCodexUsageDashboardLines(theme, baseSnapshot);
	assert.ok(!unavailableLines.some((line) => line.includes("Plan:")));
	assert.ok(!unavailableLines.some((line) => line.includes("Availability:")));
	assert.ok(unavailableLines.includes("Credits: 12.50"));
	assert.ok(!unavailableLines.some((line) => line.includes("Credit resets:")));

	const definedLines = renderCodexUsageDashboardLines(theme, {
		...baseSnapshot,
		ordinaryUsageAllowed: false,
		credits: { ...baseSnapshot.credits, resetCreditCount: 0 },
	});
	assert.ok(definedLines.includes("Availability: not allowed"));
	assert.ok(definedLines.includes("Credits: 12.50 · Credit resets: 0"));
});

void test("sanitizes presentation provider and model fields in the quota footer", () => {
	const theme = { fg: (_name: string, text: string): string => text };
	const snapshot = {
		planType: "plus",
		ordinaryUsageAllowed: true,
		buckets: [
			{
				id: "codex",
				label: undefined,
				primary: { usedPercent: 37, windowMinutes: 300, resetsAt: undefined },
				secondary: undefined,
			},
		],
		credits: undefined,
		fetchedAt: 1_900_000_000_000,
	};

	const sanitized = renderCodexUsageDashboardLines(theme, snapshot, {
		provider: "\u001B[31m custom\tprovider\u0007 \u001B[0m\n",
		model: "\u001B[2J gpt\u0000-5.6\t\n",
	});
	assert.deepEqual(
		sanitized.find((line) => line.includes("Profile:")),
		"Profile: none · Provider: custom provider · Model: gpt-5.6",
	);
	assert.ok(
		sanitized.every((line) =>
			Array.from(stripLabelSgr(line)).every((character) => {
				const code = character.charCodeAt(0);
				return code >= 32 && (code < 127 || code > 159);
			}),
		),
	);

	const fallback = renderCodexUsageDashboardLines(theme, snapshot, {
		provider: "\u001B[31m\u001B[0m\u0000",
		model: "\n\t",
	});
	assert.ok(
		fallback.includes("Profile: none · Provider: unknown · Model: unknown"),
	);
});

void test("uses a themed double outer frame and keeps controls only on its final line", () => {
	const theme = { fg: (_name: string, text: string): string => text };
	const lines = renderCodexUsagePanelLines(
		theme,
		{ kind: "loading", snapshot: undefined },
		{},
		1_893_456_000_000,
		60,
	);
	assert.match(lines[0] ?? "", /^╔.*╗$/);
	assert.match(lines.at(-1) ?? "", /^╚.*╝$/);
	assert.equal(
		lines.filter(
			(line) => line.includes("refresh") || line.includes("esc/q close"),
		).length,
		1,
	);
	assert.match(lines.at(-2) ?? "", /r refresh · esc\/q close/);
});

void test("fills modal footer quota bars from remaining capacity", () => {
	const theme = { fg: (_name: string, text: string): string => text };
	for (const { usedPercent, filled } of [
		{ usedPercent: 0, filled: 28 },
		{ usedPercent: 37, filled: 18 },
		{ usedPercent: 100, filled: 0 },
	]) {
		const lines = renderCodexUsageDashboardLines(
			theme,
			{
				planType: "plus",
				ordinaryUsageAllowed: true,
				buckets: [
					{
						id: "codex",
						label: undefined,
						primary: { usedPercent, windowMinutes: 300, resetsAt: undefined },
						secondary: undefined,
					},
				],
				credits: undefined,
				fetchedAt: 1_893_456_000_000,
			},
			{},
			1_893_456_000_000,
			70,
		);
		assert.ok(
			lines
				.map(stripLabelSgr)
				.includes(
					`Codex Session ${"█".repeat(filled)}${"░".repeat(28 - filled)} ${100 - usedPercent}% left · ${usedPercent}% used`,
				),
		);
	}
});

void test("inserts themed dividers after every detail title, bucket heading, and quota heading", () => {
	const theme = {
		fg: (name: string, text: string): string =>
			`\u001B[${name === "border" ? 34 : 36}m${text}\u001B[0m`,
	};
	const snapshot = {
		planType: "plus",
		ordinaryUsageAllowed: true,
		buckets: [
			{
				id: "codex",
				label: undefined,
				primary: { usedPercent: 37, windowMinutes: 300, resetsAt: undefined },
				secondary: { usedPercent: 71, windowMinutes: 10_080, resetsAt: undefined },
			},
		],
		credits: undefined,
		fetchedAt: 1_893_456_000_000,
	};
	for (const width of [46, 60, 100]) {
		const lines = renderCodexUsageDashboardLines(
			theme,
			snapshot,
			{},
			1_893_456_000_000,
			width,
		);
		const primaryTitle = lines.findIndex((line) =>
			stripLabelSgr(line).includes("Session · 5h"),
		);
		const secondaryTitle = lines.findIndex((line) =>
			stripLabelSgr(line).includes("Weekly · 7d"),
		);
		const bucketHeading = lines.findIndex((line) =>
			line.includes("Codex [codex]"),
		);
		const quotaHeading = lines.findIndex((line) =>
			line.includes("Quotas + account"),
		);
		assert.ok(primaryTitle >= 0 && secondaryTitle >= primaryTitle);
		assert.match(lines[primaryTitle + 1] ?? "", /─/);
		assert.match(lines[secondaryTitle + 1] ?? "", /─/);
		assert.match(lines[bucketHeading + 1] ?? "", /─/);
		assert.match(lines[quotaHeading + 1] ?? "", /─/);
		assert.ok(
			[
				primaryTitle + 1,
				secondaryTitle + 1,
				bucketHeading + 1,
				quotaHeading + 1,
			].every((index) => visibleWidth(lines[index] ?? "") <= width),
		);
	}
});

void test("sanitizes hostile provider snapshot strings before rendering and bounds their widths", () => {
	const theme = { fg: (_name: string, text: string): string => text };
	const hostile =
		"\u001B[31m\u001B]8;;https://evil.example\u0007bad\u001B]8;;\u0007\n\t\u0000";
	const snapshot = {
		planType: hostile,
		ordinaryUsageAllowed: true,
		buckets: [
			{
				id: hostile,
				label: hostile,
				primary: { usedPercent: 37, windowMinutes: 300, resetsAt: undefined },
				secondary: undefined,
			},
		],
		credits: {
			hasCredits: true,
			unlimited: false,
			balance: hostile,
			resetCreditCount: 0,
		},
		fetchedAt: 1_893_456_000_000,
	};
	for (const width of [46, 60, 100]) {
		const lines = renderCodexUsageDashboardLines(
			theme,
			snapshot,
			{},
			1_893_456_000_000,
			width,
		);
		assert.ok(lines.some((line) => line.includes("Plan: bad")));
		assert.ok(lines.some((line) => line.includes("Credits: bad")));
		assert.ok(lines.some((line) => line.includes("bad [bad]")));
		assert.ok(
			lines.every((line) =>
				Array.from(stripLabelSgr(line)).every((character) => {
					const code = character.charCodeAt(0);
					return code >= 32 && (code < 127 || code > 159);
				}),
			),
		);
		assert.ok(lines.every((line) => visibleWidth(line) <= width));
	}
});

void test("separates modal quota footer bars and account metadata with blank lines", () => {
	const theme = { fg: (_name: string, text: string): string => text };
	const lines = renderCodexUsageDashboardLines(
		theme,
		{
			planType: "plus",
			ordinaryUsageAllowed: true,
			buckets: [
				{
					id: "codex",
					label: undefined,
					primary: { usedPercent: 37, windowMinutes: 300, resetsAt: undefined },
					secondary: { usedPercent: 71, windowMinutes: 10_080, resetsAt: undefined },
				},
			],
			credits: undefined,
			fetchedAt: 1_893_456_000_000,
		},
		{ profile: "work", provider: "openai-codex", model: "gpt-5.6" },
		1_893_456_000_000,
		70,
	);

	const footerStart = lines.indexOf("Quotas + account");
	assert.deepEqual(
		lines.slice(footerStart, footerStart + 9).map(stripLabelSgr),
		[
			"Quotas + account",
			"─".repeat(70),
			"Codex Session ██████████████████░░░░░░░░░░ 63% left · 37% used",
			"",
			"Codex Weekly ████████░░░░░░░░░░░░░░░░░░░░ 29% left · 71% used",
			"",
			"Profile: work",
			"Provider: openai-codex",
			"Model: gpt-5.6",
		],
	);
});

void test("adds only the account section gap for one modal quota footer bar", () => {
	const theme = { fg: (_name: string, text: string): string => text };
	const lines = renderCodexUsageDashboardLines(theme, {
		planType: "plus",
		ordinaryUsageAllowed: true,
		buckets: [
			{
				id: "codex",
				label: undefined,
				primary: { usedPercent: 37, windowMinutes: 300, resetsAt: undefined },
				secondary: undefined,
			},
		],
		credits: undefined,
		fetchedAt: 1_893_456_000_000,
	});
	const footerStart = lines.indexOf("Quotas + account");
	assert.deepEqual(
		lines.slice(footerStart, footerStart + 5).map(stripLabelSgr),
		[
			"Quotas + account",
			"─".repeat(94),
			"Codex Session ██████████████████░░░░░░░░░░ 63% left · 37% used",
			"",
			"Profile: none · Provider: unknown · Model: unknown",
		],
	);
});

void test("does not add a quota gap when the modal footer has no quota bars", () => {
	const theme = { fg: (_name: string, text: string): string => text };
	const lines = renderCodexUsageDashboardLines(theme, {
		planType: "plus",
		ordinaryUsageAllowed: true,
		buckets: [],
		credits: undefined,
		fetchedAt: 1_893_456_000_000,
	});
	const footerStart = lines.indexOf("Quotas + account");
	assert.deepEqual(lines.slice(footerStart, footerStart + 3), [
		"Quotas + account",
		"─".repeat(94),
		"Profile: none · Provider: unknown · Model: unknown",
	]);
});

void test("renders compact quota footer bars and account fields without detail-card duplication", () => {
	const theme = { fg: (_name: string, text: string): string => text };
	const snapshot = {
		planType: "plus",
		ordinaryUsageAllowed: true,
		buckets: [
			{
				id: "codex",
				label: undefined,
				primary: { usedPercent: 37, windowMinutes: 300, resetsAt: 1_893_463_200 },
				secondary: undefined,
			},
		],
		credits: {
			hasCredits: true,
			unlimited: false,
			balance: "12.50",
			resetCreditCount: 2,
		},
		fetchedAt: 1_893_456_000_000,
	};
	const lines = renderCodexUsageDashboardLines(
		theme,
		snapshot,
		{ profile: "work", provider: "openai-codex", model: "gpt-5.6" },
		1_893_456_000_000,
		70,
	);
	assert.ok(lines.includes("Quotas + account"));
	assert.ok(
		lines.some(
			(line) =>
				stripLabelSgr(line).includes("Codex Session") &&
				line.includes("█") &&
				line.includes("63% left") &&
				line.includes("37% used"),
		),
	);
	assert.ok(lines.includes("Profile: work"));
	assert.ok(lines.includes("Provider: openai-codex"));
	assert.ok(lines.includes("Model: gpt-5.6"));
	const detailLines = lines.slice(0, lines.indexOf("Quotas + account"));
	assert.ok(detailLines.some((line) => line.includes("Window: 5h")));
	assert.ok(
		detailLines.some((line) => line.includes("Local:")) &&
			detailLines.some((line) => line.includes("UTC:")),
	);
	assert.ok(
		!detailLines.some((line) => line.includes("% used") || line.includes("█")),
	);
});

void test("puts one final control line in ready and error output while remaining ANSI-width safe", () => {
	const theme = {
		fg: (name: string, text: string): string =>
			`\u001B[${name === "warning" ? 33 : 36}m${text}\u001B[0m`,
	};
	const snapshot = {
		planType: undefined,
		ordinaryUsageAllowed: undefined,
		buckets: [
			{
				id: "codex",
				label: undefined,
				primary: { usedPercent: 37, windowMinutes: 300, resetsAt: 1_893_463_200 },
				secondary: undefined,
			},
		],
		credits: undefined,
		fetchedAt: 1_893_456_000_000,
	};
	for (const state of [
		{ kind: "ready" as const, snapshot },
		{ kind: "error" as const, message: "Unavailable", snapshot },
	]) {
		const lines = renderCodexUsagePanelLines(
			theme,
			state,
			{},
			1_893_456_000_000,
			48,
		);
		assert.equal(
			lines.filter(
				(line) => line.includes("r refresh") || line.includes("esc/q close"),
			).length,
			1,
		);
		assert.match(lines.at(-2) ?? "", /r refresh · esc\/q close/);
		assert.ok(lines.some((line) => line.includes("Session")));
		assert.ok(
			!lines.some(
				(line) => line.includes("Primary") || line.includes("Secondary"),
			),
		);
		assert.ok(lines.every((line) => visibleWidth(line) <= 48));
	}
});

void test("stacks Session and Weekly window cards in a narrow usage dashboard", () => {
	const theme = { fg: (_name: string, text: string): string => text };
	const snapshot = {
		planType: "plus",
		ordinaryUsageAllowed: true,
		buckets: [
			{
				id: "codex",
				label: undefined,
				primary: { usedPercent: 37, windowMinutes: 300, resetsAt: undefined },
				secondary: { usedPercent: 71, windowMinutes: 10_080, resetsAt: undefined },
			},
		],
		credits: undefined,
		fetchedAt: 1_893_456_000_000,
	};
	const lines = renderCodexUsageDashboardLines(
		theme,
		snapshot,
		{},
		1_893_456_000_000,
		70,
	);
	const primaryIndex = lines.findIndex((line) => line.includes("Session"));
	const secondaryIndex = lines.findIndex((line) => line.includes("Weekly"));

	assert.ok(primaryIndex >= 0);
	assert.ok(secondaryIndex > primaryIndex);
	assert.ok(
		!lines.some((line) => line.includes("Session") && line.includes("Weekly")),
	);
});

void test("adapts dashboard content at the minimum and intermediate narrow widths without losing account data", () => {
	const theme = {
		fg: (name: string, text: string): string =>
			`\u001B[${name === "accent" ? 36 : name === "mdLink" ? 35 : 90}m${text}\u001B[0m`,
	};
	const snapshot = {
		planType: undefined,
		ordinaryUsageAllowed: false,
		buckets: [
			{
				id: "codex",
				label: undefined,
				primary: { usedPercent: 37, windowMinutes: 300, resetsAt: 1_893_463_200 },
				secondary: {
					usedPercent: 71,
					windowMinutes: 10_080,
					resetsAt: 1_893_463_200,
				},
			},
		],
		credits: {
			hasCredits: true,
			unlimited: false,
			balance: "12.50",
			resetCreditCount: 0,
		},
		fetchedAt: 1_893_456_000_000,
	};
	for (const width of [46, 60]) {
		const lines = renderCodexUsageDashboardLines(
			theme,
			snapshot,
			{
				profile: "engineering-production-profile",
				provider: "openai-codex-enterprise-provider-with-a-long-name",
				model: "openai-codex/gpt-5.6-super-long-model-variant",
			},
			1_893_456_000_000,
			width,
		);
		const primaryCard = lines.findIndex((line) =>
			stripLabelSgr(line).includes("Session · 5h"),
		);
		const secondaryCard = lines.findIndex((line) =>
			stripLabelSgr(line).includes("Weekly · 7d"),
		);
		assert.ok(primaryCard >= 0 && secondaryCard > primaryCard);
		assert.ok(
			lines.some(
				(line) => line.includes("Reset:") && line.includes("resets in 2h"),
			),
		);
		assert.ok(lines.some((line) => line.includes("Local:")));
		assert.ok(lines.some((line) => line.includes("UTC: 2030-01-01 02:00 UTC")));
		const plainOutput = stripLabelSgr(lines.join(""))
			.replaceAll("\u001B[36m", "")
			.replaceAll("\u001B[35m", "")
			.replaceAll("\u001B[90m", "")
			.replaceAll("\u001B[0m", "");
		assert.ok(
			plainOutput.includes("Codex Session") && plainOutput.includes("63% left"),
		);
		assert.ok(
			plainOutput.includes("Codex Weekly") && plainOutput.includes("29% left"),
		);
		assert.ok(lines.some((line) => line.includes("Profile:")));
		assert.ok(lines.some((line) => line.includes("Provider:")));
		assert.ok(lines.some((line) => line.includes("Model:")));
		assert.ok(plainOutput.includes("engineering-production-profile"));
		assert.ok(
			plainOutput.includes("openai-codex-enterprise-provider-with-a-long-name"),
		);
		assert.ok(
			plainOutput.includes("openai-codex/gpt-5.6-super-long-model-variant"),
		);
		assert.ok(!lines.some((line) => line.includes("Plan:")));
		assert.ok(lines.some((line) => line.includes("Availability: not allowed")));
		assert.ok(lines.some((line) => line.includes("Credits: 12.50")));
		assert.ok(lines.some((line) => line.includes("Credit resets: 0")));
		assert.ok(lines.at(-1)?.includes("r refresh · esc/q close"));
		assert.ok(lines.every((line) => visibleWidth(line) <= width));
	}
});

void test("renders each additional bucket below Codex with its own window cards", () => {
	const theme = { fg: (_name: string, text: string): string => text };
	const lines = renderCodexUsageDashboardLines(
		theme,
		{
			planType: "plus",
			ordinaryUsageAllowed: true,
			buckets: [
				{
					id: "codex",
					label: undefined,
					primary: { usedPercent: 37, windowMinutes: 300, resetsAt: undefined },
					secondary: undefined,
				},
				{
					id: "additional",
					label: "Additional limits",
					primary: { usedPercent: 25, windowMinutes: 60, resetsAt: undefined },
					secondary: { usedPercent: 50, windowMinutes: 120, resetsAt: undefined },
				},
			],
			credits: undefined,
			fetchedAt: 1_893_456_000_000,
		},
		{},
		1_893_456_000_000,
		100,
	);
	const codexIndex = lines.findIndex((line) => line === "Codex [codex]");
	const additionalIndex = lines.findIndex(
		(line) => line === "Additional limits [additional]",
	);

	assert.ok(codexIndex >= 0);
	assert.ok(additionalIndex > codexIndex);
	assert.ok(
		lines
			.slice(additionalIndex + 1)
			.some((line) => line.includes("Session") && line.includes("Weekly")),
	);
});

void test("uses the requested near-full-screen overlay dimensions", () => {
	assert.deepEqual(CODEX_USAGE_OVERLAY_OPTIONS, {
		anchor: "center",
		width: 96,
		minWidth: 48,
		maxHeight: "92%",
		margin: 1,
	});
});

void test("renders compact themed remaining-capacity bars for full, partial, and empty quotas", () => {
	const theme = { fg: (_name: string, text: string): string => text };
	for (const { usedPercent, bar } of [
		{ usedPercent: 0, bar: "████████████" },
		{ usedPercent: 50, bar: "██████░░░░░░" },
		{ usedPercent: 100, bar: "░░░░░░░░░░░░" },
	]) {
		const lines = renderCompactCodexQuotaBars(
			theme,
			{
				planType: "plus",
				ordinaryUsageAllowed: true,
				buckets: [
					{
						id: "codex",
						label: undefined,
						primary: { usedPercent, windowMinutes: 300, resetsAt: undefined },
						secondary: undefined,
					},
				],
				credits: undefined,
				fetchedAt: 0,
			},
			80,
		);
		assert.deepEqual(lines.map(stripLabelSgr), [
			`Session 5h ${100 - usedPercent}% left ${bar}`,
		]);
	}
});

void test("places compact Codex quota bars on one wide line and stacks them when narrow", () => {
	const theme = { fg: (_name: string, text: string): string => text };
	const snapshot = {
		planType: "plus",
		ordinaryUsageAllowed: true,
		buckets: [
			{
				id: "codex",
				label: undefined,
				primary: { usedPercent: 37, windowMinutes: 300, resetsAt: undefined },
				secondary: { usedPercent: 71, windowMinutes: 10_080, resetsAt: undefined },
			},
		],
		credits: undefined,
		fetchedAt: 0,
	};
	const wide = renderCompactCodexQuotaBars(theme, snapshot, 80);
	const narrow = renderCompactCodexQuotaBars(theme, snapshot, 40);
	assert.equal(wide.length, 1);
	assert.match(
		stripLabelSgr(wide[0] ?? ""),
		/Session 5h 63% left.*Weekly 7d 29% left/,
	);
	assert.equal(narrow.length, 2);
	assert.match(stripLabelSgr(narrow[0] ?? ""), /Session 5h 63% left/);
	assert.match(stripLabelSgr(narrow[1] ?? ""), /Weekly 7d 29% left/);
	assert.ok([...wide, ...narrow].every((line) => !line.includes("% used")));
});

void test("fits ANSI-colored compact quota bars at very narrow widths without losing windows", () => {
	const theme = {
		fg: (name: string, text: string): string =>
			`\u001B[${name === "accent" ? 36 : 90}m${text}\u001B[0m`,
	};
	const snapshot = {
		planType: "plus",
		ordinaryUsageAllowed: true,
		buckets: [
			{
				id: "codex",
				label: undefined,
				primary: { usedPercent: 37, windowMinutes: 300, resetsAt: undefined },
				secondary: { usedPercent: 71, windowMinutes: 10_080, resetsAt: undefined },
			},
		],
		credits: undefined,
		fetchedAt: 0,
	};
	for (const width of [1, 2, 3, 10, 12, 20]) {
		const lines = renderCompactCodexQuotaBars(theme, snapshot, width);
		assert.equal(lines.length, 2);
		assert.ok(lines.every((line) => visibleWidth(line) <= Math.max(1, width)));
		assert.ok(lines.every((line) => /[█░]/.test(line)));
	}
	const lines = renderCompactCodexQuotaBars(theme, snapshot, 20);
	assert.ok(lines[0]?.includes("5h 63% left"));
	assert.ok(lines[1]?.includes("7d 29% left"));
});

void test("uses window-bound theme colors for modal and compact quota labels and bars", () => {
	const calls: Array<{ name: string; text: string }> = [];
	const theme = {
		fg: (name: string, text: string): string => {
			calls.push({ name, text });
			return `[${name}:${text}]`;
		},
	};
	const snapshot = {
		planType: "plus",
		ordinaryUsageAllowed: true,
		buckets: [
			{
				id: "codex",
				label: undefined,
				primary: { usedPercent: 50, windowMinutes: 300, resetsAt: undefined },
				secondary: { usedPercent: 50, windowMinutes: 10_080, resetsAt: undefined },
			},
			{
				id: "additional",
				label: "Additional",
				primary: { usedPercent: 50, windowMinutes: 60, resetsAt: undefined },
				secondary: { usedPercent: 50, windowMinutes: 120, resetsAt: undefined },
			},
		],
		credits: undefined,
		fetchedAt: 0,
	};
	const modal = renderCodexUsageDashboardLines(theme, snapshot, {}, 0, 100).join(
		"\n",
	);
	const compact = renderCompactCodexQuotaBars(theme, snapshot, 80).join("\n");

	assert.ok(modal.includes("[accent: \u001B[1mSession\u001B[22m · 5h"));
	assert.ok(modal.includes("[accent: \u001B[1mWeekly\u001B[22m · 7d"));
	assert.ok(modal.includes("[accent:\u001B[1mSession\u001B[22m ]"));
	assert.ok(modal.includes("[accent:\u001B[1mWeekly\u001B[22m ]"));
	assert.ok(modal.includes("[accent:████") && modal.includes("[mdLink:████"));
	assert.ok(
		compact.includes(
			"[accent:\u001B[1mSession\u001B[22m ][muted:5h 50% left ][accent:████",
		),
	);
	assert.ok(
		compact.includes(
			"[accent:\u001B[1mWeekly\u001B[22m ][muted:7d 50% left ][mdLink:████",
		),
	);
	assert.ok(
		calls.some(
			({ name, text }) =>
				name === "accent" && text.includes("\u001B[1mSession\u001B[22m"),
		),
	);
	assert.ok(
		calls.some(
			({ name, text }) =>
				name === "accent" && text.includes("\u001B[1mWeekly\u001B[22m"),
		),
	);
	assert.ok(
		calls
			.filter(({ name }) => name === "muted")
			.some(({ text }) => text.includes("░")),
	);
});

void test("renders Session and Weekly labels bold accent while preserving their modal and compact bar colors", () => {
	const theme = {
		fg: (name: string, text: string): string =>
			`\u001B[${name === "accent" ? 36 : name === "mdLink" ? 35 : 90}m${text}\u001B[0m`,
	};
	const snapshot = {
		planType: "plus",
		ordinaryUsageAllowed: true,
		buckets: [
			{
				id: "codex",
				label: undefined,
				primary: { usedPercent: 50, windowMinutes: 300, resetsAt: undefined },
				secondary: { usedPercent: 50, windowMinutes: 10_080, resetsAt: undefined },
			},
		],
		credits: undefined,
		fetchedAt: 0,
	};
	const modal = renderCodexUsageDashboardLines(theme, snapshot, {}, 0, 100);
	const compact = renderCompactCodexQuotaBars(theme, snapshot, 80);
	const ready = renderCodexUsageReadyLines(theme, snapshot, 0);
	const error = renderCodexUsagePanelLines(
		theme,
		{ kind: "error", message: "Unavailable", snapshot },
		{},
		0,
		100,
	);

	const modalOutput = modal.join("\n");
	const compactOutput = compact.join("\n");
	for (const output of [
		modalOutput,
		compactOutput,
		ready.join("\n"),
		error.join("\n"),
	]) {
		assert.ok(output.includes("\u001B[36m\u001B[1mSession\u001B[22m"));
		assert.ok(output.includes("\u001B[36m\u001B[1mWeekly\u001B[22m"));
	}
	for (const output of [modalOutput, compactOutput]) {
		assert.ok(output.includes("\u001B[36m█"));
		assert.ok(output.includes("\u001B[35m█"));
		assert.ok(output.includes("\u001B[90m░"));
	}
	assert.ok(
		[...modal, ...compact, ...ready, ...error].every(
			(line) => visibleWidth(line) <= 100,
		),
	);
});

void test("requests an immediate modal repaint when refresh remains in flight", async () => {
	let component: { handleInput(data: string): void } | undefined;
	let renderRequests = 0;
	let resolveRefresh: (() => void) | undefined;
	let refreshCalls = 0;
	const refresh = (): Promise<void> => {
		refreshCalls += 1;
		if (refreshCalls === 1) return Promise.resolve();
		return new Promise<void>((resolve) => {
			resolveRefresh = resolve;
		});
	};

	void showCodexUsagePanel(
		{
			ui: {
				custom: async <T>(
					factory: (
						tui: TUI,
						theme: SimpleTheme,
						keybindings: unknown,
						done: (result: T) => void,
					) => Component,
				): Promise<T> => {
					component = factory(
						{
							requestRender: () => {
								renderRequests += 1;
							},
						} as TUI,
						{ fg: (_name: string, text: string): string => text },
						{},
						() => {},
					) as { handleInput(data: string): void };
					return await new Promise<T>(() => {});
				},
			},
		},
		() => ({ kind: "loading", snapshot: undefined }),
		refresh,
	);
	await Promise.resolve();
	await Promise.resolve();
	renderRequests = 0;

	component?.handleInput("r");
	component?.handleInput("r");

	assert.equal(refreshCalls, 2);
	assert.equal(renderRequests, 1);
	resolveRefresh?.();
});

void test("keeps Codex quota out of the editor top border layout", () => {
	const title = " Osdy-Pi ";
	const modelAndThinking = "openai-codex/gpt-5.6-sol · think medium";
	assert.deepEqual(resolveCodexUsageLayout(title, modelAndThinking), {
		topRight: modelAndThinking,
	});
});

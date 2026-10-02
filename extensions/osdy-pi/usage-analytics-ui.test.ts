import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { visibleWidth } from "@earendil-works/pi-tui";
import ts from "typescript";
import type { UsageRecord } from "./usage-analytics-data.js";
import type { UsageSnapshot } from "./usage-analytics-store.js";
import type { UsageAnalyticsState } from "./usage-analytics-ui.js";

registerHooks({
	resolve(specifier, context, nextResolve) {
		if (specifier.startsWith(".") && specifier.endsWith(".js") && context.parentURL?.endsWith(".ts")) {
			const url = new URL(`${specifier.slice(0, -3)}.ts`, context.parentURL);
			if (existsSync(fileURLToPath(url))) return { shortCircuit: true, url: url.href };
		}
		return nextResolve(specifier, context);
	},
	load(url, context, nextLoad) {
		if (url.endsWith(".ts")) return {
			format: "module", shortCircuit: true,
			source: ts.transpileModule(readFileSync(fileURLToPath(url), "utf8"), {
				compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
			}).outputText,
		};
		return nextLoad(url, context);
	},
});

const ui = await import("./usage-analytics-ui.js");
const anchor = new Date(2030, 0, 15, 12);
const theme = { fg: (_name: string, text: string): string => text };
function record(overrides: Partial<UsageRecord> = {}): UsageRecord {
	return { version: 1, timestamp: anchor.getTime(), sessionId: "s", entryId: "e", profile: "work", provider: "openai-codex", model: "model", input: 100, output: 50, cacheRead: 30, cacheWrite: 20, estimatedCost: 0.25, ...overrides };
}
function snapshot(records: UsageRecord[] = [record()]): UsageSnapshot {
	return { records, warnings: [], limited: false, missing: false };
}
function ready(data = snapshot()): UsageAnalyticsState {
	return { ...ui.createUsageAnalyticsState(anchor), load: { kind: "ready" as const, snapshot: data } };
}

void test("pages isolate their sections and summary is the default", () => {
	const state = ready();
	assert.equal(state.page, "summary");
	for (const [page, expected, excluded] of [
		["summary", "Total tokens", ["Profiles", "Provider/models", "Token composition", "Timeline detail", "Coverage:"]],
		["profiles", "Profiles", ["Total tokens", "Provider/models", "Token composition", "Timeline overview"]],
		["models", "Token composition", ["Total tokens", "Profiles", "Timeline overview"]],
		["history", "Timeline detail", ["Total tokens", "Profiles", "Token composition"]],
	] as const) {
		const text = ui.renderUsageAnalyticsContent(theme, { ...state, page }, 96).join("\n");
		assert.ok(text.includes(expected), page);
		for (const section of excluded) assert.ok(!text.includes(section), `${page}: ${section}`);
	}
});

void test("page and help navigation preserve shared selection and reset scroll", () => {
	const state = { ...ready(), filter: { model: "model" }, scroll: 50 };
	let next = ui.updateUsageAnalyticsState(state, "previousPage");
	assert.equal(next.page, "history");
	assert.equal(next.scroll, 0);
	assert.equal(next.period, state.period);
	assert.equal(next.filter, state.filter);
	assert.equal(next.load, state.load);
	next = ui.updateUsageAnalyticsState(next, "nextPage");
	assert.equal(next.page, "summary");
	next = ui.updateUsageAnalyticsState(next, "help");
	assert.equal(next.help, "open");
	assert.match(ui.renderUsageAnalyticsContent(theme, next, 96).join("\n"), /\? back/);
	next = ui.updateUsageAnalyticsState(next, "models");
	assert.equal(next.page, "models");
	assert.equal(next.help, "closed");
	assert.equal(next.filter, state.filter);
});

void test("every page and help remain width-safe and recognizable on short terminals", () => {
	for (const page of ["summary", "profiles", "models", "history"] as const) {
		for (const help of ["open", "closed"] as const) {
			for (const width of [1, 2, 12, 32, 96]) {
				for (const rows of [3, 6, 12]) {
					const lines = ui.renderUsageAnalyticsPanel(theme, { ...ready(snapshot([record({ model: "模型 α é".repeat(10) })])), page, help }, width, rows);
					assert.ok(lines.length <= rows);
					assert.ok(lines.every((line) => visibleWidth(line) <= width));
					if (width >= 12) {
						assert.match(lines.join("\n"), new RegExp(page[0]?.toUpperCase() + page.slice(1)));
						assert.match(lines.join("\n"), /Tab/);
						if (help === "open") assert.match(lines.join("\n"), /\? back/);
					}
				}
			}
		}
	}
});

void test("help works before any snapshot and alongside initial read errors", () => {
	const state = ui.updateUsageAnalyticsState(ui.createUsageAnalyticsState(anchor), "help");
	const loading = ui.renderUsageAnalyticsContent(theme, state, 96).join("\n");
	assert.match(loading, /Loading/);
	assert.match(loading, /Coverage:/);
	assert.match(loading, /\? back/);
	const error = ui.renderUsageAnalyticsContent(theme, { ...state, load: { kind: "error", message: "retry", snapshot: undefined } }, 96).join("\n");
	assert.match(error, /Read error/);
	assert.match(error, /Ctrl\+C close/);
});

void test("summary leads with metrics and only a compact overview", (context) => {
	const lines = ui.renderUsageAnalyticsContent(theme, ready(), 96);
	const text = lines.join("\n");
	assert.match(lines[0] ?? "", /Total tokens.*Recorded turns.*Estimated USD/);
	assert.ok(!text.includes("Profiles"));
	assert.ok(!text.includes("Details"));
	const overview = lines.slice(lines.findIndex((line) => line.includes("Timeline overview")) + 1);
	assert.ok(overview.length <= 4);
	assert.match(overview.join("\n"), /·.*█/);
	assert.match(text, /max 200 tokens/);
	context.diagnostic(`Synthetic normal-width first screen:\n${ui.renderUsageAnalyticsPanel(theme, ready(), 96, 20).join("\n")}`);
});

void test("unknown estimates never masquerade as zero or missing history", () => {
	const unknown = ui.renderUsageAnalyticsContent(theme, ready(snapshot([record({ estimatedCost: null })])), 96).join("\n");
	assert.match(unknown, /Estimated USD.*unavailable/s);
	assert.ok(!unknown.includes("$0.0000"));
	assert.match(unknown, /1 unpriced turn/);
	assert.match(ui.renderUsageAnalyticsContent(theme, ready(snapshot([record({ estimatedCost: 0 })])), 96).join("\n"), /\$0.0000/);
	assert.match(ui.renderUsageAnalyticsContent(theme, ready(snapshot([])), 96).join("\n"), /No records/);
});

void test("rankings use descending consumption, stable ties and selected-total shares", () => {
	const data = snapshot([record({ profile: "z", input: 600 }), record({ profile: "b" }), record({ profile: "a" })]);
	const text = ui.renderUsageAnalyticsContent(theme, { ...ready(data), page: "profiles" }, 96).join("\n");
	const ranking = text.slice(text.indexOf("Profiles"));
	assert.ok(ranking.indexOf("Profile: z") < ranking.indexOf("Profile: a"));
	assert.ok(ranking.indexOf("Profile: a") < ranking.indexOf("Profile: b"));
	assert.match(ranking, /63\.6%/);
	assert.match(text, /share of selected total/);
	const bars = ranking.split("\n").filter((line) => line.includes("█"));
	assert.equal(bars.length, 3);
	assert.ok((bars[0]?.match(/█/g)?.length ?? 0) > (bars[1]?.match(/█/g)?.length ?? 0));
});

void test("narrow content retains long Unicode names and short panels leave a body viewport", () => {
	const label = "模型αβγδεζηθικλμνξοπρστυφχψω";
	for (const width of [12, 32, 96]) {
		const state = { ...ready(snapshot([record({ profile: "long-profile-name-retained-through-wrapping", model: label })])), page: "models" as const };
		const lines = ui.renderUsageAnalyticsContent(theme, state, width);
		assert.ok(lines.every((line) => visibleWidth(line) <= width));
		assert.ok(lines.map((line) => line.replace(/[█░].*/, "").trim()).join("").includes(label));
		for (const rows of [3, 6, 12]) {
			const panel = ui.renderUsageAnalyticsPanel(theme, state, width, rows);
			assert.ok(panel.length <= rows);
			assert.ok(panel.some((line) => /Models/.test(line)), `${width}x${rows}`);
		}
	}
});

void test("compact timeline retains every bucket and positive peaks at narrow widths", () => {
	for (const width of [12, 32, 96]) {
		const lines = ui.renderUsageAnalyticsContent(theme, ready(), width);
		const start = lines.findIndex((line) => line.includes("binning"));
		// Narrow headings wrap; locate the spark by its symbol-only content.
		const spark = lines.slice(start + 1).filter((line) => /^[·▁▂▃▄▅▆▇█]+$/.test(line));
		assert.ok(start >= 0);
		assert.equal(spark.join("").length, 24);
		assert.equal(spark.join("").replace(/·/g, ""), "█");
		assert.ok(ui.renderUsageAnalyticsContent(theme, { ...ready(), page: "history" }, width).join(" ").includes(`${ui.usageBucketLabel(anchor.getTime(), true)} · 200`));
	}
});

void test("status warnings precede charts and zero-token rankings have zero shares", () => {
	const data = { ...snapshot([record({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0, estimatedCost: 0 })]), limited: true, warnings: ["malformed-record" as const] };
	const state = { ...ready(data), load: { kind: "error" as const, message: "retry", snapshot: data } };
	const text = ui.renderUsageAnalyticsContent(theme, state, 96).join("\n");
	for (const label of ["Read error", "previous snapshot", "Limited", "malformed-record"]) assert.ok(text.indexOf(label) < text.indexOf("Timeline overview"));
	assert.match(ui.renderUsageAnalyticsContent(theme, { ...state, page: "profiles" }, 96).join("\n"), /0\.0%/);
	assert.ok(!text.includes("NaN"));
	assert.match(text, /\$0.0000/);
	assert.match(ui.renderUsageAnalyticsContent(theme, { ...state, load: { kind: "loading", snapshot: data } }, 96).join("\n"), /Loading.*previous snapshot/);
});

void test("provider-model ties and shares are deterministic regardless of record order", () => {
	const records = [record({ model: "z", input: 600 }), record({ model: "b" }), record({ model: "a" })];
	const ranking = (data: UsageRecord[]): string => {
		const text = ui.renderUsageAnalyticsContent(theme, { ...ready(snapshot(data)), page: "models" }, 96).join("\n");
		return text.slice(text.indexOf("Provider/models"), text.indexOf("Token composition"));
	};
	const text = ranking(records);
	assert.equal(text, ranking([...records].reverse()));
	assert.ok(text.indexOf(" / z") < text.indexOf(" / a"));
	assert.ok(text.indexOf(" / a") < text.indexOf(" / b"));
	assert.match(text, /18\.2%/);
});

void test("renders actual profile/model, stacked composition and temporal charts", () => {
	const lines = ["summary", "profiles", "models", "history"].flatMap((page) =>
		ui.renderUsageAnalyticsContent(theme, ui.updateUsageAnalyticsState(ready(), page === "summary" ? "summary" : page === "profiles" ? "profiles" : page === "models" ? "models" : "history"), 78));
	const text = lines.join("\n");
	for (const label of ["Profiles", "Provider/models", "Token composition", "Timeline", "work", "openai-codex", "model", "Input 100", "Output 50", "Cache read 30", "Cache write 20", "$0.2500", "Local timezone"]) assert.ok(text.includes(label), label);
	assert.ok(lines.filter((line) => line.includes("█")).length >= 3);
	assert.match(text, /I+O+R+W+/);
	assert.match(text, /12:00 UTC[+-]\d\d:\d\d/);
});

void test("width bounds every line including Unicode and hostile error text", () => {
	const data = snapshot([record({ model: "模型 👩🏽‍💻 é".repeat(10) })]);
	for (const width of [1, 2, 12, 24, 48, 96]) {
		const lines = ui.renderUsageAnalyticsPanel(theme, ready(data), width, 18);
		assert.ok(lines.length <= 18);
		for (const line of lines) assert.ok(visibleWidth(line) <= width, `${width}: ${line}`);
	}
	const state = { ...ready(), load: { kind: "error" as const, message: "bad\u001b[31m\n\u009b2J\u202eerror", snapshot: undefined } };
	const text = ui.renderUsageAnalyticsContent(theme, state, 48).join("\n");
	for (const code of [27, 155, 8238]) assert.ok(!text.includes(String.fromCharCode(code)));
	assert.match(text, /Read error/);
});

void test("honest empty, filter-empty, loading, limited, warning and unpriced states", () => {
	assert.match(ui.renderUsageAnalyticsContent(theme, ready({ ...snapshot([]), missing: true }), 78).join("\n"), /No recorded history/);
	const emptyFilter = { ...ready(), filter: { model: "other" } };
	assert.match(ui.renderUsageAnalyticsContent(theme, emptyFilter, 78).join("\n"), /No records match/);
	assert.match(ui.renderUsageAnalyticsContent(theme, ui.createUsageAnalyticsState(anchor), 78).join("\n"), /Loading/);
	const data = { ...snapshot([record({ estimatedCost: null }), record({ estimatedCost: 0 })]), limited: true, warnings: ["record-limit" as const, "malformed-record" as const] };
	const text = ui.renderUsageAnalyticsContent(theme, ready(data), 78).join("\n");
	for (const label of ["Limited", "record-limit", "malformed-record", "1 unpriced turn", "partial estimates"]) assert.ok(text.includes(label), label);
});

void test("period navigation, independent filters, reset and scrolling are pure", () => {
	const state = ready(snapshot([record(), record({ profile: null, provider: "other", model: "tail" })]));
	const week = ui.updateUsageAnalyticsState(state, "week");
	assert.equal(week.period.kind, "week");
	const next = ui.updateUsageAnalyticsState(week, "next");
	assert.equal(ui.updateUsageAnalyticsState(next, "previous").period.start, week.period.start);
	assert.equal(ui.updateUsageAnalyticsState(state, "month").period.kind, "month");
	const prof = ui.updateUsageAnalyticsState(state, "profile");
	assert.equal(prof.filter.profile, null);
	const provider = ui.updateUsageAnalyticsState(prof, "provider");
	assert.equal(provider.filter.provider, "openai-codex");
	assert.equal(provider.filter.profile, null);
	const model = ui.updateUsageAnalyticsState(provider, "model");
	assert.equal(model.filter.model, "model");
	assert.deepEqual(ui.updateUsageAnalyticsState(model, "reset").filter, {});
	assert.equal(ui.updateUsageAnalyticsState(state, "down").scroll, 1);
	assert.equal(ui.updateUsageAnalyticsState(state, "up").scroll, 0);
	assert.equal(state.scroll, 0);
});

void test("all groups and filter choices remain reachable beyond any top N", () => {
	const data = snapshot(Array.from({ length: 35 }, (_, i) => record({ profile: `p${String(i).padStart(2, "0")}`, model: `m${i}` })));
	let state = ready(data);
	assert.match(ui.renderUsageAnalyticsContent(theme, { ...state, page: "models" }, 78).join("\n"), /m34/);
	assert.match(ui.renderUsageAnalyticsContent(theme, { ...state, page: "profiles" }, 78).join("\n"), /p34/);
	for (let i = 0; i < 35; i++) state = ui.updateUsageAnalyticsState(state, "profile");
	assert.equal(state.filter.profile, "p34");
	assert.equal(ui.updateUsageAnalyticsState(state, "profile").filter.profile, undefined);
	state = ui.updateUsageAnalyticsState(ready(data), "pageDown");
	assert.ok(state.scroll > 1);
	const tail = ui.renderUsageAnalyticsPanel(theme, { ...ready(data), page: "history", scroll: 99999 }, 78, 18).join("\n");
	assert.match(tail, /23:00/);
	assert.match(tail, /scroll/);
});

function deferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (reason: Error) => void;
	const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
	return { promise, resolve, reject };
}
void test("refresh serializes reads, preserves filters and never repaints or finishes after close", async () => {
	const pending = deferred<UsageSnapshot>();
	let reads = 0;
	let paints = 0;
	let finishes = 0;
	const panel = ui.createUsageAnalyticsPanel(theme, { read: () => { reads++; return pending.promise; }, now: () => anchor }, { requestRender: () => { paints++; }, rows: () => 24, done: () => { finishes++; } });
	const first = panel.refresh();
	await panel.refresh();
	assert.equal(reads, 1);
	assert.match(panel.render(78).join("\n"), /Loading/);
	panel.handleInput("q");
	panel.handleInput("q");
	const before = paints;
	pending.resolve(snapshot());
	await first;
	assert.equal(paints, before);
	assert.equal(finishes, 1);
	await panel.refresh();
	assert.equal(reads, 1);
});

void test("refresh errors are contained, stale data labeled, and disposal suppresses rejection paint", async () => {
	let fail = false;
	let paints = 0;
	const panel = ui.createUsageAnalyticsPanel(theme, { now: () => anchor, read: () => fail ? Promise.reject(new Error("private path")) : Promise.resolve(snapshot()) }, { requestRender: () => { paints++; }, rows: () => 24, done: () => {} });
	await panel.refresh();
	panel.handleInput("p");
	fail = true;
	await panel.refresh();
	const content = panel.render(78).join("\n");
	assert.match(content, /Read error/);
	assert.match(content, /previous snapshot/);
	assert.ok(!content.includes("private path"));
	const pending = deferred<UsageSnapshot>();
	const closing = ui.createUsageAnalyticsPanel(theme, { read: () => pending.promise }, { requestRender: () => { paints++; }, rows: () => 24, done: () => assert.fail("dispose must not finish") });
	const refresh = closing.refresh();
	closing.dispose();
	const before = paints;
	pending.reject(new Error("late"));
	await refresh;
	assert.equal(paints, before);
});

void test("hour labels distinguish repeated DST hours and weeks/months use date buckets", () => {
	const original = process.env.TZ;
	try {
		process.env.TZ = "America/New_York";
		assert.equal(ui.usageBucketLabel(Date.parse("2024-11-03T05:00:00Z"), true), "01:00 UTC-04:00");
		assert.equal(ui.usageBucketLabel(Date.parse("2024-11-03T06:00:00Z"), true), "01:00 UTC-05:00");
		assert.equal(ui.usageBucketLabel(Date.parse("2024-11-03T06:00:00Z"), false), "2024-11-03");
		const data = snapshot([record({ timestamp: Date.parse("2024-11-03T05:30:00Z") })]);
		const state = { ...ui.createUsageAnalyticsState(new Date("2024-11-03T12:00:00Z")), load: { kind: "ready" as const, snapshot: data } };
		const history = ui.updateUsageAnalyticsState(state, "history");
		const text = ui.renderUsageAnalyticsContent(theme, history, 78).join("\n");
		assert.match(text, /01:00 UTC-04:00/);
		assert.match(text, /01:00 UTC-05:00/);
		for (const kind of ["week", "month"] as const) {
			const calendar = ui.renderUsageAnalyticsContent(theme, ui.updateUsageAnalyticsState(history, kind), 78).join("\n");
			assert.match(calendar, /2024-11-03/);
		}
	} finally {
		if (original === undefined) delete process.env.TZ;
		else process.env.TZ = original;
	}
});

void test("keyboard actions navigate, filter, scroll back from End, and refresh without resetting selection", async () => {
	const panel = ui.createUsageAnalyticsPanel(theme, { now: () => anchor, read: () => Promise.resolve(snapshot()) }, { requestRender: () => {}, rows: () => 24, done: () => {} });
	await panel.refresh();
	panel.render(78);
	panel.handleInput("w");
	assert.match(panel.render(78).join("\n"), /week:/);
	panel.handleInput("\u001b[C");
	assert.match(panel.render(78).join("\n"), /2030-01-21/);
	panel.handleInput("\u001b[D");
	panel.handleInput("m");
	assert.match(panel.render(78).join("\n"), /month:/);
	panel.handleInput("d");
	panel.handleInput("p");
	panel.handleInput("v");
	panel.handleInput("f");
	await panel.refresh();
	assert.match(panel.render(78).join("\n"), /Profile: work/);
	panel.handleInput("x");
	assert.match(panel.render(78).join("\n"), /All providers/);
	panel.handleInput("4");
	panel.handleInput("\u001b[F");
	const end = panel.render(78).join("\n");
	panel.handleInput("\u001b[A");
	assert.notEqual(panel.render(78).join("\n"), end);
	panel.handleInput("\u001b[H");
	assert.match(panel.render(78).join("\n"), /scroll 1-/);
	panel.dispose();
});

void test("theme roles are applied at render time, including each stacked segment", () => {
	const roles = new Set<string>();
	const themed = { fg: (role: string, text: string): string => { roles.add(role); return `\u001b[32m${text}\u001b[0m`; } };
	const lines = ui.renderUsageAnalyticsContent(themed, { ...ready(), page: "models" }, 24);
	for (const line of lines) assert.ok(visibleWidth(line) <= 24);
	for (const role of ["accent", "muted", "success", "warning", "dim"]) assert.ok(roles.has(role));
	assert.ok(ui.renderUsageAnalyticsContent(theme, ready(), 24).every((line) => !line.includes(String.fromCharCode(27))));
});

void test("refresh key and every close key keep their lifecycle semantics", async () => {
	for (const key of ["q", "\u001b", "\u0003"]) {
		let reads = 0;
		let finishes = 0;
		const panel = ui.createUsageAnalyticsPanel(theme, { now: () => anchor, read: () => { reads++; return Promise.resolve(snapshot()); } }, { requestRender: () => {}, rows: () => 24, done: () => { finishes++; } });
		panel.handleInput("r");
		await Promise.resolve();
		assert.equal(reads, 1);
		panel.handleInput(key);
		panel.handleInput(key);
		panel.handleInput("r");
		assert.equal(finishes, 1);
		assert.equal(reads, 1);
	}
});

void test("keyboard pages wrap, jump and return from help without extra reads", async () => {
	let reads = 0;
	const panel = ui.createUsageAnalyticsPanel(theme, { now: () => anchor, read: () => { reads++; return Promise.resolve(snapshot()); } }, { requestRender: () => {}, rows: () => 24, done: () => {} });
	await panel.refresh();
	for (const [key, label] of [["\u001b[Z", "History"], ["\t", "Summary"], ["2", "Profiles"], ["3", "Models"], ["4", "History"], ["1", "Summary"]]) {
		panel.handleInput(key ?? "");
		assert.match(panel.render(96).join("\n"), new RegExp(label ?? ""));
	}
	panel.handleInput("p");
	panel.handleInput("v");
	panel.handleInput("f");
	panel.handleInput("?");
	assert.match(panel.render(96).join("\n"), /\? back/);
	panel.handleInput("?");
	assert.match(panel.render(96).join("\n"), /Profile: work/);
	panel.handleInput("?");
	panel.handleInput("3");
	const text = panel.render(96).join("\n");
	assert.match(text, /Models/);
	assert.ok(!text.includes("Help"));
	assert.match(text, /Profile: work/);
	assert.equal(reads, 1);
	panel.dispose();
});

void test("warnings and empty states survive every page and optional help", () => {
	const data = { ...snapshot([record({ estimatedCost: null }), record()]), limited: true, warnings: ["malformed-record" as const] };
	for (const page of ["summary", "profiles", "models", "history"] as const) {
		for (const help of ["open", "closed"] as const) {
			const state = { ...ready(data), page, help, load: { kind: "error" as const, message: "retry", snapshot: data } };
			const text = ui.renderUsageAnalyticsContent(theme, state, 96).join("\n");
			for (const label of ["Read error", "previous snapshot", "Limited", "malformed-record", "1 unpriced turn", "partial estimates"]) assert.ok(text.includes(label), `${page}/${help}: ${label}`);
			const tail = ui.renderUsageAnalyticsPanel(theme, { ...state, scroll: 99999 }, 96, 12).join("\n");
			for (const label of ["Read error/stale", "Limited", "Scan warnings", "Partial cost"]) assert.ok(tail.includes(label), label);
			for (const [records, expected] of [[[], "No recorded history"], [[record()], "No records match"]] as const) {
				const empty = ui.renderUsageAnalyticsContent(theme, { ...ready(snapshot([...records])), page, help, filter: { model: "absent" } }, 96).join("\n");
				assert.ok(empty.includes(expected));
			}
		}
	}
});

for (const [columns, terminalRows, panelWidth] of [[12, 10, 10], [32, 16, 30], [100, 5, 96]] as const) {
	void test(`sticky statuses survive real panel viewport at ${columns}x${terminalRows}`, async () => {
		for (const cost of ["partial", "unknown", "zero"] as const) {
			for (const limited of [false, true]) {
				for (const failed of [false, true]) {
					const data = { ...snapshot([record({ estimatedCost: cost === "zero" ? 0 : null }), record({ estimatedCost: cost === "unknown" ? null : 0 })]), limited, warnings: limited ? ["malformed-record" as const] : [] };
					let fail = false;
					const panel = ui.createUsageAnalyticsPanel(theme, { now: () => anchor, read: () => fail ? Promise.reject(new Error("retry")) : Promise.resolve(data) }, { requestRender: () => {}, rows: () => terminalRows, done: () => {} });
					await panel.refresh();
					if (failed) { fail = true; await panel.refresh(); }
					for (const [key, page] of [["1", "Summary"], ["2", "Profiles"], ["3", "Models"], ["4", "History"]]) {
						panel.handleInput(key ?? "");
						for (const help of [false, true]) {
							if (help) panel.handleInput("?");
							panel.handleInput("\u001b[F");
							const lines = panel.render(panelWidth);
							const text = lines.join("\n").replace(/[║]/g, " ").replace(/\s+/g, " ");
							assert.ok(lines.length <= Math.floor(terminalRows * 0.92) - 2);
							assert.ok(lines.every((line) => visibleWidth(line) <= panelWidth));
							assert.ok(text.includes(page ?? ""));
							assert.equal(text.includes("Limited"), limited);
							if (limited) assert.match(text, /Scan warn/);
							if (failed) assert.match(text, /Read error/);
							assert.equal(text.includes("Partial cost"), cost === "partial", text);
							assert.equal(text.includes("Cost unknown"), cost === "unknown", text);
						}
					}
					panel.dispose();
				}
			}
		}
	});
}

void test("model filter narrows exact composition and page changes reset End", () => {
	const data = snapshot([record(), record({ model: "other", input: 900 })]);
	let state = ui.updateUsageAnalyticsState({ ...ready(data), filter: { model: "model" }, scroll: 99999 }, "models");
	assert.equal(state.scroll, 0);
	const text = ui.renderUsageAnalyticsContent(theme, state, 96).join("\n");
	for (const label of ["Input 100", "Output 50", "Cache read 30", "Cache write 20"]) assert.ok(text.includes(label));
	assert.ok(!text.includes("900"));
	state = ui.updateUsageAnalyticsState(state, "help");
	state = ui.updateUsageAnalyticsState(state, "help");
	assert.equal(state.page, "models");
	assert.deepEqual(state.filter, { model: "model" });
});

void test("close keys close even from help", () => {
	for (const key of ["q", "\u001b", "\u0003"]) {
		let finishes = 0;
		const panel = ui.createUsageAnalyticsPanel(theme, { read: () => assert.fail("help must not read") }, { requestRender: () => {}, rows: () => 24, done: () => { finishes++; } });
		panel.handleInput("?");
		panel.handleInput(key);
		assert.equal(finishes, 1);
	}
});

void test("navigation during an outstanding refresh survives its completion", async () => {
	const pending = deferred<UsageSnapshot>();
	const panel = ui.createUsageAnalyticsPanel(theme, { now: () => anchor, read: () => pending.promise }, { requestRender: () => {}, rows: () => 24, done: () => {} });
	const refresh = panel.refresh();
	panel.handleInput("m");
	panel.handleInput("\u001b[C");
	panel.handleInput("3");
	pending.resolve(snapshot());
	await refresh;
	assert.match(panel.render(78).join("\n"), /month: 2030-02-01/);
	assert.match(panel.render(78).join("\n"), /Models/);
	panel.dispose();
});

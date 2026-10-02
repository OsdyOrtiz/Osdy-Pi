import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { chmod, lstat, mkdir, mkdtemp, readdir, realpath, symlink, utimes, writeFile } from "node:fs/promises";
import { registerHooks } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import type { UsageRecord } from "./usage-analytics-data.ts";

registerHooks({
	resolve(specifier, context, nextResolve) {
		if (specifier.startsWith(".") && specifier.endsWith(".js") && context.parentURL?.endsWith(".ts")) {
			const sourceUrl = new URL(`${specifier.slice(0, -3)}.ts`, context.parentURL);
			if (existsSync(fileURLToPath(sourceUrl))) return { shortCircuit: true, url: sourceUrl.href };
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

const { parseUsageRecord, aggregateUsage, usagePeriod, adjacentPeriod, profileKey } = await import("./usage-analytics-data.js");
const { createUsageAnalyticsStore, defaultUsageAgentDirectory } = await import("./usage-analytics-store.js");

function event(entryId = "entry", timestamp = new Date(2024, 0, 15, 12).getTime()): UsageRecord {
	return { version: 1, timestamp, sessionId: "session", entryId, profile: "Work", provider: "openai", model: "model", input: 10, output: 20, cacheRead: 3, cacheWrite: 4, estimatedCost: null };
}
async function fixture(): Promise<string> {
	// macOS /var is a system symlink; inject the real synthetic temporary root.
	return mkdtemp(join(await realpath(tmpdir()), "osdy-usage-test-"));
}

void test("schema validates unknown values and serializes only approved fields", () => {
	assert.deepEqual(parseUsageRecord({ ...event(), messages: "secret", auth: "secret" }), event());
	for (const invalid of [NaN, Infinity, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, "1"]) {
		assert.equal(parseUsageRecord({ ...event(), input: invalid }), null);
	}
	for (const invalid of [NaN, Infinity, -1, 9e15, "today"]) assert.equal(parseUsageRecord({ ...event(), timestamp: invalid }), null);
	for (const invalid of ["", "a\n", "a\u001b", "x".repeat(257)]) assert.equal(parseUsageRecord({ ...event(), model: invalid }), null);
	for (const invalid of ["bad name", "default", "profiles", "a/b"]) assert.equal(parseUsageRecord({ ...event(), profile: invalid }), null);
	assert.equal(parseUsageRecord({ ...event(), sessionId: "/private/session.jsonl" }), null);
	assert.equal(parseUsageRecord({ ...event(), entryId: "folder\\\\entry" }), null);
	assert.equal(parseUsageRecord({ ...event(), estimatedCost: Infinity }), null);
	assert.equal(parseUsageRecord({ ...event(), estimatedCost: -1 }), null);
	assert.equal(parseUsageRecord({ ...event(), estimatedCost: "1" }), null);
	assert.equal(parseUsageRecord({ ...event(), version: 2 }), null);
	assert.equal(parseUsageRecord(null), null);
	assert.equal(parseUsageRecord([]), null);
	assert.equal(parseUsageRecord({ ...event(), timestamp: 1.5 }), null);
	assert.equal(parseUsageRecord({ ...event(), estimatedCost: undefined })?.estimatedCost, null);
	assert.notEqual(profileKey(null), profileKey("unmanaged"));
});

void test("private independent shards serialize concurrent appends and deduplicate tuples", async () => {
	const baseDir = await fixture();
	const a = createUsageAnalyticsStore({ baseDir });
	const b = createUsageAnalyticsStore({ baseDir });
	await Promise.all(Array.from({ length: 30 }, (_, i) => (i % 2 ? a : b).append(event(String(i)))));
	await b.append(event("0"));
	await a.append({ ...event("metadata"), extra: "do not persist" });
	const snapshot = await a.read();
	assert.equal(snapshot.records.length, 31);
	assert.equal(snapshot.limited, false);
	assert.deepEqual(snapshot.warnings, []);
	const files = await readdir(a.directory);
	assert.equal(files.length, 2);
	for (const file of files) {
		assert.equal(readFileSync(join(a.directory, file), "utf8").includes("do not persist"), false);
		if (process.platform !== "win32") assert.equal((await lstat(join(a.directory, file))).mode & 0o777, 0o600);
	}
	if (process.platform !== "win32") assert.equal((await lstat(a.directory)).mode & 0o777, 0o700);
	await assert.rejects(a.append({ ...event(), input: -2 }));
});

void test("corrupt and truncated records warn; missing history is explicit", async () => {
	const baseDir = await fixture();
	const store = createUsageAnalyticsStore({ baseDir });
	assert.equal((await store.read()).missing, true);
	await store.append(event());
	await writeFile(join(store.directory, "shard-corrupt.jsonl"), `\nbroken\n${JSON.stringify(event("valid"))}\n{"partial":`, { mode: 0o600 });
	const snapshot = await store.read();
	assert.equal(snapshot.records.length, 2);
	assert.ok(snapshot.warnings.includes("malformed-record"));
	assert.ok(snapshot.warnings.includes("truncated-line"));
	const invalidUtf8 = Buffer.from(`${JSON.stringify({ ...event("utf8"), model: "badX" })}\n`);
	invalidUtf8[invalidUtf8.indexOf("badX") + 3] = 0xff;
	await writeFile(join(store.directory, "shard-invalid-utf8.jsonl"), invalidUtf8);
	const restarted = createUsageAnalyticsStore({ baseDir });
	await restarted.append(event("after-restart"));
	const afterRestart = await restarted.read();
	assert.equal(afterRestart.records.some((record) => record.entryId === "after-restart"), true);
	assert.equal(afterRestart.records.length, 3);
});

void test("bounded reads retain newest tail records and visibly report caps", async () => {
	const baseDir = await fixture();
	const writer = createUsageAnalyticsStore({ baseDir });
	for (let i = 0; i < 8; i++) await writer.append(event(String(i), 1000 + i));
	const capped = createUsageAnalyticsStore({ baseDir, limits: { maxRecords: 2, maxFileBytes: 700, maxTotalBytes: 700 } });
	const result = await capped.read();
	assert.deepEqual(result.records.map((record) => record.entryId), ["6", "7"]);
	assert.equal(result.limited, true);
	await writeFile(join(writer.directory, "shard-large.jsonl"), `${"x".repeat(1000)}\n`, { mode: 0o600 });
	assert.ok((await createUsageAnalyticsStore({ baseDir, limits: { maxLineBytes: 300 } }).read()).warnings.includes("oversized-line"));
	assert.equal((await createUsageAnalyticsStore({ baseDir, limits: { maxFiles: 1 } }).read()).limited, true);
	assert.equal((await createUsageAnalyticsStore({ baseDir, limits: { maxDirectoryEntries: 1 } }).read()).limited, true);
	assert.throws(() => createUsageAnalyticsStore({ baseDir, limits: { maxRecords: 0 } }));
});

void test("an exact bounded tail preserves its complete first record", async () => {
	const baseDir = await fixture();
	const writer = createUsageAnalyticsStore({ baseDir });
	await writer.append(event("older", 1000));
	const newest = event("newest", 2000);
	await writer.append(newest);
	const bytes = Buffer.byteLength(`${JSON.stringify(newest)}\n`);
	for (const limits of [{ maxFileBytes: bytes }, { maxTotalBytes: bytes }, { maxFileBytes: bytes, maxTotalBytes: bytes }]) {
		const snapshot = await createUsageAnalyticsStore({ baseDir, limits }).read();
		assert.deepEqual(snapshot.records, [newest]);
		assert.deepEqual(snapshot.warnings, ["byte-limit"]);
		assert.equal(snapshot.limited, true);
	}
	const partial = await createUsageAnalyticsStore({ baseDir, limits: { maxTotalBytes: bytes - 1 } }).read();
	assert.deepEqual(partial.records, []);
});

void test("unsafe paths and nonregular shards reject rather than silently swallowing I/O", async () => {
	const baseDir = await fixture();
	const store = createUsageAnalyticsStore({ baseDir });
	await store.append(event());
	const outside = join(baseDir, "outside");
	await writeFile(outside, "untouched");
	await symlink(outside, join(store.directory, "shard-link.jsonl"));
	await assert.rejects(store.read(), /regular|symbolic/i);
	assert.equal(readFileSync(outside, "utf8"), "untouched");
	const other = await fixture();
	await symlink(baseDir, join(other, "linked"));
	await assert.rejects(createUsageAnalyticsStore({ baseDir: join(other, "linked") }).append(event()), /directory|symbolic/i);
	const nonregular = createUsageAnalyticsStore({ baseDir: await fixture() });
	await nonregular.append(event());
	await mkdir(join(nonregular.directory, "shard-directory.jsonl"));
	await assert.rejects(nonregular.read(), /regular/i);
	if (process.platform !== "win32" && process.getuid?.() !== 0) {
		await chmod(nonregular.directory, 0o000);
		await assert.rejects(nonregular.read());
	}
});

void test("bounded file selection prefers recent shards and total byte caps are visible", async () => {
	const baseDir = await fixture();
	const store = createUsageAnalyticsStore({ baseDir });
	await store.append(event("old", 1000));
	const [oldFile] = await readdir(store.directory);
	assert.ok(oldFile);
	await utimes(join(store.directory, oldFile), 1, 1);
	const newer = createUsageAnalyticsStore({ baseDir });
	await newer.append(event("new", 2000));
	const snapshot = await createUsageAnalyticsStore({ baseDir, limits: { maxFiles: 1 } }).read();
	assert.deepEqual(snapshot.records.map((record) => record.entryId), ["new"]);
	assert.ok(snapshot.warnings.includes("file-limit"));
	const directoryCap = await createUsageAnalyticsStore({ baseDir, limits: { maxDirectoryEntries: 1 } }).read();
	assert.ok(directoryCap.warnings.includes("directory-limit"));
	const bytes = await createUsageAnalyticsStore({ baseDir, limits: { maxTotalBytes: 300 } }).read();
	assert.ok(bytes.warnings.includes("byte-limit"));
	assert.equal(bytes.records[0]?.entryId, "new");
});

void test("drain exposes failed writes, and no failure touches outside a synthetic fixture", async () => {
	const baseDir = await fixture();
	const store = createUsageAnalyticsStore({ baseDir });
	await writeFile(join(baseDir, "extensions"), "not a directory");
	await assert.rejects(store.append(event()));
	await assert.rejects(store.drain());
});

void test("tuple deduplication cannot collide on delimiters and replay is idempotent", async () => {
	const store = createUsageAnalyticsStore({ baseDir: await fixture() });
	await store.append({ ...event("c"), sessionId: "a:b" });
	await store.append({ ...event("b:c"), sessionId: "a", estimatedCost: 0 });
	await store.append({ ...event("c"), sessionId: "a:b" });
	const snapshot = await store.read();
	assert.equal(snapshot.records.length, 2);
	assert.equal(snapshot.records.find((record) => record.sessionId === "a")?.estimatedCost, 0);
});

void test("default location uses only an absolute configured agent directory", () => {
	assert.equal(defaultUsageAgentDirectory({ PI_CODING_AGENT_DIR: "/synthetic/agent" }, "/synthetic/home"), "/synthetic/agent");
	assert.equal(defaultUsageAgentDirectory({ PI_CODING_AGENT_DIR: "relative" }, "/synthetic/home"), "/synthetic/home/.pi/agent");
});

void test("local aggregation filters profiles/models, keeps empty buckets and estimated costs separate", () => {
	const period = usagePeriod("week", new Date(2024, 0, 17));
	assert.equal(new Date(period.start).getDay(), 1);
	const records = [event(), { ...event("two"), profile: "work", estimatedCost: 0.5 }, { ...event("other"), profile: null }, { ...event("boundary"), timestamp: period.end }];
	const result = aggregateUsage(records, period, { profile: "WORK", provider: "openai", model: "model" });
	assert.equal(result.buckets.length, 7);
	assert.equal(result.totals.records, 2);
	assert.equal(result.totals.input, 20);
	assert.equal(result.totals.output, 40);
	assert.equal(result.totals.cacheRead, 6);
	assert.equal(result.totals.cacheWrite, 8);
	assert.equal(result.totals.estimatedCost, 0.5);
	assert.equal(result.totals.unavailableCostRecords, 1);
	assert.equal(result.profiles.length, 1);
	assert.equal(result.models.length, 1);
	assert.equal(aggregateUsage(records, period, { profile: null }).totals.records, 1);
	assert.equal(aggregateUsage(records, period, { model: "missing" }).totals.records, 0);
	const grouped = aggregateUsage([event(), { ...event("z"), profile: "Zed", provider: "z" }, { ...event("u"), profile: "unmanaged" }, { ...event("n"), profile: null }], period);
	assert.equal(grouped.profiles.length, 4);
	assert.deepEqual(grouped.models.map((group) => group.provider), ["openai", "z"]);
	assert.throws(() => usagePeriod("day", new Date(NaN)));
	assert.throws(() => aggregateUsage([], { ...period, end: period.start }));
	assert.throws(() => aggregateUsage([{ ...event(), input: -1 }], period));
	assert.throws(() => aggregateUsage([{ ...event(), input: Number.MAX_SAFE_INTEGER }, event("overflow")], period));
	assert.throws(() => aggregateUsage([], period, { profile: "invalid profile" }));
	assert.throws(() => aggregateUsage([], period, { model: "" }));
	assert.equal(aggregateUsage([{ ...event(), profile: "Renamed" }, event("original")], period).profiles.length, 2);
});

void test("calendar navigation crosses months, leap days and years", () => {
	const january = usagePeriod("month", new Date(2024, 0, 31));
	const february = adjacentPeriod(january, 1);
	assert.equal(aggregateUsage([], february).buckets.length, 29);
	assert.equal(new Date(adjacentPeriod(january, -1).start).getFullYear(), 2023);
	assert.equal(adjacentPeriod(february, -1).start, january.start);
});

void test("skipped midnight does not carry hour one into subsequent civil boundaries", () => {
	const previous = process.env.TZ;
	process.env.TZ = "America/Santiago";
	try {
		// Node's tz database skips 2024-09-08 00:00 to 01:00.
		assert.equal(new Date(2024, 8, 8).getHours(), 1);
		const transition = usagePeriod("day", new Date(2024, 8, 8, 12));
		const following = usagePeriod("day", new Date(2024, 8, 9, 12));
		assert.equal(transition.end, following.start);
		assert.equal(transition.end - transition.start, 23 * 3600000);
		assert.deepEqual(adjacentPeriod(transition, 1), following);
		assert.deepEqual(adjacentPeriod(following, -1), transition);
		const boundaryRecord = event("boundary", following.start);
		assert.equal(aggregateUsage([boundaryRecord], transition).totals.records, 0);
		assert.equal(aggregateUsage([boundaryRecord], following).totals.records, 1);
	} finally {
		if (previous === undefined) delete process.env.TZ;
		else process.env.TZ = previous;
	}
});

void test("week and month buckets reset to civil midnight after a midnight DST jump", () => {
	const previous = process.env.TZ;
	process.env.TZ = "America/Santiago";
	try {
		for (const kind of ["week", "month"] as const) {
			const period = usagePeriod(kind, new Date(2024, 8, 8, 12));
			assert.equal(new Date(period.start).getHours(), 0);
			assert.equal(new Date(period.end).getHours(), 0);
			const buckets = aggregateUsage([], period).buckets;
			assert.equal(buckets.length, kind === "week" ? 7 : 30);
			for (const [index, bucket] of buckets.entries()) {
				const start = new Date(bucket.start);
				assert.equal(start.getHours(), start.getDate() === 8 ? 1 : 0);
				assert.equal(start.getMinutes(), 0);
				if (index > 0) assert.equal(buckets[index - 1]?.end, bucket.start);
			}
			assert.equal(buckets.at(-1)?.end, period.end);
		}
	} finally {
		if (previous === undefined) delete process.env.TZ;
		else process.env.TZ = previous;
	}
});

void test("DST calendar arithmetic uses local boundaries, not fixed day durations", () => {
	const previous = process.env.TZ;
	process.env.TZ = "America/New_York";
	try {
		const spring = usagePeriod("day", new Date(2024, 2, 10, 12));
		const fall = usagePeriod("day", new Date(2024, 10, 3, 12));
		assert.equal(spring.end - spring.start, 23 * 3600000);
		assert.equal(fall.end - fall.start, 25 * 3600000);
		assert.equal(aggregateUsage([], spring).buckets.length, 23);
		assert.equal(aggregateUsage([], fall).buckets.length, 25);
		assert.equal(new Date(adjacentPeriod(spring, 1).start).getHours(), 0);
		assert.equal(aggregateUsage([], usagePeriod("week", new Date(2024, 2, 10))).buckets.length, 7);
		process.env.TZ = "Australia/Lord_Howe";
		const halfHour = aggregateUsage([], usagePeriod("day", new Date(2024, 9, 6, 12)));
		assert.equal(new Date(halfHour.buckets.at(-1)?.start ?? NaN).getMinutes(), 0);
		assert.equal(halfHour.buckets.at(-1)?.end, halfHour.period.end);
	} finally {
		if (previous === undefined) delete process.env.TZ;
		else process.env.TZ = previous;
	}
});

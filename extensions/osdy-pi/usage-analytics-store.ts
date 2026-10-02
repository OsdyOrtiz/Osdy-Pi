import { randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { chmod, lstat, mkdir, open, opendir } from "node:fs/promises";
import { homedir } from "node:os";
import { isAbsolute, join, parse, resolve } from "node:path";
import { parseUsageRecord, type UsageRecord } from "./usage-analytics-data.js";

export interface UsageReadLimits {
	maxDirectoryEntries: number;
	maxFiles: number;
	maxFileBytes: number;
	maxTotalBytes: number;
	maxRecords: number;
	maxLineBytes: number;
}
/** directory-limit means even newest coverage cannot be guaranteed outside the scanned set.
 * Other caps prefer recently modified shards and their newest complete lines.
 */
export type UsageHistoryWarning = "directory-limit" | "file-limit" | "byte-limit" | "record-limit" | "oversized-line" | "malformed-record" | "truncated-line";
export interface UsageSnapshot {
	records: UsageRecord[];
	warnings: UsageHistoryWarning[];
	limited: boolean;
	missing: boolean;
}
export interface UsageAnalyticsStore {
	readonly directory: string;
	append(value: unknown): Promise<void>;
	read(): Promise<UsageSnapshot>;
	/** Wait for queued appends and reject if any write in this store failed. */
	drain(): Promise<void>;
}
export interface UsageStoreOptions { baseDir?: string; limits?: Partial<UsageReadLimits> }

const DEFAULT_LIMITS: UsageReadLimits = {
	maxDirectoryEntries: 4096, maxFiles: 256, maxFileBytes: 4 * 1024 * 1024,
	maxTotalBytes: 16 * 1024 * 1024, maxRecords: 50000, maxLineBytes: 8192,
};
export function defaultUsageAgentDirectory(env: NodeJS.ProcessEnv = process.env, home: string = homedir()): string {
	const configured = env.PI_CODING_AGENT_DIR;
	return configured && isAbsolute(configured) ? configured : join(home, ".pi", "agent");
}
function errorCode(error: unknown, code: string): boolean {
	return typeof error === "object" && error !== null && "code" in error && error.code === code;
}

/** Check each component, including the injected base, rather than following existing links.
 * Newly created components are private; only our leaf directory's existing mode is tightened.
 */
async function checkDirectories(directory: string, create: boolean): Promise<boolean> {
	const root = parse(directory).root;
	const parts = directory.slice(root.length).split(/[\\/]/).filter(Boolean);
	let current = root;
	for (const part of parts) {
		current = join(current, part);
		let stat;
		try { stat = await lstat(current); }
		catch (error) {
			if (!errorCode(error, "ENOENT")) throw error;
			if (!create) return false;
			try { await mkdir(current, { mode: 0o700 }); }
			catch (mkdirError) { if (!errorCode(mkdirError, "EEXIST")) throw mkdirError; }
			stat = await lstat(current);
		}
		if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("Usage history requires nonsymbolic directories");
	}
	return true;
}
interface Shard { name: string; modified: number }

export function createUsageAnalyticsStore(options: UsageStoreOptions = {}): UsageAnalyticsStore {
	const baseDir = options.baseDir ?? defaultUsageAgentDirectory();
	if (!isAbsolute(baseDir)) throw new Error("Usage history base directory must be absolute");
	const directory = join(resolve(baseDir), "extensions", "osdy-pi", "usage-analytics");
	const limits = { ...DEFAULT_LIMITS, ...options.limits };
	for (const value of Object.values(limits)) {
		if (!Number.isSafeInteger(value) || value <= 0 || value > 100 * 1024 * 1024) throw new Error("Invalid usage read limit");
	}
	// Never share a filename or an in-memory counter with another factory/process instance.
	const shardPath = join(directory, `shard-${Date.now()}-${process.pid}-${randomUUID()}.jsonl`);
	let initialized = false;
	let failed: Error | undefined;
	let queue: Promise<void> = Promise.resolve();
	let appendFailure: Error | undefined;

	async function appendRecord(record: UsageRecord): Promise<void> {
		if (failed) throw failed;
		await checkDirectories(directory, true);
		await chmod(directory, 0o700);
		const flags = constants.O_WRONLY | constants.O_APPEND | constants.O_NOFOLLOW | (initialized ? 0 : constants.O_CREAT | constants.O_EXCL);
		const handle = await open(shardPath, flags, 0o600);
		try {
			const stat = await handle.stat();
			if (!stat.isFile() || stat.nlink !== 1) throw new Error("Usage shard must be a private regular file");
			await handle.chmod(0o600);
			initialized = true;
			try {
				await handle.writeFile(`${JSON.stringify(record)}\n`, "utf8");
			} catch (error) {
				// A partial write may have left a trailing fragment. Do not concatenate a later event.
				failed = new Error("Usage shard write failed; create a new store before appending", { cause: error });
				throw failed;
			}
		} finally { await handle.close(); }
	}

	async function read(): Promise<UsageSnapshot> {
		await queue;
		const warnings = new Set<UsageHistoryWarning>();
		let limited = false;
		function cap(warning: UsageHistoryWarning): void { warnings.add(warning); limited = true; }
		if (!await checkDirectories(directory, false)) return { records: [], warnings: [], limited: false, missing: true };
		const candidates: Shard[] = [];
		const dir = await opendir(directory, { bufferSize: 32 });
		try {
			let scanned = 0;
			while (true) {
				const entry = await dir.read();
				if (!entry) break;
				if (scanned++ >= limits.maxDirectoryEntries) { cap("directory-limit"); break; }
				if (!/^shard-[A-Za-z0-9-]+\.jsonl$/.test(entry.name)) continue;
				const stat = await lstat(join(directory, entry.name));
				if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) throw new Error("Usage shard must be a nonsymbolic regular file");
				candidates.push({ name: entry.name, modified: stat.mtimeMs });
			}
		} finally { await dir.close(); }
		// Latest modified shards and file tails first, not oldest-first coverage under byte caps.
		candidates.sort((a, b) => b.modified - a.modified || b.name.localeCompare(a.name));
		if (candidates.length > limits.maxFiles) cap("file-limit");
		const selected = candidates.slice(0, limits.maxFiles);
		const decoder = new TextDecoder("utf-8", { fatal: true });
		const records: UsageRecord[] = [];
		let bytesLeft = limits.maxTotalBytes;
		let parsedRecords = 0;
		for (const shard of selected) {
			if (bytesLeft === 0) { cap("byte-limit"); break; }
			const handle = await open(join(directory, shard.name), constants.O_RDONLY | constants.O_NOFOLLOW);
			try {
				const stat = await handle.stat();
				if (!stat.isFile() || stat.nlink !== 1) throw new Error("Usage shard must be a regular file");
				const size = Math.min(stat.size, limits.maxFileBytes, bytesLeft);
				const offset = stat.size - size;
				if (offset > 0) cap("byte-limit");
				const buffer = Buffer.alloc(size);
				let readBytes = 0;
				while (readBytes < size) {
					const result = await handle.read(buffer, readBytes, size - readBytes, offset + readBytes);
					if (result.bytesRead === 0) break;
					readBytes += result.bytesRead;
				}
				bytesLeft -= size;
				const contents = buffer.subarray(0, readBytes);
				const start = 0;
				// The first bounded line may be a fragment OR an exactly aligned record.
				// Validate it below rather than discard it or read outside the byte budget.
				let end = contents.length;
				if (end > start && contents[end - 1] !== 10) {
					warnings.add("truncated-line");
					const newline = contents.lastIndexOf(10);
					end = newline < start ? start : newline + 1;
				}
				while (end > start) {
					// Buffer's negative search offsets wrap from the end; a leading blank
					// line must still move the cursor to zero.
					const previous = end >= 2 ? contents.lastIndexOf(10, end - 2) : -1;
					const lineStart = Math.max(start, previous + 1);
					const line = contents.subarray(lineStart, end - 1);
					end = lineStart;
					if (line.length > limits.maxLineBytes) { warnings.add("oversized-line"); continue; }
					const boundedFirstLine = offset > 0 && lineStart === 0;
					let parsed: unknown;
					try { parsed = JSON.parse(decoder.decode(line)); }
					catch { if (!boundedFirstLine) warnings.add("malformed-record"); continue; }
					const record = parseUsageRecord(parsed);
					if (!record) { if (!boundedFirstLine) warnings.add("malformed-record"); continue; }
					parsedRecords++;
					records.push(record);
					if (parsedRecords >= limits.maxRecords) { if (end > start) cap("record-limit"); break; }
				}
			} finally { await handle.close(); }
			if (parsedRecords >= limits.maxRecords) {
				if (shard !== selected.at(-1)) cap("record-limit");
				break;
			}
		}
		const identities = new Set<string>();
		const unique: UsageRecord[] = [];
		// Prefer latest event timestamp for replay conflicts, then return chronological chart input.
		records.sort((a, b) => b.timestamp - a.timestamp);
		for (const record of records) {
			const identity = JSON.stringify([record.sessionId, record.entryId]);
			if (!identities.has(identity)) { identities.add(identity); unique.push(record); }
		}
		unique.reverse();
		return { records: unique, warnings: [...warnings].sort(), limited, missing: false };
	}

	return {
		directory,
		append(value: unknown): Promise<void> {
			const record = parseUsageRecord(value);
			if (!record) return Promise.reject(new Error("Invalid usage record"));
			const result = queue.then(() => appendRecord(record));
			// Recover scheduling only; the caller receives the original rejection.
			queue = result.catch((error: unknown) => {
				appendFailure ??= error instanceof Error ? error : new Error("Usage append failed", { cause: error });
			});
			return result;
		},
		read,
		async drain(): Promise<void> {
			await queue;
			if (appendFailure) throw appendFailure;
		},
	};
}

import { createHash, randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { lstat, mkdir, open, rename, unlink } from "node:fs/promises";
import type { FileHandle } from "node:fs/promises";
import { join } from "node:path";
import type { ConsumeCodexResetCode } from "./codex-usage.js";

/** Resolved without confirmedCode means definitely not sent, never inferred from GET. */
export type CodexResetRecord = {
	version: 1;
	accountId: string;
	creditId: string;
	requestId: string;
	expiresAt?: number;
} & ({ status: "pending" } | { status: "resolved"; confirmedCode?: ConsumeCodexResetCode });

export type CodexResetLease = {
	read(): Promise<CodexResetRecord | undefined>;
	write(record: CodexResetRecord): Promise<void>;
	release(): Promise<void>;
};

export type CodexResetStore = { acquire(accountId: string): Promise<CodexResetLease> };

const MAX_BYTES = 8_192;
const UUID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const CODES = new Set(["reset", "nothing_to_reset", "no_credit", "already_redeemed"]);
const unavailable = () => new Error("Codex reset journal is unavailable");
const isMissing = (error: unknown) => !!error && typeof error === "object" && "code" in error && error.code === "ENOENT";
const validId = (value: unknown): value is string => typeof value === "string" && value.length <= 512 && !!value.trim() &&
	!Array.from(value).some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127);

function validateRecord(value: unknown, accountId: string): CodexResetRecord {
	if (!value || typeof value !== "object" || Array.isArray(value)) throw unavailable();
	// Capture own values once; never serialize caller prototypes, toJSON hooks, or later mutations.
	const record = { ...value } as Record<string, unknown>;
	const keys = ["version", "accountId", "creditId", "requestId", "expiresAt", "status", "confirmedCode"];
	if (Object.getOwnPropertyNames(value).some((key) => !keys.includes(key)) || record.version !== 1 || record.accountId !== accountId ||
		!validId(record.creditId) || typeof record.requestId !== "string" || !UUID.test(record.requestId) ||
		(record.expiresAt !== undefined && (typeof record.expiresAt !== "number" || !Number.isSafeInteger(record.expiresAt) || record.expiresAt < 0)) ||
		(record.status !== "pending" && record.status !== "resolved") ||
		(record.confirmedCode !== undefined && (record.status !== "resolved" || typeof record.confirmedCode !== "string" || !CODES.has(record.confirmedCode))))
		throw unavailable();
	return record as CodexResetRecord;
}

function sameAttempt(left: CodexResetRecord, right: CodexResetRecord): boolean {
	return left.accountId === right.accountId && left.creditId === right.creditId &&
		left.requestId === right.requestId && left.expiresAt === right.expiresAt;
}

/** The injected root must have trusted parents. No auth material enters this edge. */
export function createCodexResetStore(rootDirectory: string): CodexResetStore {
	return {
		async acquire(accountId) {
			let lock: FileHandle | undefined;
			try {
				if (!validId(accountId)) throw unavailable();
				await mkdir(rootDirectory, { recursive: true, mode: 0o700 });
				const root = await lstat(rootDirectory);
				if (!root.isDirectory() || root.isSymbolicLink() || (root.mode & 0o777) !== 0o700) throw unavailable();
				const hash = createHash("sha256").update(accountId).digest("hex");
				const journalPath = join(rootDirectory, `${hash}.json`);
				const lockPath = join(rootDirectory, `${hash}.lock`);
				// Existing locks (including empty, stale, or symlink locks) are never reclaimed.
				lock = await open(lockPath, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
				const heldLock = lock;
				const lockStat = await heldLock.stat();
				let released = false;
				let poisoned = false;

				async function checkRoot() {
					if (released || poisoned) throw unavailable();
					const current = await lstat(rootDirectory);
					if (!current.isDirectory() || current.isSymbolicLink() || current.dev !== root.dev || current.ino !== root.ino ||
						(current.mode & 0o777) !== 0o700) throw unavailable();
				}

				async function read(): Promise<CodexResetRecord | undefined> {
					let file: FileHandle | undefined;
					try {
						await checkRoot();
						try { file = await open(journalPath, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK); }
						catch (error) { if (isMissing(error)) return undefined; throw error; }
						const info = await file.stat();
						if (!info.isFile() || (info.mode & 0o777) !== 0o600 || info.size > MAX_BYTES) throw unavailable();
						// A fixed buffer bounds reads even if another writer grows the file after stat.
						const buffer = Buffer.alloc(MAX_BYTES + 1);
						let size = 0;
						while (size < buffer.length) {
							const { bytesRead } = await file.read(buffer, size, buffer.length - size, size);
							if (bytesRead === 0) break;
							size += bytesRead;
						}
						if (size > MAX_BYTES) throw unavailable();
						const text = new TextDecoder("utf-8", { fatal: true }).decode(buffer.subarray(0, size));
						return validateRecord(JSON.parse(text) as unknown, accountId);
					} catch { throw unavailable(); }
					finally { await file?.close().catch(() => { throw unavailable(); }); }
				}

				async function syncDirectory() {
					const directory = await open(rootDirectory, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
					try { await directory.sync(); }
					finally { await directory.close(); }
				}

				async function write(record: CodexResetRecord): Promise<void> {
					let previous: CodexResetRecord | undefined;
					let published = false;
					async function atomicSave(next: CodexResetRecord) {
						const tempPath = join(rootDirectory, `${hash}.${randomUUID()}.tmp`);
						let temp: FileHandle | undefined;
						let created = false;
						try {
							await checkRoot();
							temp = await open(tempPath, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
							created = true;
							await temp.writeFile(JSON.stringify(next), "utf8");
							await temp.sync();
							await temp.close();
							temp = undefined;
							await checkRoot();
							try {
								const final = await lstat(journalPath);
								if (!final.isFile() || final.isSymbolicLink() || (final.mode & 0o777) !== 0o600) throw unavailable();
							} catch (error) { if (!isMissing(error)) throw error; }
							await rename(tempPath, journalPath);
							created = false;
							published = true;
							await syncDirectory();
						} finally {
							try { await temp?.close(); }
							finally { if (created) await unlink(tempPath); }
						}
					}
					try {
						record = validateRecord(record, accountId);
						if (Buffer.byteLength(JSON.stringify(record)) > MAX_BYTES) throw unavailable();
						previous = await read();
						if ((previous?.status === "pending" && !sameAttempt(previous, record)) ||
							(previous?.status === "resolved" && record.status === "pending" && previous.requestId === record.requestId) ||
							(record.status === "resolved" && (previous?.status !== "pending" || !sameAttempt(previous, record)))) throw unavailable();
						await atomicSave(record);
					} catch {
						// A post-rename fsync failure must not expose a resolved gate. Restore pending;
						// if even that fails, retain the lock rather than permit another attempt.
						if (published && record.status === "resolved" && previous?.status === "pending") {
							try { await atomicSave(previous); }
							catch { poisoned = true; }
						}
						throw unavailable();
					}
				}

				async function release(): Promise<void> {
					try {
						await checkRoot();
						const current = await lstat(lockPath);
						if (!current.isFile() || (current.mode & 0o777) !== 0o600 || current.dev !== lockStat.dev || current.ino !== lockStat.ino)
							throw unavailable();
						await heldLock.close();
						await unlink(lockPath);
					} catch { throw unavailable(); }
					finally { released = true; await heldLock.close().catch(() => {}); }
				}
				return { read, write, release };
			} catch {
				await lock?.close().catch(() => {}); // Never remove an uncertain or pre-existing lock.
				throw unavailable();
			}
		},
	};
}

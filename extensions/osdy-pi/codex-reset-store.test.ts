import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { chmod, mkdtemp, open, readFile, readdir, rm, stat, symlink, writeFile } from "node:fs/promises";
import type { FileHandle } from "node:fs/promises";
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

const { createCodexResetStore } = await import("./codex-reset-store.js");
const accountId = "synthetic-account/../not-a-path";
const pending = {
	version: 1 as const, accountId, creditId: "synthetic-credit",
	requestId: "11111111-1111-4111-8111-111111111111", expiresAt: 2_000, status: "pending" as const,
};
const basename = createHash("sha256").update(accountId).digest("hex");

async function fixture(t: test.TestContext) {
	const directory = await mkdtemp(join(tmpdir(), "osdy-reset-test-"));
	t.after(() => rm(directory, { recursive: true, force: true })); // Only this synthetic fixture.
	const root = join(directory, "journal");
	return { root, store: createCodexResetStore(root) };
}

void test("private hashed journals round-trip and resolved attempts permit a new request", async (t) => {
	const { root, store } = await fixture(t);
	const lease = await store.acquire(accountId);
	assert.equal(await lease.read(), undefined);
	await lease.write(pending);
	assert.deepEqual(await lease.read(), pending);
	assert.equal((await stat(root)).mode & 0o777, 0o700);
	for (const name of await readdir(root)) {
		assert.match(name, /^[a-f0-9]{64}\.(json|lock)$/);
		assert.equal((await stat(join(root, name))).mode & 0o777, 0o600);
	}
	assert.equal((await readFile(join(root, `${basename}.json`), "utf8")).includes("accessToken"), false);
	await lease.write({ ...pending, status: "resolved", confirmedCode: "reset" });
	await lease.write({ ...pending, requestId: "22222222-2222-4222-8222-222222222222" });
	await lease.release();
	const restored = await store.acquire(accountId);
	assert.equal((await restored.read())?.requestId, "22222222-2222-4222-8222-222222222222");
	await restored.release();
	assert.deepEqual(await readdir(root), [`${basename}.json`]);
});

void test("account leases are exclusive, isolate accounts, and never reclaim existing stale locks", async (t) => {
	const { root, store } = await fixture(t);
	const lease = await store.acquire(accountId);
	await assert.rejects(store.acquire(accountId), /^Error: Codex reset journal is unavailable$/);
	const other = await store.acquire("synthetic-other");
	assert.equal(await other.read(), undefined);
	await lease.write(pending);
	assert.equal(await other.read(), undefined);
	await other.release();
	await lease.release();
	await writeFile(join(root, `${basename}.lock`), "", { mode: 0o600 });
	await assert.rejects(store.acquire(accountId), /^Error: Codex reset journal is unavailable$/);
	assert.equal(await readFile(join(root, `${basename}.lock`), "utf8"), "");
});

for (const content of [
	"{broken", "x".repeat(8_193), JSON.stringify({ ...pending, version: 2 }),
	JSON.stringify({ ...pending, accountId: "wrong-account" }), JSON.stringify({ ...pending, requestId: "bad" }),
	JSON.stringify({ ...pending, expiresAt: -1 }), JSON.stringify({ ...pending, accessToken: "forbidden" }),
	JSON.stringify({ ...pending, status: "resolved", confirmedCode: "invented" }),
	JSON.stringify({ ...pending, status: "pending", confirmedCode: "reset" }),
]) {
	void test(`rejects corrupt or unbounded journal fixture ${content.length}:${content.slice(0, 12)}`, async (t) => {
		const { root, store } = await fixture(t);
		const lease = await store.acquire(accountId);
		await writeFile(join(root, `${basename}.json`), content, { mode: 0o600 });
		await assert.rejects(lease.read(), /^Error: Codex reset journal is unavailable$/);
		await lease.release();
	});
}

void test("refuses final-file symlinks on both read and atomic write, preserving the target", async (t) => {
	const { root, store } = await fixture(t);
	const lease = await store.acquire(accountId);
	const target = join(root, "synthetic-target");
	await writeFile(target, "untouched", { mode: 0o600 });
	await symlink(target, join(root, `${basename}.json`));
	await assert.rejects(lease.read());
	await assert.rejects(lease.write(pending));
	assert.equal(await readFile(target, "utf8"), "untouched");
	await lease.release();
	assert.equal((await readdir(root)).some((name) => name.endsWith(".tmp")), false);
});

void test("refuses symlink roots and non-private journal files or directories", async (t) => {
	const { root, store } = await fixture(t);
	const lease = await store.acquire(accountId);
	await lease.write(pending);
	await chmod(join(root, `${basename}.json`), 0o644);
	await assert.rejects(lease.read());
	await lease.release();
	await chmod(root, 0o755);
	await assert.rejects(store.acquire(accountId));
	const link = `${root}-link`;
	await symlink(root, link);
	await assert.rejects(createCodexResetStore(link).acquire(accountId));
});

void test("validation/write failure cannot replace pending; terminal outcomes must match the logical attempt", async (t) => {
	const { root, store } = await fixture(t);
	const lease = await store.acquire(accountId);
	await lease.write(pending);
	await assert.rejects(lease.write({ ...pending, creditId: "different" }));
	await assert.rejects(lease.write({ ...pending, status: "resolved", requestId: "22222222-2222-4222-8222-222222222222" }));
	await assert.rejects(lease.write({ ...pending, creditId: "x".repeat(8_193) }));
	assert.deepEqual(await lease.read(), pending);
	assert.equal((await readdir(root)).some((name) => name.endsWith(".tmp")), false);
	await lease.write({ ...pending, status: "resolved" }); // Definitely not sent.
	await lease.release();
});

void test("invalid UTF-8 must not silently change an opaque stored credit ID", async (t) => {
	const { root, store } = await fixture(t);
	const lease = await store.acquire(accountId);
	const content = Buffer.from(JSON.stringify(pending));
	content[content.indexOf("synthetic-credit")] = 0xff;
	await writeFile(join(root, `${basename}.json`), content, { mode: 0o600 });
	await assert.rejects(lease.read());
	await lease.release();
});

void test("resolved request IDs cannot be reused for a new logical attempt", async (t) => {
	const { store } = await fixture(t);
	const lease = await store.acquire(accountId);
	await lease.write(pending);
	await lease.write({ ...pending, status: "resolved", confirmedCode: "reset" });
	await assert.rejects(lease.write(pending));
	await lease.release();
});

async function fileHandlePrototype(root: string): Promise<FileHandle> {
	const probe = await open(join(root, "synthetic-probe"), "wx", 0o600);
	const prototype = Object.getPrototypeOf(probe) as FileHandle;
	await probe.close();
	return prototype;
}

void test("failed temporary write leaves pending intact and cleans only its own temporary file", async (t) => {
	const { root, store } = await fixture(t);
	const lease = await store.acquire(accountId);
	await lease.write(pending);
	const prototype = await fileHandlePrototype(root);
	const fault = t.mock.method(prototype, "writeFile", () => Promise.reject(new Error("synthetic write fault")));
	await assert.rejects(lease.write({ ...pending, status: "resolved", confirmedCode: "reset" }));
	fault.mock.restore();
	assert.deepEqual(await lease.read(), pending);
	assert.equal((await readdir(root)).some((name) => name.endsWith(".tmp")), false);
	await lease.release();
});

for (const restoreFails of [false, true]) {
	void test(`post-rename terminal fsync failure restores pending or retains lock (${restoreFails})`, async (t) => {
		const { root, store } = await fixture(t);
		const lease = await store.acquire(accountId);
		await lease.write(pending);
		const prototype = await fileHandlePrototype(root);
		const original = Reflect.get(prototype, "sync");
		let directorySyncs = 0;
		const fault = t.mock.method(prototype, "sync", async function (this: FileHandle) {
			if ((await this.stat()).isDirectory() && (++directorySyncs === 1 || restoreFails)) throw new Error("synthetic fsync fault");
			await original.call(this);
		});
		await assert.rejects(lease.write({ ...pending, status: "resolved", confirmedCode: "reset" }));
		fault.mock.restore();
		assert.deepEqual(JSON.parse(await readFile(join(root, `${basename}.json`), "utf8")) as unknown, pending);
		if (restoreFails) {
			await assert.rejects(lease.release());
			await assert.rejects(store.acquire(accountId));
		} else {
			await lease.release();
			const next = await store.acquire(accountId);
			assert.deepEqual(await next.read(), pending);
			await next.release();
		}
		assert.equal((await readdir(root)).some((name) => name.endsWith(".tmp")), false);
	});
}

void test("accepts the byte limit but never reads beyond it", async (t) => {
	const { root, store } = await fixture(t);
	const lease = await store.acquire(accountId);
	const serialized = JSON.stringify(pending);
	await writeFile(join(root, `${basename}.json`), serialized.padEnd(8_192, " "), { mode: 0o600 });
	assert.deepEqual(await lease.read(), pending);
	await writeFile(join(root, `${basename}.json`), serialized.padEnd(8_193, " "), { mode: 0o600 });
	await assert.rejects(lease.read());
	await lease.release();
});

void test("no terminal record without pending, no operations after lease release", async (t) => {
	const { store } = await fixture(t);
	const lease = await store.acquire(accountId);
	await assert.rejects(lease.write({ ...pending, status: "resolved", confirmedCode: "reset" }));
	assert.equal(await lease.read(), undefined);
	await lease.release();
	await assert.rejects(lease.read());
	await assert.rejects(lease.write(pending));
});

void test("write snapshots validated fields before asynchronous IO and cannot serialize inherited credentials", async (t) => {
	const { root, store } = await fixture(t);
	const lease = await store.acquire(accountId);
	const input = { ...pending };
	Object.setPrototypeOf(input, { toJSON: () => ({ ...pending, accessToken: "synthetic-forbidden" }) });
	const saving = lease.write(input);
	Object.assign(input, { creditId: "x".repeat(8_193), accessToken: "synthetic-forbidden" });
	await saving;
	assert.deepEqual(await lease.read(), pending);
	assert.equal((await readFile(join(root, `${basename}.json`), "utf8")).includes("synthetic-forbidden"), false);
	await lease.release();
});

void test("lock release failure is generic and refuses a subsequent lease", async (t) => {
	const { root, store } = await fixture(t);
	const lease = await store.acquire(accountId);
	await chmod(join(root, `${basename}.lock`), 0o644);
	await assert.rejects(lease.release(), /^Error: Codex reset journal is unavailable$/);
	await assert.rejects(store.acquire(accountId));
});

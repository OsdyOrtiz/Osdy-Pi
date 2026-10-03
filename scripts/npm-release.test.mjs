import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { gzipSync, gunzipSync } from "node:zlib";
import { readFile } from "node:fs/promises";
import { URL } from "node:url";
import test from "node:test";
import { allocateVersion, finalizeInputs, inspectArchive, hashes, verifyPublished, registryDocument, guardRerun } from "./npm-release.mjs";

const source = "a".repeat(40);
const repository = { type: "git", url: "git+https://github.com/OsdyOrtiz/Osdy-Pi.git" };
const record = (version, extra = {}) => ({ name: "osdy-pi", version, ...extra });
const packument = (versions = {}) => ({ name: "osdy-pi", versions });
const manifest = { name: "osdy-pi", version: "1.11.0", files: ["README.md"] };
const lock = { version: manifest.version, packages: { "": { version: manifest.version }, dep: { version: "2.0.0" } } };
function archive(entries) {
	const blocks = [];
	for (const [name, bytes, type = "0"] of entries) {
		const body = Buffer.from(bytes);
		const header = Buffer.alloc(512);
		header.write(name);
		header.write(body.length.toString(8).padStart(11, "0"), 124);
		header.fill(32, 148, 156);
		header.write(type, 156);
		const sum = header.reduce((total, byte) => total + byte, 0);
		header.write(`${sum.toString(8).padStart(6, "0")}\0 `, 148);
		blocks.push(header, body, Buffer.alloc((512 - body.length % 512) % 512));
	}
	return gzipSync(Buffer.concat([...blocks, Buffer.alloc(1024)]));
}

test("patch allocation uses the greater source/registry stable version, never prereleases", () => {
	assert.equal(allocateVersion("1.11.0", packument(), source).version, "1.11.1");
	assert.equal(allocateVersion("1.11.0", packument({ "1.12.9": record("1.12.9"), "9.0.0-beta.1": record("9.0.0-beta.1") }), source).version, "1.12.10");
	assert.throws(() => allocateVersion("invalid", packument(), source), /stable/);
	assert.throws(() => allocateVersion("1.11.0", {}, source), /registry/);
});

test("same-source reruns reuse exactly one prior version; ambiguous mappings fail closed", () => {
	const versions = { "1.11.4": record("1.11.4", { releaseSource: source }) };
	assert.deepEqual(allocateVersion("1.11.0", packument(versions), source), { version: "1.11.4", existing: true });
	assert.throws(() => allocateVersion("1.11.0", packument({ ...versions, "1.11.5": record("1.11.5", { releaseSource: source }) }), source), /multiple/);
});

test("allocation rejects malformed package records, version keys and source mappings", () => {
	for (const entry of [null, [], 3, {}, record("1.2.4"), record("1.2.3", { name: "other" }), record("1.2.3", { releaseSource: null }), record("1.2.3", { releaseSource: "invalid" })])
		assert.throws(() => allocateVersion("1.11.0", packument({ "1.2.3": entry }), source), /registry/);
	for (const key of ["invalid", "01.2.3", "1.2.3-beta.01", "1.2.3-", "1.2.3+", "9007199254740992.0.0"])
		assert.throws(() => allocateVersion("1.11.0", packument({ [key]: record(key) }), source), /registry/);
	for (const document of [null, [], 3, { versions: {} }, packument([]), { ...packument(), name: "other" }])
		assert.throws(() => allocateVersion("1.11.0", document, source), /registry/);
	const otherSource = "b".repeat(40);
	assert.throws(() => allocateVersion("1.11.0", packument({
		"1.2.3": record("1.2.3", { releaseSource: otherSource }),
		"1.2.4": record("1.2.4", { releaseSource: otherSource }),
	}), source), /multiple/);
	const versions = Object.fromEntries(["9.0.0-beta.1", "9.0.0-0", "9.0.0-alpha-beta+build.01", "1.12.9+build.01"].map((version) => [version, record(version, { dist: {}, _id: `osdy-pi@${version}` })]));
	assert.equal(allocateVersion("1.11.0", packument(versions), source).version, "1.12.10");
	assert.throws(() => allocateVersion("1.11.0", packument({ "1.11.4": record("1.11.4", { releaseSource: source }), "1.11.5": null }), source), /registry/);
});

test("reruns without a registry-verified source stop instead of allocating blindly", () => {
	guardRerun({ existing: false }, "1");
	guardRerun({ existing: true }, "2");
	assert.throws(() => guardRerun({ existing: false }, "2"), /uncertain/);
	assert.throws(() => guardRerun({ existing: false }, "unknown"), /attempt/);
});

test("finalization synchronizes all roots without dependency changes or input mutation", () => {
	const result = finalizeInputs(manifest, lock, "1.11.1", source);
	assert.equal(result.manifest.releaseSource, source);
	assert.deepEqual(result.manifest.repository, repository);
	assert.equal(manifest.repository, undefined);
	assert.equal(result.manifest.version, result.lock.version);
	assert.equal(result.lock.packages[""].version, result.manifest.version);
	assert.deepEqual(result.lock.packages.dep, lock.packages.dep);
	assert.equal(manifest.version, "1.11.0");
	assert.throws(() => finalizeInputs(manifest, { ...lock, version: "0.0.0" }, "1.11.1", source), /roots/);
	assert.throws(() => finalizeInputs(manifest, lock, "1.11.1", "not-a-sha"), /source/);
});

test("generated repository metadata is canonical and conflicts fail closed", () => {
	for (const existing of [repository, repository.url])
		assert.deepEqual(finalizeInputs({ ...manifest, repository: existing }, lock, "1.11.1", source).manifest.repository, repository);
	for (const existing of [null, [], 3, {}, "https://github.com/other/repo", { ...repository, url: "git+https://github.com/other/repo.git" }, { ...repository, type: "svn" }])
		assert.throws(() => finalizeInputs({ ...manifest, repository: existing }, lock, "1.11.1", source), /repository/);
	const finalized = finalizeInputs(manifest, lock, "1.11.1", source).manifest;
	const bytes = Buffer.from(JSON.stringify(finalized));
	assert.deepEqual(inspectArchive(archive([["package/package.json", bytes]]), new Map([["package.json", bytes]])), ["package.json"]);
	assert.throws(() => inspectArchive(archive([["package/package.json", JSON.stringify({ ...finalized, repository: undefined })]]), new Map([["package.json", bytes]])), /bytes/);
});

test("archive inventory and every byte are checked independently", () => {
	const expected = new Map([["README.md", Buffer.from("reviewed")], ["package.json", Buffer.from("{}")]]);
	const entries = [...expected].map(([name, bytes]) => [`package/${name}`, bytes]);
	assert.deepEqual(inspectArchive(archive(entries), expected), ["README.md", "package.json"]);
	for (const bad of [
		entries.slice(1), [...entries, entries[0]],
		[["package/README.md", "changed"], entries[1]],
		[...entries, ["package/../escape", "x"]],
		[...entries, ["package/.npmrc", "x"]],
		[...entries, ["package/odd/task.md", "x"]],
		[["package/README.md", "reviewed", "2"], entries[1]],
	]) assert.throws(() => inspectArchive(archive(bad), expected));
	assert.throws(() => inspectArchive(Buffer.from("not gzip"), expected));
	const corrupted = gunzipSync(archive(entries));
	corrupted[0] ^= 1;
	assert.throws(() => inspectArchive(gzipSync(corrupted), expected), /checksum/);
	assert.throws(() => inspectArchive(gzipSync(gunzipSync(archive(entries)).subarray(0, 512)), expected));
});

test("registry verification requires version, source, both hashes and latest", () => {
	const digest = hashes(Buffer.alloc(0));
	assert.equal(digest.shasum, "da39a3ee5e6b4b0d3255bfef95601890afd80709");
	assert.match(digest.integrity, /^sha512-[A-Za-z0-9+/]{86}==$/);
	const published = { version: "1.11.1", releaseSource: source, dist: digest };
	verifyPublished(published, { latest: "1.11.1" }, "1.11.1", source, digest);
	for (const changed of [{ ...published, dist: {} }, { ...published, releaseSource: "b".repeat(40) }, { ...published, version: "1.11.2" }])
		assert.throws(() => verifyPublished(changed, { latest: "1.11.1" }, "1.11.1", source, digest));
	assert.throws(() => verifyPublished(published, { latest: "1.11.2" }, "1.11.1", source, digest));
});

test("workflow gates automatic main publication, queues runs and limits OIDC to publish", async () => {
	const workflow = await readFile(new URL("../.github/workflows/npm-publish.yml", import.meta.url), "utf8");
	assert.match(workflow, /on:\n {2}push:\n {4}branches: \[main\]/);
	assert.doesNotMatch(workflow, /workflow_dispatch|contents: write|NODE_AUTH_TOKEN|npm publish/);
	assert.match(workflow, /queue: max\n {2}cancel-in-progress: false/);
	const [checks, publish] = workflow.split("  publish:\n");
	assert.doesNotMatch(checks, /id-token/);
	assert.match(publish, /needs: checks/);
	assert.match(publish, /github.ref == 'refs\/heads\/main' && github.event_name == 'push'/);
	assert.match(publish, /id-token: write/);
	assert.match(publish, /node-version: '24'/);
	assert.match(publish, /npm-release.mjs prepare/);
	assert.match(publish, /npm-release.mjs publish/);
	assert.match(publish, /if: always\(\)/);
	assert.match(publish, /actions\/upload-artifact@v4/);
});

test("only explicit official-registry not-found is absence; service errors are not permission", async () => {
	const fetcher = (status, body) => async () => ({ status, ok: status === 200, json: async () => body });
	assert.equal(await registryDocument("osdy-pi/1.11.1", fetcher(404, { error: "Not found" })), null);
	assert.equal(await registryDocument("osdy-pi/1.11.1", fetcher(404, { error: "version not found: 1.11.1" })), null);
	await assert.rejects(registryDocument("osdy-pi/1.11.1", fetcher(404, { error: "version not found: 1.11.2" })), /registry/);
	assert.equal(await registryDocument("osdy-pi", fetcher(404, { error: "Not found" })), null);
	await assert.rejects(registryDocument("osdy-pi", fetcher(404, { error: "version not found: 1.11.1" })), /registry/);
	await assert.rejects(registryDocument("osdy-pi", fetcher(503, { error: "Not found" })), /registry/);
	await assert.rejects(registryDocument("osdy-pi", fetcher(200, { name: "other", versions: {} })), /registry/);
	await assert.rejects(registryDocument("osdy-pi/1.11.1", fetcher(200, record("1.11.2"))), /registry/);
	await assert.rejects(registryDocument("osdy-pi/1.11.1", fetcher(200, [])), /registry/);
	assert.deepEqual(await registryDocument("osdy-pi", fetcher(200, packument())), packument());
	assert.deepEqual(await registryDocument("osdy-pi/1.11.1", fetcher(200, record("1.11.1"))), record("1.11.1"));
	await assert.rejects(registryDocument("osdy-pi", fetcher(503, {})), /registry/);
	await assert.rejects(registryDocument("osdy-pi", fetcher(404, {})), /registry/);
	await assert.rejects(registryDocument("osdy-pi", async () => { throw new Error("offline"); }), /offline/);
});

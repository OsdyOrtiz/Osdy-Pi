import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFile, writeFile, mkdir, lstat } from "node:fs/promises";
import { resolve, join, isAbsolute, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";
import process from "node:process";
import console from "node:console";
import { setTimeout } from "node:timers";

const REGISTRY = "https://registry.npmjs.org/";
const stable = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const semver = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
const repository = { type: "git", url: "git+https://github.com/OsdyOrtiz/Osdy-Pi.git" };
const forbidden = /(^|\/)(?:odd|\.pi(?:-dev|-lens)?|\.codegraph|\.atl|\.git|\.github|\.cache|\.npmignore|npm-debug\.log|node_modules|\.npmrc|\.env[^/]*|auth\.json|(?:credentials|secrets|tokens)[^/]*|[^/]*\.(?:pem|key)|[^/]*\.tgz)(\/|$)/i;

function versionParts(value) {
	if (!stable.test(value)) throw new Error("Expected a stable semantic version");
	const parts = value.split(".").map(Number);
	if (!parts.every(Number.isSafeInteger)) throw new Error("Unsafe stable version");
	return parts;
}

function validateVersionRecord(entry, version) {
	const parts = typeof version === "string" && semver.exec(version);
	if (!parts || !parts.slice(1, 4).map(Number).every(Number.isSafeInteger) ||
		!entry || typeof entry !== "object" || Array.isArray(entry) || entry.name !== "osdy-pi" || entry.version !== version ||
		(Object.hasOwn(entry, "releaseSource") && (typeof entry.releaseSource !== "string" || !/^[a-f0-9]{40}$/.test(entry.releaseSource))))
		throw new Error("Invalid registry version record");
}

function validatePackageDocument(document) {
	if (!document || typeof document !== "object" || Array.isArray(document) || document.name !== "osdy-pi" ||
		!document.versions || typeof document.versions !== "object" || Array.isArray(document.versions))
		throw new Error("Invalid registry versions document");
	const sources = new Set();
	for (const [version, entry] of Object.entries(document.versions)) {
		validateVersionRecord(entry, version);
		if (entry.releaseSource !== undefined) {
			if (sources.has(entry.releaseSource)) throw new Error("Same source maps to multiple registry versions");
			sources.add(entry.releaseSource);
		}
	}
}

export function allocateVersion(base, document, source) {
	let maximum = versionParts(base);
	validatePackageDocument(document);
	const prior = Object.entries(document.versions).filter(([, entry]) => entry?.releaseSource === source);
	if (prior.length > 1) throw new Error("Same source maps to multiple registry versions");
	if (prior.length) {
		versionParts(prior[0][0]);
		return { version: prior[0][0], existing: true };
	}
	for (const value of Object.keys(document.versions)) {
		if (semver.exec(value)[4]) continue;
		const parts = versionParts(value.split("+")[0]);
		const firstDifference = parts.findIndex((part, index) => part !== maximum[index]);
		if (firstDifference >= 0 && parts[firstDifference] > maximum[firstDifference]) maximum = parts;
	}
	maximum[2] += 1;
	const version = maximum.join(".");
	versionParts(version);
	return { version, existing: false };
}

export function guardRerun(allocation, attempt) {
	if (!/^[1-9]\d*$/.test(attempt)) throw new Error("Invalid workflow attempt");
	if (Number(attempt) > 1 && !allocation.existing)
		throw new Error("Prior publication state is uncertain: source absent from registry; reconcile manually before another push");
}

export function finalizeInputs(manifest, lock, version, source) {
	versionParts(version);
	if (!/^[a-f0-9]{40}$/.test(source)) throw new Error("Invalid source commit");
	if (manifest.name !== "osdy-pi" || manifest.version !== lock.version || manifest.version !== lock.packages?.[""].version)
		throw new Error("Package identity or version roots disagree");
	if (Object.hasOwn(manifest, "repository") && manifest.repository !== repository.url &&
		(!manifest.repository || typeof manifest.repository !== "object" || Array.isArray(manifest.repository) ||
			manifest.repository.type !== repository.type || manifest.repository.url !== repository.url))
		throw new Error("Conflicting repository metadata");
	return {
		manifest: { ...manifest, version, releaseSource: source, repository: { ...repository } },
		lock: { ...lock, version, packages: { ...lock.packages, "": { ...lock.packages[""], version } } },
	};
}

export function hashes(bytes) {
	return {
		shasum: createHash("sha1").update(bytes).digest("hex"),
		integrity: `sha512-${createHash("sha512").update(bytes).digest("base64")}`,
	};
}

// Parse actual tar bytes, not npm's claimed file inventory. Unsupported tar features fail closed.
export function inspectArchive(archive, expected) {
	const tar = gunzipSync(archive, { maxOutputLength: 128 * 1024 * 1024 });
	const seen = new Set();
	let offset = 0;
	while (offset + 512 <= tar.length && tar.subarray(offset, offset + 512).some((byte) => byte !== 0)) {
		const header = tar.subarray(offset, offset + 512);
		const text = (start, length) => header.subarray(start, start + length).toString("utf8").split("\0")[0];
		const octal = (start, length) => {
			const value = text(start, length).trim();
			if (!/^[0-7]+$/.test(value)) throw new Error("Invalid tar number");
			return Number.parseInt(value, 8);
		};
		const checksum = header.reduce((sum, byte, index) => sum + (index >= 148 && index < 156 ? 32 : byte), 0);
		if (octal(148, 8) !== checksum) throw new Error("Invalid tar checksum");
		const prefix = text(345, 155);
		const member = `${prefix ? `${prefix}/` : ""}${text(0, 100)}`;
		const path = member.slice(8);
		const size = octal(124, 12);
		if (!member.startsWith("package/") || !path || path.split("/").some((part) => !part || part === "." || part === "..") || path.includes("\\") || forbidden.test(path))
			throw new Error(`Forbidden archive member: ${member}`);
		if (!["0", ""].includes(text(156, 1)) || seen.has(path) || !expected.has(path))
			throw new Error(`Unexpected archive member/type: ${member}`);
		const end = offset + 512 + size;
		if (end > tar.length || !tar.subarray(offset + 512, end).equals(expected.get(path)))
			throw new Error(`Archive bytes differ: ${path}`);
		seen.add(path);
		offset += 512 + Math.ceil(size / 512) * 512;
	}
	if (tar.length - offset < 1024 || tar.subarray(offset).some((byte) => byte !== 0) || seen.size !== expected.size)
		throw new Error("Incomplete or trailing archive inventory");
	return [...seen].sort();
}

export async function registryDocument(path, fetcher = globalThis.fetch) {
	if (!/^osdy-pi(?:\/[0-9]+\.[0-9]+\.[0-9]+)?$/.test(path)) throw new Error("Invalid registry path");
	const response = await fetcher(`${REGISTRY}${path}`, { redirect: "error", signal: globalThis.AbortSignal.timeout(30_000) });
	const body = await response.json();
	const version = path.split("/")[1];
	if (response.status === 404 && (body?.error === "Not found" ||
		(version && body?.error === `version not found: ${version}`))) return null;
	if (!response.ok || !body || typeof body !== "object" || Array.isArray(body)) throw new Error(`Unknown registry state (${response.status})`);
	if (version) validateVersionRecord(body, version);
	else validatePackageDocument(body);
	return body;
}

export function verifyPublished(published, tags, version, source, digest) {
	if (published?.version !== version || published.releaseSource !== source ||
		published.dist?.shasum !== digest.shasum || published.dist?.integrity !== digest.integrity || tags?.latest !== version)
		throw new Error("Registry version/source/hashes/latest mismatch; do not republish");
}

function command(program, args, options = {}) {
	return execFileSync(program, args, { encoding: "utf8", maxBuffer: 32 * 1024 * 1024, ...options });
}
const jsonBytes = (value) => Buffer.from(`${JSON.stringify(value, null, "\t")}\n`);
const blob = (source, path) => command("git", ["show", `${source}:${path}`], { encoding: "buffer" });

async function expectedInputs(source, manifest) {
	if (!Array.isArray(manifest.files)) throw new Error("Explicit manifest files are required");
	const roots = [...manifest.files, "package.json", "README.md", "LICENSE"];
	if (roots.some((path) => typeof path !== "string" || !/^[\w./-]+$/.test(path) || path.split("/").includes("..") || forbidden.test(path)))
		throw new Error("Unsupported manifest inclusion rules");
	const entries = command("git", ["ls-tree", "-r", source]).trim().split("\n");
	const expected = new Map();
	for (const entry of entries) {
		const [info, path] = entry.split("\t");
		if (!roots.some((root) => path === root || path.startsWith(`${root}/`))) continue;
		if (forbidden.test(path) || !/^100(?:644|755) blob /.test(info)) throw new Error(`Unsafe release input: ${path}`);
		expected.set(path, path === "package.json" ? jsonBytes(manifest) : blob(source, path));
	}
	for (const root of roots) {
		if (![...expected.keys()].some((path) => path === root || path.startsWith(`${root}/`))) throw new Error(`Missing release root: ${root}`);
	}
	// Check finalized working bytes against immutable source inputs before packing/publishing.
	for (const [path, bytes] of expected) {
		if (!(await lstat(path)).isFile() || !(await readFile(path)).equals(bytes)) throw new Error(`Release workspace changed: ${path}`);
	}
	return expected;
}

function workflowBoundary(directory) {
	if (process.env.GITHUB_ACTIONS !== "true" || process.env.GITHUB_REPOSITORY !== "OsdyOrtiz/Osdy-Pi" ||
		process.env.GITHUB_REF !== "refs/heads/main" || process.env.GITHUB_EVENT_NAME !== "push")
		throw new Error("Release commands require the main push workflow");
	const source = command("git", ["rev-parse", "HEAD"]).trim();
	if (source !== process.env.GITHUB_SHA) throw new Error("Checkout does not match source event");
	const root = command("git", ["rev-parse", "--show-toplevel"]).trim();
	if (!isAbsolute(directory) || !relative(root, directory).startsWith("../")) throw new Error("Retained archive must be outside checkout");
	const npmVersion = command("npm", ["--version"]).trim().split(".").map(Number);
	if (Number(process.versions.node.split(".")[0]) < 24 || npmVersion[0] < 11 ||
		(npmVersion[0] === 11 && (npmVersion[1] < 5 || (npmVersion[1] === 5 && npmVersion[2] < 1))))
		throw new Error("Release requires Node 24+ and npm 11.5.1+");
	return source;
}

async function prepare(directory, source) {
	if (command("git", ["status", "--porcelain"]).trim()) throw new Error("Release checkout must be clean");
	const original = JSON.parse(blob(source, "package.json"));
	const lock = JSON.parse(blob(source, "package-lock.json"));
	if (Object.keys(original.scripts ?? {}).some((name) => /^(prepublish|prepare|prepack|postpack|publish|postpublish)/.test(name)))
		throw new Error("Unreviewed package lifecycle hook");
	const registry = await registryDocument("osdy-pi");
	const allocation = allocateVersion(original.version, registry ?? { name: "osdy-pi", versions: {} }, source);
	guardRerun(allocation, process.env.GITHUB_RUN_ATTEMPT);
	const inputs = finalizeInputs(original, lock, allocation.version, source);
	await writeFile("package.json", jsonBytes(inputs.manifest));
	await writeFile("package-lock.json", jsonBytes(inputs.lock));
	const expected = await expectedInputs(source, inputs.manifest);
	await mkdir(directory, { recursive: false });
	const packed = JSON.parse(command("npm", ["pack", "--json", "--ignore-scripts", "--registry", REGISTRY, "--pack-destination", directory]));
	if (packed.length !== 1 || !/^[\w.-]+\.tgz$/.test(packed[0].filename)) throw new Error("Invalid npm pack result");
	const archive = join(directory, packed[0].filename);
	const bytes = await readFile(archive);
	const inventory = inspectArchive(bytes, expected);
	const digest = hashes(bytes);
	if (packed[0].shasum !== digest.shasum || packed[0].integrity !== digest.integrity) throw new Error("npm pack hashes disagree");
	await writeFile(join(directory, "evidence.json"), jsonBytes({ source, version: allocation.version, archive, ...digest, inventory }));
	console.log(JSON.stringify({ source, version: allocation.version, archive, ...digest, files: inventory.length }));
}

async function publish(directory, source) {
	const evidence = JSON.parse(await readFile(join(directory, "evidence.json"), "utf8"));
	if (evidence.source !== source || resolve(evidence.archive) !== join(directory, evidence.archive.split("/").at(-1))) throw new Error("Invalid retained evidence");
	const manifest = JSON.parse(await readFile("package.json", "utf8"));
	const lock = JSON.parse(await readFile("package-lock.json", "utf8"));
	const finalized = finalizeInputs(JSON.parse(blob(source, "package.json")), JSON.parse(blob(source, "package-lock.json")), evidence.version, source);
	if (!jsonBytes(finalized.manifest).equals(jsonBytes(manifest)) || !jsonBytes(finalized.lock).equals(jsonBytes(lock))) throw new Error("Finalized release inputs changed");
	const expected = await expectedInputs(source, manifest);
	const bytes = await readFile(evidence.archive);
	inspectArchive(bytes, expected);
	const digest = hashes(bytes);
	if (digest.shasum !== evidence.shasum || digest.integrity !== evidence.integrity) throw new Error("Retained archive changed");
	const existing = await registryDocument(`osdy-pi/${evidence.version}`);
	if (existing) {
		const document = await registryDocument("osdy-pi");
		verifyPublished(existing, document?.["dist-tags"], evidence.version, source, digest);
		console.log("Previously published source verified; no publication attempted");
		return;
	}
	// One attempt only. Any nonzero/timeout is uncertain and must be reconciled, never retried here.
	let uncertain = false;
	try {
		command("npm", ["publish", evidence.archive, "--ignore-scripts", "--access", "public", "--tag", "latest", "--registry", REGISTRY], { stdio: "inherit", timeout: 120_000 });
	} catch { uncertain = true; }
	for (let attempt = 0; attempt < 6; attempt++) {
		const published = await registryDocument(`osdy-pi/${evidence.version}`);
		if (published) {
			const document = await registryDocument("osdy-pi");
			verifyPublished(published, document?.["dist-tags"], evidence.version, source, digest);
			console.log("Official registry version, source, hashes and latest verified");
			return;
		}
		if (attempt < 5) await new Promise((done) => setTimeout(done, 10_000));
	}
	throw new Error(`${uncertain ? "Uncertain publication" : "Publication accepted but not visible"}; retain evidence and reconcile before any rerun`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	const [action, directory] = process.argv.slice(2);
	try {
		if (!["prepare", "publish"].includes(action) || !directory) throw new Error("Usage: npm-release.mjs prepare|publish <absolute-output-directory>");
		const source = workflowBoundary(directory);
		await (action === "prepare" ? prepare(directory, source) : publish(directory, source));
	} catch (error) {
		console.error(error.message);
		process.exitCode = 1;
	}
}

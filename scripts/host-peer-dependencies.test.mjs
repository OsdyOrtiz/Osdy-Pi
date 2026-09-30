import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { URL } from "node:url";

const manifest = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const lock = JSON.parse(readFileSync(new URL("../package-lock.json", import.meta.url), "utf8"));
const hostPackages = [
	"@earendil-works/pi-ai",
	"@earendil-works/pi-agent-core",
	"@earendil-works/pi-coding-agent",
	"@earendil-works/pi-tui",
	"typebox",
];

for (const [name, metadata] of [["manifest", manifest], ["lock root", lock.packages[""]]]) {
	test(`${name} declares TypeBox as a host peer with a local development range`, () => {
		assert.equal(metadata.peerDependencies?.typebox, "*");
		assert.equal(metadata.dependencies?.typebox, undefined);
		assert.equal(metadata.devDependencies?.typebox, "^1.3.7");
	});

	test(`${name} keeps declared host packages out of runtime dependencies`, () => {
		for (const host of hostPackages) {
			assert.equal(metadata.dependencies?.[host], undefined, `${host} must not be a runtime dependency`);
			assert.equal(metadata.optionalDependencies?.[host], undefined, `${host} must not be an optional runtime dependency`);
			if (Object.hasOwn(metadata.peerDependencies ?? {}, host) || Object.hasOwn(metadata.devDependencies ?? {}, host)) {
				assert.equal(metadata.peerDependencies?.[host], "*", `${host} must use the host peer range`);
			}
		}
	});
}

test("lockfile keeps the local TypeBox installation development-only", () => {
	assert.equal(lock.packages["node_modules/typebox"].dev, true);
});

test("manifest and lock root agree on dependency declarations", () => {
	for (const field of ["dependencies", "devDependencies", "peerDependencies", "peerDependenciesMeta"]) {
		assert.deepEqual(lock.packages[""][field], manifest[field], field);
	}
});

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import test from "node:test";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

test("npm package includes the single native extension entry and its ODD TODO modules", () => {
	const packed = spawnSync("npm", ["pack", "--dry-run", "--json"], {
		cwd: root,
		encoding: "utf8",
	});
	assert.equal(packed.status, 0, packed.stderr);
	const [packageInfo] = JSON.parse(packed.stdout);
	const names = packageInfo.files.map((file) => file.path);
	assert.deepEqual(
		JSON.parse(readFileSync(resolve(root, "package.json"), "utf8")).pi.extensions,
		["./extensions/osdy-pi.ts"],
	);
	for (const path of [
		"extensions/osdy-pi.ts",
		"extensions/osdy-pi/runtime.ts",
		"extensions/osdy-pi/odd-todo-ui.ts",
		"extensions/osdy-pi/odd-todo-store.ts",
		"README.md",
	]) assert.equal(names.filter((name) => name === path).length, 1, `${path} must be packed once`);
	assert.equal(names.filter((name) => name.endsWith("/odd-todo-ui.ts")).length, 1);
});

test("packed entry wires Osdy and exactly one native todo registration", async () => {
	const entry = await readFile(resolve(root, "extensions/osdy-pi.ts"), "utf8");
	const runtime = await readFile(resolve(root, "extensions/osdy-pi/runtime.ts"), "utf8");
	const todo = await readFile(resolve(root, "extensions/osdy-pi/odd-todo-ui.ts"), "utf8");
	assert.match(entry, /registerOsdyPi\(pi\)/);
	assert.match(runtime, /registerCommand\(\s*pi,/);
	assert.equal(runtime.match(/registerOddTodo\(pi\)/g)?.length, 1);
	assert.equal(todo.match(/pi\.registerTool\(\{\s*name: "todo"/g)?.length, 1);
	assert.equal(todo.match(/pi\.registerCommand\("todos"/g)?.length, 1);
});

test("README names the native ledger and manual standalone package removal", async () => {
	const readme = await readFile(resolve(root, "README.md"), "utf8");
	assert.match(readme, /\/todos/);
	assert.match(readme, /`todo` tool/);
	assert.match(readme, /odd\/tasks\/\*\.md/);
	assert.match(readme, /pi remove npm:@juicesharp\/rpiv-todo/);
	assert.match(readme, /external editor/i);
});

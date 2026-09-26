import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import test from "node:test";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

test("npm package includes the single native extension entry and session TODO modules", () => {
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
		"extensions/osdy-pi/todo-tool.ts",
		"extensions/osdy-pi/todo-command.ts",
		"extensions/osdy-pi/todo-domain.ts",
		"extensions/osdy-pi/todo-session.ts",
		"extensions/osdy-pi/todo-widget.ts",
		"README.md",
	]) assert.equal(names.filter((name) => name === path).length, 1, `${path} must be packed once`);
	assert.equal(names.filter((name) => name.endsWith("/todo-tool.ts")).length, 1);
});

test("packed entry wires Osdy and exactly one native todo registration", async () => {
	const entry = await readFile(resolve(root, "extensions/osdy-pi.ts"), "utf8");
	const runtime = await readFile(resolve(root, "extensions/osdy-pi/runtime.ts"), "utf8");
	const todo = await readFile(resolve(root, "extensions/osdy-pi/todo-tool.ts"), "utf8");
	assert.match(entry, /registerOsdyPi\(pi\)/);
	assert.match(runtime, /registerCommand\(\s*pi,/);
	assert.equal(runtime.match(/createTodoSessionStore\(\)/g)?.length, 1);
	assert.equal(runtime.match(/registerTodoTool\(pi, todoStore\)/g)?.length, 1);
	assert.equal(runtime.match(/registerTodosCommand\(pi, todoStore\)/g)?.length, 1);
	assert.equal(runtime.match(/registerTodoWidget\(pi, todoStore\)/g)?.length, 1);
	assert.doesNotMatch(runtime, /registerOddTodo|odd-todo-ui/);
	assert.equal(todo.match(/pi\.registerTool\(\{/g)?.length, 1);
	assert.doesNotMatch(todo, /registerCommand\(/);
});

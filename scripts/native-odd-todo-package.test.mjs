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
	const manifest = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
	const lock = JSON.parse(readFileSync(resolve(root, "package-lock.json"), "utf8"));
	assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
	assert.equal(lock.version, manifest.version);
	assert.equal(lock.packages[""].version, manifest.version);
	assert.equal(packageInfo.version, manifest.version);
	assert.deepEqual(
		JSON.parse(readFileSync(resolve(root, "package.json"), "utf8")).pi.extensions,
		["./extensions/osdy-pi.ts"],
	);
	for (const path of [
		"extensions/osdy-pi.ts",
		"extensions/osdy-pi/runtime.ts",
		"extensions/osdy-pi/uninstall.ts",
		"extensions/osdy-pi/agent-coexistence-setup.ts",
  "extensions/osdy-pi/todo-provider-settings.ts",
		"bin/osdy-pi.mjs",
		"bin/osdy.mjs",
		"extensions/osdy-pi/todo-tool.ts",
		"extensions/osdy-pi/todo-command.ts",
		"extensions/osdy-pi/todo-domain.ts",
		"extensions/osdy-pi/todo-session.ts",
		"extensions/osdy-pi/todo-widget.ts",
		"extensions/osdy-pi/todo-config.ts",
		"extensions/osdy-pi/todo-i18n.ts",
		...(["de", "en", "es", "fr", "pt-BR", "pt", "ru", "uk", "zh"].map((locale) => `extensions/osdy-pi/locales/${locale}.json`)),
		"README.md",
		"LICENSE",
	]) assert.equal(names.filter((name) => name === path).length, 1, `${path} must be packed once`);
	for (const path of [
		"extensions/osdy-pi/odd-todo-ui.ts", "extensions/osdy-pi/odd-todo-ui.test.ts",
		"extensions/osdy-pi/odd-todo-store.ts", "extensions/osdy-pi/odd-todo-store.test.ts",
	]) {
		assert.equal(names.includes(path), false, `${path} must not be packed`);
	}
	assert.equal(names.filter((name) => name.endsWith("/todo-tool.ts")).length, 1);
});

test("optional localization peer is declared consistently without installing the SDK", async () => {
	const manifest = JSON.parse(await readFile(resolve(root, "package.json"), "utf8"));
	const lock = JSON.parse(await readFile(resolve(root, "package-lock.json"), "utf8"));
	assert.equal(manifest.peerDependencies["@juicesharp/rpiv-i18n"], "*");
	assert.deepEqual(manifest.peerDependenciesMeta["@juicesharp/rpiv-i18n"], { optional: true });
	assert.equal(lock.packages[""].peerDependencies["@juicesharp/rpiv-i18n"], "*");
	assert.deepEqual(lock.packages[""].peerDependenciesMeta["@juicesharp/rpiv-i18n"], { optional: true });
	assert.equal(manifest.dependencies?.["@juicesharp/rpiv-i18n"], undefined);
});

test("README describes session snapshots rather than ODD-backed TODO editing", async () => {
	const readme = await readFile(resolve(root, "README.md"), "utf8");
	assert.match(readme, /session-branch.*snapshots/i);
	assert.match(readme, /create.*update.*list.*get.*delete.*clear/);
	assert.match(readme, /\/todos.*read-only/i);
	assert.match(readme, /no automatic sync/i);
	assert.match(readme, /XDG_CONFIG_HOME.*rpiv-todo\/config\.json/);
	assert.match(readme, /First-party TODO (?:included|ships) starting (?:in |with )?1\.5\.0/i);
	assert.match(readme, /compaction replay.*unverified/i);
	assert.match(readme, /language switching.*unverified/i);
	assert.match(readme, /(?:visual|ANSI) strikethrough.*unverified/i);
	assert.match(readme, /installed.*profile.*unverified/i);
	assert.doesNotMatch(readme, /unshipped branch|this branch's first-party TODO changes are \*\*not published\*\*|try this feature branch|unmerged branch/i);
	assert.doesNotMatch(readme, /native \/todos panel|native ODD ledger|opens the ODD ledger|Markdown ledger, \*\*not Pi conversation history/);
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
 assert.match(runtime, /if \(todoActive\) \{[\s\S]*?registerTodoTool[\s\S]*?registerTodosCommand[\s\S]*?registerTodoWidget/);
	assert.doesNotMatch(runtime, /registerOddTodo|odd-todo-ui/);
	assert.equal(todo.match(/pi\.registerTool\(\{/g)?.length, 1);
	assert.doesNotMatch(todo, /registerCommand\(/);
});

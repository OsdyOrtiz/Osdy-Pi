import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
	appendItem,
	listDocuments,
	parseItems,
	readDocument,
	setItemChecked,
	// eslint-disable-next-line @typescript-eslint/ban-ts-comment
	// @ts-ignore Node's native TypeScript runner resolves test-only TypeScript source imports.
} from "./odd-todo-store.ts";

async function fixture(): Promise<{ root: string; tasks: string }> {
	const root = await mkdtemp(join(tmpdir(), "odd-todo-store-"));
	const tasks = join(root, "odd", "tasks");
	await mkdir(tasks, { recursive: true });
	return { root, tasks };
}

void test("parses nested checkboxes without fenced examples or rewriting their context", () => {
	const source = "# Plan\r\n- [ ] top\r\n  - [x] nested **bold**\r\n```md\r\n- [ ] example\r\n```\r\n~~~\r\n- [ ] also example\r\n~~~\r\n    - [ ] deep\r\n";
	const items = parseItems(source);
	assert.deepEqual(items.map(({ text, checked }) => [text, checked]), [
		["top", false], ["nested **bold**", true], ["deep", false],
	]);
	assert.equal(new Set(items.map((item) => item.id)).size, 3);
	assert.equal(parseItems("- [ ] top\n- [ ] extra\n  - [x] nested **bold**\n")[2]?.id, items[1]?.id);
});

void test("discovers only regular Markdown task documents and requires explicit safe names", async () => {
	const { root, tasks } = await fixture();
	await writeFile(join(tasks, "b.md"), "- [ ] b\n");
	await writeFile(join(tasks, "a.md"), "- [ ] a\n");
	await writeFile(join(tasks, "notes.txt"), "secret");
	await symlink(join(tasks, "a.md"), join(tasks, "linked.md"));
	assert.deepEqual(await listDocuments(root), ["a.md", "b.md"]);
	for (const name of ["../a.md", "a/b.md", "/tmp/x.md", "linked.md", "notes.txt", ".hidden.md"]) {
		await assert.rejects(readDocument(root, name));
	}
	await assert.rejects(readDocument(root, ""));
	await assert.rejects(readDocument(root, "a.md/../../b.md"));
	const other = await fixture();
	await symlink(tasks, join(other.root, "odd", "linked"));
	await assert.rejects(readDocument(other.root, "linked/a.md"));
});

void test("rejects a symlinked task directory", async () => {
	const root = await mkdtemp(join(tmpdir(), "odd-todo-root-"));
	const target = await mkdtemp(join(tmpdir(), "odd-todo-target-"));
	await mkdir(join(root, "odd"));
	await symlink(target, join(root, "odd", "tasks"));
	await assert.rejects(listDocuments(root));
});

void test("appends and toggles exactly one line while retaining CRLF, prose and task IDs", async () => {
	const { root, tasks } = await fixture();
	const file = join(tasks, "plan.md");
	const original = "# Plan\r\n\r\n  - [ ] first  \r\n```\r\n- [ ] sample\r\n```\r\n  * [X] second\r\n";
	await writeFile(file, original);
	const before = await readDocument(root, "plan.md");
	const changed = await setItemChecked(root, "plan.md", before.revision, before.items[0]!.id, true);
	assert.equal(await readFile(file, "utf8"), original.replace("- [ ] first", "- [x] first"));
	assert.equal(changed.items[0]?.id, before.items[0]?.id);
	const added = await appendItem(root, "plan.md", changed.revision, "new **item**");
	assert.equal(await readFile(file, "utf8"), original.replace("- [ ] first", "- [x] first") + "- [ ] new **item**\r\n");
	assert.equal(added.items.at(-1)?.text, "new **item**");
	await assert.rejects(appendItem(root, "plan.md", before.revision, "stale"), /conflict/i);
	await assert.rejects(setItemChecked(root, "plan.md", before.revision, before.items[0]!.id, false), /conflict/i);
});

void test("refuses to append inside an unclosed fenced block without changing the document", async () => {
	const { root, tasks } = await fixture();
	const file = join(tasks, "open.md");
	for (const source of ["# Plan\n```md\n- [ ] example\n", "# Plan\n~~~~\n- [ ] example"]) {
		await writeFile(file, source);
		const before = await readDocument(root, "open.md");
		assert.deepEqual(before.items, []);
		await assert.rejects(appendItem(root, "open.md", before.revision, "real task"), /unclosed fence/i);
		assert.equal(await readFile(file, "utf8"), source);
		assert.deepEqual(await readDocument(root, "open.md"), before);
	}
});

void test("rejects ambiguous duplicate IDs, invalid content and missing references", async () => {
	const { root, tasks } = await fixture();
	const file = join(tasks, "dup.md");
	await writeFile(file, "- [ ] repeat\n- [ ] repeat\n");
	const doc = await readDocument(root, "dup.md");
	assert.equal(doc.items[0]?.id, doc.items[1]?.id);
	await assert.rejects(setItemChecked(root, "dup.md", doc.revision, doc.items[0]!.id, true), /ambiguous/i);
	await assert.rejects(setItemChecked(root, "dup.md", doc.revision, "missing", true));
	for (const text of ["", "  ", "line\nnext", "line\rnext", "bad\0text"]) {
		await assert.rejects(appendItem(root, "dup.md", doc.revision, text));
	}
	assert.equal(await readFile(file, "utf8"), "- [ ] repeat\n- [ ] repeat\n");
});

void test("preserves missing final newline and supports no-op status updates", async () => {
	const { root, tasks } = await fixture();
	const file = join(tasks, "plain.md");
	await writeFile(file, "Intro\n- [x] done");
	const doc = await readDocument(root, "plain.md");
	const same = await setItemChecked(root, "plain.md", doc.revision, doc.items[0]!.id, true);
	assert.equal(same.revision, doc.revision);
	assert.equal(await readFile(file, "utf8"), "Intro\n- [x] done");
	await appendItem(root, "plain.md", same.revision, "new");
	assert.equal(await readFile(file, "utf8"), "Intro\n- [x] done\n- [ ] new\n");
});

void test("detects external edits and refuses symlink replacement before writes", async () => {
	const { root, tasks } = await fixture();
	const file = join(tasks, "todo.md");
	await writeFile(file, "- [ ] task\n");
	const doc = await readDocument(root, "todo.md");
	await writeFile(file, "changed externally\n");
	await assert.rejects(appendItem(root, "todo.md", doc.revision, "task"), /conflict/i);
	assert.equal(await readFile(file, "utf8"), "changed externally\n");
	await symlink(file, join(tasks, "alias.md"));
	await assert.rejects(appendItem(root, "alias.md", doc.revision, "task"));
});

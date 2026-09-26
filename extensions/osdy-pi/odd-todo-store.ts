import { createHash, randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { lstat, open, readdir, rename, unlink } from "node:fs/promises";
import type { Stats } from "node:fs";
import { join } from "node:path";

export interface TaskItem {
	readonly id: string;
	readonly text: string;
	readonly checked: boolean;
}

export interface TaskDocument {
	readonly name: string;
	readonly revision: string;
	readonly items: readonly TaskItem[];
}

interface LocatedItem extends TaskItem {
	readonly markerOffset: number;
	readonly marker: string;
}

const checkbox = /^([ \t]*(?:[-+*]|\d+[.)])[ \t]+\[)([ xX])(\][^\r\n]*)$/;
const validName = /^[a-zA-Z0-9][a-zA-Z0-9._-]*\.md$/;
const decoder = new TextDecoder("utf-8", { fatal: true });

function digest(value: string | Buffer): string {
	return createHash("sha256").update(value).digest("hex");
}

function locateItems(source: string): { items: LocatedItem[]; unclosedFence: boolean } {
	const result: LocatedItem[] = [];
	let fence: { character: string; length: number } | undefined;
	for (const match of source.matchAll(/[^\r\n]*(?:\r\n|\n|\r|$)/g)) {
		const whole = match[0];
		if (!whole) continue;
		const line = whole.replace(/\r\n$|[\r\n]$/, "");
		const delimiter = /^[ \t]*(`{3,}|~{3,})(.*)$/.exec(line);
		if (fence) {
			if (delimiter?.[1]?.[0] === fence.character && delimiter[1].length >= fence.length && !delimiter[2]?.trim()) fence = undefined;
			continue;
		}
		if (delimiter?.[1]) {
			fence = { character: delimiter[1][0]!, length: delimiter[1].length };
			continue;
		}
		const found = checkbox.exec(line);
		if (!found?.[1] || !found[2] || found[3] === undefined) continue;
		const normalized = found[1] + " " + found[3];
		result.push({
			id: digest(normalized),
			text: found[3].slice(1).trim(),
			checked: found[2] !== " ",
			markerOffset: match.index + found[1].length,
			marker: found[2],
		});
	}
	return { items: result, unclosedFence: fence !== undefined };
}

export function parseItems(source: string): TaskItem[] {
	return locateItems(source).items.map(({ id, text, checked }) => ({ id, text, checked }));
}

function checkedName(name: string): string {
	if (!validName.test(name) || name === "." || name === "..") throw new Error("Invalid task document name");
	return name;
}

async function regularDirectory(path: string): Promise<Stats> {
	const info = await lstat(path);
	if (!info.isDirectory() || info.isSymbolicLink()) throw new Error("Unsafe task directory");
	return info;
}

async function taskDirectory(root: string): Promise<string> {
	const odd = join(root, "odd");
	await regularDirectory(odd);
	const tasks = join(odd, "tasks");
	await regularDirectory(tasks);
	return tasks;
}

export async function listDocuments(root: string): Promise<string[]> {
	const tasks = await taskDirectory(root);
	const entries = await readdir(tasks, { withFileTypes: true });
	return entries.filter((entry) => entry.isFile() && validName.test(entry.name)).map((entry) => entry.name).sort();
}

async function load(tasks: string, name: string): Promise<{ source: string; revision: string; stat: Stats }> {
	const path = join(tasks, checkedName(name));
	const stat = await lstat(path);
	if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("Unsafe task document");
	const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
	try {
		const opened = await handle.stat();
		if (!opened.isFile() || opened.dev !== stat.dev || opened.ino !== stat.ino) throw new Error("Task document changed: conflict");
		const bytes = await handle.readFile();
		return { source: decoder.decode(bytes), revision: digest(bytes), stat: opened };
	} finally {
		await handle.close();
	}
}

function document(name: string, source: string): TaskDocument {
	return { name, revision: digest(Buffer.from(source)), items: parseItems(source) };
}

export async function readDocument(root: string, name: string): Promise<TaskDocument> {
	const { source, revision } = await load(await taskDirectory(root), name);
	return { name, revision, items: parseItems(source) };
}

async function mutate(root: string, name: string, revision: string, change: (source: string) => string): Promise<TaskDocument> {
	checkedName(name);
	if (!/^[a-f0-9]{64}$/.test(revision)) throw new Error("Invalid revision");
	const tasks = await taskDirectory(root);
	const path = join(tasks, name);
	// Serializes writers using this repository. External writers are detected by the
	// revision and file identity check immediately before the atomic rename.
	const lockPath = join(tasks, `.${name}.lock`);
	let lock;
	try {
		lock = await open(lockPath, "wx", 0o600);
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "EEXIST") throw new Error("Task document locked: conflict");
		throw error;
	}
	let temporary: string | undefined;
	try {
		const current = await load(tasks, name);
		if (current.revision !== revision) throw new Error("Task document changed: conflict");
		const next = change(current.source);
		if (next === current.source) return document(name, current.source);
		temporary = join(tasks, `.${name}.${randomUUID()}.tmp`);
		const output = await open(temporary, "wx", current.stat.mode & 0o777);
		try {
			await output.writeFile(next, "utf8");
			await output.chmod(current.stat.mode & 0o777);
			await output.sync();
		} finally {
			await output.close();
		}
		const freshTasks = await taskDirectory(root);
		if (freshTasks !== tasks) throw new Error("Task directory changed: conflict");
		const latest = await load(tasks, name);
		if (latest.revision !== revision || latest.stat.dev !== current.stat.dev || latest.stat.ino !== current.stat.ino) {
			throw new Error("Task document changed: conflict");
		}
		await rename(temporary, path);
		temporary = undefined;
		return document(name, next);
	} finally {
		if (temporary) await unlink(temporary);
		await lock.close();
		await unlink(lockPath);
	}
}

export async function appendItem(root: string, name: string, revision: string, text: string): Promise<TaskDocument> {
	if (!text.trim() || /[\r\n\0]/.test(text)) throw new Error("Invalid checklist text");
	return mutate(root, name, revision, (source) => {
		if (locateItems(source).unclosedFence) throw new Error("Cannot append inside an unclosed fence");
		const newline = source.includes("\r\n") ? "\r\n" : source.includes("\r") && !source.includes("\n") ? "\r" : "\n";
		const separator = source && !/[\r\n]$/.test(source) ? newline : "";
		return source + separator + `- [ ] ${text}` + newline;
	});
}

export async function setItemChecked(root: string, name: string, revision: string, id: string, checked: boolean): Promise<TaskDocument> {
	if (!/^[a-f0-9]{64}$/.test(id) || typeof checked !== "boolean") throw new Error("Invalid task reference");
	return mutate(root, name, revision, (source) => {
		const found = locateItems(source).items.filter((item) => item.id === id);
		if (found.length > 1) throw new Error("Ambiguous task reference");
		const item = found[0];
		if (!item) throw new Error("Task reference not found");
		if (item.checked === checked) return source;
		return source.slice(0, item.markerOffset) + (checked ? (item.marker === "X" ? "X" : "x") : " ") + source.slice(item.markerOffset + 1);
	});
}

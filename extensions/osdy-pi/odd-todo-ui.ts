import { Type } from "typebox";
import { withFileMutationQueue, truncateHead, type ExtensionAPI, type ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { matchesKey, truncateToWidth, type Component } from "@earendil-works/pi-tui";
import { join } from "node:path";
import { appendItem, listDocuments, readDocument, setItemChecked, type TaskDocument } from "./odd-todo-store.js";
import type { SimpleTheme } from "./types.js";

export type TodoStore = {
 listDocuments: typeof listDocuments;
 readDocument: typeof readDocument;
 appendItem: typeof appendItem;
 setItemChecked: typeof setItemChecked;
};
const storeDefault: TodoStore = { listDocuments, readDocument, appendItem, setItemChecked };
const schema = Type.Object({
 action: Type.Union([Type.Literal("list"), Type.Literal("read"), Type.Literal("add"), Type.Literal("set")]),
 document: Type.Optional(Type.String({ description: "Task document filename from list" })),
 revision: Type.Optional(Type.String({ description: "Revision from read; required for add/set" })),
 text: Type.Optional(Type.String({ description: "Checklist text for add" })),
 id: Type.Optional(Type.String({ description: "Stable item id from read for set" })),
 checked: Type.Optional(Type.Boolean({ description: "Desired checkbox state for set" })),
}, { additionalProperties: false });

function safeText(text: string): string {
 // Escape sequences and control bytes must never be interpreted as terminal output.
 // eslint-disable-next-line no-control-regex
 return text.replace(/\x1b(?:\][^\x07]*(?:\x07|\x1b\\)|\[[0-?]*[ -/]*[@-~]|.)|[\x00-\x1f\x7f-\x9f]/g, " ").replace(/\s+/g, " ").trim();
}

async function selectDocument(root: string, name: string | undefined, store: TodoStore): Promise<string> {
 const names = await store.listDocuments(root);
 if (!name) {
  if (names.length === 1) return names[0]!;
  throw new Error(names.length ? `Select a task document explicitly: ${names.join(", ")}` : "No task documents found");
 }
 if (!names.includes(name)) throw new Error("Task document not found in odd/tasks");
 return name;
}

/** No cached task data: each tool call reads the ledger or supplies an expected revision. */
export function registerOddTodo(pi: ExtensionAPI, store: TodoStore = storeDefault): void {
 pi.registerTool({
  name: "todo",
  label: "ODD TODO",
  description: "List ODD task documents; read items and revision; add or set a checkbox with a matching revision. Select a document explicitly when more than one exists. Output is limited to 50KB/2000 lines; truncated output must be refreshed or read from the ledger. External non-cooperating writes can race the store's final check and rename.",
  parameters: schema,
  async execute(_id, raw, signal, _update, ctx) {
   const params = raw;
   const root = ctx.cwd;
   if (signal?.aborted) throw new Error("TODO request cancelled");
   let result: string[] | TaskDocument;
   if (params.action === "list") result = await store.listDocuments(root);
   else {
    const name = await selectDocument(root, params.document, store);
    if (params.action === "read") result = await store.readDocument(root, name);
    else {
     if (!params.revision) throw new Error("A document revision is required; read the document first");
     if (!/^[a-f0-9]{64}$/.test(params.revision)) throw new Error("Invalid revision");
     if (params.action === "add" && params.text === undefined) throw new Error("Checklist text is required");
     if (params.action === "set" && (params.id === undefined || params.checked === undefined)) throw new Error("Item id and checked state are required");
     // Join only after confirming the filename belongs to the store's constrained directory.
     result = await withFileMutationQueue(join(root, "odd", "tasks", name), async () => {
      if (signal?.aborted) throw new Error("TODO request cancelled");
      if (params.action === "add") return store.appendItem(root, name, params.revision!, params.text!);
      return store.setItemChecked(root, name, params.revision!, params.id!, params.checked!);
     });
    }
   }
   const output = truncateHead(JSON.stringify(result), { maxLines: 2000, maxBytes: 50_000 });
   return { content: [{ type: "text", text: output.content + (output.truncated ? "\n[Truncated; read the selected task document for full data.]" : "") }], details: {} };
  },
 });
 pi.registerCommand("todos", {
  description: "Open the ODD task document panel",
  handler: async (args, ctx) => {
   if (args.trim()) { ctx.ui.notify("Usage: /todos", "warning"); return; }
   if (ctx.mode !== "tui") { ctx.ui.notify("/todos requires the interactive TUI", "warning"); return; }
   await showTodoPanel(ctx, store);
  },
 });
}

export class TodoPanel implements Component {
 private names: string[] = [];
 private document: TaskDocument | undefined;
 private selection = 0;
 private message: string | undefined;
 private busy = false;
 private job: Promise<void> = Promise.resolve();
 private closed = false;
 constructor(
  private readonly root: string,
  private readonly store: TodoStore,
  private readonly theme: SimpleTheme,
  private readonly repaint: () => void,
  private readonly close: () => void,
  private readonly input: () => Promise<string | undefined>,
 ) {}

 pending(): Promise<void> { return this.job; }
 showError(error: unknown): void {
  this.message = error instanceof Error ? error.message : String(error);
  this.repaint();
 }

 private run(work: () => Promise<void>): void {
  if (this.busy || this.closed) return;
  this.busy = true;
  this.repaint();
  this.job = (async () => {
   try { await work(); }
   catch (error) { this.message = error instanceof Error ? error.message : String(error); }
   finally { this.busy = false; if (!this.closed) this.repaint(); }
  })();
 }

 async refresh(): Promise<void> {
  const names = await this.store.listDocuments(this.root);
  this.names = names;
  this.message = undefined;
  if (this.document && names.includes(this.document.name)) {
   this.document = await this.store.readDocument(this.root, this.document.name);
  } else {
   this.document = names.length === 1 ? await this.store.readDocument(this.root, names[0]!) : undefined;
   this.selection = 0;
  }
  this.selection = Math.min(this.selection, Math.max(0, (this.document?.items.length ?? names.length) - 1));
  this.repaint();
 }

 handleInput(data: string): void {
  if (this.busy || this.closed) return;
  if (matchesKey(data, "escape") || matchesKey(data, "q")) { this.closed = true; this.close(); return; }
  if (matchesKey(data, "r")) { this.run(() => this.refresh()); return; }
  if (this.document && matchesKey(data, "d")) { this.document = undefined; this.selection = 0; this.message = undefined; this.repaint(); return; }
  const size = this.document?.items.length ?? this.names.length;
  if (matchesKey(data, "up")) { this.selection = Math.max(0, this.selection - 1); this.repaint(); return; }
  if (matchesKey(data, "down")) { this.selection = Math.min(Math.max(0, size - 1), this.selection + 1); this.repaint(); return; }
  if (!this.document) {
   if (matchesKey(data, "enter")) {
    const name = this.names[this.selection];
    if (name) this.run(async () => { this.document = await this.store.readDocument(this.root, name); this.selection = 0; this.message = undefined; });
   }
   return;
  }
  if (matchesKey(data, "a")) {
   this.run(async () => {
    const text = await this.input();
    if (text === undefined) return;
    const snapshot = this.document;
    if (!snapshot) return;
    this.document = await this.store.appendItem(this.root, snapshot.name, snapshot.revision, text);
    this.message = undefined;
   });
   return;
  }
  if (matchesKey(data, "enter") || matchesKey(data, "space")) {
   const snapshot = this.document;
   const item = snapshot.items[this.selection];
   if (!item) return;
   this.run(async () => {
    this.document = await this.store.setItemChecked(this.root, snapshot.name, snapshot.revision, item.id, !item.checked);
    this.message = undefined;
   });
  }
 }

 render(width: number): string[] {
  const lines = [this.theme.fg("accent", "ODD TODO"), this.theme.fg("muted", "↑/↓ navigate · enter select/toggle · space toggle · a add · d documents · r refresh · esc/q close")];
  if (this.busy) lines.push(this.theme.fg("muted", "Working…"));
  if (this.message) lines.push(this.theme.fg("error", `Error: ${safeText(this.message)} · r refresh to reload`));
  if (this.document) {
   lines.push(this.theme.fg("accent", `Document: ${safeText(this.document.name)}`));
   lines.push(this.theme.fg("muted", `Revision: ${this.document.revision}`));
   if (!this.document.items.length) lines.push("No checklist items");
   const start = Math.max(0, this.selection - 7);
   for (const [offset, item] of this.document.items.slice(start, start + 15).entries()) {
    const line = `${start + offset === this.selection ? ">" : " "} [${item.checked ? "x" : " "}] ${safeText(item.text)} (${item.id.slice(0, 12)})`;
    lines.push(this.theme.fg(start + offset === this.selection ? "accent" : "text", line));
   }
   if (this.document.items.length > start + 15) lines.push(this.theme.fg("muted", "↓ more items"));
  } else {
   if (!this.names.length) lines.push("No task documents found in odd/tasks");
   for (const [offset, name] of this.names.slice(Math.max(0, this.selection - 7), Math.max(0, this.selection - 7) + 15).entries()) {
    const index = Math.max(0, this.selection - 7) + offset;
    lines.push(this.theme.fg(index === this.selection ? "accent" : "text", `${index === this.selection ? ">" : " "} ${safeText(name)}`));
   }
  }
  return lines.map((line) => truncateToWidth(line, Math.max(1, width), "…"));
 }
 invalidate(): void {}
}

export function createTodoPanel(root: string, store: TodoStore, theme: SimpleTheme, repaint: () => void, close: () => void, input: () => Promise<string | undefined>): TodoPanel {
 return new TodoPanel(root, store, theme, repaint, close, input);
}

async function showTodoPanel(ctx: ExtensionCommandContext, store: TodoStore): Promise<void> {
 await ctx.ui.custom<void>((tui, theme, _keys, done) => {
  const panel = createTodoPanel(ctx.cwd, store, theme, () => tui.requestRender(), () => done(), () => ctx.ui.input("New checklist item:"));
  void panel.refresh().catch((error: unknown) => panel.showError(error));
  return panel;
 }, { overlay: true, overlayOptions: { anchor: "center", width: 90, minWidth: 40, maxHeight: "90%", margin: 1 } });
}

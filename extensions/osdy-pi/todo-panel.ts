import { matchesKey, type Component, type TUI } from "@earendil-works/pi-tui";
import { doubleBorderBox, MODAL_OVERLAY_OPTIONS } from "./modal-frame.js";
import type { SimpleTheme } from "./types.js";
import type { TodoStatus } from "./todo-domain.js";

export type TodoPanelRow =
 | { text: string; kind: "summary"; done: number; total: number }
 | { text: string; kind: "section" | "task"; status: TodoStatus }
 | { text: string; kind: "space" };
type PanelLine = string | TodoPanelRow;

function styledRow(theme: SimpleTheme, row: PanelLine): string {
 if (typeof row === "string") return row;
 if (row.kind === "summary") {
  const filled = Math.round(10 * row.done / row.total);
  return `${theme.fg("success", "█".repeat(filled))}${theme.fg("muted", "░".repeat(10 - filled))} ${theme.fg("accent", row.text)}`;
 }
 if (row.kind === "space") return "";
 const color = row.status === "completed" ? "success" : row.status === "in_progress" ? "accent" : row.kind === "section" ? "warning" : "muted";
 return theme.fg(color, row.text);
}

class TodoPanel implements Component {
 private offset = 0;
 private readonly tui: TUI;
 private readonly theme: SimpleTheme;
 private readonly lines: () => PanelLine[];
 private readonly title: string;
 private readonly close: () => void;
 constructor(tui: TUI, theme: SimpleTheme, lines: () => PanelLine[], title: string, close: () => void) {
  this.tui = tui;
  this.theme = theme;
  this.lines = lines;
  this.title = title;
  this.close = close;
 }

 private heightCap(): number {
  const rows = this.tui.terminal.rows;
  // Pi resolves the percentage against terminal rows, then clamps to the
  // available height after its one-row top and bottom margins.
  return Math.min(Math.max(1, Math.floor(rows * 0.92)), Math.max(1, rows - 2));
 }

 private pageSize(): number {
  // Top/bottom borders and the fixed control hint each consume one row.
  return Math.max(0, this.heightCap() - 3);
 }

 handleInput(data: string): void {
  if (matchesKey(data, "escape") || matchesKey(data, "q")) return this.close();
  const total = this.lines().length;
  const max = Math.max(0, total - this.pageSize());
  const old = this.offset;
  if (matchesKey(data, "down")) this.offset++;
  else if (matchesKey(data, "up")) this.offset--;
  else if (matchesKey(data, "pageDown")) this.offset += this.pageSize();
  else if (matchesKey(data, "pageUp")) this.offset -= this.pageSize();
  this.offset = Math.max(0, Math.min(max, this.offset));
  if (old !== this.offset) this.tui.requestRender();
 }

 render(width: number): string[] {
  const lines = this.lines();
  const size = this.pageSize();
  this.offset = Math.min(this.offset, Math.max(0, lines.length - size));
  const cap = this.heightCap();
  if (cap < 3) return doubleBorderBox(this.theme, width, this.title, []).slice(-cap);
  const first = lines.length ? this.offset + 1 : 0;
  const last = Math.min(lines.length, this.offset + size);
  const hint = this.theme.fg("muted", `${first}-${last}/${lines.length} · esc/q close · ↑/↓ scroll · PgUp/PgDn page`);
  return doubleBorderBox(this.theme, width, this.title, [...lines.slice(this.offset, this.offset + size).map((row) => styledRow(this.theme, row)), hint]);
 }

 invalidate(): void {}
}

/** Show read-only lines; each invocation owns a fresh, keyboard-scrollable overlay. */
export async function showTodoPanel(
 ctx: { ui: { custom<T>(factory: (tui: TUI, theme: SimpleTheme, keybindings: unknown, done: (value: T) => void) => Component, options: { overlay: boolean; overlayOptions: typeof MODAL_OVERLAY_OPTIONS }): Promise<T> } },
 lines: () => PanelLine[],
 title: string,
): Promise<void> {
 await ctx.ui.custom<void>(
  (tui, theme, _keybindings, done) => new TodoPanel(tui, theme, lines, title, () => done()),
  { overlay: true, overlayOptions: MODAL_OVERLAY_OPTIONS },
 );
}

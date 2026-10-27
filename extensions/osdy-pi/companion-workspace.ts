import type { ExtensionUIContext } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth, type Component } from "@earendil-works/pi-tui";
import { fitBorder } from "./border.js";
import type { SimpleTheme } from "./types.js";

type Panel = "todo" | "git" | "working" | "usage";
export interface WorkspacePanelContent {
 lines: string[];
 footer?: string;
}
export interface WorkspacePanel extends Component {
 renderInline?(width: number): WorkspacePanelContent;
}
export interface WorkspaceMouseTarget {
 component: Component;
 x: number;
 y: number;
 width: number;
 height: number;
}
export interface WorkspaceLayout {
 lines: string[];
 targets: WorkspaceMouseTarget[];
}
interface PanelFrame {
 lines: string[];
 target?: WorkspaceMouseTarget;
}
interface Card {
 key: "todo" | "usage" | "git";
 component: WorkspacePanel;
 minimum: number;
 preferred: number;
}

function fitLine(line: string, width: number): string {
 const content = truncateToWidth(line, width, "");
 return content + " ".repeat(Math.max(0, width - visibleWidth(content)));
}

/** Satisfy readable minima first, then share width according to actual content. */
function allocateWidths(cards: readonly { minimum: number; preferred: number }[], width: number): number[] | undefined {
 const free = width - Math.max(0, cards.length - 1) - cards.reduce((sum, card) => sum + card.minimum, 0);
 if (free < 0) return undefined;
 const demand = cards.reduce((sum, card) => sum + Math.max(0, card.preferred - card.minimum), 0);
 const widths = cards.map(card => card.minimum + (demand ? Math.floor(Math.min(free, demand) * Math.max(0, card.preferred - card.minimum) / demand) : 0));
 let remaining = width - Math.max(0, cards.length - 1) - widths.reduce((sum, value) => sum + value, 0);
 // Tasks lead the allocation; siblings still expand when another card vanishes.
 const shares = cards.map((_card, index) => index === 0 ? 2 : 1);
 const total = shares.reduce((sum, value) => sum + value, 0);
 const extra = shares.map(share => Math.floor(remaining * share / total));
 for (let index = 0; index < widths.length; index++) { widths[index] = (widths[index] ?? 0) + (extra[index] ?? 0); remaining -= extra[index] ?? 0; }
 if (widths.length) widths[0] = (widths[0] ?? 0) + remaining;
 return widths;
}

/** Presentation only: each native widget remains mounted and owns its state. */
export class CompanionWorkspace {
 private readonly panels = new Map<Panel, WorkspacePanel>();
 available: (width: number) => boolean = () => false;
 location: Component | undefined;
 statuses: Component | undefined;

 wrap(key: Panel, inline: WorkspacePanel, stacked: Component = inline): Component & { dispose(): void } {
  this.panels.set(key, inline);
  return {
   render: width => this.available(width) ? [] : stacked.render(width),
   handleMouse: event => this.available(event.width) ? undefined : stacked.handleMouse?.(event),
   invalidate: () => stacked.invalidate(),
   dispose: () => { if (this.panels.get(key) === inline) this.panels.delete(key); },
  };
 }

 private frame(key: Panel, width: number, theme: SimpleTheme, component: WorkspacePanel): PanelFrame | undefined {
  const innerWidth = width - 2;
  const panel: WorkspacePanelContent = component.renderInline?.(innerWidth) ?? { lines: component.render(innerWidth) };
  const content = [...panel.lines];
  while (content.at(-1) === "") content.pop();
  if (!content.length) return undefined;
  let footer = panel.footer;
  if (footer && visibleWidth(footer) + 5 > innerWidth) { content.push(footer); footer = undefined; }
  const nativeHeight = content.length;
  const title = key === "todo" ? content.shift() ?? "" : key === "git" ? "Git" : "Usage";
  const accent = (text: string) => theme.fg("accent", text);
  const side = theme.fg("mdHeading", "│");
  const lines = [
   `${accent("✦")}${fitBorder(` ${title} `, "", innerWidth, accent)}${accent("✦")}`,
   ...content.map(line => `${side}${fitLine(line, innerWidth)}${side}`),
   footer
    ? `${theme.fg("mdLink", "╰")}${fitBorder(` ${footer} `, "", innerWidth, text => theme.fg("mdLink", text))}${theme.fg("mdLink", "╯")}`
    : theme.fg("mdLink", `╰${"─".repeat(innerWidth)}╯`),
  ];
  // TODO's heading is its title; Usage's added title is clickable too. Bottom
  // and side borders are excluded, independently of neighboring card heights.
  const height = nativeHeight + (key === "usage" ? 1 : 0);
  return { lines, ...(key === "todo" || key === "usage" ? { target: { component, x: 1, y: 0, width: innerWidth, height } } : {}) };
 }

 render(width: number, theme: SimpleTheme, usage?: Component, rowBudget = Number.POSITIVE_INFINITY): WorkspaceLayout {
  const layout: WorkspaceLayout = { lines: [], targets: [] };
  const accent = (text: string) => theme.fg("accent", text);
  const strip = (left: string, right = ""): void => {
   layout.lines.push(`${accent("✦")}${fitBorder(left ? ` ${left} ` : "", right ? ` ${right} ` : "", width - 2, accent)}${accent("✦")}`);
  };
  const activity = this.panels.get("working")?.render(width - 2)[0]?.trim() ?? "";
  const location = this.location?.render(width - 2)[0]?.trim() ?? "";
  if (activity && location && visibleWidth(activity) + visibleWidth(location) + 9 > width) {
   strip(activity); strip(location);
  } else if (activity || location) strip(activity, location);
  const side = theme.fg("mdHeading", "│");
  for (const line of this.statuses?.render(width - 2) ?? []) layout.lines.push(`${side}${fitLine(line, width - 2)}${side}`);

  const cards: Card[] = [];
  for (const key of ["todo", "usage", "git"] as const) {
   const component: WorkspacePanel | undefined = key === "usage" ? usage : this.panels.get(key);
   if (!component) continue;
   const panel: WorkspacePanelContent = component.renderInline?.(width - 2) ?? { lines: component.render(width - 2) };
   if (!panel.lines.length) continue;
   const minimum = key === "todo" ? 38 : key === "usage" ? 28 : 25;
   const preferred = Math.max(minimum, ...panel.lines.map(line => visibleWidth(line.trim()) + 2), panel.footer ? visibleWidth(panel.footer) + 7 : 0);
   cards.push({ key, component, minimum, preferred });
  }
  if (!cards.length) return layout;

  const compose = (frames: PanelFrame[], widths: number[], horizontal: boolean): WorkspaceLayout => {
   const result: WorkspaceLayout = { lines: [], targets: [] };
   let x = 0;
   for (const [index, frame] of frames.entries()) {
    const y = horizontal ? 0 : result.lines.length;
    if (frame.target) result.targets.push({ ...frame.target, x: frame.target.x + x, y: frame.target.y + y });
    if (horizontal) {
     const height = Math.max(result.lines.length, frame.lines.length);
     for (let row = 0; row < height; row++) result.lines[row] = `${fitLine(result.lines[row] ?? "", Math.max(0, x - 1))}${x ? " " : ""}${fitLine(frame.lines[row] ?? "", widths[index] ?? 0)}`;
     x += (widths[index] ?? 0) + 1;
    } else result.lines.push(...frame.lines);
   }
   return result;
  };
  const candidates: { view: WorkspaceLayout; penalty: number }[] = [];
  const renderCards = (widths: number[]): PanelFrame[] => cards.map((card, index) => this.frame(card.key, widths[index] ?? width, theme, card.component) ?? { lines: [] });
  const penalty = (widths: number[]): number => cards.reduce((sum, card, index) => sum + Math.max(0, card.preferred - (widths[index] ?? width)), 0);
  // A bounded menu: stacked, peer columns (one/two/three), or tasks + sidebar.
  const fullWidths = cards.map(() => width);
  candidates.push({ view: compose(renderCards(fullWidths), fullWidths, false), penalty: 0 });
  const peers = allocateWidths(cards, width);
  if (peers) candidates.push({ view: compose(renderCards(peers), peers, true), penalty: penalty(peers) });
  if (cards.length === 3) {
   const task = cards[0]!;
   const summaries = cards.slice(1);
   const grouped = allocateWidths([task, { minimum: Math.max(...summaries.map(card => card.minimum)), preferred: Math.max(...summaries.map(card => card.preferred)) }], width);
   if (grouped) {
    const widths = [grouped[0]!, grouped[1]!, grouped[1]!];
    const frames = renderCards(widths);
    const sidebar = compose(frames.slice(1), widths.slice(1), false);
    const view = compose([frames[0]!, { lines: sidebar.lines }], grouped, true);
    view.targets.push(...sidebar.targets.map(target => ({ ...target, x: target.x + grouped[0]! + 1 })));
    candidates.push({ view, penalty: penalty(widths) });
   }
  }
  const fitting = candidates.filter(candidate => layout.lines.length + candidate.view.lines.length <= rowBudget);
  const chosen = fitting.length
   ? fitting.sort((a, b) => a.view.lines.length - b.view.lines.length || a.penalty - b.penalty)[0]!
   : candidates.sort((a, b) => a.view.lines.length - b.view.lines.length || a.penalty - b.penalty)[0]!;
  layout.targets.push(...chosen.view.targets.map(target => ({ ...target, y: target.y + layout.lines.length })));
  layout.lines.push(...chosen.view.lines);
  return layout;
 }
}

const workspaces = new WeakMap<ExtensionUIContext, CompanionWorkspace>();

/** The foreground UI, not a project or session id, is the presentation boundary. */
export function companionWorkspace(ui: ExtensionUIContext): CompanionWorkspace {
 let workspace = workspaces.get(ui);
 if (!workspace) { workspace = new CompanionWorkspace(); workspaces.set(ui, workspace); }
 return workspace;
}

import type { ExtensionAPI, ExtensionContext, Theme } from "@earendil-works/pi-coding-agent";
import { Text, visibleWidth, type Component } from "@earendil-works/pi-tui";

const ENTRY_TYPE = "osdy-pi-role-marker";
const ASSISTANT_GLYPH = "✦";
const ASSISTANT_LABEL = `${ASSISTANT_GLYPH} Pi`;
type Marker = { role: "assistant" };

/** Accent-colored text label; narrow widths keep only the glyph, invalid widths an empty row. */
function createAssistantMarker(theme: Pick<Theme, "fg">): Component {
 return {
  render(width) {
   if (!Number.isInteger(width) || width < 2) return [""];
   const label = visibleWidth(ASSISTANT_LABEL) <= width ? ASSISTANT_LABEL : ASSISTANT_GLYPH;
   return new Text(theme.fg("accent", label), 0, 0).render(width);
  },
  invalidate() { /* Stateless text. */ },
 };
}

export function registerMessageRoleMarkers(
 pi: Pick<ExtensionAPI, "on" | "appendEntry" | "registerEntryRenderer">,
 isEnabled: () => boolean,
 isVisible: () => boolean = () => true,
): void {
 let pendingAssistant = false;
 const eligible = (ctx: ExtensionContext): boolean => isEnabled() && ctx.mode === "tui" && ctx.hasUI;
 const visible = (content: unknown): boolean =>
  Array.isArray(content) && (content as unknown[]).some((part) => {
   if (part === null || typeof part !== "object") return false;
   const block = part as { type?: unknown; text?: unknown };
   return block.type === "text" && typeof block.text === "string" && Boolean(block.text.trim());
  });
 const reset = (): void => { pendingAssistant = false; };

 pi.registerEntryRenderer<Marker>(ENTRY_TYPE, (entry, _options, theme) => {
  const role = entry.data?.role;
  if (role !== "assistant") return undefined;
  const marker = createAssistantMarker(theme);
  // Historical entries stay intact; both replay and already-created rows honor visibility.
  return {
   render: (width: number) => isVisible() ? marker.render(width) : [],
   invalidate: () => marker.invalidate(),
  };
 });
 pi.on("message_start", (event, ctx) => {
  if (event.message.role === "user") {
   pendingAssistant = false;
  } else if (event.message.role === "assistant") {
   pendingAssistant = eligible(ctx);
  }
 });
 pi.on("message_update", (event, ctx) => {
  if (event.message.role === "assistant" && pendingAssistant && eligible(ctx) && visible(event.message.content)) {
   pi.appendEntry<Marker>(ENTRY_TYPE, { role: "assistant" });
   pendingAssistant = false;
  }
 });
 pi.on("message_end", (event, ctx) => {
  if (event.message.role !== "assistant") return;
  if (pendingAssistant && eligible(ctx) && visible(event.message.content))
   pi.appendEntry<Marker>(ENTRY_TYPE, { role: "assistant" });
  pendingAssistant = false;
 });
 pi.on("session_start", reset);
 pi.on("session_tree", reset);
 pi.on("session_shutdown", reset);
}

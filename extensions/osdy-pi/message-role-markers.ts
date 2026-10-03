import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { createAssistantMarker } from "./message-role-marker-image.js";

const ENTRY_TYPE = "osdy-pi-role-marker";
type Marker = { role: "assistant" };

export function registerMessageRoleMarkers(
 pi: Pick<ExtensionAPI, "on" | "appendEntry" | "registerEntryRenderer"> & Partial<Pick<ExtensionAPI, "getSettings">>,
 isEnabled: () => boolean,
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
  return createAssistantMarker(theme, () => pi.getSettings?.().terminal?.showImages !== false);
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

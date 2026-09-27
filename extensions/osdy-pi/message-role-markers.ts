import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";

const ENTRY_TYPE = "osdy-pi-role-marker";
type Role = "user" | "assistant";
type Marker = { role: Role };

export function registerMessageRoleMarkers(
 pi: Pick<ExtensionAPI, "on" | "appendEntry" | "registerEntryRenderer">,
 isEnabled: () => boolean,
): void {
 let seenUsers = new WeakSet<object>();
 let pendingAssistant = false;
 const eligible = (ctx: ExtensionContext): boolean => isEnabled() && ctx.mode === "tui" && ctx.hasUI;
 const visible = (content: unknown): boolean =>
  Array.isArray(content) && (content as unknown[]).some((part) => {
   if (part === null || typeof part !== "object") return false;
   const block = part as { type?: unknown; text?: unknown };
   return block.type === "text" && typeof block.text === "string" && Boolean(block.text.trim());
  });
 const reset = (): void => { seenUsers = new WeakSet<object>(); pendingAssistant = false; };

 pi.registerEntryRenderer<Marker>(ENTRY_TYPE, (entry, _options, theme) => {
  const role = entry.data?.role;
  if (role !== "user" && role !== "assistant") return undefined;
  const text = new Text(theme.fg("muted", role === "user" ? "👤" : "🦝"), 0, 0);
  return {
   render: (width: number) => !Number.isInteger(width) || width < 2 ? [""] : text.render(width),
   invalidate: () => text.invalidate(),
  };
 });
 pi.on("message_start", (event, ctx) => {
  if (event.message.role === "user") {
   pendingAssistant = false;
   if (eligible(ctx) && !seenUsers.has(event.message)) {
    seenUsers.add(event.message);
    pi.appendEntry<Marker>(ENTRY_TYPE, { role: "user" });
   }
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

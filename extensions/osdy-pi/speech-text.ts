/** Keep prose, not fenced programs, terminal controls or macOS synth directives. */
export function normalizeSpeechText(text: string): string {
 const prose: string[] = [];
 let fence: { marker: string; length: number } | undefined;
 for (const line of text.split(/\r?\n/u)) {
  const marker = /^\s{0,3}(`{3,}|~{3,})/u.exec(line)?.[1];
  if (fence) {
   if (marker && marker[0] === fence.marker && marker.length >= fence.length && /^\s*(?:`+|~+)\s*$/u.test(line)) fence = undefined;
   continue;
  }
  if (marker) { fence = { marker: marker[0]!, length: marker.length }; continue; }
  prose.push(line);
 }
 return prose.join(" ")
  .replace(/\[\[[\s\S]*?(?:\]\]|$)/gu, "")
  .replace(/!\[([^\]]*)\]\([^)]*\)/gu, "$1")
  .replace(/\[([^\]]+)\]\([^)]*\)/gu, "$1")
  .replace(/<[^>]*>/gu, "")
  .replace(/(?:^|\s)[#>]+\s*/gu, " ")
  .replace(/[`*_~]/gu, "")
  // Markdown removal itself can reveal a previously split synth directive.
  .replace(/\[\[[\s\S]*?(?:\]\]|$)/gu, "")
  .split("").map((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127 ? " " : character).join("")
  .replace(/\s+/gu, " ").trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
 return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function extractResponseSpeech(messages: readonly unknown[]): string | undefined {
 for (let index = messages.length - 1; index >= 0; index--) {
  const message = messages[index];
  if (!isRecord(message) || message.role !== "assistant") continue;
  if (message.stopReason !== "stop" || !Array.isArray(message.content)) return undefined;
  const blocks: unknown[] = message.content;
  const text = blocks.flatMap((block) => isRecord(block) && block.type === "text" && typeof block.text === "string" ? [block.text] : []);
  return normalizeSpeechText(text.join("\n")) || undefined;
 }
 return undefined;
}

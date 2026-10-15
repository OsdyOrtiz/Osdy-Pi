import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Native Node tests import TypeScript sources.
import { extractResponseSpeech, normalizeSpeechText } from "./speech-text.ts";

void test("normalizes readable prose and removes code and synth controls", () => {
 assert.equal(normalizeSpeechText("# Hello **world**\n[read](https://example.com) `this` [[rate 999]]\n```ts\nsecret()\n```\nDone"), "Hello world read this Done");
 assert.equal(normalizeSpeechText("Before\n~~~js\nnever read"), "Before");
 assert.equal(normalizeSpeechText("Safe [`[rate 999]`] after"), "Safe after");
 assert.equal(normalizeSpeechText("Before [[unfinished"), "Before");
});
void test("only the newest successfully stopped assistant text is eligible", () => {
 const old = { role: "assistant", stopReason: "stop", content: [{ type: "text", text: "old" }] };
 assert.equal(extractResponseSpeech([old]), "old");
 for (const content of [[], [{ type: "thinking", thinking: "secret" }], [{ type: "toolCall", name: "secret" }]]) {
  assert.equal(extractResponseSpeech([old, { role: "assistant", stopReason: "stop", content }]), undefined);
 }
 assert.equal(extractResponseSpeech([old, { role: "assistant", stopReason: "error", content: [{ type: "text", text: "bad" }] }]), undefined);
 assert.equal(extractResponseSpeech([old, { role: "user", content: "ignored" }]), "old");
 assert.equal(extractResponseSpeech([null, 1, { role: "assistant", stopReason: "stop", content: [{ type: "text", text: "new" }, { type: "thinking", text: "secret" }] }]), "new");
});

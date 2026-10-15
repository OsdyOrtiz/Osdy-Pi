import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Native Node tests import TypeScript sources.
import { createSpeechSettingsStore, defaultSpeechSettings, validateSpeechSettings } from "./speech-settings.ts";
import type { SpeechSettingsFileSystem } from "./speech-settings.js";

void test("settings reject invalid input without changing persisted values", async () => {
 // Virtual filesystem prevents any access to personal state or out-of-scope test files.
 const files = new Map<string, string>();
 const temporary: string[] = [];
 const fs: SpeechSettingsFileSystem = {
  readFile: (name) => files.has(name) ? Promise.resolve(files.get(name)!) : Promise.reject(Object.assign(new Error("missing"), { code: "ENOENT" })),
  mkdir: () => Promise.resolve(),
  writeFile: (name, value) => { temporary.push(name); files.set(name, value); return Promise.resolve(); },
  rename: (from, to) => { files.set(to, files.get(from)!); files.delete(from); return Promise.resolve(); },
 };
 const store = createSpeechSettingsStore("/virtual-project/private-test", fs);
 assert.deepEqual(await store.load(), defaultSpeechSettings());
 const good = { ...defaultSpeechSettings(), enabled: true, rate: 200 };
 await store.save(good);
 assert.deepEqual(await store.load(), good);
 for (const bad of [{...good, rate: 0}, {...good, rate: NaN}, {...good, enabled: "yes"}, {...good, voice: ""}, {...good, version: 2}]) {
  assert.throws(() => validateSpeechSettings(bad));
  await assert.rejects(store.save(bad as typeof good));
  assert.deepEqual(await store.load(), good);
 }
 await Promise.all([store.save(good), store.save(good)]);
 assert.equal(new Set(temporary).size, 3);
 files.set("/virtual-project/private-test/extensions/osdy-pi/speech.json", '{"version":1,"enabled":"bad"}');
 await assert.rejects(store.load());
});

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { ESLint } from "eslint";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

void test("lint excludes the isolated Kokoro runtime but still checks project scripts", async () => {
 const lint = new ESLint({ cwd: root });
 assert.equal(await lint.isPathIgnored(path.join(root, ".pi-dev/kokoro/cache/dependency.js")), true);
 const [result] = await lint.lintText("missingProjectValue;", { filePath: "scripts/osdy-pi-lint-control.mjs" });
 assert.ok(result.messages.some(message => message.ruleId === "no-undef"));
});

void test("npm package ships the Kokoro adapter and the setup guide linked by README", () => {
 const scratchRoot = path.join(root, ".pi-dev");
 mkdirSync(scratchRoot, { recursive: true });
 const scratch = mkdtempSync(path.join(scratchRoot, "kokoro-package-"));
 try {
  const result = spawnSync("npm", ["--cache", path.join(scratch, "cache"), "pack", "--dry-run", "--ignore-scripts", "--json"], {
   cwd: root, encoding: "utf8", timeout: 30_000,
  });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, "");
  const [pack] = JSON.parse(result.stdout);
  const files = new Set(pack.files.map(file => file.path));
  for (const file of ["docs/kokoro.md", "extensions/osdy-pi/kokoro-speech-adapter.ts", "extensions/osdy-pi/kokoro-audio-player.ts"]) {
   assert.ok(files.has(file), `${file} must ship in the npm package`);
  }
  assert.equal([...files].some(file => file.startsWith(".pi-dev/")), false);
 } finally {
  rmSync(scratch, { recursive: true, force: true });
 }
});

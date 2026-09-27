import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import test from "node:test";

const themesDir = join(dirname(fileURLToPath(import.meta.url)), "..", "themes");
const themeFiles = readdirSync(themesDir).filter((file) => /^osdy-pi-.*\.json$/.test(file));

function resolveColor(theme, role) {
  const value = theme.colors[role];
  const hex = theme.vars[value] ?? value;
  assert.match(hex, /^#[0-9a-f]{6}$/i, `${theme.name}: ${role} must resolve to a hex color`);
  return hex;
}

function luminance(hex) {
  const channels = hex.slice(1).match(/../g).map((channel) => {
    const value = parseInt(channel, 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

function contrast(first, second) {
  const [lighter, darker] = [luminance(first), luminance(second)].sort((a, b) => b - a);
  return (lighter + 0.05) / (darker + 0.05);
}

test("every bundled Osdy Pi theme has a legible native user card", () => {
  assert.equal(themeFiles.length, 14, "cover all bundled Osdy Pi themes");
  for (const file of themeFiles) {
    const theme = JSON.parse(readFileSync(join(themesDir, file), "utf8"));
    assert.equal(typeof theme.colors.userMessageBg, "string", `${theme.name}: userMessageBg must be a string`);
    assert.ok(theme.colors.userMessageBg.trim(), `${theme.name}: userMessageBg must not fall back to the terminal background`);
    const user = resolveColor(theme, "userMessageBg");
    assert.ok(contrast(user, resolveColor(theme, "userMessageText")) >= 4.5, `${theme.name}: user card text should remain readable`);
    // pageBg is an HTML-export hint, not a guaranteed TUI background. Skip
    // terminals without a known background (Lucent Orange has an empty hint).
    if (theme.export?.pageBg) {
      const page = theme.vars[theme.export.pageBg] ?? theme.export.pageBg;
      if (/^#[0-9a-f]{6}$/i.test(page)) {
        assert.ok(contrast(user, page) >= 1.2, `${theme.name}: user card must stand off the known page background`);
      }
    }
  }
});

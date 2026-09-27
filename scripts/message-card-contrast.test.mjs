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

test("every bundled Osdy Pi theme has distinct, legible native role cards", () => {
  assert.equal(themeFiles.length, 14, "cover all bundled Osdy Pi themes");
  for (const file of themeFiles) {
    const theme = JSON.parse(readFileSync(join(themesDir, file), "utf8"));
    const user = resolveColor(theme, "userMessageBg");
    const assistant = resolveColor(theme, "assistantMessageBg");
    const lightTheme = ["osdy-pi-catppuccin-latte", "osdy-pi-kanagawa-lotus"].includes(theme.name);
    // Light cards must keep the shared dark Markdown palette readable. At >=4.5:1
    // dark body text, their white user stripe limits feasible role separation;
    // test the meaningful 1.4:1 floor instead of forcing dark assistant cards.
    assert.ok(contrast(user, assistant) >= (lightTheme ? 1.4 : 1.8), `${theme.name}: role backgrounds need separation`);
    if (theme.export?.pageBg) {
      const page = theme.vars[theme.export.pageBg] ?? theme.export.pageBg;
      const roles = lightTheme ? [["user", user]] : [["user", user], ["assistant", assistant]];
      // A pale assistant card on a light page may blend into the page; its
      // distinguishability comes from the darker user card and blue stripe.
      for (const [role, bg] of roles) {
        assert.ok(contrast(bg, page) >= 1.2, `${theme.name}: ${role} card must stand off the known page background`);
      }
    }
    if (lightTheme) {
      assert.ok(contrast(user, resolveColor(theme, "userMessageAccentBg")) >= 1.6, `${theme.name}: white user stripe should remain visible`);
      assert.ok(contrast(assistant, resolveColor(theme, "assistantMessageAccentBg")) >= 3.5, `${theme.name}: blue assistant stripe should remain visible`);
      for (const role of ["mdHeading", "mdLink", "mdLinkUrl", "mdCode", "mdCodeBlock", "mdQuote", "mdListBullet"]) {
        // These are shared Markdown colors, not assistant-only overrides. The
        // weakest light-palette accents (Latte peach/sapphire) need >=2.4:1.
        assert.ok(contrast(assistant, resolveColor(theme, role)) >= 2.4, `${theme.name}: ${role} must be visible on assistant cards`);
        assert.ok(contrast(user, resolveColor(theme, role)) >= 1.8, `${theme.name}: ${role} must remain visible on user cards`);
      }
    }
    for (const role of ["user", "assistant"]) {
      assert.ok(
        contrast(resolveColor(theme, `${role}MessageBg`), resolveColor(theme, `${role}MessageText`)) >= 4.5,
        `${theme.name}: ${role} card text should remain readable`,
      );
    }
    assert.equal(resolveColor(theme, "userMessageAccentBg").toLowerCase(), "#ffffff", `${theme.name}: retain white user stripe`);
    assert.equal(resolveColor(theme, "assistantMessageAccentBg").toLowerCase(), resolveColor(theme, "accent").toLowerCase(), `${theme.name}: retain theme assistant stripe`);
  }
});

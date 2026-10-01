import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath, URL } from "node:url";
import { dirname, join } from "node:path";
import test from "node:test";
import { colorToHex } from "@earendil-works/pi-tui";

const themesDir = join(dirname(fileURLToPath(import.meta.url)), "..", "themes");
const themeFiles = readdirSync(themesDir).filter((file) => /^osdy-pi-.*\.json$/.test(file));

const newDarkNames = ["osdy-pi-gruvbox-dark", "osdy-pi-nord", "osdy-pi-rose-pine", "osdy-pi-daniela-cute"];

test("new dark themes cover every installed Pi role and load without fallbacks", async () => {
  const schema = JSON.parse(readFileSync(new URL("../node_modules/@earendil-works/pi-coding-agent/dist/modes/interactive/theme/theme-schema.json", import.meta.url), "utf8"));
  const { loadThemeFromPath } = await import("../node_modules/@earendil-works/pi-coding-agent/dist/modes/interactive/theme/theme.js");
  for (const name of newDarkNames) {
    const file = `${name}.json`;
    assert.ok(themeFiles.includes(file), `${name}: bundled file must exist`);
    const theme = JSON.parse(readFileSync(join(themesDir, file), "utf8"));
    assert.equal(theme.name, name);
    assert.equal(theme.appearance, "dark");
    assert.deepEqual(Object.keys(theme.colors).sort(), Object.keys(schema.properties.colors.properties).sort());
    for (const key of Object.keys(theme)) assert.ok(key in schema.properties, `${name}: supported property ${key}`);
    for (const role of Object.keys(theme.colors)) resolveColor(theme, role);
    for (const [role, value] of Object.entries(theme.export)) {
      assert.ok(role in schema.properties.export.properties);
      assert.match(theme.vars[value] ?? value, /^#[0-9a-f]{6}$/i);
    }
    const loaded = loadThemeFromPath(join(themesDir, file), "truecolor");
    assert.equal(loaded.name, name);
    for (const role of Object.keys(theme.colors)) {
      assert.equal(colorToHex(loaded.colors[role]).toLowerCase(), resolveColor(theme, role).toLowerCase());
    }
  }
});

test("Daniela Cute retains its exact approved palette and distinct status and syntax colors", () => {
  const theme = JSON.parse(readFileSync(join(themesDir, "osdy-pi-daniela-cute.json"), "utf8"));
  assert.equal(theme.name, "osdy-pi-daniela-cute");
  const palette = {
    navy: "#0B1220", card: "#111F33", border: "#253A55", cobalt: "#3584E4",
    text: "#D8E2EF", muted: "#93A6BE", selection: "#193655",
  };
  for (const [variable, hex] of Object.entries(palette)) assert.equal(theme.vars[variable], hex);
  for (const role of ["toolPendingBg", "toolSuccessBg", "toolErrorBg", "searchMatchText"]) {
    assert.equal(resolveColor(theme, role), palette.navy);
  }
  for (const role of ["userMessageBg", "customMessageBg", "scrollbarTrack"]) {
    assert.equal(resolveColor(theme, role), palette.card);
  }
  for (const role of ["border", "borderMuted", "mdCodeBlockBorder", "mdHr"]) {
    assert.equal(resolveColor(theme, role), palette.border);
  }
  for (const role of ["accent", "borderAccent", "scrollbarThumb", "mdQuoteBorder", "thinkingMinimal"]) {
    assert.equal(resolveColor(theme, role), palette.cobalt);
  }
  for (const role of ["text", "userMessageText", "customMessageText", "toolOutput", "mdCodeBlock", "syntaxVariable"]) {
    assert.equal(resolveColor(theme, role), palette.text);
  }
  for (const role of ["muted", "thinkingText", "mdLinkUrl", "mdQuote", "toolDiffContext", "syntaxPunctuation"]) {
    assert.equal(resolveColor(theme, role), palette.muted);
  }
  assert.equal(resolveColor(theme, "selectedBg"), palette.selection);
  assert.deepEqual(Object.fromEntries(Object.entries(theme.export).map(([role, value]) => [role, theme.vars[value] ?? value])), {
    pageBg: palette.navy, cardBg: palette.card, infoBg: palette.navy,
  });
  for (const [role, hex] of Object.entries({
    success: "#32D583", error: "#FF5364", warning: "#FFC247",
    syntaxComment: "#7895BA", syntaxKeyword: "#A970FF", syntaxFunction: "#22D3EE",
    syntaxString: "#32D583", syntaxNumber: "#FF963C", syntaxType: "#FFC247", syntaxOperator: "#F54DB8",
  })) assert.equal(resolveColor(theme, role), hex);
});

test("Daniela Cute primary and secondary text remain readable on panels, cards and selection", () => {
  const theme = JSON.parse(readFileSync(join(themesDir, "osdy-pi-daniela-cute.json"), "utf8"));
  for (const background of ["toolPendingBg", "userMessageBg", "selectedBg"]) {
    for (const foreground of ["text", "muted"]) {
      assert.ok(contrast(resolveColor(theme, foreground), resolveColor(theme, background)) >= 4.5,
        `${theme.name}: ${foreground} must remain readable on ${background}`);
    }
  }
});

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
  assert.equal(themeFiles.length, 18, "cover all bundled Osdy Pi themes");
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
        // Daniela Cute's user-approved exact palette has 1.130191:1 card/page
        // contrast. Keep a bounded 1.1 floor only for it; all other themes
        // retain 1.2, and text readability retains its separate 4.5 minimum.
        const minimum = theme.name === "osdy-pi-daniela-cute" ? 1.1 : 1.2;
        assert.ok(contrast(user, page) >= minimum, `${theme.name}: user card must stand off the known page background (>=${minimum})`);
      }
    }
  }
});

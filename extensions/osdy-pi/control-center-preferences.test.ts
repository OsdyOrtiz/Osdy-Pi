import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import test from "node:test";
import { fileURLToPath } from "node:url";
import type { VisualPreferenceSnapshot } from "./control-center-preferences.js";

registerHooks({
	resolve(specifier, context, nextResolve) {
		if (specifier.startsWith(".") && specifier.endsWith(".js") && context.parentURL?.endsWith(".ts")) {
			const url = new URL(`${specifier.slice(0, -3)}.ts`, context.parentURL);
			if (existsSync(fileURLToPath(url))) return { shortCircuit: true, url: url.href };
		}
		return nextResolve(specifier, context);
	},
});
const { preferenceDetail } = await import("./control-center-preferences.js");
const snapshot: VisualPreferenceSnapshot = { enabled: true, headerVariant: "osdy-theme", mascot: "current",
	editorMode: "auto", editorEffective: true, smallMode: false };

void test("preference rows expose every catalog value and exactly one current indicator", () => {
	for (const [category, field, values] of [
		["Header", "headerVariant", ["osdy-theme", "neon"]],
		["Mascot", "mascot", ["current", "bts", "osdy-halloween"]],
		["Editor", "editorMode", ["auto", "extended", "simple"]],
	] as const) {
		for (const value of values) {
			const detail = preferenceDetail(category, { ...snapshot, [field]: value });
			assert.ok(detail);
			assert.deepEqual(detail.rows.map((row) => "value" in row.action ? row.action.value : undefined), values);
			assert.equal(detail.rows.filter((row) => row.current).length, 1);
			assert.equal(detail.rows.find((row) => row.current)?.action.kind, category.toLowerCase());
			const label = value === "bts" ? "Bts" : value === "osdy-halloween" ? "Osdy-Halloween" : value;
			assert.match(detail.summary, new RegExp(`Current: ${label}`));
			assert.equal(detail.rows.find((row) => row.current)?.label, label);
		}
	}
});

void test("effective editor and disabled visuals describe live runtime, not a derived rendering policy", () => {
	assert.match(preferenceDetail("Editor", snapshot)?.summary ?? "", /Effective: extended/);
	const disabled = { ...snapshot, enabled: false, editorEffective: false };
	assert.match(preferenceDetail("Editor", disabled)?.summary ?? "", /Osdy disabled.*Effective: simple\/native/);
	assert.match(preferenceDetail("Header", disabled)?.note ?? "", /apply when Osdy is enabled/);
	assert.match(preferenceDetail("Mascot", { ...snapshot, smallMode: true })?.summary ?? "", /Current: current/);
	assert.equal(preferenceDetail("Git", snapshot), undefined);
	assert.equal(preferenceDetail("Sounds", snapshot), undefined);
	assert.equal(preferenceDetail("Account", snapshot), undefined);
	assert.equal(preferenceDetail("Usage", snapshot), undefined);
});

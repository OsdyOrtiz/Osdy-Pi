import { EDITOR_MODES, HEADER_VARIANT_CHOICES, MASCOT_CHOICES } from "./types.js";
import type { EditorMode, HeaderVariant, MascotChoice, OsdyState } from "./types.js";
import type { ControlCenterCategory, ControlCenterRow } from "./control-center.js";

export type VisualPreferenceAction =
	| { kind: "visuals"; value: boolean }
	| { kind: "header"; value: HeaderVariant }
	| { kind: "mascot"; value: MascotChoice }
	| { kind: "editor"; value: EditorMode };

export type VisualPreferenceSnapshot = Pick<OsdyState,
	"enabled" | "visualsEnabled" | "headerVariant" | "mascot" | "editorMode" | "editorEffective" | "smallMode">;

export interface ControlCenterPreferences {
	snapshot(): VisualPreferenceSnapshot;
	/** Per-visual choices apply live; the visuals switch saves transactionally before reload. */
	apply(action: VisualPreferenceAction): Promise<boolean>;
}

export function visualPreferenceLabel(action: VisualPreferenceAction): string {
	if (action.kind === "visuals") return action.value ? "on" : "off";
	if (action.kind === "mascot") {
		if (action.value === "bts") return "Bts";
		if (action.value === "osdy-halloween") return "Osdy-Halloween";
	}
	return action.value;
}

/** Explicit view adaptation only; application and persistence belong to runtime. */
export function preferenceDetail(category: ControlCenterCategory, state: VisualPreferenceSnapshot): {
	rows: ControlCenterRow[];
	summary: string;
	note: string;
} | undefined {
	if (category === "Visuals") return {
		rows: [true, false].map(value => ({ label: value ? "on — save and reload" : "off — save and reload", current: (state.visualsEnabled !== false) === value, action: { kind: "visuals", value } })),
		summary: `Current: ${state.visualsEnabled !== false ? "on" : "off"}${state.enabled ? "" : " | Legacy master off; use /osdy-pi on to enable it."}`,
		note: "Visuals only; notifications, accounts, speech and tools stay active. Saves then reloads via /osdyConfig; shortcut: run /reload manually. Keeps theme and visual selections.",
	};
	let actions: VisualPreferenceAction[];
	let current: string;
	let effective = !state.enabled ? " | Osdy disabled" : state.visualsEnabled === false ? " | Visuals off" : "";
	switch (category) {
		case "Header":
			actions = HEADER_VARIANT_CHOICES.map((value) => ({ kind: "header", value }));
			current = state.headerVariant;
			break;
		case "Mascot":
			actions = MASCOT_CHOICES.map((value) => ({ kind: "mascot", value }));
			current = state.mascot;
			break;
		case "Editor":
			actions = Object.values(EDITOR_MODES).map((value) => ({ kind: "editor", value }));
			current = state.editorMode;
			effective += ` | Effective: ${state.editorEffective ? "extended" : "simple/native"}`;
			if (state.smallMode) effective += " (small terminal)";
			break;
		default: return undefined;
	}
	const currentAction = actions.find((action) => action.value === current);
	return {
		rows: actions.map((action) => ({ label: visualPreferenceLabel(action), current: action.value === current, action })),
		summary: `Current: ${currentAction ? visualPreferenceLabel(currentAction) : current}${effective}`,
		note: state.enabled && state.visualsEnabled !== false
			? "Applies live; saves globally in Osdy settings."
			: "Saves globally; visuals apply when Osdy is enabled and Visuals are on.",
	};
}

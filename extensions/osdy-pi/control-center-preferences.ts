import { EDITOR_MODES, HEADER_VARIANT_CHOICES, MASCOT_CHOICES } from "./types.js";
import type { EditorMode, HeaderVariant, MascotChoice, OsdyState } from "./types.js";
import type { ControlCenterCategory, ControlCenterRow } from "./control-center.js";

export type VisualPreferenceAction =
	| { kind: "header"; value: HeaderVariant }
	| { kind: "mascot"; value: MascotChoice }
	| { kind: "editor"; value: EditorMode };

export type VisualPreferenceSnapshot = Pick<OsdyState,
	"enabled" | "headerVariant" | "mascot" | "editorMode" | "editorEffective" | "smallMode">;

export interface ControlCenterPreferences {
	snapshot(): VisualPreferenceSnapshot;
	/** Applies live before awaiting the existing global store. False means save failed. */
	apply(action: VisualPreferenceAction): Promise<boolean>;
}

export function visualPreferenceLabel(action: VisualPreferenceAction): string {
	return action.kind === "mascot" && action.value === "bts" ? "Bts" : action.value;
}

/** Explicit view adaptation only; application and persistence belong to runtime. */
export function preferenceDetail(category: ControlCenterCategory, state: VisualPreferenceSnapshot): {
	rows: ControlCenterRow[];
	summary: string;
	note: string;
} | undefined {
	let actions: VisualPreferenceAction[];
	let current: string;
	let effective = state.enabled ? "" : " | Osdy disabled";
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
		note: state.enabled
			? "Applies live; saves globally in Osdy settings."
			: "Saves globally; visuals apply when Osdy is enabled.",
	};
}

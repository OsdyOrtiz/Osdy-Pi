import { COMPANION_STYLES, EDITOR_MODES, HEADER_VARIANT_CHOICES, MASCOT_CHOICES } from "./types.js";
import type { CompanionStyle, EditorMode, HeaderVariant, MascotChoice, OsdyState } from "./types.js";
import { COMPANION_STYLE_LABELS } from "./companion-labels.js";
import type { ControlCenterCategory, ControlCenterRow } from "./control-center.js";

export type VisualPreferenceAction =
	| { kind: "visuals"; value: boolean }
	| { kind: "header"; value: HeaderVariant }
	| { kind: "mascot"; value: MascotChoice }
	| { kind: "editor"; value: EditorMode }
	| { kind: "companion"; value: boolean }
	/** Choosing a style also turns the companion on. */
	| { kind: "companion-style"; value: CompanionStyle };

export type VisualPreferenceSnapshot = Pick<OsdyState,
	"enabled" | "visualsEnabled" | "companionEnabled" | "companionStyle" | "headerVariant" | "mascot" | "editorMode" | "editorEffective" | "smallMode">;

export interface ControlCenterPreferences {
	snapshot(): VisualPreferenceSnapshot;
	/** Per-visual choices apply live; Visuals commits appearance and provider settings before reload. */
	apply(action: VisualPreferenceAction): Promise<boolean>;
}

const MASCOT_LABELS: Record<MascotChoice, string> = {
	current: "Cozy Bandit",
	bts: "Lavender Bandit",
	"osdy-halloween": "Little Vampire",
	pi: "Hoodie Pi",
};

export function mascotLabel(mascot: MascotChoice): string {
	return MASCOT_LABELS[mascot];
}

export function visualPreferenceLabel(action: VisualPreferenceAction): string {
	if (action.kind === "visuals" || action.kind === "companion") return action.value ? "on" : "off";
	if (action.kind === "companion-style") return COMPANION_STYLE_LABELS[action.value];
	if (action.kind === "mascot") return mascotLabel(action.value);
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
		note: "Off suspends Osdy visuals, TODO and Joker; on restores prior selections, not forced opt-in. Gentle fallback allowed, never installed or required. Notifications, accounts, speech and analytics stay independent. Active Joker requires normal personal Pi: custom/project/direct/ambiguous active configurations refuse atomically. Saves then reloads via /osdyConfig; shortcut: run /reload manually. Keeps theme and visual selections.",
	};
	let actions: VisualPreferenceAction[];
	let current: string | boolean;
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
		case "Companion":
			actions = [
				...COMPANION_STYLES.map((value) => ({ kind: "companion-style" as const, value })),
				{ kind: "companion", value: false },
			];
			current = state.companionEnabled === false ? false : state.companionStyle ?? "original";
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

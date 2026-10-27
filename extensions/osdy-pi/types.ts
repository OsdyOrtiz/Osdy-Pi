import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { TUI } from "@earendil-works/pi-tui";

type EditorFactory = Exclude<
	ReturnType<ExtensionContext["ui"]["getEditorComponent"]>,
	undefined
>;
import type { CodexUsageSnapshot } from "./codex-usage.js";
import type { GenerationReading } from "./generation-meter.js";

export type AnimationMode = "off" | "intro" | "continuous";

export const EDITOR_MODES = {
	AUTO: "auto",
	EXTENDED: "extended",
	SIMPLE: "simple",
} as const;

export type EditorMode = (typeof EDITOR_MODES)[keyof typeof EDITOR_MODES];

export const DEFAULT_EDITOR_MODE = EDITOR_MODES.AUTO;

export interface GlobalEditorSettings {
	version: number;
	enabled: boolean;
	/** Missing in older v1 settings means visuals are enabled. */
	visualsEnabled?: boolean;
	editorMode: EditorMode;
	workingTreeEnabled: boolean;
	headerVariant: HeaderVariant;
	mascot: MascotChoice;
	/** Missing means the editor companion raccoon is shown. */
	companionEnabled?: boolean;
	/** Missing means the original style. */
	companionStyle?: CompanionStyle;
}

export function areVisualsEnabled(state: Pick<OsdyState, "enabled" | "visualsEnabled">): boolean {
	return state.enabled && state.visualsEnabled !== false;
}

export function resolveEffectiveEditorMode(
	mode: EditorMode,
	smallMode: boolean,
): EditorMode {
	if (smallMode || mode === EDITOR_MODES.SIMPLE) return EDITOR_MODES.SIMPLE;
	return EDITOR_MODES.EXTENDED;
}

export function shouldShowFooterMetadata(editorEffective: boolean): boolean {
	return !editorEffective;
}

export const HEADER_VARIANT_CHOICES = ["osdy-theme", "neon", "block-shadow", "slanted"] as const;

export type HeaderVariant = (typeof HEADER_VARIANT_CHOICES)[number];

/** Header for new or unreadable settings; a saved choice always wins. */
export const DEFAULT_HEADER_VARIANT: HeaderVariant = "slanted";

export const MASCOT_CHOICES = ["current", "bts", "osdy-halloween", "pi"] as const;

export type MascotChoice = (typeof MASCOT_CHOICES)[number];

/** Mascot for new or unreadable settings (Hoodie Pi); a saved choice always wins. */
export const DEFAULT_MASCOT: MascotChoice = "pi";

/** Header mascots drawn as tone-mapped text art; the rest are half-block pixel art. */
export type TextMascotChoice = Exclude<MascotChoice, "pi">;

export function isTextMascotChoice(choice: MascotChoice): choice is TextMascotChoice {
	return choice !== "pi";
}

/**
 * Original: converted from the OpenPets sheet. Drawn: hand-drawn 16 x 16 art.
 * Rounded: generated from the Pi rounded terminal mascot pack (48 x 52).
 * Terminal: generated from the flat-color Pi Terminal pack (24 x 24).
 */
export const COMPANION_STYLES = ["original", "drawn", "rounded", "terminal", "slim", "slim-small"] as const;

export type CompanionStyle = (typeof COMPANION_STYLES)[number];

export function isCompanionStyle(value: unknown): value is CompanionStyle {
	return typeof value === "string" && COMPANION_STYLES.some((style) => style === value);
}

export type WorkingTreePlacement = "aboveEditor" | "belowEditor";

export type CodexUsageState =
	| { kind: "idle" }
	| { kind: "loading"; snapshot: CodexUsageSnapshot | undefined }
	| { kind: "ready"; snapshot: CodexUsageSnapshot }
	| { kind: "error"; message: string; snapshot: CodexUsageSnapshot | undefined };

export type OsdyState = {
	codexUsage: CodexUsageState;
	/** Presentation entrypoint; resolves the current foreground context on every click. */
	openUsage?: () => Promise<void>;
	/** Volatile response reading; never persisted as usage or settings. */
	generation?: GenerationReading;
	enabled: boolean;
	visualsEnabled?: boolean;
	/** Actual mounted editor, including while a desired change is deferred. */
	editorEffective: boolean;
	/** Volatile interaction ownership; never saved in global settings. */
	editorMountHold?: { count: number } | undefined;
	editorReconcilePending?: boolean;
	/** A new session must reconstruct the editor's captured context, even in the same mode. */
	editorSessionRemountPending?: boolean;
	editorMode: EditorMode;
	fallbackEditorFactory: EditorFactory | undefined;
	headerVariant: HeaderVariant;
	mascot: MascotChoice;
	smallMode: boolean;
	tui: TUI | undefined;
	workingTreeEnabled: boolean;
	workingTreePlacement: WorkingTreePlacement;
	/** Editor companion raccoon preference; missing means enabled. */
	companionEnabled?: boolean;
	/** Editor companion raccoon art; missing means the original style. */
	companionStyle?: CompanionStyle;
	/** Live read-only view of the working indicator; drives the editor companion pose. */
	working?: Readonly<Pick<WorkingWidgetState, "active" | "activity" | "frame">>;
};

export type WorkingActivity =
	| "thinking"
	| "exploring"
	| "verifying"
	| "working"
	| "delegating"
	| "executing";

export type WorkingWidgetState = {
	active: boolean;
	activity: WorkingActivity;
	label: string;
	frame: number;
	timer: ReturnType<typeof setInterval> | undefined;
	tui: TUI | undefined;
};

export type WorkingTreeFileSummary = {
	path: string;
	additions: number;
	removals: number;
	staged: boolean;
	unstaged: boolean;
	untracked: boolean;
};

export type WorkingTreeSnapshot = {
	files: WorkingTreeFileSummary[];
	totalFiles: number;
	stagedFiles: number;
	unstagedFiles: number;
	untrackedFiles: number;
	additions: number;
	removals: number;
};

export type WorkingTreeState = {
	enabled: boolean;
	loading: boolean;
	visible: boolean;
	snapshot: WorkingTreeSnapshot | null;
	error: string | undefined;
	tui: TUI | undefined;
};

export type AssistantUsage = {
	input?: number;
	output?: number;
	cacheRead?: number;
	cacheWrite?: number;
	cost?: {
		total?: number;
	};
};

export type AssistantSessionEntry = {
	type: "message";
	id: string;
	parentId: string | null;
	timestamp: string;
	message?: {
		role?: string;
		usage?: AssistantUsage;
	};
};

export type SimpleTheme = {
	fg(name: string, text: string): string;
	bold?(text: string): string;
};

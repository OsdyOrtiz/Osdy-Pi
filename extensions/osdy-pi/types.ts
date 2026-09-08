import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { TUI } from "@earendil-works/pi-tui";

type EditorFactory = Exclude<
	ReturnType<ExtensionContext["ui"]["getEditorComponent"]>,
	undefined
>;
import type { CodexUsageSnapshot } from "./codex-usage.js";

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
	editorMode: EditorMode;
	workingTreeEnabled: boolean;
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

export type HeaderVariant = "osdy-theme" | "classic";

export type WorkingTreePlacement = "aboveEditor" | "belowEditor";

export type CodexUsageState =
	| { kind: "idle" }
	| { kind: "loading"; snapshot: CodexUsageSnapshot | undefined }
	| { kind: "ready"; snapshot: CodexUsageSnapshot }
	| { kind: "error"; message: string; snapshot: CodexUsageSnapshot | undefined };

export type OsdyState = {
	codexUsage: CodexUsageState;
	enabled: boolean;
	editorEffective: boolean;
	editorMode: EditorMode;
	fallbackEditorFactory: EditorFactory | undefined;
	headerVariant: HeaderVariant;
	smallMode: boolean;
	tui: TUI | undefined;
	workingTreeEnabled: boolean;
	workingTreePlacement: WorkingTreePlacement;
};

export type WorkingWidgetState = {
	active: boolean;
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
};

import type { TUI } from "@earendil-works/pi-tui";

export type AnimationMode = "off" | "intro" | "continuous";

export type HeaderVariant = "osdy-theme" | "classic";

export type WorkingTreePlacement = "aboveEditor" | "belowEditor";

export type OsdyState = {
	enabled: boolean;
	headerVariant: HeaderVariant;
	previousThemeName?: string;
	gitLabel: string;
	agentsLabel: string;
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

export type HeaderMetaRow = {
	leftLabel: string;
	leftValue: string;
	rightLabel: string;
	rightValue: string;
};

export type SimpleTheme = {
	fg(name: string, text: string): string;
};

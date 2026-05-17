import type { TUI } from "@earendil-works/pi-tui";

export type AnimationMode = "off" | "intro" | "continuous";

export type OsdyState = {
	enabled: boolean;
	previousThemeName?: string;
	gitLabel: string;
	agentsLabel: string;
};

export type WorkingWidgetState = {
	active: boolean;
	label: string;
	frame: number;
	timer: ReturnType<typeof setInterval> | undefined;
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

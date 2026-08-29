import {
	CustomEditor,
	type ExtensionAPI,
	type ExtensionContext,
	type KeybindingsManager,
	type ReadonlyFooterDataProvider,
} from "@earendil-works/pi-coding-agent";
import {
	type Component,
	type EditorTheme,
	type TUI,
	truncateToWidth,
	visibleWidth,
} from "@earendil-works/pi-tui";
import {
	animateAsciiLine,
	animateAsciiLineWithToneMap,
	asciiAnimationMode,
} from "./animation.js";
import { fitBorder } from "./border.js";
import {
	ANIMATION_INTERVAL_MS,
	headerWidth,
	HEADER_VARIANTS,
	INTRO_ANIMATION_FRAMES,
	MASCOT_GAP,
	scaleMascot,
	WORKING_SPINNER_FRAMES,
} from "./constants.js";
import { formatPath } from "./format.js";
import { modelLabel, usageLabel } from "./metrics.js";
import type { OsdyState, SimpleTheme, WorkingWidgetState } from "./types.js";
import {
	compactMascotWidthBudget,
	composeSideBySide,
	fitCenterVisible,
	internalLineTarget,
	isSmallResponsiveMode,
	sanitizeStatusText,
} from "./utils.js";

const THINKING_THEME_TOKENS = {
	off: "thinkingOff",
	minimal: "thinkingMinimal",
	low: "thinkingLow",
	medium: "thinkingMedium",
	high: "thinkingHigh",
	xhigh: "thinkingXhigh",
} satisfies Record<ReturnType<ExtensionAPI["getThinkingLevel"]>, string>;

const PI_LENS_STATUS_KEY = "pi-lens-lsp";

class OsdyFooter implements Component {
	private readonly pi: ExtensionAPI;
	private readonly ctx: ExtensionContext;
	private readonly state: OsdyState;
	private readonly footerData: ReadonlyFooterDataProvider;
	private readonly theme: SimpleTheme;

	constructor(
		pi: ExtensionAPI,
		ctx: ExtensionContext,
		state: OsdyState,
		footerData: ReadonlyFooterDataProvider,
		theme: SimpleTheme,
	) {
		this.pi = pi;
		this.ctx = ctx;
		this.state = state;
		this.footerData = footerData;
		this.theme = theme;
	}

	render(width: number): string[] {
		const ellipsis = this.theme.fg("dim", "...");
		let location = formatPath(this.ctx.cwd);
		const branch = this.footerData.getGitBranch?.();
		if (branch) location = `${location} (${branch})`;
		const locationLine = truncateToWidth(
			this.theme.fg("dim", location),
			width,
			ellipsis,
		);
		const statuses = this.footerData.getExtensionStatuses?.() ?? new Map();
		const statusEntries = Array.from(statuses.entries()).filter(
			([key]) => !this.state.smallMode || key !== PI_LENS_STATUS_KEY,
		);
		const statusLine = statusEntries
			.sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
			.map(([, text]) => sanitizeStatusText(text))
			.join(" ");
		if (!this.state.smallMode) {
			return statusLine
				? [locationLine, truncateToWidth(statusLine, width, ellipsis)]
				: [locationLine];
		}
		const thinkingLevel = this.pi.getThinkingLevel();
		const thinkingLine = truncateToWidth(
			`${modelLabel(this.ctx)} · think ${this.theme.fg(THINKING_THEME_TOKENS[thinkingLevel], `\u001B[1m${thinkingLevel}\u001B[22m`)}`,
			width,
			ellipsis,
		);
		const usageLine = truncateToWidth(usageLabel(this.ctx).trim(), width, ellipsis);
		return statusLine
			? [
				thinkingLine,
				usageLine,
				locationLine,
				truncateToWidth(statusLine, width, ellipsis),
			]
			: [thinkingLine, usageLine, locationLine];
	}

	invalidate(): void {}
}

class OsdyWorkingWidget implements Component {
	private readonly state: WorkingWidgetState;
	private readonly theme: SimpleTheme;

	constructor(state: WorkingWidgetState, theme: SimpleTheme) {
		this.state = state;
		this.theme = theme;
	}

	render(width: number): string[] {
		if (!this.state.active) return [];
		const frame =
			WORKING_SPINNER_FRAMES[this.state.frame % WORKING_SPINNER_FRAMES.length] ??
			WORKING_SPINNER_FRAMES[0] ??
			"⠋";
		const line = `${this.theme.fg("accent", frame)} ${this.theme.fg("muted", this.state.label)}`;
		return [fitCenterVisible(line, width)];
	}

	invalidate(): void {}
}

export function createHeaderComponent(
	_pi: ExtensionAPI,
	_ctx: ExtensionContext,
	state: OsdyState,
) {
	return (_tui: TUI, theme: SimpleTheme) => {
		state.tui = _tui;
		let frame = 0;
		let animationComplete = false;
		const animationMode = asciiAnimationMode();
		const animateAscii = animationMode !== "off";
		const timer = animateAscii
			? setInterval(() => {
					frame += 1;
					if (animationMode === "intro" && frame >= INTRO_ANIMATION_FRAMES) {
						animationComplete = true;
						clearInterval(timer);
					}
					_tui.requestRender();
				}, ANIMATION_INTERVAL_MS)
			: undefined;
		return {
			render(width: number): string[] {
				const animationStyle =
					animateAscii && !animationComplete ? "animated" : "static";
				const variant = HEADER_VARIANTS[state.headerVariant];
				const terminalColumns = Math.max(1, _tui.terminal.columns);
				const terminalRows = Math.max(1, _tui.terminal.rows);
				const mascotSource = variant.mascot ?? [];
				const mascotMapSource = variant.mascotMap ?? [];
				const hasMascot = mascotSource.length > 0 && mascotMapSource.length > 0;
				const fullHeaderWidth = headerWidth(state.headerVariant);
				const canUseFullHeader = !isSmallResponsiveMode(
					state.headerVariant,
					terminalColumns,
					terminalRows,
				);
				const mascotWidthBudget = canUseFullHeader
					? Math.max(1, width - fullHeaderWidth - MASCOT_GAP)
					: compactMascotWidthBudget(width);
				const mascotArt = hasMascot
					? scaleMascot(
							{ mascot: mascotSource, toneMap: mascotMapSource },
							mascotWidthBudget,
							terminalRows,
						)
					: { mascot: [], toneMap: [] };
				const mascotLines = mascotArt.mascot.map((line, index) => {
					const toneLine = mascotArt.toneMap[index];
					if (toneLine && variant.mascotTonePalette) {
						return animateAsciiLineWithToneMap(
							line,
							toneLine,
							index,
							frame,
							theme,
							variant.mascotTonePalette,
							animationStyle,
						);
					}
					return animateAsciiLine(
						line,
						index,
						frame,
						theme,
						variant.mascotPalette.baseColor,
						variant.mascotPalette.highlightColor,
						variant.mascotPalette.trailColor,
						animationStyle,
					);
				});
				if (!canUseFullHeader) {
					return mascotLines.map((line) => fitCenterVisible(line, width));
				}
				const logoLines = variant.header.map((line, index) => {
					const toneLine = variant.headerMap?.[index];
					if (toneLine && variant.headerTonePalette) {
						return animateAsciiLineWithToneMap(
							line,
							toneLine,
							index,
							frame,
							theme,
							variant.headerTonePalette,
							animationStyle,
						);
					}
					const palette = variant.linePalette(index);
					return animateAsciiLine(
						line,
						index,
						frame,
						theme,
						palette.baseColor,
						palette.highlightColor,
						palette.trailColor,
						animationStyle,
					);
				});
				const scaledMascotWidth = mascotArt.mascot.reduce(
					(maximum, line) => Math.max(maximum, visibleWidth(line)),
					0,
				);
				return composeSideBySide(
					mascotLines,
					scaledMascotWidth,
					logoLines,
					width,
					fullHeaderWidth,
				);
			},
			invalidate() {},
			dispose() {
				if (timer) clearInterval(timer);
			},
		};
	};
}

export function createFooterComponent(
	pi: ExtensionAPI,
	ctx: ExtensionContext,
	state: OsdyState,
	footerData: ReadonlyFooterDataProvider,
	theme: SimpleTheme,
): Component {
	return new OsdyFooter(pi, ctx, state, footerData, theme);
}

export function createWorkingWidgetFactory(workingState: WorkingWidgetState) {
	return (tui: TUI, theme: SimpleTheme): Component => {
		workingState.tui = tui;
		return new OsdyWorkingWidget(workingState, theme);
	};
}

export function createEditorComponent(
	pi: ExtensionAPI,
	ctx: ExtensionContext,
): (
	tui: TUI,
	theme: EditorTheme,
	keybindings: KeybindingsManager,
) => CustomEditor {
	class OsdyEditor extends CustomEditor {
		private readonly tuiRef: TUI;

		constructor(
			tuiRef: TUI,
			theme: EditorTheme,
			keybindings: KeybindingsManager,
		) {
			super(tuiRef, theme, keybindings, { paddingX: 1 });
			this.tuiRef = tuiRef;
		}

		override render(width: number): string[] {
			if (width < 4 || this.isShowingAutocomplete()) return super.render(width);
			const editorWidth = width;
			const innerWidth = Math.max(1, editorWidth - 2);
			const lines = super.render(innerWidth);
			if (lines.length < 2) return lines;
			let bottomIndex = Math.max(1, lines.length - 1);
			const target = internalLineTarget(this.tuiRef);
			const internalLines = bottomIndex - 1;
			if (internalLines < target) {
				const blank = " ".repeat(innerWidth);
				const added = Array.from({ length: target - internalLines }, () => blank);
				lines.splice(bottomIndex, 0, ...added);
				bottomIndex += added.length;
			}
			const borderColor = (text: string) => this.borderColor(text);
			const side = borderColor("│");
			for (let index = 1; index < bottomIndex; index += 1) {
				const content = truncateToWidth(lines[index] ?? "", innerWidth, "");
				const padding = " ".repeat(Math.max(0, innerWidth - visibleWidth(content)));
				lines[index] = `${side}${content}${padding}${side}`;
			}
			const topLeft = ctx.ui.theme.fg("mdLink", " Osdy-Pi ");
			const topRight = ctx.ui.theme.fg(
				"muted",
				` ${modelLabel(ctx)} · think ${pi.getThinkingLevel()} `,
			);
			const bottomLeft = ctx.ui.theme.fg("muted", usageLabel(ctx));
			lines[0] = `${borderColor("╭")}${fitBorder(topLeft, topRight, editorWidth - 2, borderColor)}${borderColor("╮")}`;
			lines[bottomIndex] =
				`${borderColor("╰")}${fitBorder(bottomLeft, "", editorWidth - 2, borderColor)}${borderColor("╯")}`;
			return lines;
		}
	}

	return (tui, theme, keybindings) => new OsdyEditor(tui, theme, keybindings);
}

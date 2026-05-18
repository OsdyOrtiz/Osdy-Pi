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
	HEADER_FALLBACK,
	HEADER_VARIANTS,
	INTRO_ANIMATION_FRAMES,
	MASCOT_GAP,
	MASCOT_MIN_ROWS,
	mascotWidth,
	WORKING_SPINNER_FRAMES,
} from "./constants.js";
import { formatPath } from "./format.js";
import {
	modelLabel,
	renderHeaderMetadata,
	renderMetaRows,
	usageLabel,
} from "./metrics.js";
import type { OsdyState, SimpleTheme, WorkingWidgetState } from "./types.js";
import {
	composeSideBySide,
	fitCenterVisible,
	internalLineTarget,
	sanitizeStatusText,
} from "./utils.js";

class OsdyFooter implements Component {
	private readonly ctx: ExtensionContext;
	private readonly footerData: ReadonlyFooterDataProvider;
	private readonly theme: SimpleTheme;

	constructor(
		ctx: ExtensionContext,
		footerData: ReadonlyFooterDataProvider,
		theme: SimpleTheme,
	) {
		this.ctx = ctx;
		this.footerData = footerData;
		this.theme = theme;
	}

	render(width: number): string[] {
		let location = formatPath(this.ctx.cwd);
		const branch = this.footerData.getGitBranch?.();
		if (branch) location = `${location} (${branch})`;
		const locationLine = truncateToWidth(
			this.theme.fg("dim", location),
			width,
			this.theme.fg("dim", "..."),
		);
		const statuses = this.footerData.getExtensionStatuses?.() ?? new Map();
		const statusEntries = Array.from(statuses.entries());
		const statusLine = statusEntries
			.sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
			.map(([, text]) => sanitizeStatusText(text))
			.join(" ");
		return statusLine
			? [
					locationLine,
					truncateToWidth(statusLine, width, this.theme.fg("dim", "...")),
				]
			: [locationLine];
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
			WORKING_SPINNER_FRAMES[
				this.state.frame % WORKING_SPINNER_FRAMES.length
			] ??
			WORKING_SPINNER_FRAMES[0] ??
			"⠋";
		const line = `${this.theme.fg("accent", frame)} ${this.theme.fg("muted", this.state.label)}`;
		return [fitCenterVisible(line, width)];
	}

	invalidate(): void {}
}

export function createHeaderComponent(
	pi: ExtensionAPI,
	ctx: ExtensionContext,
	state: OsdyState,
) {
	return (_tui: TUI, theme: SimpleTheme) => {
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
				const fullHeaderWidth = headerWidth(state.headerVariant);
				const canUseFullHeader =
					width >= fullHeaderWidth &&
					(variant.minRowsForFull === undefined ||
						_tui.terminal.rows >= variant.minRowsForFull);
				const mascotLinesSource = variant.mascot ?? [];
				const mascotToneMap = variant.mascotMap ?? [];
				const fullMascotWidth = mascotWidth(state.headerVariant);
				const showMascot =
					canUseFullHeader &&
					mascotLinesSource.length > 0 &&
					_tui.terminal.rows >= MASCOT_MIN_ROWS &&
					width >= fullMascotWidth + MASCOT_GAP + fullHeaderWidth;
				const headerLines = canUseFullHeader
					? [...variant.header]
					: [...(variant.fallbackHeader ?? HEADER_FALLBACK)];
				const headerToneMap = canUseFullHeader ? (variant.headerMap ?? []) : [];
				const metadataRows = renderHeaderMetadata(pi, ctx, state, width);
				const logoLines = headerLines.map((line, index) => {
					const toneLine = headerToneMap[index];
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
					const palette = canUseFullHeader
						? variant.linePalette(index)
						: (variant.fallbackLinePalette?.(index) ??
							variant.linePalette(index));
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
				const mascotLines = mascotLinesSource.map((line, index) => {
					const toneLine = mascotToneMap[index];
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
				const headerBlock = showMascot
					? composeSideBySide(
							mascotLines,
							fullMascotWidth,
							logoLines,
							width,
							fullHeaderWidth,
						)
					: logoLines.map((line) => fitCenterVisible(line, width));
				return [
					"",
					...headerBlock,
					"",
					...renderMetaRows(metadataRows, width, theme),
					"",
				];
			},
			invalidate() {},
			dispose() {
				if (timer) clearInterval(timer);
			},
		};
	};
}

export function createFooterComponent(
	ctx: ExtensionContext,
	footerData: ReadonlyFooterDataProvider,
	theme: SimpleTheme,
): Component {
	return new OsdyFooter(ctx, footerData, theme);
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
				const added = Array.from(
					{ length: target - internalLines },
					() => blank,
				);
				lines.splice(bottomIndex, 0, ...added);
				bottomIndex += added.length;
			}
			const borderColor = (text: string) => this.borderColor(text);
			const side = borderColor("│");
			for (let index = 1; index < bottomIndex; index += 1) {
				const content = truncateToWidth(lines[index] ?? "", innerWidth, "");
				const padding = " ".repeat(
					Math.max(0, innerWidth - visibleWidth(content)),
				);
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

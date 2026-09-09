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
import { formatContextUsage } from "./context-usage-ui.js";
import {
	renderCompactCodexQuotaBars,
	resolveCodexUsageLayout,
} from "./codex-usage-ui.js";
import {
	ANIMATION_INTERVAL_MS,
	COMPACT_HEADER_HIDDEN_COLUMNS,
	headerWidth,
	HEADER_VARIANTS,
	INTRO_ANIMATION_FRAMES,
	MASCOT_GAP,
	mascotWidthForRows,
	scaleHeader,
	scaleMascot,
	STACKED_CONTENT_MAX_ROWS,
	STACKED_HEADER_MAX_ROWS,
	STACKED_HEADER_MIN_ROWS,
	type ScaledHeaderArt,
	WORKING_SPINNER_FRAMES,
} from "./constants.js";
import { formatPath } from "./format.js";
import { contextUsageData, modelLabel } from "./metrics.js";
import {
	formatModelMetadata,
	resolveActiveProfileLabel,
	resolveEditorTitleLabel,
} from "./profile-label.js";
import {
	shouldShowFooterMetadata,
	type HeaderVariant,
	type OsdyState,
	type SimpleTheme,
	type WorkingWidgetState,
} from "./types.js";
import {
	compactMascotWidthBudget,
	composeSideBySide,
	fitCenterVisible,
	internalLineTarget,
	sanitizeStatusText,
} from "./utils.js";

const THINKING_THEME_TOKENS = {
	off: "thinkingOff",
	minimal: "thinkingMinimal",
	low: "thinkingLow",
	medium: "thinkingMedium",
	high: "thinkingHigh",
	xhigh: "thinkingXhigh",
	max: "thinkingXhigh",
} satisfies Record<ReturnType<ExtensionAPI["getThinkingLevel"]>, string>;

const PI_LENS_STATUS_KEY = "pi-lens-lsp";

function stackedHeaderRowBudget(terminalRows: number): number {
	const contentRows = Math.min(terminalRows, STACKED_CONTENT_MAX_ROWS);
	return Math.min(STACKED_HEADER_MAX_ROWS, Math.floor(contentRows / 3));
}

type HeaderLayout = {
	canUseFullHeader: boolean;
	hasMascot: boolean;
	compactHeader: ScaledHeaderArt | undefined;
	fullHeaderWidth: number;
	mascotRowBudget: number;
	mascotWidthBudget: number;
	renderWidth: number;
};

type HeaderConfig = (typeof HEADER_VARIANTS)[HeaderVariant];

function calculateHeaderLayout(
	variantName: HeaderVariant,
	variant: HeaderConfig,
	width: number,
	terminalColumns: number,
	terminalRows: number,
): HeaderLayout {
	const renderWidth = Math.max(1, width);
	const fullHeaderWidth = headerWidth(variantName);
	const mascotArt = {
		mascot: variant.mascot ?? [],
		toneMap: variant.mascotMap ?? [],
	};
	const hasMascot = mascotArt.mascot.length > 0 && mascotArt.toneMap.length > 0;
	const heightLimitedMascotWidth = hasMascot
		? mascotWidthForRows(mascotArt, terminalRows)
		: 0;
	const canUseFullHeader =
		hasMascot &&
		renderWidth >= fullHeaderWidth + MASCOT_GAP + heightLimitedMascotWidth &&
		terminalRows >= variant.header.length;
	const canShowCompactHeader =
		!canUseFullHeader &&
		terminalColumns >= COMPACT_HEADER_HIDDEN_COLUMNS &&
		renderWidth >= COMPACT_HEADER_HIDDEN_COLUMNS;
	const compactHeaderRows = stackedHeaderRowBudget(terminalRows);
	const compactHeader =
		canShowCompactHeader && compactHeaderRows >= STACKED_HEADER_MIN_ROWS
			? scaleHeader(variantName, renderWidth, compactHeaderRows)
			: undefined;
	const contentRowBudget = Math.min(terminalRows, STACKED_CONTENT_MAX_ROWS);
	return {
		canUseFullHeader,
		hasMascot,
		compactHeader,
		fullHeaderWidth,
		mascotRowBudget: canUseFullHeader
			? terminalRows
			: Math.max(1, contentRowBudget - (compactHeader?.header.length ?? 0)),
		mascotWidthBudget: canUseFullHeader
			? Math.max(1, renderWidth - fullHeaderWidth - MASCOT_GAP)
			: compactMascotWidthBudget(renderWidth),
		renderWidth,
	};
}

function renderMascotLines(
	variant: HeaderConfig,
	mascotArt: ReturnType<typeof scaleMascot>,
	frame: number,
	theme: SimpleTheme,
	animationStyle: "animated" | "static",
): string[] {
	return mascotArt.mascot.map((line, index) => {
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
}

function renderHeaderLines(
	variant: HeaderConfig,
	header: readonly string[],
	toneMap: readonly string[] | undefined,
	sourceIndexes: readonly number[],
	frame: number,
	theme: SimpleTheme,
	animationStyle: "animated" | "static",
): string[] {
	return header.map((line, index) => {
		const sourceIndex = sourceIndexes[index] ?? index;
		const toneLine = toneMap?.[index];
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
		const palette = variant.linePalette(sourceIndex);
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
}

function renderResponsiveHeader(
	state: OsdyState,
	width: number,
	terminalColumns: number,
	terminalRows: number,
	frame: number,
	theme: SimpleTheme,
	animationStyle: "animated" | "static",
): string[] {
	const variant = HEADER_VARIANTS[state.headerVariant];
	const layout = calculateHeaderLayout(
		state.headerVariant,
		variant,
		width,
		terminalColumns,
		terminalRows,
	);
	const mascotArt = layout.hasMascot
		? scaleMascot(
				{ mascot: variant.mascot ?? [], toneMap: variant.mascotMap ?? [] },
				layout.mascotWidthBudget,
				layout.mascotRowBudget,
			)
		: { mascot: [], toneMap: [] };
	const mascotLines = renderMascotLines(
		variant,
		mascotArt,
		frame,
		theme,
		animationStyle,
	);
	if (!layout.canUseFullHeader && !layout.compactHeader) {
		return mascotLines.map((line) => fitCenterVisible(line, layout.renderWidth));
	}
	const headerArt = layout.compactHeader;
	const logoLines = layout.canUseFullHeader
		? renderHeaderLines(
				variant,
				variant.header,
				variant.headerMap,
				variant.header.map((_line, index) => index),
				frame,
				theme,
				animationStyle,
			)
		: renderHeaderLines(
				variant,
				headerArt?.header ?? [],
				headerArt?.toneMap,
				headerArt?.sourceIndexes ?? [],
				frame,
				theme,
				animationStyle,
			);
	if (!layout.canUseFullHeader) {
		return [...mascotLines, ...logoLines].map((line) =>
			fitCenterVisible(line, layout.renderWidth),
		);
	}
	const scaledMascotWidth = mascotArt.mascot.reduce(
		(maximum, line) => Math.max(maximum, visibleWidth(line)),
		0,
	);
	return composeSideBySide(
		mascotLines,
		scaledMascotWidth,
		logoLines,
		layout.renderWidth,
		layout.fullHeaderWidth,
	);
}

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
		if (!shouldShowFooterMetadata(this.state.editorEffective)) {
			return statusLine
				? [locationLine, truncateToWidth(statusLine, width, ellipsis)]
				: [locationLine];
		}
		const thinkingLevel = this.pi.getThinkingLevel();
		const baseMetadata = formatModelMetadata(
			modelLabel(this.ctx),
			this.theme.fg(
				THINKING_THEME_TOKENS[thinkingLevel],
				`\u001B[1m${thinkingLevel}\u001B[22m`,
			),
			resolveActiveProfileLabel(),
		);
		const cachedCodexUsage =
			this.state.codexUsage.kind === "idle"
				? undefined
				: this.state.codexUsage.snapshot;
		const codexSnapshot =
			this.ctx.model?.provider === "openai-codex" ? cachedCodexUsage : undefined;
		const thinkingLine = truncateToWidth(baseMetadata, width, ellipsis);
		const quotaLines = codexSnapshot
			? renderCompactCodexQuotaBars(this.theme, codexSnapshot, width)
			: [];
		const usageLine = truncateToWidth(
			formatContextUsage(this.theme, contextUsageData(this.ctx), width),
			width,
			ellipsis,
		);
		const lines = [thinkingLine, ...quotaLines, usageLine, locationLine];
		return statusLine
			? [...lines, truncateToWidth(statusLine, width, ellipsis)]
			: lines;
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
				return renderResponsiveHeader(
					state,
					width,
					Math.max(1, _tui.terminal.columns),
					Math.max(1, _tui.terminal.rows),
					frame,
					theme,
					animationStyle,
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
	state: OsdyState,
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
			const topLeft = ctx.ui.theme.fg(
				"mdLink",
				` ${resolveEditorTitleLabel(resolveActiveProfileLabel())} `,
			);
			const cachedCodexUsage =
				state.codexUsage.kind === "idle" ? undefined : state.codexUsage.snapshot;
			const codexSnapshot =
				ctx.model?.provider === "openai-codex" ? cachedCodexUsage : undefined;
			const thinkingLevel = pi.getThinkingLevel();
			const modelAndThinking = `${modelLabel(ctx)} · think ${ctx.ui.theme.bold(thinkingLevel)}`;
			const layout = resolveCodexUsageLayout(topLeft, ` ${modelAndThinking} `);
			const topRight = ctx.ui.theme.fg("muted", layout.topRight);
			const bottomLeft = formatContextUsage(
				ctx.ui.theme,
				contextUsageData(ctx),
				innerWidth,
			);
			lines[0] = `${borderColor("╭")}${fitBorder(topLeft, topRight, editorWidth - 2, borderColor)}${borderColor("╮")}`;
			lines[bottomIndex] =
				`${borderColor("╰")}${fitBorder(bottomLeft, "", editorWidth - 2, borderColor)}${borderColor("╯")}`;
			const quotaLines = codexSnapshot
				? renderCompactCodexQuotaBars(ctx.ui.theme, codexSnapshot, editorWidth)
				: [];
			return [...lines, ...quotaLines];
		}
	}

	return (tui, theme, keybindings) => new OsdyEditor(tui, theme, keybindings);
}

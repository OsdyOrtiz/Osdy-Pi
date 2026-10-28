import { readFileSync } from "node:fs";
import {
	CustomEditor,
	type ExtensionAPI,
	type ExtensionContext,
	type KeybindingsManager,
	type ReadonlyFooterDataProvider,
} from "@earendil-works/pi-coding-agent";
import {
	type Component,
	type TuiMouseEvent,
	type TuiMouseEventResult,
	type EditorTheme,
	type TUI,
	truncateToWidth,
	visibleWidth,
	wrapTextWithAnsi,
} from "@earendil-works/pi-tui";
import {
	animateAsciiLine,
	animateAsciiLineWithToneMap,
	asciiAnimationMode,
} from "./animation.js";
import { fitBorder } from "./border.js";
import {
	companionLayout,
	composeWithCompanion,
	renderCompanionBox,
	resolveMascotPose,
	shouldShowCompanion,
} from "./companion-panel.js";
import { companionWorkspace, type CompanionWorkspace, type WorkspaceMouseTarget, type WorkspaceLayout } from "./companion-workspace.js";
import { formatContextUsage } from "./context-usage-ui.js";
import {
	renderCompactCodexQuotaBars,
	resolveCodexUsageLayout,
} from "./codex-usage-ui.js";
import {
	ANIMATION_INTERVAL_MS,
	headerWidth,
	HEADER_VARIANTS,
	INTRO_ANIMATION_FRAMES,
	MASCOT_GAP,
	mascotForChoice,
	mascotWidthForRows,
	scaleMascot,
	STACKED_CONTENT_MAX_ROWS,
	type MascotConfig,
} from "./constants.js";
import { formatPath } from "./format.js";
import { renderPixelHeader } from "./header-slanted.js";
import { PI_WAVE_TICKS, piMascotWidthForRows, piWaveFrameAt, renderPiMascot } from "./pixel-mascot.js";
import { renderWorkingWidget } from "./working-animation.js";
import { contextUsageData, modelLabel } from "./metrics.js";
import {
	formatModelMetadata,
	resolveActiveProfileLabel,
	resolveEditorTitleLabel,
} from "./profile-label.js";
import {
	isTextMascotChoice,
	shouldShowFooterMetadata,
	type HeaderVariant,
	type MascotChoice,
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

/** Read only this installed package, never the workspace or Pi host manifest. */
export function loadInstalledPackageVersion(
	readManifest: (url: URL) => string = (url) => readFileSync(url, "utf8"),
): string | undefined {
	try {
		const manifest: unknown = JSON.parse(
			readManifest(new URL("../../package.json", import.meta.url)),
		);
		if (typeof manifest !== "object" || manifest === null ||
			!("name" in manifest) || manifest.name !== "osdy-pi" ||
			!("version" in manifest) || typeof manifest.version !== "string") return undefined;
		const version = manifest.version;
		// SemVer's ASCII grammar also excludes terminal controls and whitespace.
		const numeric = "(?:0|[1-9][0-9]*)";
		const prerelease = `(?:${numeric}|[0-9]*[A-Za-z-][0-9A-Za-z-]*)`;
		const semver = new RegExp(`^${numeric}\\.${numeric}\\.${numeric}(?:-${prerelease}(?:\\.${prerelease})*)?(?:\\+[0-9A-Za-z-]+(?:\\.[0-9A-Za-z-]+)*)?$`);
		return version.length <= 128 && semver.test(version) && !/\s/u.test(version)
			? version : undefined;
	} catch {
		return undefined;
	}
}

/** Decorate only empty space; the centered artwork remains byte-for-byte intact. */
export function decorateHeaderVersion(
	lines: readonly string[],
	width: number,
	version: string | undefined,
	theme?: Pick<SimpleTheme, "fg">,
): string[] {
	if (!version || !Number.isFinite(width)) return [...lines];
	const label = `osdy-pi v${version}`;
	const padding = Math.floor(width) - visibleWidth(label);
	if (padding < 0) return [...lines];
	const row = `${" ".repeat(padding)}${theme ? theme.fg("accent", label) : label}`;
	const firstRow = (lines[0] ?? "").replace(
		new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, "g"), "",
	);
	return lines.length > 0 && firstRow.trim() === ""
		? [row, ...lines.slice(1)] : [row, ...lines];
}

type HeaderLayout = {
	canUseFullHeader: boolean;
	hasMascot: boolean;
	fullHeaderWidth: number;
	mascotRowBudget: number;
	mascotWidthBudget: number;
	renderWidth: number;
};

type HeaderConfig = (typeof HEADER_VARIANTS)[HeaderVariant];

/** What the responsive header needs from a mascot, whether text art or pixel art. */
type HeaderMascot = {
	widthForRows(rows: number): number;
	render(
		widthBudget: number,
		rowBudget: number,
		frame: number,
		theme: SimpleTheme,
		animationStyle: "animated" | "static",
		waveFrame?: number,
	): string[];
};

function headerMascotFor(choice: MascotChoice): HeaderMascot {
	if (!isTextMascotChoice(choice)) {
		return {
			widthForRows: piMascotWidthForRows,
			render: (widthBudget, rowBudget, frame, theme, animationStyle, waveFrame) =>
				renderPiMascot(widthBudget, rowBudget, { frame, theme, style: animationStyle, waveFrame }),
		};
	}
	const mascot = mascotForChoice(choice);
	const hasArt = mascot.art.mascot.length > 0 && mascot.art.toneMap.length > 0;
	return {
		widthForRows: (rows) => hasArt ? mascotWidthForRows(mascot.art, rows) : 0,
		render: (widthBudget, rowBudget, frame, theme, animationStyle) => hasArt
			? renderMascotLines(
				mascot,
				scaleMascot(mascot.art, widthBudget, rowBudget),
				frame,
				theme,
				animationStyle,
			)
			: [],
	};
}

function calculateHeaderLayout(
	variantName: HeaderVariant,
	variant: HeaderConfig,
	mascot: HeaderMascot,
	width: number,
	terminalRows: number,
): HeaderLayout {
	const renderWidth = Math.max(1, width);
	const fullHeaderWidth = headerWidth(variantName);
	const heightLimitedMascotWidth = mascot.widthForRows(terminalRows);
	const hasMascot = heightLimitedMascotWidth > 0;
	const canUseFullHeader =
		hasMascot &&
		renderWidth >= fullHeaderWidth + MASCOT_GAP + heightLimitedMascotWidth &&
		terminalRows >= variant.header.length;
	const contentRowBudget = Math.min(terminalRows, STACKED_CONTENT_MAX_ROWS);
	return {
		canUseFullHeader,
		hasMascot,
		fullHeaderWidth,
		mascotRowBudget: canUseFullHeader
			? terminalRows
			: Math.max(1, contentRowBudget),
		mascotWidthBudget: canUseFullHeader
			? Math.max(1, renderWidth - fullHeaderWidth - MASCOT_GAP)
			: compactMascotWidthBudget(renderWidth),
		renderWidth,
	};
}

function renderMascotLines(
	mascot: MascotConfig,
	mascotArt: ReturnType<typeof scaleMascot>,
	frame: number,
	theme: SimpleTheme,
	animationStyle: "animated" | "static",
): string[] {
	return mascotArt.mascot.map((line, index) => {
		const toneLine = mascotArt.toneMap[index];
		if (toneLine) {
			return animateAsciiLineWithToneMap(
				line,
				toneLine,
				index,
				frame,
				theme,
				mascot.tonePalette,
				animationStyle,
			);
		}
		return animateAsciiLine(
			line,
			index,
			frame,
			theme,
			"accent",
			"mdHeading",
			"mdLink",
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
	terminalRows: number,
	frame: number,
	theme: SimpleTheme,
	animationStyle: "animated" | "static",
	waveFrame?: number,
): string[] {
	const variant = HEADER_VARIANTS[state.headerVariant];
	const mascot = headerMascotFor(state.mascot);
	const layout = calculateHeaderLayout(
		state.headerVariant,
		variant,
		mascot,
		width,
		terminalRows,
	);
	const mascotLines = layout.hasMascot
		? mascot.render(layout.mascotWidthBudget, layout.mascotRowBudget, frame, theme, animationStyle, waveFrame)
		: [];
	if (!layout.canUseFullHeader) {
		return mascotLines.map((line) => fitCenterVisible(line, layout.renderWidth));
	}
	// Pixel headers cannot be scaled: they render whole here, or the layout above fell back to the mascot alone.
	const logoLines = variant.pixelHeader
		? renderPixelHeader(variant.pixelHeader, frame, theme, animationStyle)
		: renderHeaderLines(
			variant,
			variant.header,
			variant.headerMap,
			variant.header.map((_line, index) => index),
			frame,
			theme,
			animationStyle,
		);
	const scaledMascotWidth = mascotLines.reduce(
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
	private readonly workspace: CompanionWorkspace;
	private readonly location: Component;
	private readonly statuses: Component;

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
		this.workspace = companionWorkspace(ctx.ui);
		this.location = { render: width => [this.renderLocation(width)], invalidate() {} };
		this.workspace.location = this.location;
		this.statuses = { render: width => {
			const text = this.renderStatuses();
			return text ? wrapTextWithAnsi(text, width) : [];
		}, invalidate() {} };
		this.workspace.statuses = this.statuses;
	}

	private renderLocation(width: number): string {
		const ellipsis = this.theme.fg("dim", "...");
		let location = formatPath(this.ctx.cwd);
		const branch = this.footerData.getGitBranch?.();
		if (branch) location = `${location} (${branch})`;
		return truncateToWidth(this.theme.fg("dim", location), width, ellipsis);
	}

	private renderStatuses(): string {
		const statuses = this.footerData.getExtensionStatuses?.() ?? new Map();
		const statusEntries = Array.from(statuses.entries()).filter(
			([key]) => !this.state.smallMode || key !== PI_LENS_STATUS_KEY,
		);
		return statusEntries
			.sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
			.map(([, text]) => sanitizeStatusText(text))
			.join(" ");
	}

	render(width: number): string[] {
		const ellipsis = this.theme.fg("dim", "...");
		const shared = this.workspace.available(width);
		const locationLines = shared ? [] : [this.renderLocation(width)];
		const statusLine = shared ? "" : this.renderStatuses();
		if (!shouldShowFooterMetadata(this.state.editorEffective)) {
			return statusLine
				? [...locationLines, truncateToWidth(statusLine, width, ellipsis)]
				: locationLines;
		}
		const thinkingLevel = this.pi.getThinkingLevel();
		const activeProfile = resolveActiveProfileLabel();
		const baseMetadata = formatModelMetadata(
			modelLabel(this.ctx),
			this.theme.fg(
				THINKING_THEME_TOKENS[thinkingLevel],
				`\u001B[1m${thinkingLevel}\u001B[22m`,
			),
			activeProfile ? this.theme.fg("accent", activeProfile) : undefined,
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
			formatContextUsage(this.theme, { ...contextUsageData(this.ctx), generation: this.state.generation }, width),
			width,
			ellipsis,
		);
		const lines = [thinkingLine, ...quotaLines, usageLine, ...locationLines];
		return statusLine
			? [...lines, truncateToWidth(statusLine, width, ellipsis)]
			: lines;
	}

	invalidate(): void {}

	dispose(): void {
		if (this.workspace.location === this.location) this.workspace.location = undefined;
		if (this.workspace.statuses === this.statuses) this.workspace.statuses = undefined;
	}
}

class OsdyWorkingWidget implements Component {
	private readonly state: WorkingWidgetState;
	private readonly theme: SimpleTheme;

	constructor(state: WorkingWidgetState, theme: SimpleTheme) {
		this.state = state;
		this.theme = theme;
	}

	render(width: number): string[] {
		return renderWorkingWidget(this.state, this.theme, width);
	}

	invalidate(): void {}
}

/** The intro runs until both the glow intro and, for the pi mascot, its startup wave are done. */
function introFramesFor(choice: MascotChoice): number {
	return isTextMascotChoice(choice) ? INTRO_ANIMATION_FRAMES : Math.max(INTRO_ANIMATION_FRAMES, PI_WAVE_TICKS);
}

export function createHeaderComponent(
	_pi: ExtensionAPI,
	_ctx: ExtensionContext,
	state: OsdyState,
) {
	return (_tui: TUI, theme: SimpleTheme) => {
		state.tui = _tui;
		const installedVersion = loadInstalledPackageVersion();
		let frame = 0;
		let animationComplete = false;
		const animationMode = asciiAnimationMode();
		const animateAscii = animationMode !== "off";
		const timer = animateAscii
			? setInterval(() => {
					frame += 1;
					if (animationMode === "intro" && frame >= introFramesFor(state.mascot)) {
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
				const waveFrame = animateAscii && !animationComplete && state.mascot === "pi"
					? piWaveFrameAt(frame)
					: undefined;
				const lines = renderResponsiveHeader(
					state,
					width,
					Math.max(1, _tui.terminal.rows),
					frame,
					theme,
					animationStyle,
					waveFrame,
				);
				return decorateHeaderVersion(lines, width, installedVersion, theme);
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

export function createWorkingWidgetFactory(workingState: WorkingWidgetState, workspace?: CompanionWorkspace) {
	return (tui: TUI, theme: SimpleTheme): Component => {
		workingState.tui = tui;
		const component = new OsdyWorkingWidget(workingState, theme);
		return workspace?.wrap("working", component) ?? component;
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
	const workspace = companionWorkspace(ctx.ui);
	class OsdyEditor extends CustomEditor {
		private readonly tuiRef: TUI;
		private mouseLayout: { width: number; editorY: number; editorHeight: number; panels: WorkspaceMouseTarget[] } | undefined;

		constructor(
			tuiRef: TUI,
			theme: EditorTheme,
			keybindings: KeybindingsManager,
		) {
			super(tuiRef, theme, keybindings, { paddingX: 1 });
			this.tuiRef = tuiRef;
			workspace.available = width => this.prepareWorkspace(width) !== undefined;
		}

		private renderQuotaLines(width: number, layout: "compact" | "spaced" = "compact"): string[] {
			const snapshot = state.codexUsage.kind === "idle" ? undefined : state.codexUsage.snapshot;
			return ctx.model?.provider === "openai-codex" && snapshot
				? renderCompactCodexQuotaBars(ctx.ui.theme, snapshot, width, layout) : [];
		}

		/** The same live measurement is used by native wrappers, even before this editor renders. */
		private prepareWorkspace(width: number): { editorWidth: number; panels: WorkspaceLayout } | undefined {
			const style = state.companionStyle ?? "original";
			if (!state.enabled || state.visualsEnabled === false || !state.editorEffective || this.isShowingAutocomplete()
				|| !shouldShowCompanion({ style, enabled: state.companionEnabled !== false,
					smallMode: state.smallMode, width, terminalRows: this.tuiRef.terminal.rows })) return undefined;
			const companion = companionLayout(style);
			const editorWidth = width - companion.columns;
			const editorHeight = Math.max(super.render(editorWidth - 2).length, internalLineTarget(this.tuiRef) + 2);
			const usage: Component = {
				render: width => this.renderQuotaLines(width, "spaced"),
				handleMouse: event => {
					if (this.tuiRef.mode !== "fullscreen" || this.tuiRef.hasOverlay()
						|| event.type !== "click" || event.button !== "left" || !state.openUsage) return undefined;
					void state.openUsage();
					return { handled: true };
				},
				invalidate() {},
			};
			const panels = workspace.render(editorWidth, ctx.ui.theme, usage, companion.boxHeight - editorHeight);
			if (editorHeight + panels.lines.length <= companion.boxHeight) return { editorWidth, panels };
			// Restore native editor hit-test/wrapping metadata after a rejected narrow
			// measurement; below-editor widgets can ask for availability after render.
			super.render(Math.max(1, width - 2));
			return undefined;
		}

		override handleMouse(event: TuiMouseEvent): TuiMouseEventResult | undefined {
			const layout = this.mouseLayout;
			if (!layout) return super.handleMouse(event);
			if (event.x >= layout.width) return undefined; // Companion and gap are not editable.
			for (const panel of layout.panels) {
				if (event.x >= panel.x && event.x < panel.x + panel.width
					&& event.y >= panel.y && event.y < panel.y + panel.height) {
					return panel.component.handleMouse?.({ ...event, x: event.x - panel.x,
						y: event.y - panel.y, width: panel.width, height: panel.height });
				}
			}
			if (event.y < layout.editorY || event.y >= layout.editorY + layout.editorHeight) return undefined;
			// super.render receives the inner width; preserve absolute screen coordinates.
			return super.handleMouse({ ...event, x: Math.max(0, event.x - 1), y: event.y - layout.editorY,
				width: layout.width - 2, height: layout.editorHeight });
		}

		override render(width: number): string[] {
			this.mouseLayout = undefined;
			if (width < 4 || this.isShowingAutocomplete()) return super.render(width);
			const companionStyle = state.companionStyle ?? "original";
			const companion = companionLayout(companionStyle);
			const shared = this.prepareWorkspace(width);
			const editorWidth = shared?.editorWidth ?? width;
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
				"accent",
				` ${resolveEditorTitleLabel(resolveActiveProfileLabel())} `,
			);
			const thinkingLevel = pi.getThinkingLevel();
			const modelAndThinking = `${modelLabel(ctx)} · think ${ctx.ui.theme.bold(thinkingLevel)}`;
			const layout = resolveCodexUsageLayout(topLeft, ` ${modelAndThinking} `);
			const topRight = ctx.ui.theme.fg("muted", layout.topRight);
			const bottomLeft = formatContextUsage(
				ctx.ui.theme,
				{ ...contextUsageData(ctx), generation: state.generation },
				innerWidth,
			);
			lines[0] = `${borderColor("╭")}${fitBorder(topLeft, topRight, editorWidth - 2, borderColor)}${borderColor("╮")}`;
			lines[bottomIndex] =
				`${borderColor("╰")}${fitBorder(bottomLeft, "", editorWidth - 2, borderColor)}${borderColor("╯")}`;
			if (!shared) return [...lines, ...this.renderQuotaLines(editorWidth)];
			const box = renderCompanionBox(
				companionStyle,
				resolveMascotPose(state.working),
				state.working?.frame ?? 0,
				ctx.ui.theme,
			);
			const panels = shared.panels;
			const topPadding = Math.max(0, box.length - panels.lines.length - lines.length);
			this.mouseLayout = {
				width: editorWidth, editorY: topPadding + panels.lines.length, editorHeight: lines.length,
				panels: panels.targets.map(target => ({ ...target, y: target.y + topPadding })),
			};
			return composeWithCompanion([...panels.lines, ...lines], editorWidth, box, companion.boxWidth);
		}
	}

	return (tui, theme, keybindings) => new OsdyEditor(tui, theme, keybindings);
}

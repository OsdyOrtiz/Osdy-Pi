import {
	CustomEditor,
	VERSION,
	type ExtensionAPI,
	type ExtensionContext,
	type KeybindingsManager,
} from "@earendil-works/pi-coding-agent";
import {
	truncateToWidth,
	visibleWidth,
	type Component,
	type EditorTheme,
	type TUI,
} from "@earendil-works/pi-tui";

const THEME_NAME = "osdy-pi-dark";
const ANIMATION_ENABLED = true;
const ANIMATION_INTERVAL_MS = 30;
const INTRO_ANIMATION_FRAMES = 28;

type AnimationMode = "off" | "intro" | "continuous";

type OsdyState = {
	enabled: boolean;
	previousThemeName?: string;
	gitLabel: string;
	agentsLabel: string;
};

const MASCOT_MIN_ROWS = 34;
const MASCOT_GAP = 0;

const MASCOT = [
	"                  %%  %%%@@             @@%%% @%%",
	"                 %= --- -=#% @@@@@@@@@%%%-- ----#%",
	"                 %- -*#@ =+**-------:-**- %%#*--#%",
	"                 %- -*#%*-----------------*%#*--#%",
	"                  %+-#*---------------------**-+%",
	"                   %#=--=-  ==-------=   ----=*%",
	"                  %+--  ***** ------  ****   -=*%",
	"                @%%  ****%% %*=-----**% %****# #%%@",
	"               @%# ******%%%%*=--==-**%%%%*****#--%",
	"                %%#*******##*# %%%%  **%#*******%%@",
	"                  %%%#******  %@%%@%   ******#%@%",
	"                     %%%::               ::#%@    %%%%%",
	"                        %%%**::::::::::%%%     %%#-****%%",
	"                       %#---: :   :: ::-=+%%%%%=-::::+*#%",
	"                      %%----- :     ::----*%%%*****-:::#%",
	"                      #*------ :   ::-----**#+-:=+***=-*%",
	"                   %%%+*=+------ ::------+*=+%-:::-*##+%%",
	"                   %*---**-----*  **----+*--=+%=---=*#%",
	"                   %**+==%*----*==%=----##==+*%#+--*%%",
	"                    %%#%#%@+=+++%%++++==%##%#%#%%%%",
	"                ----=+%%%#%%#%*##%###*#%%##%%==---------",
	"                           ##****=*****==",
];
const MASCOT_WIDTH = MASCOT.reduce(
	(maxWidth, line) => Math.max(maxWidth, visibleWidth(line)),
	0,
);

type HeaderMetaRow = {
	leftLabel: string;
	leftValue: string;
	rightLabel: string;
	rightValue: string;
};

const HEADER = [
	"░█████╗░░██████╗██████╗░██╗░░░██╗░░░░░░██████╗░██╗",
	"██╔══██╗██╔════╝██╔══██╗╚██╗░██╔╝░░░░░░██╔══██╗  ║",
	"██║░░██║╚█████╗░██║░░██║░╚████╔╝░█████╗██████╔╝██║",
	"██║░░██║░╚═══██╗██║░░██║░░╚██╔╝░░╚════╝██╔═══╝░██║",
	"╚█████╔╝██████╔╝██████╔╝░░░██║░░░░░░░░░██║░░░░░██║",
	"░╚════╝░╚═════╝░╚═════╝░░░░╚═╝░░░░░░░░░╚═╝░░░░░╚═╝",
	"                                ╭━╮╱╱╱╱╱╱╭╮╱╱╱╱╱╭╮╱╱╱╱╱╭╮╱╱╭╮╭╮╱╱╱╱╭━╮",
	"                                ┃╭╋━┳━━┳━╋╋╮╭━╮╭╯┣━┳┳╮╭╯┣━╮┣╋╯┣━┳━╮┃━┫",
	"                                ┃╰┫╋┃┃┃┃╋┃┃╰┫╋╰┫╋┃╋┃╭╯┃╋┃┻┫┃┃╋┃┻┫╋╰╋━┃",
	"                                ╰━┻━┻┻┻┫╭┻┻━┻━━┻━┻━┻╯╱╰━┻━╯╰┻━┻━┻━━┻━╯",
	"                                ╱╱╱╱╱╱╱╰╯                        </>",
];
const HEADER_WIDTH = HEADER.reduce(
	(maxWidth, line) => Math.max(maxWidth, visibleWidth(line)),
	0,
);
const HEADER_FALLBACK = ["OSDY - PI", "</> Compilador de ideas"];

class OsdyFooter implements Component {
	private readonly ctx: ExtensionContext;
	private readonly footerData: any;
	private readonly theme: { fg(name: string, text: string): string };

	constructor(
		ctx: ExtensionContext,
		footerData: any,
		theme: { fg(name: string, text: string): string },
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
		const statusEntries = Array.from(statuses.entries()) as Array<
			[string, string]
		>;
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

function sanitizeStatusText(text: string): string {
	return text
		.replace(/[\r\n\t]/g, " ")
		.replace(/ +/g, " ")
		.trim();
}

function positiveModulo(value: number, divisor: number): number {
	return ((value % divisor) + divisor) % divisor;
}

function asciiAnimationMode(): AnimationMode {
	if (!ANIMATION_ENABLED) return "off";
	const override = process.env.OSDY_PI_ANIMATION;
	if (override === "1" || override === "on" || override === "continuous")
		return "continuous";
	if (override === "intro") return "intro";
	if (override === "0" || override === "off") return "off";
	return "intro";
}

function animateAsciiLine(
	line: string,
	lineIndex: number,
	frame: number,
	theme: { fg(name: string, text: string): string },
	baseColor: string,
	highlightColor: string,
	trailColor: string,
	animate: boolean,
): string {
	if (!animate) return theme.fg(baseColor, line);
	return [...line]
		.map((char, charIndex) => {
			if (char === " ") return char;
			const wave = positiveModulo(charIndex + lineIndex * 2 - frame * 5, 44);
			const color =
				wave <= 3 ? highlightColor : wave <= 8 ? trailColor : baseColor;
			return theme.fg(color, char);
		})
		.join("");
}

function centerVisible(line: string, width: number): string {
	const leftPad = Math.max(0, Math.floor((width - visibleWidth(line)) / 2));
	return `${" ".repeat(leftPad)}${line}`;
}

function fitCenterVisible(line: string, width: number): string {
	return centerVisible(truncateToWidth(line, Math.max(1, width)), width);
}

function padVisibleRight(line: string, width: number): string {
	return `${line}${" ".repeat(Math.max(0, width - visibleWidth(line)))}`;
}

function composeSideBySide(
	leftLines: string[],
	rightLines: string[],
	width: number,
): string[] {
	const combinedWidth = MASCOT_WIDTH + MASCOT_GAP + HEADER_WIDTH;
	if (width < combinedWidth) return rightLines;
	const leftPad = " ".repeat(
		Math.max(0, Math.floor((width - combinedWidth) / 2)),
	);
	const rows = Math.max(leftLines.length, rightLines.length);
	const topOffset = Math.max(0, Math.floor((rows - rightLines.length) / 2));
	return Array.from({ length: rows }, (_, index) => {
		const left = padVisibleRight(leftLines[index] ?? "", MASCOT_WIDTH);
		const right = rightLines[index - topOffset] ?? "";
		return `${leftPad}${left}${" ".repeat(MASCOT_GAP)}${right}`;
	});
}

function formatPath(cwd: string) {
	const home = process.env.HOME;
	return home && cwd.startsWith(home) ? `~${cwd.slice(home.length)}` : cwd;
}

function truncateMiddle(value: string, maxWidth: number): string {
	if (maxWidth <= 0) return "";
	if (visibleWidth(value) <= maxWidth) return value;
	if (maxWidth <= 3) return truncateToWidth(value, maxWidth);
	const headWidth = Math.max(1, Math.ceil((maxWidth - 1) / 2));
	const tailWidth = Math.max(1, maxWidth - 1 - headWidth);
	const head = truncateToWidth(value, headWidth, "");
	const tail = truncateToWidth([...value].reverse().join(""), tailWidth, "")
		.split("")
		.reverse()
		.join("");
	return `${head}…${tail}`;
}

function shortNumber(value: number): string {
	if (!Number.isFinite(value)) return "0";
	if (Math.abs(value) < 1_000) return Math.round(value).toString();
	if (Math.abs(value) < 1_000_000) return `${(value / 1_000).toFixed(1)}k`;
	return `${(value / 1_000_000).toFixed(1)}m`;
}

function modelLabel(ctx: ExtensionContext): string {
	const model = ctx.model;
	if (!model) return "no model";
	return model.provider ? `${model.provider}/${model.id}` : model.id;
}

function getMcpServerCount(pi: ExtensionAPI): number {
	const serverKeys = new Set<string>();
	for (const tool of pi.getAllTools()) {
		const source = tool.sourceInfo?.source?.toLowerCase() ?? "";
		const path = tool.sourceInfo?.path?.toLowerCase() ?? "";
		if (!tool.name.toLowerCase().includes("mcp") && !source.includes("mcp"))
			continue;
		serverKeys.add(source || path || tool.name);
	}
	return serverKeys.size;
}

function countToolsByOrigin(pi: ExtensionAPI, origin: string): number {
	return pi
		.getAllTools()
		.filter((tool) => tool.sourceInfo?.origin?.toLowerCase() === origin).length;
}

function countToolsBySource(pi: ExtensionAPI, source: string): number {
	return pi
		.getAllTools()
		.filter((tool) => tool.sourceInfo?.source?.toLowerCase().includes(source))
		.length;
}

function renderHeaderMetadata(
	pi: ExtensionAPI,
	ctx: ExtensionContext,
	state: OsdyState,
	width: number,
): HeaderMetaRow[] {
	const activeTools = pi.getActiveTools().length;
	const allTools = pi.getAllTools().length;
	const git = state.gitLabel === "no-git" ? "Not a git repo" : state.gitLabel;
	const path = truncateMiddle(formatPath(ctx.cwd), width < 110 ? 34 : 52);
	const mcpServerCount = getMcpServerCount(pi);
	const pluginCount = countToolsByOrigin(pi, "package");
	const extensionCount = countToolsBySource(pi, "extension");
	return [
		{
			leftLabel: "GIT:",
			leftValue: git,
			rightLabel: "PATH:",
			rightValue: path,
		},
		{
			leftLabel: "MCP:",
			leftValue: `${mcpServerCount} servers`,
			rightLabel: "PLUGINS:",
			rightValue: `${pluginCount} package`,
		},
		{
			leftLabel: "AGENTS:",
			leftValue: `${state.agentsLabel} loaded`,
			rightLabel: "EXTENSIONS:",
			rightValue: `${extensionCount} active`,
		},
		{
			leftLabel: "VER:",
			leftValue: VERSION,
			rightLabel: "TOOLS:",
			rightValue: `${allTools} customs`,
		},
	];
}

function renderMetaRows(
	rows: HeaderMetaRow[],
	width: number,
	theme: { fg(name: string, text: string): string },
): string[] {
	const labelWidth = 11;
	const leftValueWidth = 32;
	const rightValueWidth = 52;
	const gapWidth = 10;
	const blockWidth =
		labelWidth +
		1 +
		leftValueWidth +
		gapWidth +
		labelWidth +
		1 +
		rightValueWidth;
	return rows.map((row) => {
		const leftLabel = theme.fg("mdLink", row.leftLabel.padEnd(labelWidth));
		const leftValue = theme.fg(
			"accent",
			truncateToWidth(row.leftValue, leftValueWidth).padEnd(leftValueWidth),
		);
		const rightLabel = theme.fg("mdLink", row.rightLabel.padEnd(labelWidth));
		const rightValue = theme.fg(
			"accent",
			truncateToWidth(row.rightValue, rightValueWidth).padEnd(rightValueWidth),
		);
		const rowText = `${leftLabel} ${leftValue}${" ".repeat(gapWidth)}${rightLabel} ${rightValue}`;
		return width >= blockWidth
			? centerVisible(rowText, width)
			: fitCenterVisible(rowText, width);
	});
}

function usageLabel(ctx: ExtensionContext): string {
	let input = 0;
	let output = 0;
	let cacheRead = 0;
	let cacheWrite = 0;
	let cost = 0;
	for (const entry of ctx.sessionManager.getEntries()) {
		const anyEntry = entry as any;
		if (anyEntry.type !== "message" || anyEntry.message?.role !== "assistant")
			continue;
		const usage = anyEntry.message.usage;
		if (!usage) continue;
		input += usage.input ?? 0;
		output += usage.output ?? 0;
		cacheRead += usage.cacheRead ?? 0;
		cacheWrite += usage.cacheWrite ?? 0;
		cost += usage.cost?.total ?? 0;
	}
	const context = ctx.getContextUsage();
	const contextWindow = context?.contextWindow ?? ctx.model?.contextWindow;
	const percent = context?.percent ?? null;
	const ctxText = contextWindow
		? `ctx ${percent === null ? "?" : Math.round(percent)}%/${shortNumber(contextWindow)}`
		: "ctx ?";
	const cacheText =
		cacheRead || cacheWrite
			? ` R${shortNumber(cacheRead)} W${shortNumber(cacheWrite)}`
			: "";
	return ` tok ↑${shortNumber(input)} ↓${shortNumber(output)}${cacheText} · $${cost.toFixed(4)} · ${ctxText} `;
}

function fitBorder(
	left: string,
	right: string,
	width: number,
	color: (text: string) => string,
): string {
	if (width <= 0) return "";
	if (width === 1) return color("─");
	let leftText = left;
	let rightText = right;
	const fixedWidth = 2;
	const minGap = 1;
	while (
		fixedWidth + visibleWidth(leftText) + visibleWidth(rightText) + minGap >
			width &&
		visibleWidth(rightText) > 0
	) {
		rightText = truncateToWidth(
			rightText,
			Math.max(0, visibleWidth(rightText) - 1),
			"",
		);
	}
	while (
		fixedWidth + visibleWidth(leftText) + visibleWidth(rightText) + minGap >
			width &&
		visibleWidth(leftText) > 0
	) {
		leftText = truncateToWidth(
			leftText,
			Math.max(0, visibleWidth(leftText) - 1),
			"",
		);
	}
	const fillWidth = Math.max(
		0,
		width - fixedWidth - visibleWidth(leftText) - visibleWidth(rightText),
	);
	return `${color("─")}${leftText}${color("─".repeat(fillWidth))}${rightText}${color("─")}`;
}

function internalLineTarget(tui: TUI): number {
	return tui.terminal.rows < 18 ? 3 : 4;
}

function applyOsdyPi(
	pi: ExtensionAPI,
	ctx: ExtensionContext,
	state: OsdyState,
	notify = false,
): void {
	if (!ctx.hasUI) return;
	const currentTheme = ctx.ui.theme.name;
	if (!state.previousThemeName && currentTheme && currentTheme !== THEME_NAME)
		state.previousThemeName = currentTheme;
	const osdyTheme = ctx.ui.getTheme(THEME_NAME);
	const themeResult = osdyTheme
		? ctx.ui.setTheme(osdyTheme)
		: ctx.ui.setTheme(THEME_NAME);
	if (!themeResult.success)
		ctx.ui.notify(
			`osdy-pi theme failed: ${themeResult.error ?? "unknown error"}`,
			"warning",
		);

	ctx.ui.setHeader((_tui, theme) => {
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
				const animateFrame = animateAscii && !animationComplete;
				const showMascot =
					_tui.terminal.rows >= MASCOT_MIN_ROWS &&
					width >= MASCOT_WIDTH + MASCOT_GAP + HEADER_WIDTH;
				const useFullHeader = width >= HEADER_WIDTH;
				const headerLines = useFullHeader ? HEADER : HEADER_FALLBACK;
				const metadataRows = renderHeaderMetadata(pi, ctx, state, width);
				const logoLines = headerLines.map((line, index) => {
					const baseColor = useFullHeader && index >= 6 ? "mdLink" : "accent";
					return animateAsciiLine(
						line,
						index,
						frame,
						theme,
						baseColor,
						"mdHeading",
						"mdLink",
						animateFrame,
					);
				});
				const mascotLines = MASCOT.map((line, index) =>
					animateAsciiLine(
						line,
						index,
						frame,
						theme,
						"muted",
						"mdCode",
						"muted",
						animateFrame,
					),
				);
				const headerBlock = showMascot
					? composeSideBySide(mascotLines, logoLines, width)
					: logoLines.map((line) =>
							useFullHeader
								? centerVisible(line, width)
								: fitCenterVisible(line, width),
						);
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
	});
	ctx.ui.setFooter(
		(_tui, theme, footerData) => new OsdyFooter(ctx, footerData, theme),
	);
	ctx.ui.setWorkingVisible(false);

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
		render(width: number): string[] {
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
			for (let i = 1; i < bottomIndex; i += 1) {
				const content = truncateToWidth(lines[i], innerWidth, "");
				const padding = " ".repeat(
					Math.max(0, innerWidth - visibleWidth(content)),
				);
				lines[i] = `${side}${content}${padding}${side}`;
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
	ctx.ui.setEditorComponent(
		(tui, theme, keybindings) => new OsdyEditor(tui, theme, keybindings),
	);
	if (notify) ctx.ui.notify("osdy-pi enabled", "info");
}

function disableOsdyPi(ctx: ExtensionContext, state: OsdyState): void {
	if (!ctx.hasUI) return;
	ctx.ui.setHeader(undefined);
	ctx.ui.setEditorComponent(undefined);
	ctx.ui.setFooter(undefined);
	ctx.ui.setWorkingVisible(true);
	const targetTheme = state.previousThemeName ?? "dark";
	const result = ctx.ui.setTheme(targetTheme);
	if (!result.success && targetTheme !== "dark") ctx.ui.setTheme("dark");
	ctx.ui.notify("osdy-pi disabled", "info");
}

function claimOsdyVisualLayer(
	pi: ExtensionAPI,
	ctx: ExtensionContext,
	state: OsdyState,
): void {
	if (!state.enabled) return;
	applyOsdyPi(pi, ctx, state);

	// Some packages install startup headers asynchronously. Re-apply Osdy-Pi
	// after startup so it remains the visual owner without disabling those
	// packages' prompts, agents, MCP tools, commands, or other behavior.
	for (const delayMs of [300, 1000]) {
		setTimeout(() => {
			if (state.enabled) applyOsdyPi(pi, ctx, state);
		}, delayMs);
	}
}

export default function (pi: ExtensionAPI) {
	const state: OsdyState = { enabled: true, gitLabel: "-", agentsLabel: "-" };
	pi.on("session_start", (_event, ctx) => {
		void pi
			.exec("git", ["branch", "--show-current"], { cwd: ctx.cwd })
			.then((result) => {
				state.gitLabel = result.stdout.trim() || "detached";
			})
			.catch(() => {
				state.gitLabel = "no-git";
			});
		void pi
			.exec(
				"find",
				[ctx.cwd, "-name", "AGENTS.md", "-o", "-name", "AGENTS.MD"],
				{ cwd: ctx.cwd },
			)
			.then((result) => {
				state.agentsLabel = String(
					result.stdout.split("\n").filter(Boolean).length,
				);
			})
			.catch(() => {
				state.agentsLabel = "0";
			});
		claimOsdyVisualLayer(pi, ctx, state);
	});
	pi.registerCommand("osdy-pi", {
		description: "Manage the Osdy Pi experience: enable, disable, or status.",
		getArgumentCompletions(prefix: string) {
			return ["enable", "disable", "status"]
				.filter((value) => value.startsWith(prefix.trim()))
				.map((value) => ({ value, label: value }));
		},
		handler: async (args, ctx) => {
			const action = args.trim().split(/\s+/, 1)[0] || "status";
			if (action === "enable") {
				state.enabled = true;
				applyOsdyPi(pi, ctx, state, true);
				return;
			}
			if (action === "disable") {
				state.enabled = false;
				disableOsdyPi(ctx, state);
				return;
			}
			if (action !== "status") {
				ctx.ui.notify("Usage: /osdy-pi enable | disable | status", "warning");
				return;
			}
			ctx.ui.notify(
				`osdy-pi ${state.enabled ? "enabled" : "disabled"} · theme ${ctx.ui.theme.name ?? "unknown"} · animation ${asciiAnimationMode()} · ${modelLabel(ctx)} · ${usageLabel(ctx).trim()}`,
				"info",
			);
		},
	});
}

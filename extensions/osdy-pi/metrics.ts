import {
	type ExtensionAPI,
	type ExtensionContext,
	VERSION,
} from "@earendil-works/pi-coding-agent";
import { truncateToWidth } from "@earendil-works/pi-tui";
import { formatPath, shortNumber, truncateMiddle } from "./format.js";
import type {
	AssistantSessionEntry,
	HeaderMetaRow,
	OsdyState,
	SimpleTheme,
} from "./types.js";
import { centerVisible, fitCenterVisible } from "./utils.js";

function isAssistantSessionEntry(
	entry: unknown,
): entry is AssistantSessionEntry {
	if (!entry || typeof entry !== "object") return false;
	const candidate = entry as { type?: unknown; message?: unknown };
	if (candidate.type !== "message") return false;
	if (!candidate.message || typeof candidate.message !== "object") return false;
	const message = candidate.message as { role?: unknown };
	return message.role === "assistant";
}

export function modelLabel(ctx: ExtensionContext): string {
	const model = ctx.model;
	if (!model) return "no model";
	return model.provider ? `${model.provider}/${model.id}` : model.id;
}

function getContextLabel(ctx: ExtensionContext): string {
	const context = ctx.getContextUsage();
	const contextWindow = context?.contextWindow ?? ctx.model?.contextWindow;
	const percent = context?.percent ?? null;
	return contextWindow
		? `ctx ${percent === null ? "?" : Math.round(percent)}%/${shortNumber(contextWindow)}`
		: "ctx ?";
}

function getCacheLabel(totals: UsageTotals): string {
	return totals.cacheRead || totals.cacheWrite
		? ` R${shortNumber(totals.cacheRead)} W${shortNumber(totals.cacheWrite)}`
		: "";
}

export function usageLabel(ctx: ExtensionContext): string {
	const totals = collectUsageTotals(ctx);
	const cacheText = getCacheLabel(totals);
	const ctxText = getContextLabel(ctx);
	return ` tok ↑${shortNumber(totals.input)} ↓${shortNumber(totals.output)}${cacheText} · $${totals.cost.toFixed(4)} · ${ctxText} `;
}

type UsageTotals = {
	input: number;
	output: number;
	cacheRead: number;
	cacheWrite: number;
	cost: number;
};

function createUsageTotals(): UsageTotals {
	return {
		input: 0,
		output: 0,
		cacheRead: 0,
		cacheWrite: 0,
		cost: 0,
	};
}

function mergeUsageTotals(
	totals: UsageTotals,
	entry: AssistantSessionEntry,
): UsageTotals {
	const usage = entry.message?.usage;
	if (!usage) return totals;
	return {
		input: totals.input + (usage.input ?? 0),
		output: totals.output + (usage.output ?? 0),
		cacheRead: totals.cacheRead + (usage.cacheRead ?? 0),
		cacheWrite: totals.cacheWrite + (usage.cacheWrite ?? 0),
		cost: totals.cost + (usage.cost?.total ?? 0),
	};
}

function collectUsageTotals(ctx: ExtensionContext): UsageTotals {
	return ctx.sessionManager
		.getEntries()
		.reduce<UsageTotals>((totals, entry) => {
			return isAssistantSessionEntry(entry)
				? mergeUsageTotals(totals, entry)
				: totals;
		}, createUsageTotals());
}

function getToolSources(pi: ExtensionAPI) {
	return pi.getAllTools().map((tool) => ({
		name: tool.name.toLowerCase(),
		origin: tool.sourceInfo?.origin?.toLowerCase() ?? "",
		source: tool.sourceInfo?.source?.toLowerCase() ?? "",
		path: tool.sourceInfo?.path?.toLowerCase() ?? "",
	}));
}

function isMcpTool(tool: ReturnType<typeof getToolSources>[number]): boolean {
	return tool.name.includes("mcp") || tool.source.includes("mcp");
}

function getToolServerKey(
	tool: ReturnType<typeof getToolSources>[number],
): string {
	return tool.source || tool.path || tool.name;
}

function getMcpServerCount(pi: ExtensionAPI): number {
	const serverKeys = new Set(
		getToolSources(pi).filter(isMcpTool).map(getToolServerKey),
	);
	return serverKeys.size;
}

function countToolsByOrigin(pi: ExtensionAPI, origin: string): number {
	return getToolSources(pi).filter((tool) => tool.origin === origin).length;
}

function countToolsBySource(pi: ExtensionAPI, source: string): number {
	return getToolSources(pi).filter((tool) => tool.source.includes(source))
		.length;
}

function getPathWidth(width: number): number {
	return width < 110 ? 34 : 52;
}

export function renderHeaderMetadata(
	pi: ExtensionAPI,
	ctx: ExtensionContext,
	state: OsdyState,
	width: number,
): HeaderMetaRow[] {
	const allTools = pi.getAllTools().length;
	const git = state.gitLabel === "no-git" ? "Not a git repo" : state.gitLabel;
	const path = truncateMiddle(formatPath(ctx.cwd), getPathWidth(width));
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

export function renderMetaRows(
	rows: HeaderMetaRow[],
	width: number,
	theme: SimpleTheme,
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

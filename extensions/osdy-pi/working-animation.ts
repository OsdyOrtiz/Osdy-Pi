import { WORKING_ACTIVITY_FRAMES, WORKING_SYMBOL_PULSE } from "./constants.js";
import type { SimpleTheme, WorkingWidgetState } from "./types.js";
import { fitCenterVisible } from "./utils.js";
const graphemes = new Intl.Segmenter(undefined, { granularity: "grapheme" });
const isWhitespace = (segment: string) => /\s/u.test(segment);

/** Render a compact activity symbol with a shared theme pulse beside the traveling letter highlight. */
export function renderWorkingWidget(
	state: WorkingWidgetState,
	theme: SimpleTheme,
	width: number,
): string[] {
	if (!state.active) return [];
	const frames = WORKING_ACTIVITY_FRAMES[state.activity];
	const symbol = frames[state.frame % frames.length] ?? "";
	const symbolColor = WORKING_SYMBOL_PULSE[state.frame % WORKING_SYMBOL_PULSE.length] ?? "mdQuoteBorder";
	const segments = [...graphemes.segment(state.label)].map(({ segment }) => segment);
	const letterCount = segments.filter((segment) => !isWhitespace(segment)).length;
	const highlighted = letterCount > 0 ? state.frame % letterCount : -1;
	const trailing = letterCount > 1 ? (highlighted + letterCount - 1) % letterCount : -1;
	let letterIndex = 0;
	const label = segments
		.map((segment) => {
			if (isWhitespace(segment)) return segment;
			const index = letterIndex++;
			if (index === highlighted) {
				const styled = theme.fg("accent", segment);
				return theme.bold?.(styled) ?? styled;
			}
			if (index === trailing) return theme.fg("warning", segment);
			return theme.fg("text", segment);
		})
		.join("");
	return [fitCenterVisible(`${theme.fg(symbolColor, symbol)} ${label}`, width)];
}

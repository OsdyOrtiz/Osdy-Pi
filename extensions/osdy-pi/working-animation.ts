import { WORKING_SPINNER_FRAMES } from "./constants.js";
import type { SimpleTheme, WorkingWidgetState } from "./types.js";
import { fitCenterVisible } from "./utils.js";
const graphemes = new Intl.Segmenter(undefined, { granularity: "grapheme" });
const isWhitespace = (segment: string) => /\s/u.test(segment);

/** Render the theme-accent Braille spinner beside a theme-aware traveling letter highlight. */
export function renderWorkingWidget(
	state: WorkingWidgetState,
	theme: SimpleTheme,
	width: number,
): string[] {
	if (!state.active) return [];
	const spinner = WORKING_SPINNER_FRAMES[state.frame % WORKING_SPINNER_FRAMES.length] ?? "";
	const segments = [...graphemes.segment(state.label)].map(({ segment }) => segment);
	const letterCount = segments.filter((segment) => !isWhitespace(segment)).length;
	const highlighted = letterCount > 0 ? state.frame % letterCount : -1;
	let letterIndex = 0;
	const label = segments
		.map((segment) => {
			if (isWhitespace(segment)) return segment;
			const color = letterIndex++ === highlighted ? "accent" : "text";
			return theme.fg(color, segment);
		})
		.join("");
	return [fitCenterVisible(`${theme.fg("accent", spinner)} ${label}`, width)];
}

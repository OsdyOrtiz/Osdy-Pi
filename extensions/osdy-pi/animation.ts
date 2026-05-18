import { ANIMATION_ENABLED } from "./constants.js";
import type { AnimationMode, SimpleTheme } from "./types.js";
import type { MascotTonePalette } from "./constants.js";
import { positiveModulo } from "./utils.js";

export type AsciiAnimationStyle = "static" | "animated";

const ANIMATION_OVERRIDE_MAP: Record<string, AnimationMode> = {
	"0": "off",
	"1": "continuous",
	off: "off",
	on: "continuous",
	intro: "intro",
	continuous: "continuous",
};

function getAnimationOverrideMode(
	override: string | undefined,
): AnimationMode | undefined {
	return override ? ANIMATION_OVERRIDE_MAP[override] : undefined;
}

export function asciiAnimationMode(): AnimationMode {
	if (!ANIMATION_ENABLED) return "off";
	return getAnimationOverrideMode(process.env.OSDY_PI_ANIMATION) ?? "intro";
}

function getAnimatedAsciiColor(
	wave: number,
	baseColor: string,
	highlightColor: string,
	trailColor: string,
): string {
	if (wave <= 3) return highlightColor;
	if (wave <= 8) return trailColor;
	return baseColor;
}

export function animateAsciiLine(
	line: string,
	lineIndex: number,
	frame: number,
	theme: SimpleTheme,
	baseColor: string,
	highlightColor: string,
	trailColor: string,
	style: AsciiAnimationStyle,
): string {
	if (style === "static") return theme.fg(baseColor, line);
	return Array.from(line)
		.map((char, charIndex) => {
			if (char === " ") return char;
			const wave = positiveModulo(charIndex + lineIndex * 2 - frame * 5, 44);
			return theme.fg(
				getAnimatedAsciiColor(wave, baseColor, highlightColor, trailColor),
				char,
			);
		})
		.join("");
}

export function animateAsciiLineWithToneMap(
	line: string,
	toneMap: string,
	lineIndex: number,
	frame: number,
	theme: SimpleTheme,
	palette: MascotTonePalette,
	style: AsciiAnimationStyle,
): string {
	return Array.from(line)
		.map((char, charIndex) => {
			if (char === " ") return char;
			const tone = toneMap[charIndex];
			if (
				tone !== "b" &&
				tone !== "h" &&
				tone !== "l" &&
				tone !== "m" &&
				tone !== "d" &&
				tone !== "p" &&
				tone !== "c" &&
				tone !== "v"
			) {
				return char;
			}
			const baseColor = palette[tone];
			if (style === "static") return theme.fg(baseColor, char);
			const wave = positiveModulo(charIndex + lineIndex * 2 - frame * 5, 44);
			const highlightColor =
				tone === "b" || tone === "h" || tone === "p" ? palette.h : palette.l;
			const trailColor = tone === "d" ? palette.m : palette.b;
			return theme.fg(
				getAnimatedAsciiColor(wave, baseColor, highlightColor, trailColor),
				char,
			);
		})
		.join("");
}

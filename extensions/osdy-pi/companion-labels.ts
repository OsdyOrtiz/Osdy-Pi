import type { CompanionStyle } from "./types.js";

/** Display labels only; command ids and saved setting values stay the keys. */
export const COMPANION_STYLE_LABELS: Record<CompanionStyle, string> = {
	original: "Pixel Pal",
	drawn: "Tiny Doodle",
	rounded: "Big Cuddle",
	terminal: "Retro Buddy",
	slim: "Slim Ringtail",
	"slim-small": "Pocket Ringtail",
};

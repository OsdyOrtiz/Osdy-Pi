import { visibleWidth } from "@earendil-works/pi-tui";
import type { HeaderVariant } from "./types.js";

export const THEME_NAME = "osdy-pi-dark";
export const ANIMATION_ENABLED = true;
export const ANIMATION_INTERVAL_MS = 30;
export const INTRO_ANIMATION_FRAMES = 28;
export const WORKING_SPINNER_FRAMES = [
  "⠋",
  "⠙",
  "⠹",
  "⠸",
  "⠼",
  "⠴",
  "⠦",
  "⠧",
  "⠇",
  "⠏",
];
export const WORKING_WIDGET_KEY = "osdy-pi-working";
export const WORKING_TREE_WIDGET_KEY = "osdy-pi-working-tree";
export const MASCOT_MIN_ROWS = 34;
export const MASCOT_GAP = 0;

const HTML_MASCOT = [
  "                                         ▓▓▓▓▒            ",
  "                                     ░ ▓▓▓  ▒▓            ",
  "                                  ░░░▓▓▓     ▓▓           ",
  "                    ▒ ▒ ▒▒    ▒  ░░ ▓▓▓▓    ░▒▓▓          ",
  "▓▓▓▓▓▓▓▓░░░░░     ░▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒ ▒▒    ░░▒▓           ",
  "▓▓    ▓▓▓▓▓░░░ ▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒░░   ░░▒▒           ",
  "▓▓░    ▒▓▓▓▒░▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▓▒▒▒▒▒▒▒░░ ░▒▒            ",
  " ▓▒░░    ▒░▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▓█▓▓█▓▓▓▓▓▒▒▒░▒▒░            ",
  "  ▓▒░░   ░▒▒▒▒▒▓▓▓▓▓▒█▒▒▒▒▒▓▓▓▓ ░░░  ▓▓▓▓▒▒▒░░            ",
  "   ▒▒░░ ░▒▒▒▓▓▓▓▓▓▓▓▓▓▓▒▒▒▒▓▓     ░       ▓ ▒▒░░          ",
  "    ▒▒▒▒░▒▒▓▓▓▓░     ░▓▒▒▒▒▒   ░▒▒█▓        ▒▓▓▓░▒        ",
  "     ░ ░▒▒▓▓▒   ▓░░            ░░ ░            ▓▓▓▒       ",
  "      ░░▒▓░  ░▒░▓▓        ░░                     ░▓▓▒     ",
  "      ░▒ ▒   ░▒▒▒        ▒▒▒▒ ░                  ▒▒▒      ",
  "    ░▒▓▓░               ▓▓░░░ █▓ ▒             ░▒▒▒       ",
  "   ▒▓▓▓░               ▓▓     ▓▓▓▓▓▓▓▓▓       ░░▒         ",
  "   ▓▓▓░            ░ ▓▓▓▓▓▓▒▓▓▓▓ ▓▓▓▓▓▓▓▒░░░░ ░           ",
  "  ▒▒▒▒            ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▒▒░░░░               ",
  "    ▓▒▒░░        ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▒▒▒▒▒░░ ▓                  ",
  "          ░░░░░░░░░▒▒▒▒▒▒▒▒▒▒▒▒  ░░░                      ",
  "                 ░    ░░░░░░░░░░░▒▒░░       ░ ░ ░  ▓      ",
  "                ░░░░░▒▒▒▒░░▒░ ▒▒▒▒▒░░     ░░▒▒▒░░░░░░░░   ",
  "              ▒▒▒▒▒░░░▒▒▒▒▒▒▒▒▒▒▒▒░░░  ▒░░▒▒▒▒▓▓▓▓░░░░    ",
  "              ░▒▒▒▒▒░ ░░▒▒▒▒▒▒▒▒░░░        ░░▒▓▓▓▓▒▒░░    ",
  "             ▓░░░░░░ ░ ░░░░░░░░░░░        ░░░░░░▓▒▒▒▒    ░",
  "              ░░░▒▒▓▓▓▓▓▒░░░░░░░░░░  ░░▒▒▒▒░░░░░░░▒▒░░    ",
  "              ░▒▒▒▓▓▓▓▓▓▓▓▓▓▒▒▒▒░░░   ░▒▒▒▓▓▒░░░   ░░░▒   ",
  "             ▒░▒▒▒▓▓▓▓▓▓▓▓▓▓▒▒▒▒▒░░░    ░▒▒▓▓▒░     ░     ",
  "             ░░▒▒▒▒▒▒▓▓▓▓▓▓▒▒▒▒▒▒░░░░    ░▒▒▒▒▒     ░     ",
  "             ▒░░░░▒▒▒▒▒▒▒▒▒▒▒▒▒▒░░░░░░     ▒▒░▒           ",
  "              ░░░░░░░░░░▒░░▒░▒▒░░░░ ░      ░░░░           ",
  "                ░░░░      ░░░░░░░░░░░     ░░░░            ",
  "                  ░          ░░░░░░      ▓                ",
  "             ░░░░░              ░░░░░░                    ",
  "                                 ░ ░                      ",
] as const;

const HTML_MASCOT_MAP = [
  "                                         hhhhl            ",
  "                                    dmmhhhmmlhm           ",
  "                                 dmmmhhhdmmmmhh           ",
  "                    ldldllddmdldmmmmhhlhddmmmlhh          ",
  "hhhhhhhhmmmlm     llllllllllllllllllmlldddmmmll           ",
  "hhmmmmlhhhhmmmdllllllllllllllllllllllllmddmmmll           ",
  "hhmmmddlhhhlmlllllllllllllllllllhlllllllllmmlld           ",
  " llmmmdddlmllllllllllllllllllhbhhbhhhhhllllllm            ",
  " dllmmmddllllllhhhhhlblllllhhhhmmmmmmhhhhlllmm            ",
  "  dllmmmlllllhhhhhhhhhhllllhhmmmmmmmmmddddhdlllm          ",
  "    lllllllhhhhmmmmmmmhllllldmdlllbhmmmmddddlhhhlldd      ",
  "     mdlllhhlmmdhmmmddmmdmmddmmmmdldddddddddmmmhhhl       ",
  "      lllhmddmlmhhmmmmmddmmmddddddddddddddddmmdmmmhhl     ",
  "     mlldldddmlllddddddddlllldmddddddddddddmmmddmlll      ",
  "    llhhmddddmmdddddddddhhmmmdbhdldddddddddmmddmlll       ",
  "   llhhmmmdddddddddddddhhddddmhhhhhhhhhmmdddddlml         ",
  "   hhhmmmmmddddddddldhhhhhhlhhhhmhhhhhhhlmmmmmm           ",
  "  llllmddmddddddddhhhhhhhhhhlhhhhhhhlllmmmm               ",
  "    hllllmddddddmhhhhhhhhhhhhhllllllmmmh                  ",
  "         dmmmmmmmmlllllllllllllmdmmm                      ",
  "                 mmmmmmmmmmmmmmmlllmm                     ",
  "               dlmmmmllllmmlmmllllllm    dmllllmmmmmmmm   ",
  "              lllllmmlllllllllllllmmm  lmllllllllhlmmmmm  ",
  "              mlllllmdmlllllllllmmmd  mddmmmmlhhhlllmmmmm ",
  "              hmmmmmmdmdmmmmmmmmmmm  dddmmmmmmmmlllllmmdmm",
  "              mmmlllllhllllmmmmmmmm dmmllllmmmmmmmlllmdm  ",
  "              mlllhhhhhhhhlllllllmmdddmlllhllmmmmmmlmml   ",
  "             llllllhhhhhhhllllllllmmdddmmlllllmmmmdmmd    ",
  "             mllllllllhhllllllllllmmmddmmmlllllmdddmm     ",
  "             lmllmlllllllllllllllmmmmmddmmmllllmdddd      ",
  "              lmmmmmmllllmllllllmmmdmdddddmmmmmddmd       ",
  "               dmmmmmmd dmmmmmmmmmmmmddddmmmmmdd          ",
  "               dmmmmmd      dmmmmmmd     h                ",
  "             mmmmmmmm         dmmmmmmm                    ",
  "                               dmmmmmm                    ",
] as const;

const HEADER_CLASSIC = [
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
] as const;

const HEADER_SIMPLE = [
  "    ███████                █████                             ███████████   ███ ",
  "  ███░░░░░███             ░░███                             ░░███░░░░░███ ░░░  ",
  " ███     ░░███  █████   ███████  █████ ████                  ░███    ░███ ████ ",
  "░███      ░███ ███░░   ███░░███ ░░███ ░███     ██████████    ░██████████ ░░███ ",
  "░███      ░███░░█████ ░███ ░███  ░███ ░███    ░░░░░░░░░░     ░███░░░░░░   ░███ ",
  "░░███     ███  ░░░░███░███ ░███  ░███ ░███                   ░███         ░███ ",
  " ░░░███████░   ██████ ░░████████ ░░███████                   █████        █████",
  "   ░░░░░░░    ░░░░░░   ░░░░░░░░   ░░░░░███                  ░░░░░        ░░░░░ ",
  "                                  ███ ░███",
  "                                 ░░██████",
  "                                  ░░░░░░                      <ideas_compiler/>",
] as const;

type HeaderPalette = {
  baseColor: string;
  highlightColor: string;
  trailColor: string;
};

export type MascotToneKey = "b" | "h" | "l" | "m" | "d" | "p" | "c" | "v";

export type MascotTonePalette = Record<MascotToneKey, string>;

type HeaderVariantConfig = {
  label: string;
  header: readonly string[];
  headerMap?: readonly string[];
  headerTonePalette?: MascotTonePalette;
  minRowsForFull?: number;
  fallbackHeader?: readonly string[];
  fallbackLinePalette?: (lineIndex: number) => HeaderPalette;
  mascot?: readonly string[];
  mascotMap?: readonly string[];
  linePalette: (lineIndex: number) => HeaderPalette;
  mascotPalette: HeaderPalette;
  mascotTonePalette?: MascotTonePalette;
};

const CLASSIC_PALETTE: HeaderPalette = {
  baseColor: "accent",
  highlightColor: "mdHeading",
  trailColor: "mdLink",
};

const CLASSIC_LINK_PALETTE: HeaderPalette = {
  baseColor: "mdLink",
  highlightColor: "mdHeading",
  trailColor: "mdLink",
};

const OSDY_THEME_PINK_PALETTE: HeaderPalette = {
  baseColor: "accent",
  highlightColor: "mdHeading",
  trailColor: "mdLink",
};

const OSDY_THEME_CYAN_PALETTE: HeaderPalette = {
  baseColor: "mdLink",
  highlightColor: "accent",
  trailColor: "mdHeading",
};

const OSDY_THEME_PURPLE_PALETTE: HeaderPalette = {
  baseColor: "mdHeading",
  highlightColor: "mdLink",
  trailColor: "accent",
};

const OSDY_THEME_MASCOT_PALETTE: HeaderPalette = {
  baseColor: "mdLink",
  highlightColor: "accent",
  trailColor: "mdHeading",
};

const HTML_MASCOT_TONES: MascotTonePalette = {
  b: "mascotBg",
  h: "mascotBright",
  l: "mascotLight",
  m: "mascotMid",
  d: "mascotDark",
  p: "htmlPink",
  c: "mdLink",
  v: "mdHeading",
};

type MascotArt = {
  mascot: readonly string[];
  toneMap: readonly string[];
};

function sampleIndex(
  outputIndex: number,
  outputCount: number,
  inputCount: number,
): number {
  if (outputCount <= 1) return 0;
  return Math.min(
    inputCount - 1,
    Math.round((outputIndex * (inputCount - 1)) / (outputCount - 1)),
  );
}

function sampleLine(
  line: string,
  outputWidth: number,
  inputWidth: number,
): string {
  const chars = Array.from(line.padEnd(inputWidth, " "));
  return Array.from({ length: outputWidth }, (_value, outputIndex) => {
    const inputIndex = sampleIndex(outputIndex, outputWidth, inputWidth);
    return chars[inputIndex] ?? " ";
  }).join("");
}

function scaleMascotArt(
  mascot: readonly string[],
  toneMap: readonly string[],
  scale: number,
): MascotArt {
  const inputRows = Math.min(mascot.length, toneMap.length);
  const inputWidth = Math.max(
    ...mascot.slice(0, inputRows).map((line) => Array.from(line).length),
    ...toneMap.slice(0, inputRows).map((line) => Array.from(line).length),
  );
  const outputRows = Math.max(1, Math.round(inputRows * scale));
  const outputWidth = Math.max(1, Math.round(inputWidth * scale));

  return Array.from({ length: outputRows }, (_value, outputIndex) => {
    const inputIndex = sampleIndex(outputIndex, outputRows, inputRows);
    return {
      mascot: sampleLine(mascot[inputIndex] ?? "", outputWidth, inputWidth),
      toneMap: sampleLine(toneMap[inputIndex] ?? "", outputWidth, inputWidth),
    };
  }).reduce<MascotArt>(
    (accumulator, line) => ({
      mascot: [...accumulator.mascot, line.mascot],
      toneMap: [...accumulator.toneMap, line.toneMap],
    }),
    { mascot: [], toneMap: [] },
  );
}

function addRightEdgeGlow(
  mascot: readonly string[],
  toneMap: readonly string[],
): readonly string[] {
  return toneMap.map((lineMap, lineIndex) => {
    const chars = Array.from(lineMap);
    const mascotLine = mascot[lineIndex] ?? "";
    const rightEdgeIndex = Math.max(
      ...Array.from(mascotLine).map((char, index) =>
        char === " " ? -1 : index,
      ),
    );
    if (rightEdgeIndex < 0) return lineMap;
    const glowTones = ["p", "c", "v"] as const;
    for (let offset = 0; offset < glowTones.length; offset += 1) {
      const glowTone = glowTones[offset];
      const index = rightEdgeIndex - offset;
      if (
        glowTone &&
        index >= 0 &&
        index < chars.length &&
        chars[index] !== " "
      ) {
        chars[index] = glowTone;
      }
    }
    return chars.join("");
  });
}

const OSDY_THEME_MASCOT_ART = scaleMascotArt(HTML_MASCOT, HTML_MASCOT_MAP, 0.9);
const OSDY_THEME_MASCOT_MAP = addRightEdgeGlow(
  OSDY_THEME_MASCOT_ART.mascot,
  OSDY_THEME_MASCOT_ART.toneMap,
);

function osdyThemePalette(lineIndex: number): HeaderPalette {
  if (lineIndex < 4) return OSDY_THEME_PINK_PALETTE;
  if (lineIndex < 8) return OSDY_THEME_CYAN_PALETTE;
  return OSDY_THEME_PURPLE_PALETTE;
}

export const HEADER_VARIANTS: Record<HeaderVariant, HeaderVariantConfig> = {
  "osdy-theme": {
    label: "OsdyTheme",
    header: HEADER_SIMPLE,
    mascot: OSDY_THEME_MASCOT_ART.mascot,
    mascotMap: OSDY_THEME_MASCOT_MAP,
    linePalette: osdyThemePalette,
    mascotPalette: OSDY_THEME_MASCOT_PALETTE,
    mascotTonePalette: HTML_MASCOT_TONES,
  },
  classic: {
    label: "Classic",
    header: HEADER_CLASSIC,
    mascot: HTML_MASCOT,
    mascotMap: HTML_MASCOT_MAP,
    linePalette: (lineIndex) =>
      lineIndex >= 6 ? CLASSIC_LINK_PALETTE : CLASSIC_PALETTE,
    mascotPalette: OSDY_THEME_MASCOT_PALETTE,
    mascotTonePalette: HTML_MASCOT_TONES,
  },
};

export function headerWidth(variant: HeaderVariant): number {
  return HEADER_VARIANTS[variant].header.reduce(
    (maxWidth, line) => Math.max(maxWidth, visibleWidth(line)),
    0,
  );
}

export function mascotWidth(variant: HeaderVariant): number {
  return (HEADER_VARIANTS[variant].mascot ?? []).reduce(
    (maxWidth, line) => Math.max(maxWidth, visibleWidth(line)),
    0,
  );
}

export const HEADER_FALLBACK = [
  "OSDY - PI",
  "</> Compilador de ideas",
] as const;

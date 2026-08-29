import { visibleWidth } from "@earendil-works/pi-tui";
import type { HeaderVariant } from "./types.js";

export const THEME_NAME = "osdy-pi-new";
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
  "                 mmmmmmmmmmmmmmmlllmm       m v c  p      ",
  "               dlmmmmllllmmlmmllllllm    dmllllmmmmmmmm   ",
  "              lllllmmlllllllllllllmmm  lmllllllllhlmmmmm  ",
  "              mlllllmdmlllllllllmmmd  mddmmmmlhhhlllmmmmm ",
  "             hhmmmmmmdmdmmmmmmmmmmm  dddmmmmmmmmlllllmmdmm",
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

export const MASCOT_TONE_KEYS = {
  background: "b",
  bright: "h",
  light: "l",
  mid: "m",
  dark: "d",
  rightEdgeCyan: "p",
  rightEdgeViolet: "c",
  rightEdgeSilver: "v",
} as const;

export type MascotToneKey =
  (typeof MASCOT_TONE_KEYS)[keyof typeof MASCOT_TONE_KEYS];

export type MascotTonePalette = Record<MascotToneKey, string>;

type HeaderVariantConfig = {
  label: string;
  header: readonly string[];
  headerMap?: readonly string[];
  headerTonePalette?: MascotTonePalette;
  mascot?: readonly string[];
  mascotMap?: readonly string[];
  linePalette: (lineIndex: number) => HeaderPalette;
  mascotPalette: HeaderPalette;
  mascotTonePalette?: MascotTonePalette;
};

const CLASSIC_PALETTE: HeaderPalette = {
  baseColor: "accent",
  highlightColor: "mdHeading",
  trailColor: "muted",
};

const CLASSIC_LINK_PALETTE: HeaderPalette = {
  baseColor: "muted",
  highlightColor: "mdHeading",
  trailColor: "accent",
};

const OSDY_THEME_CYAN_PALETTE: HeaderPalette = {
  baseColor: "accent",
  highlightColor: "mdHeading",
  trailColor: "muted",
};

const OSDY_THEME_SILVER_PALETTE: HeaderPalette = {
  baseColor: "muted",
  highlightColor: "accent",
  trailColor: "mdHeading",
};

const OSDY_THEME_VIOLET_PALETTE: HeaderPalette = {
  baseColor: "mdHeading",
  highlightColor: "muted",
  trailColor: "accent",
};

const OSDY_THEME_MASCOT_PALETTE: HeaderPalette = {
  baseColor: "mdLink",
  highlightColor: "accent",
  trailColor: "mdHeading",
};

const HTML_MASCOT_TONES: MascotTonePalette = {
  b: "#F9F7F2",
  h: "#F0E5D7",
  l: "#C7B4A1",
  m: "#7D6F67",
  d: "#2A2321",
  p: "#22D3EE",
  c: "#A78BFA",
  v: "#CBD5E1",
};

const RAW_HEX_COLOR = /^#[0-9A-F]{6}$/;

function assertRawHexPalette(palette: MascotTonePalette): void {
  for (const [tone, color] of Object.entries(palette)) {
    if (!RAW_HEX_COLOR.test(color)) {
      throw new Error(`Mascot tone ${tone} must be a #RRGGBB color.`);
    }
  }
}

export type MascotArt = {
  mascot: readonly string[];
  toneMap: readonly string[];
};

function mascotCodePointWidth(mascot: readonly string[]): number {
  return Math.max(...mascot.map((line) => Array.from(line).length));
}

function trimMascotMargins(art: MascotArt): MascotArt {
  const rowWidth = Math.max(
    mascotCodePointWidth(art.mascot),
    mascotCodePointWidth(art.toneMap),
  );
  const rows = art.mascot.map((line, index) => ({
    mascot: Array.from(line.padEnd(rowWidth, " ")),
    toneMap: Array.from((art.toneMap[index] ?? "").padEnd(rowWidth, " ")),
  }));
  const occupied = (rowIndex: number, columnIndex: number): boolean => {
    const row = rows[rowIndex];
    return (
      row?.mascot[columnIndex] !== " " || row?.toneMap[columnIndex] !== " "
    );
  };
  const rowIndexes = rows
    .map((_row, rowIndex) => rowIndex)
    .filter((rowIndex) =>
      Array.from({ length: rowWidth }, (_value, columnIndex) =>
        occupied(rowIndex, columnIndex),
      ).some(Boolean),
    );
  const columnIndexes = Array.from(
    { length: rowWidth },
    (_value, columnIndex) =>
      rows.some((_row, rowIndex) => occupied(rowIndex, columnIndex)),
  );
  const firstRow = rowIndexes[0] ?? 0;
  const lastRow = rowIndexes.at(-1) ?? firstRow;
  const firstColumn = columnIndexes.findIndex(Boolean);
  const lastColumn = columnIndexes.lastIndexOf(true);
  if (firstColumn < 0 || lastColumn < firstColumn) return art;
  return {
    mascot: rows
      .slice(firstRow, lastRow + 1)
      .map((row) => row.mascot.slice(firstColumn, lastColumn + 1).join("")),
    toneMap: rows
      .slice(firstRow, lastRow + 1)
      .map((row) => row.toneMap.slice(firstColumn, lastColumn + 1).join("")),
  };
}

function isMascotToneKey(value: string): value is MascotToneKey {
  return (
    value === MASCOT_TONE_KEYS.background ||
    value === MASCOT_TONE_KEYS.bright ||
    value === MASCOT_TONE_KEYS.light ||
    value === MASCOT_TONE_KEYS.mid ||
    value === MASCOT_TONE_KEYS.dark ||
    value === MASCOT_TONE_KEYS.rightEdgeCyan ||
    value === MASCOT_TONE_KEYS.rightEdgeViolet ||
    value === MASCOT_TONE_KEYS.rightEdgeSilver
  );
}

function assertMascotStructure(
  art: MascotArt,
  palette: MascotTonePalette,
): void {
  if (art.mascot.length === 0) {
    throw new Error("Mascot art must contain at least one row.");
  }
  if (art.mascot.length !== art.toneMap.length) {
    throw new Error("Mascot art and tone map must have the same row count.");
  }

  for (let rowIndex = 0; rowIndex < art.mascot.length; rowIndex += 1) {
    const mascotLine = art.mascot[rowIndex] ?? "";
    const toneLine = art.toneMap[rowIndex] ?? "";
    const mascotCharacters = Array.from(mascotLine);
    const toneCharacters = Array.from(toneLine);
    if (mascotCharacters.length !== toneCharacters.length) {
      throw new Error(`Mascot row ${rowIndex} and its tone map width differ.`);
    }
    for (
      let columnIndex = 0;
      columnIndex < toneCharacters.length;
      columnIndex += 1
    ) {
      const tone = toneCharacters[columnIndex] ?? " ";
      const character = mascotCharacters[columnIndex] ?? " ";
      if (tone !== " " && !isMascotToneKey(tone)) {
        throw new Error(
          `Mascot row ${rowIndex} has an invalid tone key: ${tone}.`,
        );
      }
      if (character !== " " && (!isMascotToneKey(tone) || !palette[tone])) {
        throw new Error(
          `Mascot row ${rowIndex} column ${columnIndex} has no usable tone.`,
        );
      }
    }
  }
}

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

function scaleLine(line: string, outputWidth: number): string {
  const characters = Array.from(line);
  return Array.from({ length: outputWidth }, (_value, outputIndex) => {
    const inputIndex = sampleIndex(outputIndex, outputWidth, characters.length);
    return characters[inputIndex] ?? " ";
  }).join("");
}

function addRightEdgeGlow(art: MascotArt): MascotArt {
  return {
    mascot: art.mascot,
    toneMap: art.toneMap.map((lineMap, lineIndex) => {
      const tones = Array.from(lineMap);
      const mascotLine = Array.from(art.mascot[lineIndex] ?? "");
      let glowIndex = 0;
      for (
        let index = mascotLine.length - 1;
        index >= 0 && glowIndex < 3;
        index -= 1
      ) {
        if (mascotLine[index] !== " ") {
          const glowTone = ["p", "c", "v"] as const;
          tones[index] =
            glowTone[glowIndex] ?? MASCOT_TONE_KEYS.rightEdgeSilver;
          glowIndex += 1;
        }
      }
      return tones.join("");
    }),
  };
}

const ROSE_MASCOT = addRightEdgeGlow({
  mascot: HTML_MASCOT,
  toneMap: HTML_MASCOT_MAP,
});

assertRawHexPalette(HTML_MASCOT_TONES);
assertMascotStructure(ROSE_MASCOT, HTML_MASCOT_TONES);

export function scaleMascot(
  art: MascotArt,
  maximumWidth: number,
  maximumRows: number,
): MascotArt {
  assertMascotStructure(art, HTML_MASCOT_TONES);
  const trimmed = trimMascotMargins(art);
  const inputWidth = mascotCodePointWidth(trimmed.mascot);
  const inputRows = trimmed.mascot.length;
  const scale = Math.min(
    1,
    Math.max(1, Math.floor(maximumWidth)) / inputWidth,
    Math.max(1, Math.floor(maximumRows)) / inputRows,
  );
  const outputWidth = Math.max(1, Math.floor(inputWidth * scale));
  const outputRows = Math.max(1, Math.floor(inputRows * scale));
  const scaled = {
    mascot: Array.from({ length: outputRows }, (_value, outputIndex) => {
      const inputIndex = sampleIndex(outputIndex, outputRows, inputRows);
      return scaleLine(trimmed.mascot[inputIndex] ?? "", outputWidth);
    }),
    toneMap: Array.from({ length: outputRows }, (_value, outputIndex) => {
      const inputIndex = sampleIndex(outputIndex, outputRows, inputRows);
      return scaleLine(trimmed.toneMap[inputIndex] ?? "", outputWidth);
    }),
  };
  assertMascotStructure(scaled, HTML_MASCOT_TONES);
  return scaled;
}

function osdyThemePalette(lineIndex: number): HeaderPalette {
  if (lineIndex < 4) return OSDY_THEME_CYAN_PALETTE;
  if (lineIndex < 8) return OSDY_THEME_SILVER_PALETTE;
  return OSDY_THEME_VIOLET_PALETTE;
}

export const HEADER_VARIANTS: Record<HeaderVariant, HeaderVariantConfig> = {
  "osdy-theme": {
    label: "OsdyTheme",
    header: HEADER_SIMPLE,
    mascot: ROSE_MASCOT.mascot,
    mascotMap: ROSE_MASCOT.toneMap,
    linePalette: osdyThemePalette,
    mascotPalette: OSDY_THEME_MASCOT_PALETTE,
    mascotTonePalette: HTML_MASCOT_TONES,
  },
  classic: {
    label: "Classic",
    header: HEADER_CLASSIC,
    mascot: ROSE_MASCOT.mascot,
    mascotMap: ROSE_MASCOT.toneMap,
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

import { visibleWidth } from "@earendil-works/pi-tui";
import type { HeaderVariant, TextMascotChoice, WorkingActivity } from "./types.js";

export const ANIMATION_ENABLED = true;
export const ANIMATION_INTERVAL_MS = 30;
export const INTRO_ANIMATION_FRAMES = 28;
export const WORKING_ACTIVITY_FRAMES: Record<WorkingActivity, readonly string[]> = {
  thinking: ["◌", "◎", "◉", "●"],
  exploring: ["✶", "✷", "✸", "✹"],
  verifying: ["◇", "◈", "◆", "◈"],
  working: ["✻", "✼", "✽", "❋"],
  delegating: ["✧", "✦", "✧"],
  executing: ["◴", "◷", "◶", "◵"],
};
export const WORKING_SYMBOL_PULSE: readonly string[] = [
  "mdQuoteBorder",
  "thinkingHigh",
  "accent",
  "borderAccent",
  "accent",
  "thinkingHigh",
  "mdQuoteBorder",
  "mdQuoteBorder",
];
export const WORKING_WIDGET_KEY = "osdy-pi-working";
export const WORKING_TREE_WIDGET_KEY = "osdy-pi-working-tree";
/** Blank columns between the header art and the mascot when both fit side by side. */
export const MASCOT_GAP = 4;
export const COMPACT_HEADER_HIDDEN_COLUMNS = 72;
export const STACKED_CONTENT_MAX_ROWS = 32;
export const STACKED_HEADER_MAX_ROWS = 8;
export const STACKED_HEADER_MIN_ROWS = 4;

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

const BTS_MASCOT = [
  "             ▒▒▒▒                          ▒▒▒░             ",
  "            ▓▓▓▓▓▓▒                     ░▒▓▓▓▓▓▒            ",
  "            ▓▓▓ ▒▓▓▒░                  ▒▓▓▓░░▓▓▓            ",
  "          ░▓▓▒    ▒▒▓▒░░  ░▒▒▒▒▒░░   ▒▒▒▓▒    ▒▓            ",
  "          ░▓▓▒     ░▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒░     ▒▓            ",
  "            ▓▓▓ ░░▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒░░ ░▓▓▒            ",
  "             ░▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒░               ",
  "             ░▒▒▒▒▒▓▓▓▓▓▓▓▒▒▒▒▒▒▒▒▒▒▓▓▓▓▓▓▒▒▒               ",
  "            ░▒▒▒▒▓▓▓▒   ▓▓▓▓▓▒▒▒▓▓▓▓▓   ░▓▓▓▓▒              ",
  "            ░▒▒▓▓▓▓      ░▓▓▓▒▒▒▓▓▓░      ▒▓▓▓░     ░   ▒▒  ",
  "           ▒▓▓▓▓░          ▓▓▒▒▒▓▓          ░▓▒░  ▓▓▓▓▓▓░   ",
  "         ▓▓▓▓▓▒       ▓▓     ▒▒▒░    ▓▓        ▓▓▓▓▓▓▓▓▓▓▓▓ ",
  "        ▒▓▓▓▒░            ░▓▓░░░▓▓░           ░▓▓▓▓▒▒▓▒▒▓▓▓▓",
  "          ░▓░            ▓▓▓▓   ▒▓▓▓▓         ▓▓▓▓▓▒▒▓▒▓▓▓▓░",
  "            ▒▓▒       ▓▓▓▓▓▓     ▒▓▓▓▓▓░    ░▓ ░▓▓▓▓▓▓▒▓▓▓  ",
  "               ▓▓░░░░▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▒░▒▓░    ░░▒▓▓▓░    ",
  "                      ░▒▓▓▓▓▓▓▓▓▓▓▓▓▓▒                      ",
  "    ▒▒▒▒▒░           ▒▒▒▒▒▒▒▓▓▓▓▓▓▒▒▒▒▒░         ░          ",
  " ░░▒▒▒▒░░░░       ░░▒▒▒▒▒▒▒▓▓▓▓▓▓▓▓▓▒▒▒▒▒▒░ ░░░  ░          ",
  "▒▒▒▒▒▒     ░      ░▒▒▒░  ▒▓▓▓▓▓▓▓▓▓▓▓▒▒▒▒▒▒▒▒▒░ ░           ",
  "░▒▒░░    ░▒▒▒▒    ░▒▒▒▒░   ▓▓▓▓▓▓▓▓▓▓▓▒░ ░▒▒░░              ",
  "  ▒░   ░▒▒▒▒▒░      ░▒░    ▓▓▓▓▓▓▓▓▓▓▓▒▒▒                   ",
  "       ▒▒▒▒░      ▒▒░   ░▒▓▓▓▓▓▓▓▓▓▓▓▓▒▒▒                   ",
  "      ▒▒▒▒░░      ▒▒▒▒▒▒▓▓▓▓▓▓▓▓▓▓▓▓▓▒▒▒▒                   ",
  "        ░▒░        ▒▒▒▒▒▒▒▓▓▓▓▓▓▓▓▒▒▒▒▒░                    ",
  "                    ░▒▒▒▒░       ░▒▒▒▒░                     ",
] as const;

const BTS_MASCOT_MAP = [
  "             mmmm                          mmmv             ",
  "            lhhhhlv                     dmlhhhhp            ",
  "            hhl mhhpv                  mlhhddhhl            ",
  "          dhhv    mphmvd  dmmmmmvd   mmphp    pl            ",
  "          dhhm     dmmmmmmmmmmmmmmmmmmmmd     pl            ",
  "            hhl ddmmmmmmmmmmmmmmmmmmmmmmmvd dhhp            ",
  "             vmvmmmmmmmmmmmmmmmmmmmmmmmmmmmmv               ",
  "             dmmmmplhhhhhhmmmmmmmmmphhhhhhpmv               ",
  "            vmmmphhhp   lhhhhmmmlhhhh   vhhhlm              ",
  "            vmmhhhl      dlhhmmmlhlv      mlhhd     d   cc  ",
  "           mhhhhd          lhmmmlh          dlpd  hhbbbld   ",
  "         lhhhhp       hb     mmmd    lb        hhhbhcbbbbbh ",
  "        mhhhpd            vhhvvvlhv           dhbbbccbccbbbl",
  "          dhv            hhhh   phhhl         lhhbbcchccbhhv",
  "            plp       lhhhhp     plhhhld    dp dlhbbbbcbhh  ",
  "               pldddvhhhhhhhhhhhhhhhhhhhmdmlv    dvmlhhd    ",
  "                      vmhhhhhhhhhhhhhm                      ",
  "    mmmmmd           mmmmmmmllllllmmmmmv         d          ",
  " dvmmmmvvvd       dvmmmmmmmhhhhhhhhlmmmmmvv dvd  d          ",
  "vmmmmm     d      vmmmd  phhhhhhhhhhhmmmmmmmmmv d           ",
  "vmmvd    vmmmm    vmmmmv   hhhhhhhhhhhmv vmmvd              ",
  "  md   dmmmmmv      vmd    hhhhhhhhhhhmmm                   ",
  "       mmmmv      mmv   dmhhhhhhhhhhhhmmm                   ",
  "      mmmmvd      mmmmmmhhhhhhhhhhhhhmmmm                   ",
  "        vmd        mmmmmmmhhhhhhhhmmmmmv                    ",
  "                    dmmmmv       vmmmmd                     ",
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

const NEON_HEADER_ROWS = [
  ["                                                             █████████                                                  ████████ ", "                                                             ddddddddd                                                  dddddddd "],
  ["          ██████████████████████                           ███████████                         █████████████████████ ████████████", "          dddddddddddpdddddddddd                           ddccccccddd                         ddddddddddddddddddddd ddccccccccpd"],
  ["        ██████████████████████████                        ███████████                        ████████████████████████████████████", "        dddccchhhhhhhhhhhhhhhcpddd                        ddcchhhhmdd                        dddccchhhhhhhhhhhhhhhcdddphhhhhllddd"],
  ["      ███████████████████████████████████████████████████████████████████████████████       ████████████████████████████████████ ", "      pddpchhhhhhhhhhhhhhhhhhhhmdddddddddddddddddddddddddddchhhhhmdddddddddpddddddddd       ddpllhhhhhhllllllhhhhhhmdddddddddddd "],
  ["     ████████████████████████████████████████████████████████████████████████████████       ███████████████████████████████████  ", "     ddpchhhhhhldddddddchhhhhlmddppchhhhhhhhhhhcdppcchhhhhhhhhhhldchhhhhpdddpchhhhcdd       dddddcchhhhdddddpchhhhlddpcchhhcpdd  "],
  ["   ██████████████   ████████████████████████████████████████████ ████████████████████████████████████████ ████████████████████   ", "   dddcchhhhhlddd   ddchhhhhldpcchhhhlmmmmmmmddcchhhhlmmlhhhhhhd chhhhlddddcchhhhddddddddddddddpchhhhhmdd dchhhhhmddpchhhhlddd   "],
  ["  ██████████████  ███████████████████████████████████████████████████████████████████████████████████████████████████████████    ", "  dddcchhhhhmddd  pdcchhhhhlddpplhhhhlddddddddcchhhhldddchhhhlddchhhhhmddpchhhhhldcchhhhhhhlpdpcchhhhhhhhhhhhhmmdddpchhhhlddd    "],
  [" ████████████████████████████ █████████████████████████████████████████████████████████████████████████████████████████████      ", " ddcchhhhhldddddddpchhhhhhmdd dddmhhhhhldddddchhhhlmddpchhhhmddchhhhhhcccchhhhhmddlllllllllddpchhhhhlllllllldddddpcchhhhldd      "],
  ["█████████████████████████████████████████████████████████████████████████████████████████████████████████████  ████████████████  ", "ddchhhhhhhlcccccccchhhhhhddpccccccchhhhhhddpchhhhhhcccchhhhlddddmhhhhhhhhhhhhhmdddddddddddddpchhhhldddddddddd  ddchhhhhmddddddd  "],
  [" ███████████████████████████████████████████████████████████████████████████████          ██████████         ██████████████████  ", " ddmhhhhhhhhhhhhhhhhhhhddpchhhhhhhhhhhhmddddhhhhhhhhhhhhhhmdddddddddddpchhhhhmdd          pchhhhhldd         dddchhhhhhhhmddddd  "],
  ["   █████████████████████████████████████   ████████████████████████████████████         ███████████          ███████████  █      ", "   ddddddddddddddddddddddddddddddddddddd   ddddddddddddddddddcchhhhhhhhhhhhmddd         dpccldddddd          dpchldddddd  d      "],
  ["                                                         ██ █████████████████           ██████               ██████              ", "                                                         dd chhhhhhhhhhlddddd           dddddd               dddddd              "],
  ["                                                         ████████████████                                                        ", "                                                         dddddddddddddddd                                                        "],
] as const;

const NEON_HEADER_TONES: MascotTonePalette = {
  b: "#FFFFFF",
  h: { kind: "theme", token: "accent" },
  l: { kind: "theme", token: "accent", dimmed: true },
  m: { kind: "theme", token: "accent", dimmed: true },
  d: "#12011B",
  p: { kind: "theme", token: "accent", dimmed: true },
  c: "#FFFFFF",
  v: "#FFFFFF",
};

const BLOCK_SHADOW_HEADER_ROWS = [
  "    ███████                  █████                       ███████████    ███ ",
  "  ███░░░░░███               ░░███                        ░░███░░░░░███  ░░░ ",
  " ███     ░░███  █████     ███████  █████ ████             ░███    ░███ ████ ",
  "░███      ░███ ███░░     ███░░███  ░░███ ░███  █████████  ░██████████  ░░███",
  "░███      ░███ ░░█████  ░███ ░███   ░███ ░███  ░░░░░░░░░  ░███░░░░░░    ░███",
  "░░███     ███   ░░░░███ ░███ ░███   ░███ ░███             ░███          ░███",
  " ░░░███████░    ██████  ░░████████  ░░███████             █████        █████",
  "   ░░░░░░░     ░░░░░░    ░░░░░░░░    ░░░░░███            ░░░░░         ░░░░░",
  "                                      ███ ░███                              ",
  "                                     ░░██████                               ",
  "                                      ░░░░░░                                ",
] as const;

const BLOCK_SHADOW_FACE_TONES = ["p", "v", "c"] as const;
const BLOCK_SHADOW_EDGE_TONES = ["l", "m", "d"] as const;

function blockShadowBand(rowIndex: number): 0 | 1 | 2 {
  if (rowIndex < 3) return 0;
  return rowIndex < 6 ? 1 : 2;
}

/** Derives a tone row from block glyphs: faces glow, shadows dim, per row band. */
function deriveBlockShadowToneRow(row: string, rowIndex: number): string {
  const band = blockShadowBand(rowIndex);
  return Array.from(row, (glyph) => {
    if (glyph === "█") return BLOCK_SHADOW_FACE_TONES[band];
    if (glyph === "░") return BLOCK_SHADOW_EDGE_TONES[band];
    return " ";
  }).join("");
}

const BLOCK_SHADOW_HEADER_TONES: MascotTonePalette = {
  b: { kind: "theme", token: "mdLink", dimmed: true },
  h: { kind: "theme", token: "accent" },
  l: { kind: "theme", token: "accent", dimmed: true },
  m: { kind: "theme", token: "mdLink", dimmed: true },
  d: { kind: "theme", token: "mdHeading", dimmed: true },
  p: { kind: "theme", token: "accent" },
  c: { kind: "theme", token: "mdHeading" },
  v: { kind: "theme", token: "mdLink" },
};

/**
 * Slanted sans-serif header drawn as 78 by 22 logical pixels (two per terminal row).
 * Keys are roles, not colors: C = bevel, S = face, V = depth, "." = transparent.
 * header-slanted.ts maps the roles to theme tokens when rendering.
 */
const SLANTED_PIXEL_ROWS = [
  ".........................................................................CCC..",
  "......CCCC........................CCCCC..................................CSSC.",
  "....CCCSSSCCC.....................CSSSS.....................CCCCCCCCC...CCSSS.",
  "..CCCSSSSSSSSC....................CSSSVV...................CCSSSSSSSSC...SSSSV",
  "..CSSSSSSSSSSSC...................CSSSVV...................CSSSSSSSSSS...VVVVV",
  ".CCSSSSSSSSSSSS...CCCCCC.....CCCC.CSSSVCCCCC...CCCC........CSSSSVSSSSSV.CCCCVV",
  "CCSSSSVVVVSSSSSV.CCSSSSSC..CCCSSSCCSSSVCSSSS..CCSSS........CSSSVVVSSSSV.CSSS..",
  "CSSSSVVVVVCSSSSVCCSSSSSSV.CCSSSSSSSSSSV.SSSSV.CSSSVV.......CSSSCCCCSSSV.CSSSV.",
  "CSSSSVV...CSSSSVCSSSVVVVVVCSSSSVSSSSSSV.CSSSVCCSSSVCCCCCC..CSSSSSSSSSSVCCSSSV.",
  "CSSSSV....CSSSSVCSSSCCCVV.CSSSVVVSSSSVV.CSSSVCSSSVVCSSSSS.CCSSSSSSSSSVVCSSSSV.",
  "CSSSSV....CSSSSV.SSSSSSC.CCSSSVV.CSSSVV.CSSSCCSSSVVCSSSSVVCSSSSSSSSVVVVCSSSSV.",
  "CSSSSC..CCCSSSVV.VVSSSSS.CSSSSV.CCSSSV..CSSSSSSSVV.CSSSSVVCSSSSVVVVVVV.CSSSVV.",
  ".SSSSSCCCSSSSSVVCCVVSSSSVCSSSSCCCSSSSV...SSSSSSSVV..VVVVV.CSSSVVVVVV...CSSSVV.",
  ".CSSSSSSSSSSSVVCCSCCCSSSV.SSSSSSSSSSSV...CSSSSSVV...VVVVV.CSSSVV.......CSSSV..",
  "..SSSSSSSSSSVVVCSSSSSSSVV.CSSSSSSSSSSV...CSSSSSVV........CCSSSV.......CCSSSV..",
  "..VVSSSSSVVVVV..VSSSSVVVV..VSSSVVVVVVV...CSSSSVV...........VVVV.........VVVV..",
  "...VVVVVVVVVV...VVVVVVVV...VVVVVVVVVVV.CCCSSSVVV..........VVVVV........VVVVV..",
  ".....VVVVV........VVVV.......VVV......CCSSSSSVV...............................",
  "......................................CSSSSSVV................................",
  "......................................CSSSSVVV................................",
  ".......................................VVVVVV.................................",
  ".......................................VVVVV..................................",
] as const;

const SLANTED_GLYPHS = [" ", "▄", "▀", "█"] as const;

/** Monochrome silhouette of the pixel art: one half-block glyph per terminal cell. */
function deriveSlantedGlyphRow(cellRow: number): string {
  const top = SLANTED_PIXEL_ROWS[cellRow * 2] ?? "";
  const bottom = SLANTED_PIXEL_ROWS[cellRow * 2 + 1] ?? "";
  return Array.from(top, (topPixel, column) => {
    const upper = topPixel !== "." ? 2 : 0;
    const lower = bottom[column] !== undefined && bottom[column] !== "." ? 1 : 0;
    return SLANTED_GLYPHS[upper + lower];
  }).join("");
}

const SLANTED_HEADER_ROWS = Array.from(
  { length: SLANTED_PIXEL_ROWS.length / 2 },
  (_value, cellRow) => deriveSlantedGlyphRow(cellRow),
);

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

export type ThemeForegroundColor = {
  kind: "theme";
  token: string;
  dimmed?: true;
};

export type MascotTonePalette = Record<MascotToneKey, string | ThemeForegroundColor>;

type HeaderVariantConfig = {
  label: string;
  header: readonly string[];
  headerMap?: readonly string[];
  headerTonePalette?: MascotTonePalette;
  /** Role-keyed pixel rows; when set the renderer draws these instead of `header` text art. */
  pixelHeader?: readonly string[];
  mascot?: readonly string[];
  mascotMap?: readonly string[];
  linePalette: (lineIndex: number) => HeaderPalette;
  mascotPalette: HeaderPalette;
  mascotTonePalette?: MascotTonePalette;
};

const OSDY_THEME_CYAN_PALETTE: HeaderPalette = {
  baseColor: "accent",
  highlightColor: "mdHeading",
  trailColor: "mdLink",
};

const OSDY_THEME_SILVER_PALETTE: HeaderPalette = {
  baseColor: "mdLink",
  highlightColor: "accent",
  trailColor: "mdHeading",
};

const OSDY_THEME_VIOLET_PALETTE: HeaderPalette = {
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
  b: "#F9F7F2",
  h: "#F0E5D7",
  l: "#C7B4A1",
  m: "#7D6F67",
  d: "#2A2321",
  p: "accent",
  c: "mdHeading",
  v: "mdLink",
};

const BTS_MASCOT_TONES: MascotTonePalette = {
  b: "#FCFCFC",
  h: "#F9F3E7",
  l: "#DDD5CC",
  m: "#969291",
  d: "#53445F",
  p: "#C9BBA8",
  c: "#CDA5F1",
  v: "#746D6C",
};

const RAW_BODY_TONE_KEYS = [
  MASCOT_TONE_KEYS.background,
  MASCOT_TONE_KEYS.bright,
  MASCOT_TONE_KEYS.light,
  MASCOT_TONE_KEYS.mid,
  MASCOT_TONE_KEYS.dark,
] as const;
const RAW_HEX_COLOR = /^#[0-9A-F]{6}$/;

function assertRawHexPalette(palette: MascotTonePalette): void {
  for (const tone of RAW_BODY_TONE_KEYS) {
    const color = palette[tone];
    if (typeof color !== "string" || !RAW_HEX_COLOR.test(color)) {
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

// Transparent overlay at Current's mouth/shoulders (row 17 onward).
// ▓ = dark cape, ▒ = crimson lining. Keep the face and tail.
const VAMPIRE_COSTUME = [
  "        ▓                                     ▓",
  "         ▓▒▓                               ▓▒▒▓",
  "          ▓▒▒▒▓                        ▓▒▒▒▒▓",
  "           ▓▒▒▒▒▒▒▓                 ▓▒▒▒▒▒▒▓",
  "            ▓▓▒▒▒▒▒▓▓             ▓▓▒▒▒▒▒▓▓",
  "            ▓▓▓▒▒▒▓▓             ▓▓▒▒▒▓▓▓",
  "           ▓▓▓▒▒▒▓▓               ▓▓▒▒▓▓▓",
  "          ▓▓▓▒▒▒▓▓                ▓▓▒▒▒▓▓",
  "         ▓▓▓▒▒▒▓▓                  ▓▓▒▒▓▓",
  "        ▓▓▓▒▒▒▓▓                   ▓▓▒▒▓▓",
  "       ▓▓▓▒▒▒▓▓                     ▓▓▒▒▓▓",
  "      ▓▓▓▒▒▒▓▓                      ▓▓▒▒▓▓",
  "     ▓▓▓▒▒▒▓▓                        ▓▓▒▒▓▓",
  "    ▓▓▓▓▒▒▓▓                         ▓▓▒▒▓▓",
  "   ▓▓▓▓▒▒▓▓                           ▓▓▒▓▓",
  "    ▓▓▓▓▓▓                             ▓▓▓",
] as const;

function addVampireCostume(art: MascotArt): MascotArt {
  const rows = art.mascot.map((line, row) => {
    const glyphs = Array.from(line);
    // Reserve b for lining; retain the few original eye glints in ivory h.
    const tones = Array.from((art.toneMap[row] ?? "").replaceAll("b", "h"));
    for (const [column, glyph] of Array.from(VAMPIRE_COSTUME[row - 17] ?? "").entries()) {
      if (glyph === " ") continue;
      glyphs[column] = glyph;
      if (glyph === "▓") tones[column] = "d";
      else if (glyph === "▒") tones[column] = "b";
      else tones[column] = "h";
    }
    return { mascot: glyphs.join(""), toneMap: tones.join("") };
  });
  return { mascot: rows.map((row) => row.mascot), toneMap: rows.map((row) => row.toneMap) };
}

const HALLOWEEN_MASCOT_TONES: MascotTonePalette = {
  ...HTML_MASCOT_TONES,
  b: "#9F2342",
};
const HALLOWEEN_MASCOT = addRightEdgeGlow(addVampireCostume({
  mascot: HTML_MASCOT,
  toneMap: HTML_MASCOT_MAP,
}));
const ROSE_MASCOT = addRightEdgeGlow({
  mascot: HTML_MASCOT,
  toneMap: HTML_MASCOT_MAP,
});
const BTS_MASCOT_ART = addRightEdgeGlow({
  mascot: BTS_MASCOT,
  toneMap: BTS_MASCOT_MAP,
});
for (const [art, palette] of [
  [ROSE_MASCOT, HTML_MASCOT_TONES],
  [BTS_MASCOT_ART, BTS_MASCOT_TONES],
  [HALLOWEEN_MASCOT, HALLOWEEN_MASCOT_TONES],
] as const) {
  assertRawHexPalette(palette);
  assertMascotStructure(art, palette);
}

export type MascotConfig = {
  art: MascotArt;
  tonePalette: MascotTonePalette;
};

export const MASCOTS: Record<TextMascotChoice, MascotConfig> = {
  current: { art: ROSE_MASCOT, tonePalette: HTML_MASCOT_TONES },
  bts: { art: BTS_MASCOT_ART, tonePalette: BTS_MASCOT_TONES },
  "osdy-halloween": { art: HALLOWEEN_MASCOT, tonePalette: HALLOWEEN_MASCOT_TONES },
};

export function mascotForChoice(choice: TextMascotChoice): MascotConfig {
  return MASCOTS[choice];
}

type PreparedMascotArt = {
  art: MascotArt;
  width: number;
  rows: number;
};

function prepareMascotArt(art: MascotArt): PreparedMascotArt {
  assertMascotStructure(art, HTML_MASCOT_TONES);
  const trimmed = trimMascotMargins(art);
  return {
    art: trimmed,
    width: mascotCodePointWidth(trimmed.mascot),
    rows: trimmed.mascot.length,
  };
}

export function mascotWidthForRows(
  art: MascotArt,
  maximumRows: number,
): number {
  const prepared = prepareMascotArt(art);
  const heightScale = Math.min(
    1,
    Math.max(1, Math.floor(maximumRows)) / prepared.rows,
  );
  return Math.max(1, Math.floor(prepared.width * heightScale));
}

export function scaleMascot(
  art: MascotArt,
  maximumWidth: number,
  maximumRows: number,
): MascotArt {
  const prepared = prepareMascotArt(art);
  const scale = Math.min(
    1,
    Math.max(1, Math.floor(maximumWidth)) / prepared.width,
    Math.max(1, Math.floor(maximumRows)) / prepared.rows,
  );
  const outputWidth = Math.max(1, Math.floor(prepared.width * scale));
  const outputRows = Math.max(1, Math.floor(prepared.rows * scale));
  const scaled = {
    mascot: Array.from({ length: outputRows }, (_value, outputIndex) => {
      const inputIndex = sampleIndex(outputIndex, outputRows, prepared.rows);
      return scaleLine(prepared.art.mascot[inputIndex] ?? "", outputWidth);
    }),
    toneMap: Array.from({ length: outputRows }, (_value, outputIndex) => {
      const inputIndex = sampleIndex(outputIndex, outputRows, prepared.rows);
      return scaleLine(prepared.art.toneMap[inputIndex] ?? "", outputWidth);
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
  neon: {
    label: "Neon",
    header: NEON_HEADER_ROWS.map(([header]) => header),
    headerMap: NEON_HEADER_ROWS.map(([, toneMap]) => toneMap),
    headerTonePalette: NEON_HEADER_TONES,
    mascot: ROSE_MASCOT.mascot,
    mascotMap: ROSE_MASCOT.toneMap,
    linePalette: osdyThemePalette,
    mascotPalette: OSDY_THEME_MASCOT_PALETTE,
    mascotTonePalette: HTML_MASCOT_TONES,
  },
  "block-shadow": {
    label: "Block Shadow",
    header: BLOCK_SHADOW_HEADER_ROWS,
    headerMap: BLOCK_SHADOW_HEADER_ROWS.map(deriveBlockShadowToneRow),
    headerTonePalette: BLOCK_SHADOW_HEADER_TONES,
    mascot: ROSE_MASCOT.mascot,
    mascotMap: ROSE_MASCOT.toneMap,
    linePalette: osdyThemePalette,
    mascotPalette: OSDY_THEME_MASCOT_PALETTE,
    mascotTonePalette: HTML_MASCOT_TONES,
  },
  slanted: {
    label: "Slanted",
    header: SLANTED_HEADER_ROWS,
    pixelHeader: SLANTED_PIXEL_ROWS,
    mascot: ROSE_MASCOT.mascot,
    mascotMap: ROSE_MASCOT.toneMap,
    linePalette: osdyThemePalette,
    mascotPalette: OSDY_THEME_MASCOT_PALETTE,
    mascotTonePalette: HTML_MASCOT_TONES,
  },
};

export type ScaledHeaderArt = {
  header: readonly string[];
  toneMap: readonly string[] | undefined;
  sourceIndexes: number[];
};

export function headerWidth(variant: HeaderVariant): number {
  return HEADER_VARIANTS[variant].header.reduce(
    (maxWidth, line) => Math.max(maxWidth, visibleWidth(line)),
    0,
  );
}

export function scaleHeader(
  variant: HeaderVariant,
  maximumWidth: number,
  maximumRows: number,
): ScaledHeaderArt {
  const source = HEADER_VARIANTS[variant];
  const inputWidth = headerWidth(variant);
  const inputRows = source.header.length;
  if (maximumWidth >= inputWidth && maximumRows >= inputRows) {
    return {
      header: source.header,
      toneMap: source.headerMap,
      sourceIndexes: source.header.map((_line, index) => index),
    };
  }
  const scale = Math.min(
    1,
    Math.max(1, Math.floor(maximumWidth)) / inputWidth,
    Math.max(1, Math.floor(maximumRows)) / inputRows,
  );
  const outputWidth = Math.max(1, Math.floor(inputWidth * scale));
  const outputRows = Math.max(1, Math.floor(inputRows * scale));
  const sourceIndexes = Array.from(
    { length: outputRows },
    (_value, outputIndex) => sampleIndex(outputIndex, outputRows, inputRows),
  );
  return {
    header: sourceIndexes.map((sourceIndex) =>
      scaleLine(source.header[sourceIndex] ?? "", outputWidth),
    ),
    toneMap: source.headerMap
      ? sourceIndexes.map((sourceIndex) =>
          scaleLine(source.headerMap?.[sourceIndex] ?? "", outputWidth),
        )
      : undefined,
    sourceIndexes,
  };
}

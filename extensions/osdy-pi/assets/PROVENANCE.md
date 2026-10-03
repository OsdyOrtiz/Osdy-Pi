# Assistant marker artwork

`assistant-mascot.png` is the landing's raccoon, exported as a transparent 360 × 350 RGBA PNG. It is not the unrelated package cover image.

## Reproduce

With the existing landing dependencies and Chromium installed, run from Osdy-Pi:

```sh
node extensions/osdy-pi/assets/assistant-mascot-export.mjs /path/to/osdy-pi-landing
```

The exporter reads the landing without modifying it and writes only the adjacent SVG and PNG. No runtime browser or font dependency is added.

## Fidelity and origin

- Source: `osdy-pi-landing/src/components/Mascot.tsx` and `src/data/mascot.ts`, adapted from Osdy-Pi's `HTML_MASCOT`, map, and tones. Artwork: MIT, Copyright (c) 2026 Osdy.
- Geometry: original 360 × 350 viewBox, 6px character pitch, 10px row pitch, 9px first baseline, and last-three-occupied-character edge selection.
- Font: landing's `@fontsource/jetbrains-mono` Latin normal 400 WOFF2, loaded into the export page only; Chromium waits for the font before capture. The retained SVG references the font family but does not redistribute font bytes. JetBrains Mono is licensed under SIL OFL 1.1 (see the installed font package's LICENSE).
- Palette: body `#F9F7F2`, `#F0E5D7`, `#C7B4A1`, `#7D6F67`, `#2A2321`; edge p/c/v `#22d3ee`/`#a78bfa`/`#67e8f9`. These resolve the default landing theme (`themes[0]`, Osdy Pi New). Alternate landing themes can have pink edges; this fixed asset intentionally preserves the default, not all theme variants.
- Generated artifacts: SVG source and PNG, captured headlessly with Playwright Chromium at device scale 1 and no background.

## Terminal boundary

The assistant marker uses Pi's real `Image`, at most 3 columns × 2 rows. At default 9 × 18 pixel cells it reserves 3 × 1 on Kitty and 3 × 2 on iTerm2. iTerm2 sends `height=auto`, so width is additionally bounded using current cell geometry. Narrow widths down to 2 columns remain safe; invalid widths render an empty row.

PNG preview was inspected. Automated protocol tests are not a live Kitty/iTerm2 visual check; legibility at tiny terminal size still requires the user's trial. Emoji fallback and stored marker lifecycle are unchanged.

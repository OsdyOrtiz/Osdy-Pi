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

# Original bundled notification sound

`notification-default.wav` is an original synthesized two-note chime created for Osdy Pi, shared by every unconfigured audio event. No recording, external asset, download, or OS sound is used. Distributed under the repository's MIT license.

## Reproduction

Generate a 44-byte canonical little-endian RIFF/WAVE header followed by 4,320 signed PCM16 mono samples at 24,000 Hz (180 ms). Header: format chunk size 16, audio format 1, channels 1, sample rate 24000, byte rate 48000, block alignment 2, bits per sample 16, data size 8640, RIFF size 8676. Total file size: 8684 bytes.

For sample index `i = 0..4319`, let `t = i / 24000`. For each note with start `s` and frequency `f`, set `u = (t - s) / 0.11` and:

```js
note(s, f) = u <= 0 || u >= 1
  ? 0
  : Math.sin(Math.PI * u) ** 2 * Math.sin(2 * Math.PI * f * (t - s));
sample = Math.round(1800 * (note(0, 660) + note(0.07, 880)));
```

Write each sample with Node's `Buffer.writeInt16LE` at offset `44 + i * 2`. The squared-sine envelope provides smooth attack and release; the low amplitude is intentionally subtle. Regeneration uses JavaScript double-precision arithmetic and `Math.round`, not normalization, dithering, randomness, or metadata. Subjective sound quality and live macOS/Windows playback remain manual checks.

SHA-256: `89f8e5e70edacb8c5232c3384d704906d5c6f8aa619f4c988a72be23636955dc`.

# Pi raccoon pixel art

Hoodie Pi, Pixel Pal, and Tiny Doodle follow the OpenPets "Pi" raccoon ("A friendly programmer companion"), supplied by the maintainer:

- `pi-base-neutral.png`, a 1122 × 1402 RGBA neutral pose;
- `pi/spritesheet.webp` from `pi-openpets.zip`, a 1536 × 1872 lossless WebP of 8 × 9 cells, 192 × 208 pixels each, with rows idle, run right, run left, waving, jumping, failed, waiting, running, and review.

Outputs:

- `../pi-raccoon-sprites.ts` (generated): the `pi` header mascot from the neutral pose (`PI_RACCOON_MASCOT_SIZES`), its startup wave from the spritesheet's four waving frames (`PI_RACCOON_MASCOT_WAVE`), and the Pixel Pal 24 × 24 editor companion animations from the spritesheet.
- `../companion-sprite.ts` (hand-drawn): the Tiny Doodle 16 × 16 companion, drawn pixel by pixel after the neutral pose with a palette sampled from it; the spritesheet served only as a pose reference.

## Reproduce the generated sprites

```sh
dwebp spritesheet.webp -o sheet.png
node scripts/generate-companion-sprites.mjs pi-base-neutral.png sheet.png extensions/osdy-pi/pi-raccoon-sprites.ts preview.png wave-preview.png
```

Both sources are resampled, not grid-aligned pixel art (thousands of colors, no clean pixel pitch), so every size is an approximation. They are drawn with five flat colors, which the generator restores:

1. Every opaque source pixel (alpha ≥ 128) snaps to the nearest flat color: outline and mask `O`, hoodie `H`, fur `G`, light fur and eye highlights `L`, zipper `Z`. This removes the resampling noise.
2. Each grid pixel takes a weighted vote over the classes of the source area it covers (8 × 8 samples; transparent unless at least 40% is opaque). Weights favor thin details: outline 1.6, light fur 1.3, zipper 4, others 1.
3. Eye highlights are smaller than a grid pixel and lose the vote to the dark mask, so they are found in the source: light fur spots of 0.02–0.28% of the crop area, at least 60% bordered by dark (`O` or `H`), between 22% and 55% of the character's opaque height from its top (the eye band, below the ears and above the muzzle). The two most enclosed spots each turn the dark grid pixel that holds them into `L`. Nothing outside the eyes changes.
4. Isolated pixels whose four neighbors agree are replaced by that neighbor, except light fur and the zipper.

Sizes:

- header mascot: the opaque bounds (912 × 1018 at 96, 274) at 64, 56, 48, 40, 32, 24, and 16 pixels tall;
- header wave: for every header size, the four waving frames reduced with the same pipeline to exactly that size's neutral grid width and height. Matching grids do not guarantee a stationary decorated header: a changed leading blank row can shift it by about one terminal row. The crop is taken from the 192 × 208 cell with the neutral grid's aspect ratio, 160 source pixels tall, bottom-aligned on the feet (row 201 of the cell) and centered on the cell (column 96), so the raised paw and ears fit and the character appears at about the neutral pose's scale. `wave-preview.png` shows, per size, the neutral pose and the four wave frames side by side for inspection;
- Pixel Pal companion: a 168 × 168 crop per cell into 24 × 24 pixels (7 source pixels each). Jump peaks lose their ear tips to the crop.

## Other supplied companion and header packs

These packs are represented by the integrated TypeScript artwork below; the original archives, supplied Python/external asset scripts, and font files are not runtime requirements. This documentation pass did not execute any supplied asset script.

| Supplied source | Included artwork | Integration and transformation |
| --- | --- | --- |
| `pi-openpets.zip` (`pi/spritesheet.webp`) and `pi-base-neutral.png` | Hoodie Pi (`pi`), its startup wave, Pixel Pal (`original`), and the Tiny Doodle (`drawn`) reference | `../pi-raccoon-sprites.ts` and `../companion-sprite.ts`; conversion/redrawing described above |
| `pi-rounded-terminal-v2.zip` (`pi-rounded/frames.json`, rounded-v2) | Big Cuddle (`rounded`), 48 × 52 pixels | `../pi-rounded-sprites.ts`; repository generator `scripts/generate-pi-pack-sprites.mjs` preserves native grids and the 31-color palette, maps transparent `0` to `.`, and retains selected states and their timing |
| `pi-terminal.zip` (`pi-terminal/frames.json`, terminal v1) | Retro Buddy (`terminal`), 24 × 24 pixels | `../pi-terminal-sprites.ts`; `scripts/generate-pi-terminal-sprites.mjs` preserves grids and five opaque colors; the supplied 16 × 16 variant is not used |
| `pi-terminal-v2.zip` (`pi-terminal-v2/frames.json`) | Slim Ringtail (`slim`), 24 × 24, and Pocket Ringtail (`slim-small`), separately drawn 16 × 16 | `../pi-slim-sprites.ts`; `scripts/generate-pi-slim-sprites.mjs` preserves grids, five opaque colors, and each retained frame's individual duration |
| Supplied `header-v2` pack | Block Shadow (`block-shadow`), 76 columns × 11 rows | `BLOCK_SHADOW_HEADER_ROWS` in `../constants.ts`; supplied block/shadow glyph geometry with derived tone maps and active-theme colors |
| Supplied `header-v3` pack | Slanted (`slanted`), 78 columns × 11 terminal rows | `SLANTED_PIXEL_ROWS` in `../constants.ts` and rendering in `../header-slanted.ts`; derived from supplied glyph geometry into 78 × 22 logical bevel/face/depth pixels, with active-theme colors; no font files redistributed |

For all three terminal companion packs, generation keeps the mapped activity states and removes active frames identical to the first resting idle frame. Runtime displays idle as a still frame and rounds pack timing to the shared 80 ms working tick; Slim/Pocket keep per-frame timing rather than one duration per animation. The repository generators can be inspected without running supplied scripts; regeneration commands are in the README and require the source packs separately.

## Maintainer redistribution confirmation

For the integrated sprite and header packs listed above, the maintainer was asked whether they had the rights to redistribute them publicly in the npm package under MIT and answered: **“Sí, puedo redistribuirlos bajo MIT”** (“Yes, I can redistribute them under MIT”). This is the maintainer confirmation recorded in feature specification S3 (`odd/tasks/visual-companions-release.md`), and is the basis for including this artwork under the repository's MIT license.

This is **a maintainer attestation, not an independently verified upstream license** or a claim that OpenPets or another upstream author published these packs under MIT. No independent upstream license verification is recorded here. Existing original artwork, sound, and font-license notices above remain unchanged.

The startup wave can be subtle at small sizes and can shift the decorated header by about one row. Live terminal/font appearance and fidelity have not been verified for these additions; automated grid/rendering checks do not establish a hardware visual pass.

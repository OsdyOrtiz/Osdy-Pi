# Two-color working letter wave

## Goal
Make the above-editor `Working...` / `Running ...` animation more noticeable while keeping the existing Braille spinner, spacing, grapheme-safe movement, active-theme response, and lifecycle.

## Decision and scope
- The user selected Pi's `borderAccent` semantic color as the secondary color across all themes; Pi does not expose a `secondary` foreground role. This may coincide with or resemble `accent` in individual palettes, and contrast is not guaranteed.
- Show two neighboring moving non-whitespace graphemes: the current wave position in `accent` and its trailing position in `borderAccent`; other graphemes keep `text`. A single-letter label stays in `accent`, and whitespace does not consume a wave position.
- Only update `extensions/osdy-pi/working-animation.ts`, its deterministic tests, and the matching README description. Do not change spinner timing, controller cleanup, theme JSON, package metadata, or the unrelated dirty files in the original checkout.

## Work unit
- [x] **WAVE-SECONDARY-001 — Render and document the two-color wave.** Added an `accent` current grapheme and trailing `borderAccent` grapheme without changing the spinner, timing, other letters or layout. Writer observed four focused RED failures before the renderer change, then five GREEN focused tests. Independent verifier confirmed the final five focused tests, 187 extension and 60 script tests, typecheck, lint and `git diff --check`; a distinct theme-switch fixture closes the stale-secondary blind spot. Changed paths are renderer, tests and README. Manual interactive theme-switch smoke was not run. Rollback: revert only this work unit's renderer, tests and README behavior; leave previous working lifecycle and theme palettes intact. Work-unit commit: `82f3006cf64a7bcb894267a36d0e2a57880402ed` (`feat(ui): animate working letters in two theme colors`, 67 changed diff lines including this ledger).
- [x] **WAVE-BOLD-002 — Emphasize only the traveling accent letter.** Added optional `SimpleTheme.bold` compatibility, wrapping only the current `accent` grapheme with the active theme's bold; the trailing `borderAccent` letter, spinner and rest remain unbolded. No font-size/layout, controller, theme-palette, account or auth change. Writer observed a focused RED on the unbolded frame-zero accent, then GREEN 6/6. Independent verifier checked fg-only fallback, Unicode width, theme-switch, spinner and trailing scope; reran 6 focused, 188 extension and 60 script tests, typecheck, lint and diff check—all passed. Active LSP found zero diagnostics across the three TypeScript files. Interactive appearance was not observed; terminal bold rendering can vary. Rollback: revert only the bold renderer/type/test/README work unit, preserving the two-color wave. Commit identity: pending local work-unit commit.

## Verification
- Focused test command: `node --test --experimental-strip-types extensions/osdy-pi/working-animation.test.ts`.
- Full checks: `npm run typecheck`, `npm run lint`, `npm test`, `git diff --check`.
- Real interactive theme-switch smoke was not performed. A test theme proves the renderer consumes current theme colors, not visual contrast in every palette. Native review inspect was blocked by `package-local-binary-missing`; no lineage or approval was created, so an independent verifier checked the work unit.

## Next step
Commit the verified WAVE-BOLD-002 unit locally, then ask for a visual judgment in this checkout. No push, PR, merge or release has been requested for this feature. Preserve the four unrelated dirty/untracked files already present in the checkout.

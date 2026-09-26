# Two-color working letter wave

## Goal
Make the above-editor `Working...` / `Running ...` animation more noticeable while keeping the existing Braille spinner, spacing, grapheme-safe movement, active-theme response, and lifecycle.

## Decision and scope
- The user selected Pi's `borderAccent` semantic color as the secondary color across all themes; Pi does not expose a `secondary` foreground role. This may coincide with or resemble `accent` in individual palettes, and contrast is not guaranteed.
- Show two neighboring moving non-whitespace graphemes: the current wave position in `accent` and its trailing position in `borderAccent`; other graphemes keep `text`. A single-letter label stays in `accent`, and whitespace does not consume a wave position.
- Only update `extensions/osdy-pi/working-animation.ts`, its deterministic tests, and the matching README description. Do not change spinner timing, controller cleanup, theme JSON, package metadata, or the unrelated dirty files in the original checkout.

## Work unit
- [x] **WAVE-SECONDARY-001 — Render and document the two-color wave.** Added an `accent` current grapheme and trailing `borderAccent` grapheme without changing the spinner, timing, other letters or layout. Writer observed four focused RED failures before the renderer change, then five GREEN focused tests. Independent verifier confirmed the final five focused tests, 187 extension and 60 script tests, typecheck, lint and `git diff --check`; a distinct theme-switch fixture closes the stale-secondary blind spot. Changed paths are renderer, tests and README. Manual interactive theme-switch smoke was not run. Rollback: revert only this work unit's renderer, tests and README behavior; leave previous working lifecycle and theme palettes intact. Commit identity: pending local work-unit commit.

## Verification
- Focused test command: `node --test --experimental-strip-types extensions/osdy-pi/working-animation.test.ts`.
- Full checks: `npm run typecheck`, `npm run lint`, `npm test`, `git diff --check`.
- Real interactive theme-switch smoke is optional and must be reported as skipped unless observed. A test theme can prove the renderer consumes current theme colors, not visual contrast in every palette.

## Next step
Commit the verified work unit on this local feature branch, record its identity, and keep the original dirty checkout untouched. No push, PR, merge or release has been requested for this feature.

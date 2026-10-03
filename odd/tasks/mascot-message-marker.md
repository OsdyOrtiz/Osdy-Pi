# Small raccoon assistant marker

## Objective
Try the landing's tiny Osdy raccoon instead of the assistant emoji, without changing message content or the existing header mascot.

## Scope and constraints
- User authorized an experiment on a new branch based on the current branch.
- Branch: `experiment/mascot-message-marker`; parent: `feat/todo-provider-opt-in`; starting HEAD: `2fa2754`.
- User explicitly authorized committing both validated features; commit TODO and mascot as separate work units on this branch. Do not alter their approved behavior or the sibling landing repository; preserve the unrelated release ledger.
- Use a packaged transparent PNG derived from the landing appearance; no new runtime dependency.
- Honor Pi's effective image settings and capability detection. Preserve the existing muted emoji fallback for unavailable/disabled images, invalid assets, or unsafe rendering.
- Keep the marker compact, assistant-only, and separate from message content. Header, editor, footer, and working indicator are out of scope.
- Local commits for both validated features are explicitly authorized. Push, PR, merge, and release remain unauthorized.

## Work unit
- [x] **T1 — Implement and verify the compact image marker.** Status: completed — automatically verified, user visually accepted, committed, and isolated native review approved and acknowledged.
  - Export a transparent mascot asset with provenance using existing browser/font tooling.
  - Observe meaningful failing tests before implementing image selection and fallback; then pass focused checks.
  - Implement minimal marker integration with bounded terminal dimensions, resize/invalidation, and deterministic fallback tests.
  - Run full tests, typecheck, lint, asset-package checks, and an independent focused spot check as required.
  - Record visual verification limits, native review outcome, and pending commit authorization honestly.

## Routing and delivery
- Route: delegated direct, one bounded `gentle-ai-worker` writer. Trigger: marker integration, tests, and asset require multiple non-trivial files.
- Verification: writer runs authorized commands synchronously; parent uses a separate verifier for external browser checks or an independent spot check.
- Test-first applies to deterministic selection, size guards, and fallback behavior. The graphic's actual appearance requires visual inspection rather than a fabricated RED test.
- Forecast: approximately 250–350 authored changed lines plus a generated PNG. Strategy: `ask-on-risk`; no PR requested.
- Native review covered only the eight mascot paths in committed range `2de357e..dffead6`, excluding TODO and release-ledger changes. Tier: medium; one consolidated reliability lens. Review completed and exact approved authority acknowledged.

## Acceptance and checks
- Compatible image-enabled terminals receive the small packaged raccoon marker.
- Unsupported or image-disabled terminals keep the existing emoji, not Pi's generic image placeholder.
- Invalid/narrow widths and missing/corrupt assets are safe; terminal row usage stays bounded.
- Existing assistant marker lifecycle and legacy entry behavior remain compatible.
- Focused tests: `node --test --experimental-strip-types extensions/osdy-pi/message-role-markers.test.ts extensions/osdy-pi/message-role-marker-image.test.ts` (omit the helper test path if no helper is added).
- Full checks: `npm test`, `npm run typecheck`, `npm run lint`, `npm pack --dry-run --json` (asset inclusion).
- Observe asset preview and disclose whether live Kitty/iTerm2 terminal rendering was actually tested.

## Evidence and progress
- Branch created from the requested current branch without resetting/stashing existing work.
- Baseline unrelated tracked diff SHA-256: `786e1e68264a1b2d7f63aba5672d40f7b59a208668f41e7916bd9ac88a101d1a`.
- Baseline untracked TODO hashes: settings test `27a0f6ac4fe50ecc8790536fb4fe3504571e222e196597d893ed04f92a4761fe`; settings implementation `7b038db580ddadd4e76740fc27d69adf18bb7afe3d8fabba53dca05459fe9a40`; feature document `36c9d237da2f810c1b5cc08c75149bbca51d97158487a07a6b27d55b07b6e17b`.
- Changed surfaces: marker and focused tests; new `message-role-marker-image.ts`/tests; `assets/assistant-mascot.png`, generated SVG, exporter, and provenance.
- Asset: transparent 360×350 RGBA PNG, 41,551 bytes; parent and verifier inspected preview against landing artwork. Export uses the loaded JetBrains Mono 400 font and default New palette.
- RED: original marker failed image selection (9 passed, 1 failed); missing helper also observed before implementation. GREEN: 16 focused tests passed. Real Pi output tests exposed and corrected iTerm2 `height=auto` column-rounding overflow.
- Worker and independent verifier both passed: focused 16/16, `npm test` 307 extension + 76 script tests (383 total), typecheck, lint, package inclusion, and `git diff --check`.
- Render budget: at most 3 columns × 2 rows; default cells reserve 3×1 on Kitty and 3×2 on iTerm2. Capability/cell geometry changes invalidate the image cache; disabling images retains the muted emoji.
- Integrity: independent verifier confirmed the unrelated tracked diff and all three pre-existing untracked hashes are unchanged, before and after checks.
- Authored size: 327 additions+deletions; generated SVG adds 37 lines (364 text lines including generated); PNG separate. Forecast remained within 250–350 authored lines.
- LSP probe checked five changed code files: two confirmed clean, one inconclusive clean check; four auxiliary warnings. Independent verifier assessed non-null filter-byte assertion, fresh-array reverse, export console output and URL literals as benign invariants/tooling. Typecheck and ESLint both passed; no source diagnostic error reported.
- PNG validation is bounded and validates CRC, inflation and filter bytes, but is not a complete PNG structural validator. Duplicate IHDR/unknown critical chunks in a manually replaced asset are a follow-up hardening limitation; the packaged asset is valid.
- Initial native ASSESS was unassessable because untracked declarations were required; independent-verifier/high-risk fallback was followed. Initial ambient INSPECT included unrelated work and no lineage was started for that mixed candidate.
- After commits, range START first refused with `native-start-retained-selection-candidate-mismatch` and no mutation. Re-INSPECT with the same explicit baseRef/committedOnly and untracked exclusion resolved the selection, yielding only the mascot paths.
- Native committed-range review `review-84c56a699248614d`: medium tier, eight paths, 364 changed lines, reliability lens; approved on final admitted event. Exact acknowledgement returned `authority: burned` for target `sha256:27481fdbee878bffabd7d38f5999f0d4cee80d4667dd57cb3b8faf54a7ea1740`, consumed revision `sha256:05822a2f0e027b78714fba8c1953353aa156321eea12ce21c49055086aeb84e5`. No correction route was offered; no subsequent STATUS was issued.
- User confirmed the marker works in their real terminal and approved its appearance: "si funciono, se ve super me gusta". Basic live display and visual acceptance are established; terminal protocol, resize/scroll/repaint and image-toggle scenarios were not individually reported.
- Final pre-commit checks: independent verifier passed 55 combined focused tests, all 383 tests, typecheck, lint, package inclusion (125 entries), and diff whitespace checks. No source behavior changed after user validation.
- Work-unit commit: `dffead6678be7122371696013594c4c383e0ad21` — `feat(ui): render the landing raccoon as assistant marker`. TODO is separate in `2de357e415587345e48bf8e9703874eb78d58426`; both on `experiment/mascot-message-marker` with explicit user permission.
- Pre-existing `odd/tasks/release-1-10-0.md` remains uncommitted and excluded; diff checksum `de9d878cb9f41c5ada7fa6968874964fe9c21813ad2ab5aa3643d6e6cd19b431` preserved.
- Rollback boundary: only the marker implementation, its tests, the new image helper/tests if used, and `extensions/osdy-pi/assets/assistant-mascot.*`/provenance. Do not remove unrelated work.

## Next step
Both user-approved feature work units are committed locally; mascot native lifecycle ended after exact acknowledgement. Save passive task-document closure separately and preserve the unrelated release ledger. No push, merge, PR, version bump or publication requested. Additional resize/scroll/repaint and image-toggle scenarios remain unreported; next delivery action requires user instruction.

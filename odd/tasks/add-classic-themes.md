# Add classic bundled themes

## Intent
Add Gruvbox Dark (warm retro), Nord (cool restrained), and Rosé Pine (base dark, soft colors) without changing the user's active theme. Register and document all three; preserve existing themes and runtime behavior.

## Scope and constraints
New themes: themes/osdy-pi-gruvbox-dark.json, themes/osdy-pi-nord.json, themes/osdy-pi-rose-pine.json.
Integration: package.json, README.md, extensions/osdy-pi/runtime.test.ts, scripts/message-card-contrast.test.mjs.
No dependencies, settings, runtime implementation, existing-theme edits, publishing or unrelated changes. Technical artifacts use English.

## Work plan
- [x] T1: Add, register, document and technically verify the three themes.
  - Route: delegated gentle-ai-worker (multi-file write trigger); independent gentle-ai-verify after interrupted writer.
  - Acceptance observed: 17 unique registrations and names; complete installed schema roles; actual Pi 0.99.1 loader resolves values; readable user cards; npm artifact contains all three.
  - Test-first evidence: RED history unavailable after cancellation; no RED claim. Final GREEN observed independently.
  - Rollback: remove new theme files and revert only related manifest, README and test edits.
  - Commit: none; explicit user authorization required by safety contract.

## Verification evidence
- Focused runtime tests: 23 passed.
- Focused message-card contrast tests: 2 passed; text >=4.5:1 and card/page >=1.2:1. Exact ratios not printed.
- npm test: 228 extension + 68 script tests passed.
- npm run typecheck and npm run lint: passed, no diagnostics.
- git diff --check: passed (does not cover untracked-file whitespace).
- npm pack --dry-run: passed, 104 files; all three new themes included, no tarball produced.
- Final independent spot check: message-card contrast 2 passed and git diff --check passed.
- Interactive appearance: not tested; manual check pending. No settings changes in the candidate, but live active-theme preservation was not independently exercised.
- Initial verifier failed with provider API error; fresh verification succeeded.
- Native review: medium, review-reliability; review-96904f112c4c3ee2 approved and acknowledged, authority burned for the seven-file candidate.
- ASSESS after closure: unassessable because untracked files require an explicit declaration. Full independent verifier and final spot check were already obtained; no successful assessment claimed.

## Delivery
Branch: feat/classic-themes. Forecast 330-390 authored lines; actual source/docs/tests candidate 319 changed lines (314 additions, 5 deletions), excluding this tracking file. Strategy: ask-on-risk; no size escalation required. No commit, push or PR authorized or performed.

## Next step
User visual check: reload package resources and choose osdy-pi-gruvbox-dark, osdy-pi-nord or osdy-pi-rose-pine through /settings. If using an installed npm package instead of this checkout, these unpublished changes require loading the checkout (npm run pi:dev). Commit only on explicit request.

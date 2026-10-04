# Mascot-only responsive header

## Objective
Remove the intermediate scaled/stacked logo layout. Keep full side-by-side header and mascot when it fits; otherwise show only the centered, responsively scaled mascot.

## Scope and constraints
- Preserve existing changes to ui.ts and ui.test.ts, including version decoration.
- Keep full-header eligibility and mascot width scaling unchanged; give fallback mascot the content row budget without reserving rows for a logo.
- Update README responsive descriptions and add deterministic regression coverage.
- No publication, push, or commit authorized. Commit evidence remains pending explicit authorization.
- Delivery strategy: ask-on-risk; forecast under 250 authored changed lines. Native workspace count includes pre-existing changes (323 lines, four tracked files).

## Tasks
- [x] T1 (completed): Remove stacked logo fallback, cover both layouts and sizing boundaries with tests, and align README.
  - Route: delegated gentle-ai-worker; multi-file implementation trigger (ui.ts, ui.test.ts, README.md).
  - Acceptance observed: no logo in fallback; centered bounded mascot; full layout unchanged; version preserved.
  - Checks: observed RED/GREEN focused UI test; npm test; npm run typecheck; npm run lint; git diff --check.
  - Commit: not authorized; no commit created.
  - Native review: medium workspace candidate; candidate-scoped consent declined, no lineage created.

## Evidence
Worker observed 18 RED behavior failures before implementation and 56 focused tests passing afterward. Independent gentle-ai-verify repeated all commands: 56 focused UI tests; 457 extension tests and 89 script tests; typecheck, lint, and diff whitespace checks passed. Readback confirmed two renderer paths and README alignment. Pre-existing version decoration changes preserved; verifier confirmed no unexpected mutation.
Native assessment could not declare untracked files; risk was unassessable, triggering independent verification, which passed. No native review approval is claimed.
Live terminal appearance, successive interactive resizes, and later animation frames were not manually verified.

## Next step
Reload Pi and resize the terminal for a visual smoke check. Commit only if explicitly authorized.

# Theme-aware Working animation

## Objective

Keep the theme-aware traveling letter wave on Osdy `Working...` and `Running ...`, paired with the original Braille spinner in the selected theme's `accent` foreground.

## Scope and acceptance

- Restore the ten original Braille frames from `WORKING_SPINNER_FRAMES`, styled with the selected Pi theme's `accent` foreground on each render; retain the 80ms timer, label wording, and activity lifecycle.
- Keep the traveling highlight across grapheme-safe letters, using `accent` for the highlight and `text` for the rest from the current Pi theme. Both spinner and letters must respond to a theme change on the next render.
- Keep spacing and visible-width centering intact, including narrow terminals and Unicode labels.
- Add deterministic tests for Braille frame sequence, theme color switching, independent letter movement, Unicode grapheme integrity, and inactive state.

## Constraints

- Do not change unrelated work already present in `odd/tasks/release-osdy-pi-1-3-0.md` or `scripts/.gitignore`; never stage or pack them.
- Technical artifacts are English. The user authorized a 1.4.1 issue/PR/merge and npm latest release, subject to target-host/session authorization and repository issue approval; no user-home installation.
- Keep test-first evidence for behavior changes and report every failed or skipped check.

## Delivery

- Route: delegated writer (renderer and focused tests: multi-file write trigger); README is a bounded documentation update; release metadata spans package and lock, so delegate a release writer; independent verification follows failed native assessment.
- Two cohesive work units: indicator behavior + README, then 1.4.1 release metadata/delivery. Forecast about 180–260 authored changed lines (excluding unrelated dirt), below ~400; delivery strategy: ask-on-risk.
- Feature branch: `feat/theme-aware-working`; branch from the current source commit (already integrated in local main); push only explicit staged work, then issue-approved PR and merge into `main` before npm publication.
- Commit identities and npm artifact integrity: pending.

## Tasks

| ID | Task | Acceptance criteria | Progress |
| --- | --- | --- | --- |
| WAVE-001 | Pair theme-accent Braille spinner with theme-aware letter wave; document and commit | Keep observed RED/GREEN; README describes Braille spinner and theme-dependent moving letters; focused/full checks and work-unit commit identity recorded. | README and independent checks complete — commit pending |
| REL141-001 | Prepare and deliver 1.4.1 release from integrated main | package/lock agree on 1.4.1; all checks and packed artifact verified; push a feature branch, obtain approved issue and PR, merge verified head into main, publish exact integrated source to npm latest once, read back version/integrity. | Pending |

## Checks and evidence

- The user selected the theme-accent Braille spinner and traveling letter wave after uncommitted amber-circle and moon trials. Those trials are superseded, not separate deliverables.
- Test-first: the initial renderer stub failed three focused cases (RED), then passed (GREEN); a grapheme regression failed on code-point segmentation (RED) and passed after grouping Unicode clusters (GREEN). The final Braille restoration failed four focused cases against the moon renderer (RED) and passed all five (GREEN).
- Writer and independent verifier passed five focused tests, `npm run typecheck`, `npm run lint`, and `npm test` (124 extension + 56 script tests); parent reran five focused tests. `git diff --check` and both untracked-file whitespace checks had no findings (the latter exited 1 because files differ from `/dev/null`).
- The original ten Braille frames advance one per 80ms tick in `accent`; the letter wave advances independently over non-whitespace graphemes in the selected theme's `accent`/`text` roles. LSP found no diagnostics in the new renderer and test; existing unrelated hints remain in `ui.ts`.
- Native review assessment and inspect unavailable (`package-local-binary-missing`, no lineage); an independent verifier reviewed the final Braille candidate without blockers.
- README Status and Editor/working-indicator sections now describe the theme-accent Braille and moving label; independent verification passed five focused tests, typecheck, lint, 124 extension + 56 script tests and diff/whitespace checks. Frame tests do not establish real-time timer accuracy.
- Interactive TUI/theme-switch smoke: not performed in this session; the user confirmed the visual result locally before requesting release.
- Rollback boundary: remove only this task's working-widget rendering, tests, and README description; retain unrelated repository modifications.

## Next step

Commit WAVE-001 with only its README, renderer, test, UI integration, and task file. Then prepare 1.4.1 metadata and verify the packed candidate, request exact GitHub target/session approval and issue approval as required, integrate via PR, and publish the integrated artifact once to npm latest.

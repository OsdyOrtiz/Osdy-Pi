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
- Feature branch: `feat/theme-aware-working`; branch from the 1.4.0 source commit. Push only explicit staged work, then issue-approved PR and merge into `main` before npm publication.
- Work-unit commits: `214e09a0dfc0f823741cba8b1f7d838d15a06c9e` (`feat(ui): animate working label with themed Braille`) and `bd73e517cba588e5b7921ca1e69e073bd551bc41` (`chore(release): prepare osdy-pi 1.4.1`). npm artifact integrity: pending.

## Tasks

| ID | Task | Acceptance criteria | Progress |
| --- | --- | --- | --- |
| WAVE-001 | Pair theme-accent Braille spinner with theme-aware letter wave; document and commit | Keep observed RED/GREEN; README describes Braille spinner and theme-dependent moving letters; focused/full checks and work-unit commit identity recorded. | Complete — `214e09a` (five intended files, tests and README included) |
| REL141-001 | Prepare and deliver 1.4.1 release from integrated main | package/lock agree on 1.4.1; all checks and packed artifact verified; push a feature branch, obtain approved issue and PR, merge verified head into main, publish exact integrated source to npm latest once, read back version/integrity. | In progress — metadata committed at `bd73e51`; remote delivery pending |

## Checks and evidence

- The user selected the theme-accent Braille spinner and traveling letter wave after uncommitted amber-circle and moon trials. Those trials are superseded, not separate deliverables.
- Test-first: the initial renderer stub failed three focused cases (RED), then passed (GREEN); a grapheme regression failed on code-point segmentation (RED) and passed after grouping Unicode clusters (GREEN). The final Braille restoration failed four focused cases against the moon renderer (RED) and passed all five (GREEN).
- Writer and independent verifier passed five focused tests, `npm run typecheck`, `npm run lint`, and `npm test` (124 extension + 56 script tests); parent reran five focused tests. `git diff --check` and both untracked-file whitespace checks had no findings (the latter exited 1 because files differ from `/dev/null`).
- The original ten Braille frames advance one per 80ms tick in `accent`; the letter wave advances independently over non-whitespace graphemes in the selected theme's `accent`/`text` roles. LSP found no diagnostics in the new renderer and test; existing unrelated hints remain in `ui.ts`.
- Native review assessment and inspect unavailable (`package-local-binary-missing`, no lineage); an independent verifier reviewed the final Braille candidate without blockers.
- README Status and Editor/working-indicator sections now describe the theme-accent Braille and moving label; independent verification passed five focused tests, typecheck, lint, 124 extension + 56 script tests and diff/whitespace checks. Frame tests do not establish real-time timer accuracy.
- Interactive TUI/theme-switch smoke: not performed in this session; the user confirmed the visual result locally before requesting release.
- 1.4.1 metadata test-first: exact root/package/lock version assertion failed on 1.4.0 (RED), passed on 1.4.1 (GREEN). Writer and independent verifier passed 5 focused tests, typecheck, lint, 124 extension + 56 script tests and `git diff --check`; `npm pack --dry-run --json` listed 68 entries including README and working-animation source/test, excluding unrelated dirty paths. Parent spot-checked version alignment and diff check; no integrated-source tarball or live npm publication yet.
- GitHub destination/session authorized for `github.com/OsdyOrtiz/Osdy-Pi` under OsdyOrtiz. All-state duplicate search found no matching 1.4.1 or Braille issue; #6 is a different mascot/header and profile-switching feature. Created and read back [issue #17](https://github.com/OsdyOrtiz/Osdy-Pi/issues/17), then applied `status:approved` with an exact user instruction and ADMIN actor permission; post-readback confirmed it and `type:feature`. Main has no branch protection, repo rulesets, or Actions workflows visible; required CI must be checked again on the eventual PR.
- Rollback boundary: remove only this task's working-widget rendering, tests, README description and 1.4.1 release metadata; retain unrelated repository modifications.

## Next step

Push the feature branch with the approved #17 reference, open a PR against main, inspect its checks and merge only after the required policy passes. Publish the exact integrated artifact once to npm latest only after fresh registry and package integrity checks.

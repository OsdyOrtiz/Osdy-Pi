# Halloween themes

## Objective
Add two selectable packaged dark themes without changing the user's active theme:
- `osdy-pi-halloween`: pumpkin orange, spectral violet, lime accents.
- `osdy-pi-halloween-killer`: black backgrounds, blood-red and violet accents.

## Scope and constraints
New theme JSON files, package registration, README theme catalog/counts, and existing theme coverage/contrast tests. No extension behavior changes, dependency changes, version bump, commit, push, or publication. Preserve readable message cards and semantic success/error colors.

## Plan
- [x] H1: Implement both complete palettes, registration, docs and integration checks (delegated writer: two non-trivial theme files plus registration/tests).
- [x] H2: Assess and verify the candidate; reconcile evidence and report usage.

## Acceptance and checks
Themes load through Pi's theme loader; all required schema roles resolve; names are registered and documented; theme counts are consistent; existing contrast tests pass for both. Run focused runtime and contrast tests, npm test, npm run typecheck, npm run lint. Use test-first for deterministic registration checks; palette design itself uses structural/loading/contrast validation rather than fabricated RED.

## Delivery
One coherent uncommitted work unit. Forecast approximately 250–350 authored changed lines. Strategy: ask-on-risk if scope exceeds roughly 400 lines. No delivery commands authorized. Rollback: remove the two new theme files and revert their manifest, README and test entries only.

## Progress and evidence
Read-only mapping completed: explicit package registration required; theme counts are hard-coded in runtime and contrast tests. Working tree initially clean on main.

## Verification evidence
Writer: gpt-6.1-sol, medium effort. RED: runtime 21/24 and contrast 2/5 passed, with intended missing-theme/count failures. GREEN: runtime 24/24, contrast 5/5. Killer card background adjusted after real card/page contrast failure. Full npm test: 229 extension and 71 script tests passed; typecheck, lint and diff check passed. Parent spot-check: contrast 5/5 and git diff --check passed. Live terminal appearance remains unverified. Theme changes approximately 232 authored lines, within forecast.

Native assessment was unassessable because untracked files require explicit declaration; returned plan requires independent verification (unknown native review outcome). No native review closure or receipt claimed. H2 routed to read-only gentle-ai-verify.

Independent verification: initial background verifier failed without diagnostic; a fresh foreground verifier passed runtime 24/24, contrast 5/5, typecheck, lint, and diff check, and confirmed both names, registration and README coverage agree. No actionable defects observed. No edits by verifier.

## Next step
Implementation and automated checks complete. User can run /reload then /settings to select either new theme. Live terminal aesthetics remain the only unverified manual check. No commits or publication performed.

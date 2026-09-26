# Configure Joker agents in normal Pi

## Objective

Provide an explicit Osdy Pi command, available after `pi install npm:osdy-pi`, that installs Joker's subagent package into normal Pi and disables Gentle's competing agent extension without touching other Gentle resources.

## Problem and rationale

Pi's package manifest and installer only register the requested package. Installing Osdy alone does not register `pi-subagents-j0k3r` or filter resources in another package. A package postinstall or extension startup write would be an unsafe surprise. The user chose an explicit post-install setup instead of changing Pi's installer.

## Scope

- Add a deliberate `/osdy-pi agents setup` action in Osdy's existing Pi command. Show/confirm the target and effect before writes; require normal personal Pi profile, reject isolated/project override paths where behavior would be ambiguous.
- Register Joker with Pi's package command, then reconcile only Gentle's `gentle-agents.ts` resource exclusion in the latest personal settings, preserving other packages and Gentle filters; support validated local and npm Gentle entries, idempotence and failure-safe retry.
- Reload or explain restart after successful setup, with focused tests and concise README instructions that distinguish explicit setup from automatic installation.

## Constraints

- Never mutate settings during extension registration, install lifecycle, or session start. Do not change authentication or unrelated packages.
- Do not edit the user's home settings or install packages while developing; use temporary fixtures/fakes.
- No push, PR, npm release, or user-home migration without separate authorization. Keep existing modified `odd/tasks/release-osdy-pi-1-3-0.md` and generated `scripts/.gitignore` out of this work unit.
- If project-local Gentle overrides the personal package entry, fail closed or explain why global filtering cannot be guaranteed.
- Technical artifacts in English; direct conversation in Spanish.

## Delivery

- Branch: `feat/joker-agent-setup` from `origin/main` at `3ddc613`.
- Route: delegated read-only scout completed; bounded multi-file writer for code/tests/docs. One parent coordinates and keeps writes single-threaded.
- Strategy: `exception-ok` selected by user after an approximately 518-line authored diff; one future PR may exceed the normal review budget. Keep service and integration as separate coherent work-unit commits; do not omit tests to fit size.
- Visible todo projection unavailable in the session tool inventory; local file and Engram mirror are authoritative.

## Tasks

| ID | Task | Acceptance criteria | Progress |
| --- | --- | --- | --- |
| JAS-001 | Reconcile Joker and Gentle safely | Focused tests first observe RED, then prove normal-profile validation, Joker registration, narrow Gentle agent exclusion, preservation/idempotence, and failure paths. | Implementation and checks complete — test-first RED/GREEN including bare/tilde/file local and recognizable remote Gentle cases; 175/175 full tests, typecheck/lint, independent re-review pass. User authorized local commit; not yet committed. |
| JAS-002 | Expose and document the explicit command | `/osdy-pi agents setup` confirms effects and target, invokes the tested service, handles reload and errors, and README explains one post-install step. Focused and full checks pass. | Implementation and checks complete — confirmation, cancellation, status and reload covered; README documents scope/remote limitation. User authorized local commit; not yet committed. |

## Verification

- Focused deterministic tests on temp fixtures; RED before behavior, then GREEN.
- `npm test`, `npm run typecheck`, `npm run lint`, `git diff --check`.
- Independent read-only review and safe temp runtime scenario; do not claim live installation on the user's Pi.

## Next step

Writer and independent verifier observed RED/GREEN for bare relative/project Gentle and remote recognition corrections. Focused 26/26, full 175/175 tests, typecheck, lint and diff-check passed; no confirmed P1 blocker for documented local/npm scope. Native risk assessment was unavailable (`package-local-binary-missing`), so independent verification ran. No live user-home install or Windows runtime check. User selected a single future PR with size exception and authorized local commits for both tasks only; no push, PR, or install authorization.

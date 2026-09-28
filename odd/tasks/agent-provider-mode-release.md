# Agent provider mode and npm release

## Objective
Make `/osdy-pi agents off` switch from Joker to Gentle agents, and `/osdy-pi agents on` switch back to Joker, then publish Osdy Pi with the already committed `/osdy-pi uninstall` change and integrate the release into `main`.

## Decisions and constraints
- User chose explicit on/off mode rather than automatic or per-task fallback. Pi extension registration changes require a reload/restart; never run both agent systems together.
- `off` must fail without mutating settings when Gentle is not configured/eligible. Keep both packages installed; alter only agent extension filters in the normal personal Pi profile. Preserve unrelated settings, profiles, accounts, and existing uncommitted work.
- `on` restores Joker, installing it when needed and excluding Gentle agents. `setup` remains an alias for ensuring Joker mode unless implementation evidence reveals a conflict.
- Do not claim a runtime task-failure fallback or support for isolated profile/project-local overrides.
- Publishing and merging are authorized; check package version, npm authentication, repository permissions, branch state, release contents, and verifications before either action.

## Delivery
- Branch: `feat/osdy-pi-uninstall-command`, based on `de22798` with uninstall work-unit commit `782034f` and ODD evidence commit `753aee4`.
- Strategy: exception-ok, direct integration into main (user explicitly accepted a combined diff above ~400 lines rather than chained PRs). Existing uninstall unit changed 344 authored lines. Fallback forecast 200–350 lines plus release metadata: cumulative >400. Keep distinct work-unit commits and report actual size before integration. No unrelated changes belong in release.
- Current npm latest observed: `1.5.0`; next version pending semver/release checks.

## Tasks
- [~] A1 Implement and test provider mode switching. Route: delegated writer (multi-file). Candidate edit surfaces: `extensions/osdy-pi/agent-coexistence-setup.ts`, `extensions/osdy-pi/agent-coexistence-setup.test.ts`, `extensions/osdy-pi/runtime.ts`, `extensions/osdy-pi/runtime.test.ts`, `README.md` (narrow further after research). Acceptance: `off` removes Gentle exclusion while filtering Joker, `on` reverses safely; status explains active mode; no overlapping registrations, no unintended package uninstall; reload or restart guidance. Test-first RED/GREEN, focused and full checks.
- [ ] A2 Prepare and publish a new npm version containing uninstall and agent modes, then integrate only intended commits into `main`. Route: delegated release verification and parent-controlled publication/merge. Acceptance: reviewed package tarball, version unique on registry, tests/typecheck/lint pass, explicit published version confirmed, main contains intended commits without unrelated work; record URLs/commit IDs and every failed/skipped check.

## Progress
A1 implemented but not complete. Initial writer checks passed; a regression fix for empty `extensions: []` passed 39 focused tests, typecheck, lint, and 221 extension + 61 script tests. Independent verifier found unresolved readiness errors for `autoload: false` and `!` exclusions, plus non-transactional Joker installation when a later validation fails. No real user settings were changed. Existing unrelated worktree changes remain untouched. Native review of the uninstall commit was unavailable in the dirty worktree; no receipt claimed.

## Next step
Correct and test the verifier findings before committing or preparing npm.

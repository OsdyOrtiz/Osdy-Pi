# Uninstall Osdy Pi from Pi

## Objective
Add `/osdy-pi uninstall` to remove only the Osdy Pi package registration from Pi, while preserving Osdy profiles, accounts, the globally installed CLI, and unrelated packages.

## Problem and constraints
Pi already supports `pi remove <source>`, but the Osdy Pi slash command has no uninstall action. The user selected an in-Pi command over a shell CLI. Support npm, Git, and local registrations without guessing a source or installation scope. Require explicit confirmation before removal; ambiguous registrations must not be modified. Do not delete profile files or global npm packages. Preserve pre-existing worktree changes in unrelated task files and `scripts/.gitignore`.

## Delivery
- Strategy: ask-on-risk; forecast 180–300 authored lines; actual commit 344 authored lines, below the approximate 400-line slice threshold.
- Feature branch: `feat/osdy-pi-uninstall-command`; starting point: `de22798`.
- Commit: `782034f5ac9ef86ef89c9f6e0de7b63becae1381` (`feat(package): add guarded in-Pi uninstall command`); user authorized publishing both changes and integrating main.

## Tasks
- [x] U1 Implement the guarded slash uninstall flow, tests, and user documentation. Route: delegated writer (multi-file write); targeted paths: `extensions/osdy-pi/runtime.ts`, `extensions/osdy-pi/runtime.test.ts`, a dedicated uninstall service and its tests if necessary, `README.md`. Acceptance: resolve exact registered source and scope; never remove on ambiguity, cancellation, or errors; remove only the selected Osdy Pi registration using supported Pi behavior; preserve other state; provide reload/restart guidance. Check: observed test-first RED/GREEN if deterministic; focused tests, typecheck, lint, applicable full tests; no real user installation is removed by tests. Work-unit commit `782034f` recorded.

## Progress
U1 behavior, tests, and documentation implemented. Regression tests exposed and corrected Git identity collisions, local provenance, and confirmation drift. Final delegated checks: 33 focused tests passed; typecheck and lint passed; full suite passed (212 extension and 61 script tests). Independent pre-correction verifier ran 28 focused tests successfully and identified the corrected issues. No real Pi registration was removed. Pi's separate remove process has a residual race after the final re-list. Native review inspect did not start: this working tree includes unrelated tracked edits and unrelated untracked files, so its candidate cannot isolate this work unit. Work-unit commit `782034f` contains only this feature. Native committed-range assessment was unavailable due unrelated untracked files; START did not create a lineage (short base ref rejected, then retained-selection candidate mismatch). No review outcome or receipt is claimed.

## Next step
Continue the separate agent-fallback work unit; resolve native review isolation before publishing. Do not include unrelated worktree changes.

# Uninstall Osdy Pi from Pi

## Objective
Add `/osdy-pi uninstall` to remove only the Osdy Pi package registration from Pi, while preserving Osdy profiles, accounts, the globally installed CLI, and unrelated packages.

## Problem and constraints
Pi already supports `pi remove <source>`, but the Osdy Pi slash command has no uninstall action. The user selected an in-Pi command over a shell CLI. Support npm, Git, and local registrations without guessing a source or installation scope. Require explicit confirmation before removal; ambiguous registrations must not be modified. Do not delete profile files or global npm packages. Preserve pre-existing worktree changes in unrelated task files and `scripts/.gitignore`.

## Delivery
- Strategy: ask-on-risk; estimated authored lines: 180–300, below the approximate 400-line slice threshold.
- Feature branch: `feat/osdy-pi-uninstall-command`; starting point: `de22798`.
- Commit: pending; repository safety instruction requires explicit user request before committing.

## Tasks
- [~] U1 Implement the guarded slash uninstall flow, tests, and user documentation. Route: delegated writer (multi-file write); targeted paths: `extensions/osdy-pi/runtime.ts`, `extensions/osdy-pi/runtime.test.ts`, a dedicated uninstall service and its tests if necessary, `README.md`. Acceptance: resolve exact registered source and scope; never remove on ambiguity, cancellation, or errors; remove only the selected Osdy Pi registration using supported Pi behavior; preserve other state; provide reload/restart guidance. Check: observed test-first RED/GREEN if deterministic; focused tests, typecheck, lint, applicable full tests; no real user installation is removed by tests. Work-unit commit pending explicit authorization.

## Progress
U1 behavior, tests, and documentation implemented. Regression tests exposed and corrected Git identity collisions, local provenance, and confirmation drift. Final delegated checks: 33 focused tests passed; typecheck and lint passed; full suite passed (212 extension and 61 script tests). Independent pre-correction verifier ran 28 focused tests successfully and identified the corrected issues. No real Pi registration was removed. Pi's separate remove process has a residual race after the final re-list. Native review inspect did not start: this working tree includes unrelated tracked edits and unrelated untracked files, so its candidate cannot isolate this work unit. A work-unit commit is still pending explicit user authorization; keep U1 open.

## Next step
Request explicit commit authorization if the user wants the work unit closed; isolate the candidate before native review. Do not include unrelated worktree changes.

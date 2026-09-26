# Portable Osdy profile setup

## Objective

Ship project-owned setup and an `osdy` command that runs the installed Pi binary with an isolated Osdy profile, preserving the user's existing Pi configuration without requiring a machine-local launcher or the Pi fork.

## Problem and rationale

The current `~/.local/bin/osdy` launcher regenerates an isolated profile, but it is not distributed with this package; older copies hardcoded a local fork. Move the portable behavior into the package, keeping official Pi settings untouched and making setup explicit and repeatable.

## Scope

- Provide an explicit, idempotent package CLI setup for an isolated Osdy profile, using official Pi settings as input and preserving existing isolated theme and sessions.
- Retain unrelated packages/settings, use the existing Gentle exclusions and Osdy-only package policy when Gentle is selected, and keep resource/auth sharing transparent.
- Ship a package-owned `osdy` launcher that uses installed `pi`, not a fork or PATH shim, and a documented migration path from the local launcher.
- Test setup, repeatability, official-profile preservation, failure safety, launcher wiring, and package integration.

## Constraints

- No mutation of `~/.pi/agent/settings.json`, credentials, or the user's current launcher during repository implementation.
- Do not install or publish packages, merge to `main`, or modify the user's existing launcher. PR #9 is open; only scoped review fixes may update its branch with authorization.
- Keep generated files outside Git; keep writes single-threaded.
- Technical artifacts in English. Use strict boundary validation and clear errors.

## Delivery

- Route: delegated writer; 4+ files to map and multi-file behavior/tests/docs trigger delegation. Read-only mapping completed by peer.
- Strategy: `exception-ok` selected by user; PR #9 is open with 17 files and 755 changed lines at initial review. Keep coherent work-unit commits; the user chose a review fix before any merge or npm publication.
- Branch: `test/native-message-cards` (existing feature branch); do not publish.
- Visible todo projection: unavailable in the current tool inventory; durable file and Engram mirror remain authoritative.

## Tasks

| ID | Task | Acceptance criteria | Progress |
| --- | --- | --- | --- |
| OPS-001 | Own isolated setup and normal-Pi launcher | Explicit setup derives an isolated profile from official settings, preserves user choices, manages only safe owned resources, is idempotent, fails safely, and `osdy` invokes installed Pi without fork/shim. Focused tests prove these behaviors. | Complete — 8/8 focused tests, typecheck, lint and independent verification passed; committed as `c32bd4c`. |
| OPS-002 | Wire package CLI and document migration | The package exposes setup and `osdy`; README explains prerequisites, isolation/auth sharing, migration from the existing local launcher, and verification commands; CLI/package tests and applicable full checks pass. | Complete — focused 11/11, full 164/164, typecheck, lint and package dry-run passed; committed as `0253169`. |
| OPS-003 | Make shared-resource links portable on Windows | Directory resources use Windows-compatible junctions while file resources retain file links, without changing macOS/Linux behavior or replacing user entries. Add deterministic focused coverage, full checks, and independent review; do not claim live Windows validation without a Windows runner. | Implementation and checks complete — focused 9/9 and full 165/165 pass; awaiting explicit commit/push authorization to update PR #9. |

## Verification

- Focused new profile-setup and launcher tests (exact runner set by implementation).
- `npm test`
- `npm run typecheck`
- `npm run lint`
- `git diff --check`
- Non-destructive runtime scenario in temporary directories passed; no automatic mutation of the user's home config during tests.
- `npm pack --dry-run --json` confirmed both bins and all three runtime services are included.
- Live migration of the existing `~/.local/bin/osdy` was intentionally not attempted; the installed global CLI may be shadowed until the user chooses to change PATH or remove that old launcher.

## Evidence and next step

- Prior read-only map: home launcher is not packaged; old version required a built local fork and PATH shim. The current local launcher now runs installed Pi and preserves isolated settings.
- OPS-001: RED (missing module), GREEN (6/6), then RED (2 targeted failures) and GREEN (8/8) for ancestor-symlink confinement and SIGPIPE exit. Independent verification passed focused tests, typecheck, and lint with no remaining severe finding. Commit: `c32bd4c feat(launcher): add isolated Osdy profile setup` (414 authored lines, size exception selected).
- OPS-002: RED (missing entrypoints), GREEN (11/11). Full tests 164/164, typecheck, lint, `git diff --check`, and package dry-run passed independently. Commit: `0253169 feat(setup): expose isolated Osdy profile commands` (79 authored lines).
- Native assessment was unavailable (`package-local-binary-missing`), so independent verification was used. The verifier noted a pre-existing SIGPIPE exit-status issue in the unrelated `osdy-pi` account launcher for a separate follow-up.
- Nested verifier-session startup auto-generated an unrelated untracked `scripts/.gitignore` and ignored `.atl/`; neither was committed. No push, PR, package install, or user-home migration was performed.
- Delivery update: PR #9 targets `main`, links approved issue #8 and references #6. Independent review found a Windows directory-symlink portability risk; the user chose to fix it before merge. OPS-003 observed RED (missing link-type export), then GREEN: focused 9/9, full 165/165, typecheck, lint, and diff-check passed independently. Windows link creation was simulated on macOS, not executed on Windows. Next: obtain explicit commit/push authorization to update PR #9; merge and npm version bump/publication remain separate decisions. The generated untracked `scripts/.gitignore` remains excluded.

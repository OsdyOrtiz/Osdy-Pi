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
- Do not install or publish packages; do not push or open a PR.
- Keep generated files outside Git; keep writes single-threaded.
- Technical artifacts in English. Use strict boundary validation and clear errors.

## Delivery

- Route: delegated writer; 4+ files to map and multi-file behavior/tests/docs trigger delegation. Read-only mapping completed by peer.
- Strategy: `exception-ok` selected by user after OPS-001 reached approximately 414 authored lines; a single future PR may exceed the normal review budget. Keep coherent work-unit commits and do not code-golf to fit the threshold. No PR or push is authorized.
- Branch: `test/native-message-cards` (existing feature branch); do not publish.
- Visible todo projection: unavailable in the current tool inventory; durable file and Engram mirror remain authoritative.

## Tasks

| ID | Task | Acceptance criteria | Progress |
| --- | --- | --- | --- |
| OPS-001 | Own isolated setup and normal-Pi launcher | Explicit setup derives an isolated profile from official settings, preserves user choices, manages only safe owned resources, is idempotent, fails safely, and `osdy` invokes installed Pi without fork/shim. Focused tests prove these behaviors. | Implementation and checks complete — 8/8 focused tests, typecheck and lint passed; awaiting explicit commit authorization to close work unit. |
| OPS-002 | Wire package CLI and document migration | The package exposes setup and `osdy`; README explains prerequisites, isolation/auth sharing, migration from the existing local launcher, and verification commands; CLI/package tests and applicable full checks pass. | Pending |

## Verification

- Focused new profile-setup and launcher tests (exact runner set by implementation).
- `npm test`
- `npm run typecheck`
- `npm run lint`
- `git diff --check`
- Non-destructive runtime scenario in temporary directories; no automatic mutation of the user's home config during tests.

## Evidence and next step

- Prior read-only map: home launcher is not packaged; old version required a built local fork and PATH shim. The current local launcher now runs installed Pi and preserves isolated settings.
- OPS-001 writer observed RED (missing module), GREEN (6/6), then RED (2 targeted failures) and GREEN (8/8) for ancestor-symlink confinement and SIGPIPE exit. Independent verifier passed focused tests (8/8), typecheck, lint, and found no remaining severe deterministic finding. An unrelated `scripts/.gitignore` and ignored `.atl/` were auto-generated at nested verifier-session startup; exclude from commit. Next: obtain explicit commit authorization for OPS-001, close its work-unit commit, then wire/package/document OPS-002.

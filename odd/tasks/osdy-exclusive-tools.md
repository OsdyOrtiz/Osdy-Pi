# Osdy-exclusive third-party tools

## Objective

Make `osdy` the only local Pi profile that loads `npm:@juicesharp/rpiv-ask-user-question` and `npm:pi-subagents-j0k3r`, while preserving local Gentle Pi with conflicting extensions excluded.

## Scope

- Update the canonical Osdy/Gentle package reconciliation and its focused tests.
- Update the installed `osdy` launcher so its generated profile applies the same durable package policy on every launch.
- Reconcile the generated Osdy profile after the launcher update.
- Leave the official Pi profile unchanged except for verifying that both third-party package entries remain absent.

## Constraints

- Preserve unrelated packages and settings.
- Keep the existing `-extensions/gentle-todo.ts` exclusion.
- Add `-extensions/ask-user-question.ts` and `-extensions/gentle-agents.ts` to local Gentle Pi.
- Do not install unrelated dependencies, push, open a PR, modify credentials, or commit user-home generated configuration.
- Artifacts, code, and comments are English.

## Delivery

- Route: `delegated`.
- Writer/preparation trigger evidence: this is substantial cross-boundary launcher, reconciliation, generated-profile, test, and verification work; the user explicitly requires an ODD task ledger, Engram mirror, and a work-unit commit.
- Delivery strategy: `ask-on-risk`.
- Planned work-unit: one behavior commit containing reconciliation, focused tests, and this task evidence. The generated user-home launcher and profile are intentionally excluded from Git.

## Tasks

| ID | Task | Acceptance criteria | Progress |
| --- | --- | --- | --- |
| OET-001 | Define durable reconciliation | Canonical reconciliation produces exactly one entry for each preferred package and a local Gentle package excluding all three conflicting extensions while retaining unrelated entries. | Complete — canonical package group now contains local Gentle Pi plus the two Osdy-only packages. |
| OET-002 | Cover behavior with focused tests | Focused tests verify normalization, ordering, idempotence, and retained unrelated packages. | Complete — focused coexistence test: 8 passed, 0 failed; full package test: 154 passed, 0 failed. |
| OET-003 | Update installed launcher and profile | Every `osdy` launch generates the preferred Osdy-only entries from the official profile without changing the official profile. | Complete — launcher uses a local Gentle package with three exclusions and canonical Osdy-only package entries; `osdy --help` regenerated the profile successfully. |
| OET-004 | Verify and commit | Required profile, CLI, launcher-readback, and focused-test checks pass; a Conventional Commit records repository behavior, tests, and task evidence. | Complete — all required checks passed; work-unit commit `b8c8e69 fix(launcher): isolate Osdy third-party tools`. |

## Checks

- `node --test scripts/osdy-pi-gentle-coexistence.test.mjs`
- JSON validation for `/Users/osdy/.pi/agent/settings.json` and `/Users/osdy/.pi/osdy-agent/settings.json`
- Profile assertions for package absence/presence, exact-once entries, and Gentle exclusions
- `pi --help` and `osdy --help`
- Installed launcher structural readback after a subsequent `osdy` run

## Test evidence

- `node --test scripts/osdy-pi-gentle-coexistence.test.mjs`: 8 passed, 0 failed.
- `npm test`: 154 passed, 0 failed.
- `npm run typecheck`: passed.
- `npm run lint`: passed.
- Runtime harness: `osdy --help` exited 0 with no duplicate-tool conflict. `pi --help` exited 0 with no duplicate-tool conflict.
- Both profile files passed `jq empty`. The official profile contains neither Osdy-only package; the Osdy profile contains each exactly once and excludes `gentle-todo.ts`, `ask-user-question.ts`, and `gentle-agents.ts` from local Gentle Pi.
- The installed launcher was read after the successful `osdy --help` run. Its regeneration filter removes prior local Gentle and Osdy-only entries, then adds the canonical local Gentle package, both Osdy-only packages, and local Osdy Pi.

## Rollback boundary

Revert the reconciliation logic, its focused tests, and this task ledger from the work-unit commit; restore the previous installed launcher separately if needed. This does not affect unrelated Pi settings or credentials.

## Commit evidence

- `b8c8e69 fix(launcher): isolate Osdy third-party tools` — canonical reconciliation, behavior tests, and ODD task evidence.
- User-home generated launcher and profile were intentionally not committed.

## Native review assessment

- Committed range: `127cc42..ac423de`
- Risk: `medium`
- Changed paths: 4
- Changed lines: 171
- `review_due`: false
- `review_due_reason`: `under_budget`
- No native review transaction was launched.

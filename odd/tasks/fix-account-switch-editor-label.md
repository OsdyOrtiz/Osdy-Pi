# Fix account switch editor label

## Objective

Refresh the Osdy editor immediately after `/osdy-account` activates a different profile so the title shows the newly active account without waiting for an unrelated render.

## Scope

- Add an explicit UI invalidation hook to the account-profile command wiring.
- Invoke the hook only after successful account activation and environment update.
- Preserve usage refresh behavior and successful-switch semantics.
- Add focused regression coverage.

## Constraints

- Keep account activation and rendering concerns separated through a small callback boundary.
- Do not change profile persistence or authentication behavior.
- Do not commit, push, or open a pull request without explicit user authorization; the user authorized commit and push after verification.
- Artifacts, code, comments, and tests are English.

## Delivery

- Route: delegated.
- Writer trigger evidence: the minimal fix spans command logic, runtime wiring, and focused tests.
- Completed work unit: one regression-fix commit with verification evidence.

## Tasks

| ID | Task | Acceptance criteria | Progress |
| --- | --- | --- | --- |
| ASL-001 | Add explicit editor invalidation | A successful account switch requests a TUI render after updating the active profile; failed activation does not. | Completed |
| ASL-002 | Add regression coverage | Focused tests prove render ordering and runtime wiring, while existing failure behavior remains intact. | Completed |
| ASL-003 | Verify the fix | Focused tests, typecheck, and lint pass or any failure is reported. | Completed — independent verification passed with no findings. |

## Checks

- Focused account-profile tests
- Focused runtime tests
- Typecheck
- Lint

## Test evidence

- `node --test --experimental-strip-types extensions/osdy-pi/account-profiles.test.ts extensions/osdy-pi/runtime.test.ts`: 34 passed, 0 failed.
- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `git diff --check`: passed.
- Independent verifier: passed with no findings.
- Live interactive TUI rendering was not manually exercised; focused tests cover the render callback and runtime wiring.

## Commit evidence

- `02c1110 fix(account): refresh editor label after switch` — account-switch render invalidation, regression tests, and task evidence.

# Release osdy-pi 1.3.0

## Objective

Publish the portable isolated-profile setup and normal-Pi `osdy` launcher from reviewed PR #9 as `osdy-pi@1.3.0`, keeping repository and npm package versions aligned.

## Scope and rationale

- Start from verified `origin/main` after PR #9 merge (`8886493`). The npm registry still serves `1.2.0`, so a Git merge alone does not deliver the new CLI.
- Bump package and lock metadata to a new minor version for the added launcher/setup behavior.
- Verify the package tarball contains both CLI bins and the profile-setup service; run full tests, typecheck, lint, and package smoke checks without touching user-home Pi config.
- Open a reviewable release PR with an approved issue before integrating version metadata; publish npm only from an exact integrated commit and after explicit npm target/account confirmation.

## Constraints

- No npm publish, GitHub merge, tag, or package install without separate explicit authorization and readback of exact target/version.
- No rewrite of the existing merged PR #9 or the user's local `osdy` launcher.
- Do not stage unrelated runtime-generated `scripts/.gitignore` or `.atl/`.
- Published package version is immutable; fail closed on ambiguous publish results and do not retry blindly.

## Delivery

- Branch: `chore/release-1.3.0` from `origin/main` at `8886493`.
- Route: inline for mechanical metadata edit, delegated independent verification and package smoke test; issue/PR and publication follow target-scoped authorization gates.
- Forecast: roughly 50-100 authored lines including this task record and release documentation; one small PR/work unit.
- Visible todo projection unavailable in this session; file and Engram mirror are authoritative.

## Tasks

| ID | Task | Acceptance criteria | Progress |
| --- | --- | --- | --- |
| REL-001 | Prepare versioned release candidate | Package and lock agree on `1.3.0`; focused metadata check observes RED then GREEN; full checks, tarball contents and temporary-directory CLI smoke pass; commit identity recorded. | Complete — RED/GREEN metadata; 165/165 tests, typecheck, lint, diff-check and packed CLI smoke passed; committed as `fb6960b`. |
| REL-002 | Review and publish release | Approved release issue and PR link the candidate, merged commit identity is verified, npm registry/account/version are confirmed, one publish attempt succeeds and registry readback confirms exact version; otherwise document the blocker. | Issue #10 created and approved; user authorized branch push and PR with `Closes #10`. Merge, npm identity confirmation and publish remain pending separate grants. |

## Verification

- `npm test`, `npm run typecheck`, `npm run lint`, `git diff --check`.
- `npm pack --dry-run --json` and a temp-directory package smoke test; no user-home profile mutation.
- Read back issue/PR, merged source, npm dist-tag and package version after each authorized remote write.

## Next step

Engram mirror created. Focused version assertion exited 1 as expected (`1.2.0` vs `1.3.0`), then passed after metadata edits. Independent verifier observed 165/165 tests, typecheck, lint, diff-check and extracted `osdy-pi-1.3.0.tgz` CLI smoke using temporary official/Gentle/Osdy fixtures; official settings bytes unchanged and no user-home write. An initial smoke assertion used a noncanonical macOS `/var` path and omitted fixture auth, then passed with corrected fixture; independent diagnosis found no product defect. Approved release issue: #10. Work-unit commit: `fb6960b chore(release): prepare osdy-pi 1.3.0`. User authorized push and PR with `Closes #10`, not merge or npm publish. Next: push release branch, open PR and check its merge/CI state; npm publish remains unauthorized until exact registry/account confirmation.

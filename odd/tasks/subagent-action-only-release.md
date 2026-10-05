# Release action-only subagent working labels

## Objective and authorization
Publish the user's action-only subagent working labels through the existing automatic npm release from `main`. The user explicitly authorized commit, push, and release. The established release policy allocates the next stable patch and publishes public `latest` via trusted CI; this does not authorize manual npm publication, dependency changes, or a GitHub Release.

## Problem and rationale
Working labels previously included the agent name. The verified source now displays only the mapped action while retaining concurrent-child `(+N)` suffixes. README still documents the removed name prefix and must be corrected before the release source freezes.

## Scope and constraints
- Source/test scope: `extensions/osdy-pi/working-child-activity.ts`, `extensions/osdy-pi/working-child-activity.test.ts`, `extensions/osdy-pi/working-controller.test.ts`.
- Additional release scope: the README Subagent fallback subsection and this excluded progress ledger.
- Preserve child identity validation, ownership, selection, fallback, glyph mapping, cleanup, and main-agent labels.
- No source-version bump: manifest and lock roots stay `1.11.0`; the verified CI script sets registry version and `releaseSource` in a disposable checkout.
- One writer; no force push, manual npm publish, credentials, or tag/GitHub Release creation.
- RDD is off. Native risk assessment for the source change was unavailable; independent verification passed.

## Baseline and delivery strategy
- Work branch: `fix/subagent-action-only-labels`.
- Branch point / fetched `origin/main`: `f0af5964701aaf9022bb79d1ff2d25dbc389b7dc`.
- README reviewed baseline blob: `65289e79a6f282eba0e78d6d2718450dab5e0b12`.
- Delivery strategy: `ask-on-risk`; forecast under 200 authored changed lines, one coherent source/README work-unit commit. No chained PR is planned.
- Source commit: pending. Release version, CI run, artifact, and registry verification: pending.

## Tasks
- [ ] **R1 — Prepare and commit release source** (in progress). Correct only stale README labels/prefix wording; run focused working/release tests, full tests, typecheck, lint, diff check; commit intended source/tests/README and initial ledger on the feature branch.
  - Route: one delegated README writer, then independent delegated verifier; parent owns narrowly staged Git commit. Mapping/preparation and command-verification routing triggers apply.
  - Acceptance: accurate README, unchanged versions, expected-only diff, checks pass, immutable Conventional Commit recorded.
- [ ] **R2 — Push main and verify automatic npm publication** (pending). Safely fast-forward the reviewed source commit into main, push once, track its exact CI run, retrieve retained artifact/evidence, verify npm source SHA, both hashes, and `latest`.
  - Route: parent performs authorized Git delivery; delegated read-only verifier inspects CI and registry.
  - Acceptance: remote main contains the source commit, its workflow succeeds, published archive and registry evidence match. Do not retry publication on uncertainty.
  - Commit boundary: the immutable R1 source commit is the release candidate; this delivery task does not change packaged source or create a release-only version commit.

## Verification evidence
- Source writer observed RED: focused tests had 11 label-related failures; GREEN: 22 focused tests passed.
- Independent source verifier: 22 focused tests, 526 extension + 89 script tests, typecheck, lint, and diff check passed.
- Active LSP: no errors in the three edited files; 9 auxiliary hints on unchanged validation boundaries.
- Interactive TUI: not manually exercised.
- Read-only release mapper reviewed README completely plus release skill/runbook, workflow, script/docs, manifests/lock roots, and release tests. Required README delta is confined to stale subagent-prefix examples and wording.
- Fresh fetch: no incoming main commits; index initially empty; only three intended source/test paths dirty.
- README finalized: blob `5a18700dc9e498940973bf43a3dcec4d392937ff`, five factual line replacements limited to subagent name-prefix examples/wording and explicit `(+N)` count.
- Independent release verifier: 22 focused working tests, 12 release-script tests, 615 full tests, typecheck, lint, and diff check passed. Source/lock version roots and dependencies remain unchanged.
- GitHub API confirms public enabled repository, unprotected main at the baseline, active workflow `373987173`, and workflow blob `3bc4d54cc9e639291e39b6a18de742bb9fedb9cd` matching local bytes.
- Official npm baseline: `latest` is `1.11.8`, top-level `releaseSource` SHA string exactly matches the baseline commit. Initial wrong nested-field query was corrected independently; no publication issue was found.
- Native assessment could not evaluate the new untracked ledger; returned independent verification plan was followed. RDD remains off.
- Publication and live trusted-publishing authentication are not yet verified.

## Progress and next step
R1 is in progress; README and all local release gates passed. Freeze the five intended paths in one source commit. Keep artifact and publication outcomes pending until official registry verification succeeds. Excluded ledger-only updates must never trigger a second main push/release; record later progress locally and in Engram without claiming a packaged-source change.

## Rollback boundary
Revert the action-only formatter/expectations and matching README subsection together. Never replace a published npm version; any corrective publication uses a newly allocated stable patch.

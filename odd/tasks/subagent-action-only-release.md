# Release action-only subagent working labels

## Objective and authorization
Publish the user's action-only subagent working labels through the existing automatic npm release from `main`. The user explicitly authorized commit, push, and release. The established release policy allocates the next stable patch and publishes public `latest` via trusted CI; this does not authorize manual npm publication, dependency changes, or a GitHub Release.

## Problem and rationale
Working labels previously included the agent name. The released source displays only the mapped action while retaining concurrent-child `(+N)` suffixes. Stale README prefix examples and fallback wording were corrected before the release source froze.

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
- Source commit: `5e7c5215302d92dc19cf7aedea5d8b767cebd76a` — `fix(working): show only mapped subagent actions` (103 insertions + 52 deletions, including excluded ledger).
- Released version/dist-tag: `osdy-pi@1.11.9`, public `latest`, official `https://registry.npmjs.org/`.
- CI run: `37262605470`, attempt 2, success — https://github.com/OsdyOrtiz/Osdy-Pi/actions/runs/37262605470.
- Release binding: the immutable source commit above; no source version bump, tag, or GitHub Release.

## Tasks
- [x] **R1 — Prepare and commit release source** (completed; commit `5e7c5215302d92dc19cf7aedea5d8b767cebd76a`). Correct only stale README labels/prefix wording; run focused working/release tests, full tests, typecheck, lint, diff check; commit intended source/tests/README and initial ledger on the feature branch.
  - Route: one delegated README writer, then independent delegated verifier; parent owns narrowly staged Git commit. Mapping/preparation and command-verification routing triggers apply.
  - Acceptance: accurate README, unchanged versions, expected-only diff, checks pass, immutable Conventional Commit recorded.
- [x] **R2 — Push main and verify automatic npm publication** (completed; release source commit `5e7c5215302d92dc19cf7aedea5d8b767cebd76a`, CI run `37262605470` attempt 2). Push the reviewed source commit to the feature branch and fast-forward remote main once, track its exact CI run, retrieve retained artifact/evidence, verify npm source SHA, both hashes, and `latest`.
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
- Both remote main and feature source initially verified at the exact source SHA after non-force push; only one main push was performed.
- Attempt 1: checks succeeded, npm accepted publication, but registry visibility exceeded CI's reconciliation window. Independent registry reconciliation proved version/source/both hashes/latest matched, so no republication was attempted.
- Parent inspected `allocateVersion`, `guardRerun`, `prepare`, and `publish`: same-source reruns reuse the registry version, fail closed if the source is absent, and verify existing publication without invoking npm publish.
- One failed-job rerun was then authorized under the existing release grant. Attempt 2 succeeded; log explicitly states `Previously published source verified; no publication attempted`. All publish steps and retained checks passed.
- Retained archive: `/tmp/osdy-pi-r2-37262605470-1.DJi5X9/artifact/osdy-pi-1.11.9.tgz`, 1,758,042 bytes, dynamically enumerated 149 regular files.
- Immutable artifact verification: 148 files match exact Git blobs; package manifest matches the script's authorized version/source/repository transformation. Lockfile is excluded. README is 72,472 bytes and matches the finalized blob. Inventory, paths, types, duplicate rejection, completeness, and forbidden-resource exclusions passed.
- Independent SHA-1: `f4316bf6b8d7cd5b1d32e76d03e877802334df11`.
- Independent SHA-512 SRI: `sha512-k2kjuQteR/m2OP3lds0+kVbdHdjwVe6itAOqciWVnMaKlkYdpKLZQbMAjaOvF4p7K3SY1oK/cD/bmFoI3jpJeQ==`.
- Official registry confirms version `1.11.9`, top-level `releaseSource` equal to the source SHA, both retained archive hashes, and `latest=1.11.9`. Original archive was rehashed after attempt 2; values remain unchanged.
- Complete downloaded evidence, inventory, archive-byte verification, and reconciliation JSON files are retained beside the archive under `/tmp/osdy-pi-r2-37262605470-1.DJi5X9/`; attempt-2 artifact is also retained by GitHub Actions for 30 days.
- Gaps: interactive TUI not manually exercised; optional attempt-2 artifact download/every-blob recheck not repeated because the original exact archive was independently rehashed against registry and attempt-2 evidence. No optional GitHub Release was created. First isolated npm-config probe failed locally and was corrected before successful official registry checks.

## Progress and next step
Both release tasks completed with the source commit pushed to main, npm publication independently verified, and CI reconciliation green. Final excluded ledger evidence is committed/pushed only on the feature branch to avoid another main release. No further publication action is needed. Optional next step: manually inspect the reloaded working indicator in the TUI. The source commit and retained artifact remain immutable.

## Rollback boundary
Revert the action-only formatter/expectations and matching README subsection together. Never replace a published npm version; any corrective publication uses a newly allocated stable patch.

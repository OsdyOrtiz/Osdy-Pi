# Restore last selected profile in the editor

## Objective and scope
Direct `pi` startup displays the last activated valid profile in editor/model labels. Explicit valid launcher identity wins; invalid/missing/stale/unreadable metadata retains fallback. Recovery changes no credentials or defaults and guards replaced sessions/concurrent selection.

## Authority and delivery
User confirmed interactive behavior and authorized README, commit, push, merge/push main, and existing automatic release. No manual version bump, tag, npm publish, or GitHub Release. Pipeline allocates patch from official stable versions, publishes osdy-pi/latest, verifies source/hashes/tag. Preserve unrelated odd/tasks/automatic-npm-main.md byte-for-byte and exclude it from delivery; progress stays local to avoid extra release-triggering main pushes.
Branch: fix/editor-last-profile. Base: d1e976e64df61fc489766e9512fdf59b7948e9ca (matched fetched origin/main). Strategy: ask-on-risk; forecast 180–230 authored lines; actual 176. Push branch then fast-forward main only if safe; never force.

## Tasks
- [x] T1 — Restore startup label and regression tests. Delegated gentle-ai-worker (multi-file/preparation); RED/GREEN. Work-unit commit below.
- [x] T2 — Independently verify behavior/checks. Delegated gentle-ai-verify after unassessable initial assessment; user confirmed interactive behavior.
- [x] T3 — Update README and commit cohesive fix. Delegated README worker (preparation); passive docs verified structurally, no meaningful RED. Commit db95251d5b6a8a60eaf0b4e21b2c44e2afa359f9, fix(editor): restore last selected profile on startup.
- [x] T4 — Native review, push branch, merge/push main, reconcile automated release. Completed: Git delivery, approved/acknowledged review, all CI checks, and registry reconciliation verified. Delegated release verification to gentle-ai-verify. Commit db95251d5b6a8a60eaf0b4e21b2c44e2afa359f9.
- [x] T5 — Reconcile npm 1.11.2 against retained artifact. Completed by read-only gentle-ai-verify at 2026-10-03T18:39:29Z. No publication retry/rerun/new trigger push. Evidence belongs to the same T3 work-unit commit; no extra release-triggering bookkeeping commit.

## Acceptance and checks
Direct startup restoration, explicit identity precedence, safe failures, and lifecycle races covered. README documents visual-only restoration/fallback and retains historical version facts. Rollback removes only restoration, new tests, README explanation.
Commands: node --test --experimental-strip-types extensions/osdy-pi/runtime.test.ts extensions/osdy-pi/ui.test.ts; node --test scripts/osdy-pi-account-profiles.test.mjs; node --test scripts/npm-release.test.mjs; npm test; npm run typecheck; npm run lint; git diff --check.

## Evidence
RED 42/44; HEAD runtime independently reproduced missing startup behavior (43/44). GREEN focused 44/44, profile scripts 33/33. Worker and independent verifier passed typecheck/lint/diff checks; full suite 309 extension + 88 script tests passed. README worker repeated full suite and checks; release tests 12/12. LSP zero errors (one clean, two inconclusive); compiler passed. User: `ok funciona`.
Nonblocking followup: default helper dynamic-import/filesystem integration not directly tested; real script exports have separate tests.
README and three extension files committed together (173 additions, 3 deletions); unrelated ledger hash preserved: 07df4548e304a88ba7f6ef749ef2617cb101288d2c3080929238f318b37e83b7.
Earlier native START returned no result; later inspection showed zero lineages. Fresh committed-range review review-e81211716e71d502 approved all four lenses; exact acknowledgement burned authority. Two informational warnings (test readability and helper reliability) are nonblocking followups, not corrections.
Branch and main pushed; fast-forward merge preserved exact db95251d5b6a8a60eaf0b4e21b2c44e2afa359f9. Remote SHAs confirmed; unrelated dirty/untracked paths preserved.
Actions run https://github.com/OsdyOrtiz/Osdy-Pi/actions/runs/37144489909 failed publication reconciliation; checks passed (release 12/12, full 309+88, typecheck/lint). npm accepted osdy-pi@1.11.2 as processing; workflow reported Publication accepted but not visible. Registry view remained E404 at verification; latest 1.11.1 still maps to base d1e976e64df61fc489766e9512fdf59b7948e9ca. No retry performed; acceptance is not verified publication.
Retained artifact: /tmp/osdy-pi-release-verification.ReO7ec/osdy-pi-1.11.2.tgz; adjacent evidence.json; artifact npm-release-37144489909-1 (11281008607). Independently verified source bytes/finalized manifest, inventory 125 files (4 root, 2 bin, 93 extensions, 3 scripts, 23 themes), size 1681024 bytes.
SHA-1: 9738c70a3da87b8dd3c14beec7addf5579ced6a9.
SHA-512 SRI: sha512-rlDPCKinZCdlxHEL9TRuTmdkKbyLWDD5bGP2jXXh6zsXVGHkw2KYLuKEKVNIhBNthU2OOfPE+5lxFDbI8g+7Nw==.
Final reconciliation at 2026-10-03T18:39:29Z: official version endpoint and dist-tags endpoint HTTP 200; version 1.11.2, releaseSource db95251d5b6a8a60eaf0b4e21b2c44e2afa359f9, SHA-1, SHA-512 SRI, and latest all match retained evidence. Artifact independently rehashed (1681024 bytes); hashes match registry/evidence. Release is registry-verified. Historical Actions reconciliation failure remains recorded; no rerun or publication retry was needed. npm's earlier standard debug log outside the repository was not read, removed, or altered.

## Next step
Feature delivered and release verified. Users with unpinned npm installs may run pi update and restart Pi; pinned versions require explicit pin replacement. No automatic local installation or further publication is authorized or needed. Progress-only records stay local; unrelated changes remain preserved.

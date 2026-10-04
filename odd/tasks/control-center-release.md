# Control Center release delivery

## Intent, grants and constraints
User authorized README update, all pending branch work, timestamp correction, commit, push, main integration and its automatic npm publication. Single-delivery size exception explicitly accepted (~4,030 committed changed lines plus pending work) to avoid intermediate releases. Delivery strategy: exception-ok. No direct npm publication, tags or GitHub Release. One writer; no force/reset/clean. Preserve unresolved findings; ledger inclusion does not mean completion. No manual version bump: CI allocates official registry/latest patch (currently likely 1.11.3). No follow-up bookkeeping main push because every main push publishes.

## Tasks
- [ ] T1 (in progress): Fix quota timestamps with RED/GREEN; finalize README; validate all pending work; commit release work unit.
- [ ] T2 (pending): Push branch, integrate main once, monitor workflow and verify official registry source/hash/tag; final evidence local only.

## Routing and checks
T1 delegated worker, preparation/multi-file triggers. Edits: README.md, control-center-account.ts/.test.ts, and narrow runtime.test.ts fixture correction, all under extensions/osdy-pi except README. Preserve existing ui.ts/ui.test.ts and all pending ledgers. English artifacts. RED applies to timestamp behavior; passive README gets structural verification.
Commands: node --test --experimental-strip-types extensions/osdy-pi/control-center-account.test.ts, same ui.test.ts and runtime.test.ts, node --test scripts/npm-release.test.mjs, npm test, npm run typecheck, npm run lint, git diff --check. Live visual/audio/auth checks not observed. Runtime boundary is injected backend/TUI tests, no real credentials. Rollback: quota formatter and tests, corresponding factual README changes; pending UI has previous ledger boundaries.
RDD on: native assessment and provider-bound review/consent, candidate only normalized work unit or slice. No inferred approval. T2 parent git/gh delivery, verifier for external reconciliation.

## Evidence
Initial main/cached origin/main db95251d5b6a8a60eaf0b4e21b2c44e2afa359f9; feature HEAD 87098542ab3b81dba5fa5767dde0031d11b17802, 11 ahead/0 behind. Refresh remote before integration. Main unprotected, no open PR. Prior workflow reconciliation failed despite npm version visible. Manifests 1.11.0 stay unchanged; publishing advances independently.
First worker: RED account 10 pass/2 fail; GREEN 12/12; UI 56/56; release tests 12/12; typecheck/lint/diff pass. npm test 457 pass/1 fail due to runtime fixture modeling resets in milliseconds. Required suite blocked, no commit/push yet. Quota resetsAt seconds; checkedAt milliseconds. README now scopes active /usage registry auth separately from explicit stored-profile snapshot query. Herdr fullscreen-scroll investigation remains unresolved.
Fixture correction complete. Writer and independent verifier both observed npm test 458 extension + 89 script = 547 passing, typecheck/lint/diff passing. Runtime focused 61/61; account 12/12. Parent git inventory lists only expected README/source/tests and six intended ODD task docs, all authorized by user. Native initial assess unavailable because untracked selection required; independent high-risk fallback executed. Commit identity pending; tracked pending diff 304 additions/72 deletions before evidence updates, plus ODD docs.

## Next step
Checks and readback passed; declare intended ODD docs, execute provider review/consent, commit complete release work unit, then fresh remote check and delivery.

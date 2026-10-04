# Control Center release delivery

## Authorization and constraints
User authorized all pending branch work, README update, quota reset correction, commit/push/main integration and automated npm publication. Explicit single-delivery size exception accepted (~4,030 previous changed lines plus new work). Strategy exception-ok, one main update to avoid intermediate releases. No direct npm publish, tags, GitHub Release, manual version bump, force/reset/clean or postrelease bookkeeping main push. Preserve unresolved investigations. One writer, English artifacts.

## Tasks
- [x] T1: Correct quota timestamps, README and pending UI; verify and commit complete work unit.
- [ ] T2 (in progress): Commit excluded evidence, refresh remote, push branch, integrate main once; monitor CI and reconcile official registry source/hash/latest. Final evidence local only.

## Evidence
T1 commit 34b7a403549a1633ae786a992f28fb5406d3bac9: 13 files +536/-72 including all pending ODD docs. Delegated worker preparation/multi-file route. Quota resetsAt seconds converted to milliseconds; checkedAt remains milliseconds. RED 10 pass/2 fail, GREEN account 12/12, UI 56/56, runtime 61/61. Full test initial 457/1 failure corrected by realistic runtime fixture. Final writer and independent verifier: 458 extension + 89 script = 547 passing; typecheck, lint and diff check pass. Passive README structural/source verification; no invented RED. Privacy distinguishes active modelRegistry usage from explicit stored-profile credentials query. Live visual/audio/auth smoke unverified; fullscreen mascot scroll unresolved.
Native review declined exact candidate, no lineage or approval. Assessment unavailable due untracked handling; high-risk independent verification fallback passed. Rollback boundary: quota formatter/tests/docs and pending header behavior, with prior ledgers retained. Initial main db95251d5b6a8a60eaf0b4e21b2c44e2afa359f9, initial branch 87098542ab3b81dba5fa5767dde0031d11b17802 (11 ahead). Fresh remote check pending.
CI auto allocates official npm registry/latest patch (likely 1.11.3, conditional), source manifests remain 1.11.0. Prior CI reconciliation failure despite visible registry version remains historical, not proof for new delivery.

## Next step
Commit excluded task evidence, then authorized push and fast-forward main only if freshly confirmed safe. CI owns immutable archive verification/publication; external verification must establish source, version, SHA-1/SHA-512 and latest.

# Config and usage shortcuts delivery

## Objective, authority and scope
Deliver Ctrl+Alt+O (`/osdyConfig`) and Ctrl+Alt+U (`/usage`), macOS Ctrl+Option+O/U. User confirmed physical delivery on one Mac terminal and authorized README update first, commit, feature push, main merge/push and existing automatic npm publication. No local npm publish/tag/version/workflow changes.
Branch: `feat/config-usage-shortcuts` from main `602ba7a`; remote main freshly fetched and identical. Seven source files: README.md; extensions/osdy-pi/runtime.ts/runtime.test.ts; account-profiles.ts/account-profiles.test.ts; control-center-account.ts/control-center-account.test.ts. Preserve base-context idle and manual reload safeguards.

## Tasks
- [x] D1 Finalize README and verify candidate. Delegated worker updated stale physical-QA claim; independent verifier observed 12 release tests, 563 extension + 89 script tests, typecheck, lint, diff check all pass. No full live-provider/account/audio verification claimed.
- [ ] D2 Commit and push feature work. In progress, parent Git coordination; exact owned surfaces only, no force push.
- [ ] D3 Merge main, push and verify automatic publication. Parent Git coordination then delegated CI/registry verification. Stop on conflicts or uncertain mutations.

## Decisions and evidence
Source manifest and both lock roots remain 1.11.0; existing CI allocates next registry-backed patch, official registry, latest tag, immutable archive checks. No local version bump needed. RDD off; no native review ceremony. LSP active probe confirmed zero errors in account helper and test; compiler also clean.
Forecast approximately 585 authored changed lines, mostly regression coverage. Single direct merge chosen explicitly by user, no PR/artificial splitting. All changes feature-owned; odd tracking excluded from npm.
D1 checked outcome will be recorded in the coherent feature source commit with D2. Publication success not yet observed.

## Next step
Stage exact seven source files and task evidence, commit Conventional Commit, push feature, then merge and push main. Record source commit and CI/publication evidence. Preserve unverified broader terminal/TUI/provider behavior limitations.

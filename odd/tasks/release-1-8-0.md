# Release Osdy Pi 1.8.0

## Intent and authorization
User authorized version 1.8.0, commit, main integration, push, GitHub and npm release. Ship four new palettes: Gruvbox Dark, Nord, Rosé Pine, Daniela Cute (18 themes). Preserve exact Daniela Cute colors and its scoped separation exception. No force-push, resets, unrelated changes or blind publication retries. Live TUI appearance remains unverified.

## Tasks
- [x] R1: Prepare and verify 1.8.0 candidate; delegated writer and independent artifact verifier.
- [x] R2: Commit, safely integrate exact verified source commit into main, push and confirm remote SHA.
- [ ] R3 (in progress): Publish exact verified tarball public/latest, tag v1.8.0 and create GitHub Release at exact main source commit; verify registry integrity and GitHub state.

## R1 evidence
- package.json and both lock roots 1.8.0; no dependency changes. README says release candidate, not confirmed publication. Version test RED:3 passed/1 failed, then GREEN:4 passed.
- Focused runtime24/24, contrast4/4, full299 tests (229 extension+70 script), typecheck/lint/diff/drypack passed.
- Real tarball: /var/folders/qg/r_11gk3n283_h43_7ncnf6r00000gn/T/tmp.Lo3KOULLsH/osdy-pi-1.8.0.tgz.
- SHA1 3fc247dabd9c40b06b42555255e223df294b039f; integrity sha512-bMAdyEl2jMMb48+QkWQs4RrkYZ+HK3G2x144GfnOGYy1SZ+erxhZpKT6RNf1Ygo5pZNAQtW4xlTaI7By9Lohkg==.
- Independent verification twice: all105 archive entries byte-equal source,18 registrations, four exact palettes, old Danielukis absent, ODD excluded; focused package4/4 and contrast4/4, diff clean.
- Scoped138 source paths stable SHA256 184b6eccb309e131da710dc5e6e746c8752ccf2459c545d0734c1f8b05e738f1. Broad ambient433file fingerprint drift exact attribution unavailable; ignored .pi-lens generated state excluded, no source mismatch waived.
- Source commit e777e43a42bc66b79a184efd38e4e5d159638992, 10 files,482 authored changed lines (472 additions/10 deletions). Coherent direct-main work unit; mostly four JSON palettes with tests/docs, no shrinking.
- Committed native review from base52226b7053cbd0d9b5c133bc20d49db9f37bf72e: medium review-reliability, review-873bb3d38320c065 approved/acknowledged authority burned. ASSESS failed explicit-untracked requirement; independent artifact verification obtained, no successful assessment claimed.

## Preflight and delivery
GitHub OsdyOrtiz, npm osdy at https://registry.npmjs.org/ freshly confirmed after E401/login. Earlier fetched main/origin/main baseline52226b7053cbd0d9b5c133bc20d49db9f37bf72e; v1.8.0 remote tag absent. Source commit e777e43a42bc66b79a184efd38e4e5d159638992 fast-forwarded to main and pushed successfully; git ls-remote confirmed exact SHA. No force-push. Annotated v1.8.0 tag pushed, peeled target e777e43a42bc66b79a184efd38e4e5d159638992. GitHub release published (not draft/prerelease) at https://github.com/OsdyOrtiz/Osdy-Pi/releases/tag/v1.8.0 on 2026-10-01T22:54:56Z.
Delivery is user-authorized direct to main, no PR. ODD ledgers excluded from artifact. Source commit kept separate from evidence docs. Rollback before publishing by revert, not remote rewrite; published versions cannot be silently replaced or removed.

## npm publication blocker
One exact-artifact npm publish attempt returned EOTP, requiring owner browser/second-factor authorization. No blind retry. A subsequent official registry query returned E404 for osdy-pi@1.8.0, confirming no observed publication. GitHub notes explicitly mark npm publication pending. Visible blocker #8; R3 remains in progress.

## Next step
Owner runs publication of the exact retained tarball from an interactive terminal and completes npm authorization without sharing OTP/tokens. Then verify registry version/latest/integrity before declaring success and update GitHub notes. Peer session 01a0f985 holds writes until release evidence/docs finish.

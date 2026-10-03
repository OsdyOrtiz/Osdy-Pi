# Spider-Man themes

## Objective and scope
Add three readable dark palettes inspired by Peter Parker, Miles Morales and Spider-Verse, through Pi's existing theme selector. User approved all three and later confirmed they look good.
Source surfaces: three themes, package registration, README, runtime.test.ts and message-card-contrast.test.mjs. Preserve pre-existing release-1-10-0.md modification; no unrelated reload fix or user-setting changes.

## Tasks
- [x] T1 Implement palettes, registration, docs and structural tests. Completed.
- [x] T2 Validate and review slice. Completed, with assessment tooling limitation recorded and independent verification passed.
- [x] T3 Preview all palettes. Completed by explicit user visual approval before release request.

## Routing and evidence
Read-only mapper gentle-ai-explore; writer gentle-ai-worker (seven-file trigger, gpt-6.1-sol medium); independent verifier gentle-ai-verify. Initial source slice 331 authored lines; ask-on-risk, no chain needed.
RED: runtime 21 passed/3 failed, contrast 3 passed/3 failed. GREEN: runtime 24/24, contrast 6/6. Writer and verifier passed typecheck, lint, npm test (285 extension +72 script tests), git diff --check. Active LSP changed TS clean.
23 unique manifest registrations; complete supported schema roles, resolvable colors, loading and tested contrast >=4.5. Parent read back Classic theme. Automated tests do not prove visual appeal; user provided approval.
Native review review-061bda05d121bf36: medium reliability lens, approved and acknowledged (authority burned). Native assessment failed untracked declaration; independent verifier ran fail-closed. Tooling failure not claimed repaired.
Source released through commit ddce7d7b3dcc37f6e63f64b663c1b1412af40be9, combining approved theme behavior and 1.11.0 alignment/landing update; main and origin/main reached that commit. Prior release ledger remained untouched. No Git tag/GitHub Release.

## Rollback and next step
Ordinary revert of the theme slice removes the three new JSON files and corresponding registration/docs/tests, not unrelated changes. Release evidence continues in odd/tasks/release-1-11-0.md; npm publication currently awaits human EOTP authentication.

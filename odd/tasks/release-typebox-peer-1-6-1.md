# Release TypeBox host-peer fix 1.6.1

## Objective and authorization
Deliver the TypeBox host-peer correction on main and publish osdy-pi 1.6.1. User authorized direct-main integration and publication, in the existing checkout without worktrees. Preserve the historical ODD stash and installed home package.

## Scope and routing
- Branch: fix/typebox-peer-dependency; base/live remote main at preflight: `3eab4b906ba3df6910c76cb775d20d8b31faa1e4`.
- TypeBox wildcard host peer and development dependency; retain locked version/integrity, remove runtime dependency.
- Patch package.json, both root lock versions and exact-version packaging assertion. Preserve historical README versions.
- REL161-001 delegated writer: multiple metadata/test surfaces, meaningful RED/GREEN and full checks. REL161-002 parent Git coordination plus independent exact-commit archive verification and registry readback.
- Delivery: direct main as requested, no PR; ask-on-risk, forecast 100-150 authored changed lines. Release commit totals 101 diff lines including generated lock metadata; one slice below 400.
- Registry https://registry.npmjs.org/, tag latest, public maintainer osdy. Preflight latest 1.6.0, 1.6.1 absent (E404). npm identity/access returned E401; publish requires human login and fresh actor/artifact confirmation. No credentials or OTP in chat, no ambiguous retries.

## Tasks
- [x] REL161-001 Prepare verified release candidate. Complete: `e2f4b48d9fec5a149fad4d2604459028ac730708` (`fix(package): release TypeBox host-peer correction in 1.6.1`); tests, package checks and final native review passed.
- [ ] REL161-002 Integrate and publish exact artifact (in progress, human authorization blocked). Main and remote integrated at `cc89fb71d6aa3c247a8f547ec24fcb0dfea72b26`; exact artifact verified. One publish attempt returned EOTP. Registry integrity verification remains pending; do not claim publication.
- [ ] AUTH161-001 Complete npm browser/2FA authorization (pending, human action). Owner runs the exact retained tarball publish from an interactive terminal; no credentials/OTP in chat. Then independently verify registry version/latest/integrity; no blind agent retry.

## Verification and review evidence
- Original peer regression RED five failures/one pass, GREEN six passes. Release packaging RED 1.6.0 vs 1.6.1 (3 passed/1 failed), GREEN packaging 4/4 and peers 6/6.
- Writer and independent verifier: full 224 extension + 67 script tests, typecheck, lint and diff check passed. Isolated npm cache resolves the earlier /dev/null ENOTDIR environment error.
- Independent `git archive` verification of e2f4b48: npm ci --ignore-scripts, focused/full checks and actual npm pack passed; all 133 archived source files unchanged. No repo/home mutation.
- Tarball: `/tmp/osdy-pi-1.6.1-artifacts.65R12X/osdy-pi-1.6.1.tgz`, 1,581,800 bytes, 101 entries; manifest 1.6.1 with TypeBox peer `*`, dev `^1.3.7`, no runtime dependencies; both CLI bins present, no node_modules/lock/Git files.
- SHA256: `9f0a8b2f59767e97a802b2206bf7c0b2dcdf02c5b311c0ff5cb372bd4c87a17d`.
- Integrity: `sha512-zi5uIb5C9HoQSMn794FB+bArIuFdP1OHw0IuCNlQRrvRYfX0AY9fftCbqL5V2TYCTQR56zoeIHIIDHpAhGUNcg==`.
- Integration evidence: fast-forward main and authorized origin/main push succeeded at `cc89fb71d6aa3c247a8f547ec24fcb0dfea72b26`. The only difference from the source commit is the non-packaged task document; all 101 tarball entries byte-match integrated main.
- Fresh npm preflight before publish: actor osdy, collaborator read-write, latest 1.6.0 and 1.6.1 E404. One `npm publish` of the exact tarball to public registry/latest returned exit 1 EOTP; no agent retry. Independent post-attempt readback still latest/version 1.6.0 and 1.6.1 E404 (not proof no pending staging). Human publish-time authorization and integrity readback remain pending.
- Native assessment unassessable/schema-incompatible; high-risk fallback independent verification completed. Actual native release review medium/reliability `review-f432ec7dbaf126bd` approved and exact acknowledgement burned authority; original fix review `review-ad962db2d590e076` also closed. Neither outcome authorizes delivery by itself.
- npm ci reported four untriaged dependency vulnerabilities (1 moderate, 3 high); no dependency upgrades attempted.
- Interactive Pi update/runtime smoke and installed-bin execution not performed. Packed manifest readback is the automated boundary checked here.
- Rollback: revert only release metadata/peer declarations and regression test; preserve unrelated behavior/stash. Published versions cannot be overwritten.

## Next step
Owner completes interactive publication of `/tmp/osdy-pi-1.6.1-artifacts.65R12X/osdy-pi-1.6.1.tgz` to https://registry.npmjs.org/ with public access and latest tag. Do not repack or blindly retry the agent attempt. Once the owner reports the result, verify registry latest/version and exact integrity. Main integration is complete; publication is not yet confirmed.

# Three-task TODO preview and 1.7.0 release

## Objective and authority
Three-row default preview; fullscreen primary header click expands/collapses, wheel reaches every task. Regular mode compact, `/todos` unchanged. User visually approved `npm run pi:dev -- --tui-mode fullscreen` and explicitly authorized commits, direct main integration/push and npm release. Branch feat/todo-collapse-three from main `f40d8b3a5157de94cce893f4979d3e50e8b2ffdf`, existing checkout/no worktrees. Preserve historical stashes; no upstream/global Pi edits or home installation.

## Tasks
- [x] TODO3-001 Implement and verify preview/fullscreen scrolling. Complete in `2ea80517fca4d3f916c92edf1a9dceee54a5d2a5`; automated checks, native review and user visual acceptance passed. Test-fixture exit is not relabeled a pass.
- [ ] TODO3-EXIT Verify isolated harness graceful exit/final task snapshot (deferred tooling follow-up, no demonstrated product defect or release blocker). No further fixture launches/fixes performed.
- [x] TODO3-REL Publish exact 1.7.0. Verified source integrated/pushed to main at `d560435404eb1a3a8c6188abe7e42ccc437ff767`; blocker record committed at `c061fdf10486d3dbb4eb5163f606a99455fbab65`. Owner completed publication; independent public version/latest and downloaded artifact hashes match 1.7.0 and the reviewed tarball.
- [x] TODO3-AUTH Complete interactive npm publish-time authorization. Owner reported `+ osdy-pi@1.7.0`; registry readback confirmed publication. Subsequent zsh command-not-found errors do not negate it. No OTP/token in chat or blind agent retry.

## Design and checks
- Public normalized mouse handler, local consumed wheel, fixed heading, bounded offset/slice. Container forwards intrinsic rather than clipped height; permit last task at first row. Heading-only/hidden dock uses `/todos` fallback. Preserve order/status/deleted filtering, task persistence, legacy collapse shortcut and modal; reset view on foreground replacement/shutdown and clamp on refresh.
- Both Pi development SDKs exact 0.99.1; wildcard host peers and root TypeBox unchanged. Missing mouse API/type blockers resolved without casts. No unrelated direct upgrades. Local installation used ignore-scripts and temporary distinct configs/cache, no home/global writes.
- Feature RED 17/1 then 11/10, GREEN widget 21/21. Metadata RED 1.6.1 != 1.7.0 (3 passed/1 failed), GREEN package 4/4. Writer and clean exact-commit archive verifier: full 227 extension + 67 script tests (294), typecheck/lint/diff checks passed. Clean npm ci installed 268 packages without changing any of 134 archived files or lock.
- Prior feature native review-3c76f2edc14d0582 closed. Committed release medium/reliability review-4ebfaa6176900e0d approved target `sha256:1aac1e1f5b1854dde68518c90869d216de75a13232d9e696d97ab6315e36b0c3`; exact acknowledgement burned authority. Subsequent changes only non-packaged passive ledger.
- Real SDK host PTY: 27 interaction assertions passed (three preview, click, ten-task scroll, filters, second click, transcript anchor, resize). Both fixture launches exited 1; corrected shutdown used SIGUSR1/undrained wait then SIGKILL, terminal restoration/final snapshot unverified. Independent read-only diagnosis: fixture/tooling issue, no demonstrated product defect; no process left. Artifacts `/tmp/todo3-pty-corrected.jGYcOX` and `/tmp/todo3-pty.8UhyQx`. User later approved local-source physical interaction but did not explicitly report exit details. Executable theme smoke and real single-row dock remain unverified.

## Artifact and delivery evidence
- Source commit `2ea80517fca4d3f916c92edf1a9dceee54a5d2a5`; retained `/tmp/osdy-pi-artifacts-1.7.0.ZnX2Ry/osdy-pi-1.7.0.tgz`, 1,583,719 bytes, 101 files, 14 themes. Every packed file byte-matches committed source and integrated main; no node_modules/.pi-dev/ledger/secrets. Bins, resources and host peers verified.
- SHA256 `2506f1753ba14513427d76cdc8c01f28b07249006e2b75b105289849a8b9e080`.
- Integrity `sha512-4WKSGA58F7g4XJTcVZ3ELmbd1RSsUTXkru2jyNlPLfXcLShm6O6hgZt2Mg7gPAu9UyldoSAVpcMWCBp1Exm9uw==`.
- Direct main fast-forward/push readback matched `d560435404eb1a3a8c6188abe7e42ccc437ff767`, checkout clean. Only ledger differs from source commit. Main unprotected/no rulesets at preflight; no PR requested. Historical stashes preserved.
- Fresh prepublication npm actor osdy, read-write collaborator, registry https://registry.npmjs.org/, latest 1.6.1, target 1.7.0 E404. One authorized `npm publish` of exact tarball with latest/public/ignore-scripts returned exit 1 EOTP. No agent retry. Independent post-attempt public registry GET still latest 1.6.1, 1.7.0 absent; not proof no staged publication. Artifact integrity remained intact. Owner subsequently completed interactive publication and reported `+ osdy-pi@1.7.0`.
- One cohesive slice, ask-on-risk: 229 authored lines including original ledger plus generated lock 1,421 (total 1,650); generated churn disclosed/reviewed, no artificial split/code-golf. Rollback only widget/SDK/tests/docs/release metadata; preserve persistence/modal/stashes. Published versions cannot be overwritten.

## Public release closure
- Independent unauthenticated no-cache GETs at 2026-09-30 16:04:40–41 UTC returned HTTP 200 for package metadata, exact version and public tarball. Version/latest both 1.7.0; publication timestamp `2026-09-30T16:01:47.987Z`.
- Registry integrity and independently computed public tarball SHA512 match the retained artifact. SHA256 and 1,583,719-byte size also match exactly. No install, source changes, re-publication or credentials inspection.
- Before passive closure, main was clean at `c061fdf10486d3dbb4eb5163f606a99455fbab65`, with both historical stashes intact. Prior 294 tests/typecheck/lint/native-review evidence remains unchanged; no rerun claimed.
- Owner's subsequent zsh errors for `--access=public9` and `9u` came from separate shell commands; exact cause is unverified. They do not invalidate the confirmed public release.

## Next step
Release complete; do not repeat publication. Home installation remains a separate user decision. TODO3-EXIT, physical single-row dock and executable theme runtime checks remain deferred and unverified; no new harness attempts are authorized by publication success.

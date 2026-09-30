# Three-task TODO preview and 1.7.0 release

## Objective and authority
Three-row default preview, fullscreen primary header click expands/collapses, local wheel reaches every task. Regular mode compact, `/todos` unchanged. User visually approved via `npm run pi:dev -- --tui-mode fullscreen` and authorized direct main integration and npm release. Branch feat/todo-collapse-three from main `f40d8b3a5157de94cce893f4979d3e50e8b2ffdf`, existing checkout/no worktrees. Preserve stashes; no global Pi edits or home package install.

## Tasks
- [x] TODO3-001 Implement and verify preview/fullscreen scrolling. Complete: work-unit `2ea80517fca4d3f916c92edf1a9dceee54a5d2a5` (`feat(todos): release three-task fullscreen preview in 1.7.0`); automated checks and user visual acceptance passed. Failed test-fixture exit remains explicitly deferred, not relabeled a pass.
- [ ] TODO3-EXIT Verify graceful isolated harness teardown/final task snapshot (deferred tooling follow-up, no demonstrated product defect or release blocker). No further launches/fixes authorized by this release scope.
- [ ] TODO3-REL Integrate and publish exact 1.7.0 (in progress). Acceptance: native release review, exact-commit archive checks/tarball, main/live SHA match, fresh npm identity/access/version, one publish or explicit blocker, independent registry latest/version/integrity match.

## Design and checks
- Public normalized mouse handlers only; no raw/global escape hooks. Container forwards intrinsic height; final-task offset guarantees first-row access even with one visible row. Heading-only/hidden dock uses `/todos` fallback.
- Preserve status/order/deleted filtering, persistent tasks, legacy fully collapsed shortcut. Same-session/tree/compaction preserve display preference; foreground replacement/shutdown reset; refresh clamps offset.
- Both Pi development SDKs exact 0.99.1, wildcard host peers and root TypeBox declarations unchanged. Necessary transitive lock churn reviewed; no unrelated direct upgrades.
- Feature RED 17 passed/1 failed then 11 passed/10 failed; GREEN widget 21/21. Release metadata RED 1.6.1 != 1.7.0 (3 passed/1 failed), GREEN package 4/4. Writer full 227 extension + 67 script tests (294), typecheck/lint/diff/pack dry-run passed (101 entries, 14 themes).
- Prior feature independent checks passed; native medium/reliability review-3c76f2edc14d0582 approved/acknowledged five-file candidate. Release changes need fresh committed-range review. Prior LSP zero diagnostics with one inconclusive path; independent tsc passed.
- SDK alignment initially blocked missing mouse types/methods; fixed via authorized local dependency installation, no casts. Duplicate `/dev/null` npm config failure happened before mutation; distinct temporary config/cache resolved it, no home/global writes.
- Real SDK InteractiveMode/TuiAltScreen/ProcessTerminal PTY: 27 interaction assertions passed (preview, click, ten-task scroll, filters, second click, anchor, resize). Both harness attempts exited 1 due to fixture issues; corrected exit required SIGKILL after SIGUSR1/undrained wait. Final snapshot/terminal restoration not verified; independent diagnosis found no demonstrated product defect. No process remains; artifacts `/tmp/todo3-pty-corrected.jGYcOX`, `/tmp/todo3-pty.8UhyQx`. Human visual approval did not explicitly confirm cleanup. Keep this limitation visible.

## Exact release evidence
- Committed release `2ea80517fca4d3f916c92edf1a9dceee54a5d2a5` verified from isolated git archive. `npm ci --ignore-scripts` succeeded; 134 archived files and root lock unchanged. Widget 21/21, package 4/4, full 294, typecheck/lint/commit diff-check passed.
- Actual tarball `/tmp/osdy-pi-artifacts-1.7.0.ZnX2Ry/osdy-pi-1.7.0.tgz`: 1,583,719 bytes, 101 files byte-identical to source. Manifest/resources/bins/host peers verified; no .pi-dev, node_modules, ledger or secrets included.
- SHA256 `2506f1753ba14513427d76cdc8c01f28b07249006e2b75b105289849a8b9e080`.
- Integrity `sha512-4WKSGA58F7g4XJTcVZ3ELmbd1RSsUTXkru2jyNlPLfXcLShm6O6hgZt2Mg7gPAu9UyldoSAVpcMWCBp1Exm9uw==`.
- Native committed release review `review-4ebfaa6176900e0d`, medium/reliability, approved target `sha256:1aac1e1f5b1854dde68518c90869d216de75a13232d9e696d97ab6315e36b0c3`; exact acknowledgement burned authority. Receipt does not authorize delivery; human request does. No packaged source changed after review.

## Delivery plan
Minor 1.7.0; registry https://registry.npmjs.org/, latest tag/public access. Preflight actor osdy/read-write, latest 1.6.1, 1.7.0 E404; local/live main equal base and unprotected/no rulesets. Fresh identity/version/artifact check required before one publication. Never share OTP/token in chat or blindly retry ambiguous/EOTP outcomes.

One cohesive release slice, ask-on-risk: 229 authored lines including passive ledger, 1,421 generated lock lines, total 1,650. Below 400 authored; generated churn disclosed, no artificial split/code-golf. Single release writer; independent exact-commit archive verifier; parent owns review, Git and publication. Rollback only widget/SDK/tests/docs/release metadata, preserve modal/storage/stashes; published versions cannot be overwritten.

## Next step
Record verified artifact/review evidence, fast-forward/push main, then one authorized npm publication after fresh account/version/artifact checks. Physical single-row dock, executable theme runtime and graceful harness exit remain follow-ups; exact archive dependency installation/checks succeeded.

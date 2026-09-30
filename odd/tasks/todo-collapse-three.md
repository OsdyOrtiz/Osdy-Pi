# Three-task TODO preview and 1.7.0 release

## Objective and authorization
Show up to three task rows by default above the editor. Fullscreen left header click expands; second click restores preview. Expanded tasks are reachable with local wheel scrolling. Regular mode remains compact; `/todos` stays unchanged.

User accepted fullscreen-only clicks, scrolling, both development SDKs aligned to 0.99.1, and testing. After running `npm run pi:dev -- --tui-mode fullscreen`, user reported the result is excellent and explicitly requested main integration and release. Commit, direct fast-forward/push main and npm release are now authorized. Existing checkout on `feat/todo-collapse-three`, base `f40d8b3a5157de94cce893f4979d3e50e8b2ffdf`; no worktrees. Preserve historical stashes. No global/upstream Pi edits or user-home package installation.

## Design and delivery
- Preserve task status/order/deleted filtering, fully collapsed shortcut, task data and modal. Only primary header clicks toggle; expanded fullscreen wheel events are consumed locally.
- Bounded offset-and-slice uses public Component.handleMouse; Container forwards intrinsic rather than clipped height. Allow the final task at the first row below the heading. Heading-only/hidden docks require `/todos` fallback.
- Same-session/tree/compaction retain view; foreground replacement/shutdown reset it; refresh clamps offset.
- Both Pi dev SDKs exact 0.99.1; peers remain `*`, root TypeBox peer `*`/dev `^1.3.7` unchanged. Generated lock updates follow SDK dependencies.
- User-visible enhancement warrants minor release 1.7.0, not overwriting 1.6.1. Public preflight: latest 1.6.1, 1.7.0 E404; actor osdy, read-write collaborator. Registry https://registry.npmjs.org/, latest tag, public access. Recheck exact artifact/account/version immediately before one publication; never request credentials/OTP in chat or blindly retry EOTP/unknown outcomes.
- Single delegated release writer for package/lock/version assertion/README; independent exact-commit archive verification and pack. Parent owns Git/native review/publication. Existing five-file feature candidate approved/acknowledged as review-3c76f2edc14d0582; changed release candidate requires fresh scoped review.
- Strategy ask-on-risk; forecast ~200-250 authored diff lines plus passive ledger, generated lock excluded. Existing 191 authored + 1,417 generated lines; full dependency churn disclosed/reviewed. One cohesive feature/release slice below 400 authored, no artificial split or code-golf. No PR requested; GitHub main unprotected, rulesets empty at preflight.

## Tasks
- [ ] TODO3-001 Implement and verify preview/fullscreen scrolling (automated and user visual acceptance verified; awaiting release work-unit commit). User approval does not turn failed harness exit into a passed test.
- [ ] TODO3-EXIT Verify graceful isolated harness teardown and final task snapshot (deferred verification-tooling follow-up, not a demonstrated product defect or release blocker). Two attempts exited 1; no fixes or further launches performed. Keep this limitation visible.
- [ ] TODO3-REL Prepare, integrate and publish exact 1.7.0 release (pending). Acceptance: package/lock/root test agree; metadata RED/GREEN and full checks; work-unit commit and native review; main/live SHA match; tarball from exact committed source verified; publication accepted and registry latest/version/integrity independently confirmed, or explicit blocker recorded.

## Evidence
- Feature RED: initial 17 passed/1 failed; expanded tests 11 passed/10 failed. GREEN focused widget 21/21; writer + verifier full 227 extension + 67 script tests (294 total), typecheck/lint/diff/pack dry-run passed (101 entries, 14 themes).
- SDK missing mouse types/Container method and unsafe call/return resolved without casts. LSP zero diagnostics, three clean paths/one inconclusive; independent tsc passed. Installation used ignore-scripts and temporary npm cache/config, no home/global writes; duplicate `/dev/null` configs initially failed before mutation and corrected.
- Native medium reliability review approved/acknowledged target `sha256:384f641aa7382c5dd7977c6142b4af387411ad1f42bc24d13353ae7d25ce0cb5`; source unchanged since. Passive ledger was excluded.
- Real OS PTY with SDK InteractiveMode/TuiAltScreen/ProcessTerminal and local widget: 27 interaction assertions passed, initial three/header expansion/ten tasks reachable/second click three/click filters/transcript anchor/60x12 resize/40x5 hidden then restore; zero recorded model/network attempts. Not human-pointer proof.
- Both PTY attempts exited 1. First fixture comparison/parser errors; second SIGUSR1 + undrained-output wait followed by SIGKILL failed terminal restoration; final task snapshot unverified. Read-only diagnosis found fixture/tooling issue, no demonstrated product defect; no process remained. Artifacts `/tmp/todo3-pty-corrected.jGYcOX` and `/tmp/todo3-pty.8UhyQx`. Source fingerprints unchanged by tests.
- Release metadata RED: packaging assertion 1.7.0 versus old 1.6.1 failed (3 passed/1 failed); GREEN 4/4. Widget 21/21, full 294, typecheck/lint/diff/pack dry-run all passed; package 1.7.0 with 101 entries/14 themes. Current authored tracked diff 197 lines plus generated lock 1,421; no other dependencies changed during version preparation.
- User subsequently tested local-source fullscreen via pi:dev and approved appearance/behavior. Did not explicitly report clean-exit details; do not claim fixture teardown repaired. Single-visible-row dock, executable theme fixtures and clean-install reproducibility previously unverified; release archive verification may cover reproducibility separately.

## Rollback and next step
Revert only widget/SDK alignment and associated tests/docs/release metadata; preserve task persistence/modal/stashes. Published versions cannot be overwritten. Prepare 1.7.0 metadata and accurate README test status, commit one feature/release work unit, review it, verify/pack exact source, fast-forward main and perform one authorized npm publication if fresh identity/version/artifact checks pass.

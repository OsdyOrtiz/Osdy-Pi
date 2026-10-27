# Live editor token-speed meter

Replace editor `tok ↑… ↓…` with response throughput. The user chose live estimation and now explicitly requests README finalization, push and merge to `main` for the automatic npm release.

## Scope and constraints

- Live `≈42.3 tok/s` uses streamed UTF-16 characters / 4; completion uses real `usage.output` over monotonic first-output-to-end time. This is client-observed throughput, not server decode telemetry.
- Count text/thinking/tool-call deltas once; output already includes reasoning. Never count input/cache tokens or subsequent tool execution.
- Preserve cache/cost/context, responsive ANSI width, native/simple mode, analytics and settings. No timers or editor remounts.
- Each response is independent; invalid timing/data, errors, aborts and session replacement/shutdown are safe.
- Preserve unrelated `odd/tasks/audio-delivery.md` and `odd/tasks/codex-banked-resets.md` byte-for-byte; do not stage `odd/` evidence.
- One writer; English artifacts; strict typing. RDD is off, so no native review transaction.
- User authorizes feature commit, branch push and main merge/push on `origin` (`OsdyOrtiz/Osdy-Pi`). No PR, manual version bump/tag/npm publish/GitHub Release or workflow/account repair is requested.
- CI allocates a patch, packs/verifies committed bytes and publishes with `latest` to `https://registry.npmjs.org/`; source manifest stays at 1.11.0. Publication must be reconciled, not inferred from a merge.

## Tasks

- [x] **T1 — Replace editor token totals with live throughput.** Implementation and automated verification complete. Route: delegated writer (multiple non-trivial files), then independent verifier. Feature work-unit commit: `439c56a0be09eff077aa06cbf6ad2bf71a277521` (`feat(editor): show live token generation speed`).
  - Acceptance: visibly approximate live rate, actual finalized output numerator, no stale/session/error readings, responsive editor/native presentation and unchanged accounting.
- [ ] **T2 — Deliver the feature to main and reconcile automatic release.** Status: in progress, blocked on registry visibility (Git delivery complete). Route: inline bounded README clarification/Git coordination; delegated release mapping, incident diagnosis and command-running checks.
  - Review/finalize README against implementation; rerun release/full checks; commit only the 10 owned behavior/test/README paths; push feature, merge and push main without forcing or staging unrelated evidence.
  - Inspect the exact main-SHA Actions run. Verify official version, `releaseSource`, `latest`, SHA-1 and SHA-512 against retained CI evidence; report pending/failed/unknown honestly. Do not retry uncertain publication.
- [ ] **B1 — Reconcile official npm visibility for 1.11.15.** Status: pending; blocker for T2. Perform a later bounded read-only comparison of exact version/source/both hashes/latest. Do not rerun, republish or push a retry while the prior outcome remains unknown.

## Verified evidence

- Branch: `feat/editor-token-speed`; delivery strategy `ask-on-risk`; observed feature size 345 authored lines (319 additions, 26 deletions), excluding uncommitted bookkeeping. About 400 is advisory, not code-golf.
- RED observed: first focused run 92 passed / 6 failed; runtime test separately failed on pending presentation. GREEN: writer 101 focused tests; independent 178 including real editor rendering.
- Full suite independently passed: 733 extension + 89 script tests; typecheck/lint/diff checks passed. Initial optional-property and shutdown-order failures corrected before reruns.
- Parent active diagnostics on 9 touched TS paths: no type errors, auxiliary style advisories. Full refresh and targeted ESLint on the new test: no findings/exit 0.
- Native ASSESS could not classify undeclared untracked files; returned independent-verifier fallback, which passed with no actionable regressions. Verifier could not repeat LSP; parent did.
- Synthetic stream/lifecycle/no-remount/resizing checks passed. Interactive provider-backed visual check not performed.
- README reviewed and finalized: response-speed section, responsive footer facts, current source/version convention and pending/unavailable clarification. Passive wording change verified structurally, not with fabricated RED.
- Final delivery checks rerun: 12 release tests; 733 extension + 89 script tests; typecheck, lint, targeted new-test ESLint and diff check all passed. The persistent automated test lint report is stale; fresh checks reproduce no errors.
- Fresh `origin/main`, local `main`, and feature HEAD before commit: `375d9ec96ba08e538070ee492c60b0ce45bb0bc4`; index empty.
- Prior failed run 37874961722 actually published 1.11.14. Independent read-only reconciliation matched source SHA above, `latest`, SHA-1 and SHA-512 with run evidence. The old outcome is resolved, so no blind retry/workflow repair is needed.
- Protected file SHA-256: audio-delivery `7736ec152fc5ab3e183f0a267a7925098609456563b1621bc83acd0ce198d4df`; codex-banked-resets `679cabcf5c9294b62cee574097b804fb02a2fbd5a2b7253aafd51fb4e2967bf7`.

## Delivery progress and next action

Feature commit `439c56a0be09eff077aa06cbf6ad2bf71a277521` pushed to `origin/feat/editor-token-speed`. Main merge `a884185d5c9c03e3695f5cecd4c370259dee1e48` pushed to `origin/main`; its tree exactly matches the verified feature tree. Local branch is now `main`. Both protected files retain the recorded hashes; no `odd/` file was staged.

Automatic run [37963222950](https://github.com/OsdyOrtiz/Osdy-Pi/actions/runs/37963222950) completed with checks success / publish failure. CI archive validation passed and npm accepted `osdy-pi@1.11.15`, but registry visibility reconciliation failed. Three subsequent official version checks returned HTTP 404; dist-tags returned `latest: 1.11.14`. Publication is accepted but not registry-verified; T2 remains open.

CI evidence: source `a884185d5c9c03e3695f5cecd4c370259dee1e48`; SHA-1 `dac840efb849953646de0edaba16f3bae54c3fbf`; SHA-512 `sha512-AjcHLlryBie41fYMdubJNMsLBLsDfKaK5eEMv0RL0pbLyD/4sTf7h3Z+IyZLL6KQ4C1g09SyH5jcjB/RaPH4sg==`. These hashes cannot yet be compared with npm metadata.

Retained archive: `/home/runner/work/_temp/npm-release-37963222950-1/osdy-pi-1.11.15.tgz`; [artifact npm-release-37963222950-1, ID 11632527412](https://github.com/OsdyOrtiz/Osdy-Pi/actions/runs/37963222950/artifacts/11632527412), expires 2026-11-08T17:02:59Z. No artifact downloaded; independent local archive-byte verification is unperformed. CI owns packing/publication and validated its archive.

Next: later read-only reconciliation of exact 1.11.15/version/source/latest/both hashes. No workflow rerun, retry main push, manual publish or account/workflow repair was attempted. Actual Pi visual verification remains unperformed. All local feature/release checks passed; the external publication-verification failure is the unresolved blocker.

Mirror: `odd/editor-token-speed/tasks` contains this full document and repository-relative locator.

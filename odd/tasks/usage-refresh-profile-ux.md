# Usage refresh and profile quota UX

Historical implementation snapshot: the no-delivery statements below describe authority at that stage, not current repository status. Later authorized implementation/delivery is recorded in [Control Center clean UX](control-center-clean-ux.md); this ledger is preserved by [working subagent delivery](working-subagent-delivery.md).

## Intent and scope
Keep active Codex quota fresh while the session is idle and separate profiles/actions from quota details in `/osdyconfig`.
- User confirmed idle staleness and selected one row per profile, grouped actions, and dedicated quota details with Refresh/Back.
- Active quota refreshes every 60 seconds when eligible, without overlapping requests, retaining the last snapshot and backing off on errors (maximum 10 minutes).
- Profile navigation never fetches quota; View usage/Refresh explicitly use the selected stored credential snapshot. Local token analytics remain separate. Preserve confirmations, active/default state, cancellation, stale-result rejection, safe errors, other categories, and keyboard navigation.
- Branch: `fix/usage-refresh-profile-ux`; baseline: `545560153d13a25f1f0d840878a2a4813df669c0`.
- Preserve user changes in `odd/tasks/control-center-release.md` and `odd/tasks/working-activity-patterns.md`.
- No commits, staging, push, PR, release, dependency changes, or raw credential inspection authorized. Human interactive quota smoke was approved; no autonomous live-provider verification claimed.

## Routing and delivery
Explore mapped the 4+ file flow. Sequential Workers implemented T1/T2 and D1; independent Verify checked the final candidate. Parent owns tracking; one writer at a time. Applicable deterministic tests used observed RED/GREEN and alternate cases.
- Native assessment was unassessable on untracked scope, so its high-risk independent-verifier plan was followed. RDD remains on.
- Delivery strategy: ask-on-risk. Our behavior/doc units total 604 authored lines; no PR/chain requested. Keep coherent rollback units; do not compress code or drop tests. No commit/slice identity exists because delivery is not authorized.
- Recovery mirror: `odd/usage-refresh-profile-ux/tasks`, full document and locator. Tracking document is excluded from the review's intended-untracked scope.

## Tasks and evidence
- [x] B1 — Clarify staleness. User confirmed inactivity; no broken settlement event was established.
- [x] T1 — Idle active-quota refresh.
  - Files under `extensions/osdy-pi/`: `codex-usage-refresh.ts`, its test, `runtime.ts`, its test.
  - Single timer, eligibility/in-flight guards, capped backoff, retained snapshot, generation isolation and pending-auth cancellation.
  - RED: 62 passed / 2 failed; GREEN: 72/72. Tests cover idle timing, eligibility, manual/settlement precedence, stop/restart, error recovery and stale-session results. Typecheck/lint/diff passed.
  - Authored 370 lines. Rollback: scheduler/runtime refresh integration and corresponding tests. Synthetic auth/fake clocks only.
- [x] T2 — Profile overview/actions and dedicated quota details.
  - Files under `extensions/osdy-pi/`: `control-center-account.ts` and test, `control-center.ts` and test, `runtime.test.ts` (T1 tests preserved).
  - Account → profile Enter → grouped actions → View usage. Refresh/Back stay reachable with long details; Back/Esc returns to overview without releasing the editor hold. Navigation makes no query.
  - RED: 102 passed / 8 failed; GREEN: 111/111. Confirmation, cancellation, credential isolation, bounds and selection preservation covered. Typecheck/lint/diff passed.
  - Authored 216 lines. Rollback: account grouping/quota navigation and corresponding tests.
- [x] D1 — Align README.
  - Account/quick paths/Esc, active refresh/backoff/snapshot retention and explicit stored-profile quota updated; unrelated release/version text preserved.
  - Passive documentation: meaningful RED is N/A. Source consistency and diff check passed. Authored 10 additions + 8 deletions = 18. Rollback: these README paragraphs only.
- [x] B2 — Isolate npm verification.
  - Fresh cache/log root and empty user/global npmrc; disposable test fixture outputs and harness captures authorized. No production configuration/credentials touched.
- [x] B3 — Preserve shutdown ordering compatibility.
  - Earlier full suite: 483/484 passed; analytics source-wiring assertion expected readiness=false first.
  - Only reordered readiness clearing before scheduler.stop in `runtime.ts`; test assertion unchanged. RED: 83/84; GREEN: 84/84; diff check passed.
- [x] T3 — Independent verification and native review.
  - Final isolated `npm test`: extensions 484/484, scripts 89/89. `npm run typecheck`, `npm run lint`, `git diff --check`: passed.
  - Parent-requested independent spot check: `node --test --experimental-strip-types extensions/osdy-pi/usage-analytics.test.ts extensions/osdy-pi/codex-usage-refresh.test.ts extensions/osdy-pi/runtime.test.ts`: 84/84. Zero failures/skips/cancellations/TODOs.
  - Before/after all 12 hashes/status/inventory matched, including protected task files. Background verifier `muty4mir-1-6e0i` settled completed.
  - Active LSP: no TypeScript errors; 28 auxiliary AST warnings across 8 files (runtime re-probe: 11). Not warning-free.
  - Native lineage `review-687e85bf91cf760c`, high tier, 11 frozen paths / 695 frozen lines (includes pre-existing user task diffs). Four provider reviewers admitted; approved on last event and exact acknowledgement consumed. Authority burned; target `sha256:c41a85510e1c7b620fafdfc08bac56e7d8957a7f4c8593c1d8d59afa824c5af9`; consumed revision `sha256:cc7ac8532bd90a4c14a4ab27229d0d402b44a30b0cdf8a1405c2d285eb8a6aea`.
  - One informational readability finding `R2-overview-index` at `control-center.ts:160`; non-blocking, separate later work. No correction or re-review offered. Review grants no delivery authority.
- [x] H1 — Human TUI/live quota smoke. Completed by user acceptance: user reported the implementation functional. No detailed remote timestamp trace was supplied.
  - Launch local source with `npm run pi:dev` (uses isolated `.pi-dev` and loads repo extension); choose/login Codex if needed.
  - `/osdyconfig` → Account → profile → View usage: check one profile row, separate actions, readable quota, Refresh and Back/Esc, without switching accounts.
  - With Codex active, open `/usage`, then leave it idle about 70 seconds; its `Updated:` time should advance without manual refresh when remote querying succeeds. Unchanged quota percentages alone do not prove stale data.
  - User feedback: functional, but the overall config panel still feels crowded. No detailed remote/network observation invented; no commits/publication.

## Next step
Feature accepted as functional. New presentation/navigation scope continues in `odd/tasks/control-center-clean-ux.md`; preserve this feature's quota refresh behavior and verification evidence.

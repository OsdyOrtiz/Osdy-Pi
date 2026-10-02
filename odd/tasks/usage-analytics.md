# Internal usage analytics with charts

## Intent and authorization

Build a terminal-native dashboard with local history across sessions, selected account profile and provider/model breakdowns, token composition and timeline charts, and day/week/month views. User approved implementation and local history from activation. Branch: `feat/usage-analytics`; base: `73871e4`.

No old-session import, prompt/content storage, credential reads, web server, budgets, account-management changes, new dependencies/version changes, commits, push or release. Commits need explicit authorization; completed below means implemented and checked, not committed or delivered.

## Design and boundaries

- `/osdy-usage` is separate from the unchanged `/usage` Codex quota panel. Recorded token usage and estimated cost are not subscription quota or a provider bill.
- Collect only new assistant turns begun after registration while Osdy is enabled. Snapshot session and selected profile at `turn_start`; use actual provider/model and stable `messageEntryId` from Pi 0.99.1 `turn_end`. No history scan/backfill or collection from refresh/tree/reload/compaction.
- Only Codex gets the selected Codex profile label; other providers/missing profiles are unmanaged. Labels are historical, not verified account identities. Rename/delete does not rewrite history; case-insensitive profile identity avoids spelling-only splits.
- Non-message/background usage and processes without the extension are excluded; disclose coverage honestly. Public Pi 0.99.1 has no verified usage-entry-created event.
- Store only version, timestamp, session/entry IDs, selected profile label, provider/model, four token counts and nullable estimated cost. No content, auth, account IDs or session paths.
- Storage: `<active agent dir>/extensions/osdy-pi/usage-analytics/`, absolute `PI_CODING_AGENT_DIR` or `~/.pi/agent`. Same-agent profiles share history; isolated directories keep separate histories.
- Private per-instance append-only JSONL shards, serialized appends and tuple deduplication; reject symlink/nonregular targets. Bound directory/file/byte/record/line work, prefer recent data, report limited/corrupt coverage. Never delete/truncate user history. Surface I/O errors without failing agent work; drain writes on shutdown.
- Validate unknown input, control-free bounded labels, finite nonnegative safe token counts/timestamps and nullable finite nonnegative costs. Whitelist serialization.
- Local calendar day/hour buckets, Monday week/daily buckets and month/daily buckets; previous/next navigation and profile/provider/model filters. Half-open ranges, independent civil boundaries and explicit empty buckets handle DST. Display timezone convention.
- Theme-aware width-safe, scrollable charts with keyboard controls and explicit empty/unknown/error/limited/unpriced states. No unsupported custom UI calls in RPC/noninteractive mode.
- Keep pure services/presentation separate and runtime wiring minimal. Strict TypeScript, no `any`, no unvalidated casts.

## Work units and delivery

Forecast: 1,000–1,600 authored lines including tests/docs; the original native review measured 1,536 authored lines; the UA-4 candidate measured 1,715 and the UA-5 candidate 1,971 across 9 files (excluding this ledger). Size is advisory, never compress code or omit tests. Strategy: `ask-on-risk`; resolve review slices/chain strategy before any authorized commit or PR. None requested yet.

| ID | Task | Route and trigger | Status | Commit |
| --- | --- | --- | --- | --- |
| UA-1 | Validated private history and local-date aggregation | delegated; multi-file writes | completed | Not authorized |
| UA-2 | Theme-aware terminal charts and filters | delegated; multi-file writes | completed | Not authorized |
| UA-3 | Request-time collection, command, documentation and full verification | delegated; lifecycle integration | completed | Not authorized |
| UA-4 | Improve summary hierarchy, compact charts and ranked comparisons | delegated; UI/tests/docs multi-file work | completed | Not authorized |
| UA-5 | Split analytics into four focused pages with shared filters | delegated; UI/state/tests/docs multi-file work | completed | Not authorized |
| UA-5B | Verify tiny-viewport warning correction | delegated; independent PTY blocker verification | completed | Not authorized |

## Acceptance and evidence

### UA-1
- [x] Private validated records, concurrent store instances, tuple deduplication, no raw metadata leakage.
- [x] Bounded recent-first reads, corruption/partial-tail warnings, symlink/nonregular rejection.
- [x] Profile/model filters, input/output/cache/cost totals and unavailable-cost counts.
- [x] Local day/week/month, half-open intervals and DST-safe boundaries.
- [x] Focused tests, typecheck and lint pass.
- Initial writer stalled with no final report; original RED unavailable. Independent verifier observed 12 tests/typecheck/lint passing, then identified exact-tail and midnight-DST defects. Correction writer observed RED 12 pass/3 fail, then GREEN 15 pass/0 fail after minimal fixes; typecheck/lint passed again. Parent read both source modules.
- Commands: `node --test --experimental-strip-types extensions/osdy-pi/usage-analytics-store.test.ts`; `npm run typecheck`; `npm run lint`.
- Runtime harness: N/A, storage not wired yet. Untested: independent OS processes, filesystem replacement races and injected partial writes. No credentials/history inspected.
- Rollback: new `usage-analytics-data.ts`, `usage-analytics-store.ts` and store tests only.

### UA-2
- [x] Profile/model bar charts, stacked input/output/cache composition and temporal chart.
- [x] Day/week/month, previous/next, profile/model filtering, refresh, scroll and close.
- [x] All groups reachable; narrow widths and empty/error/limited/unpriced states are useful.
- [x] Meaningful rendering/interaction RED/GREEN; store + UI tests, typecheck and lint pass.
- Writer observed RED 0 pass/7 fail, GREEN 7 pass, then 11 UI tests after DST/control/theme/refresh cases; 26 combined tests passed. Typecheck, lint and diff whitespace checks passed. Parent read UI module. Scripted synthetic PTY evidence is recorded under UA-3; human visual confirmation remains pending.
- UA-3 API: `showUsageAnalyticsPanel(ctx, { read, now? })`; gate `ctx.mode === "tui"`. Controls: d/w/m, left/right, p/v/f profile/provider/model, x reset, r refresh, scrolling/Home/End and esc/q/Ctrl+C close.
- Commands: `node --test --experimental-strip-types extensions/osdy-pi/usage-analytics-store.test.ts extensions/osdy-pi/usage-analytics-ui.test.ts`; `npm run typecheck`; `npm run lint`.
- Rollback: new `usage-analytics-ui.ts` and tests; no unrelated UI replacement.

### UA-3
- [x] Request-start attribution; actual assistant model; duplicate/session/account/disabled/error cases tested.
- [x] No backfill or quota mutation; serialized writes, nonfatal errors and shutdown drain.
- [x] `/osdy-usage` interactive dashboard and honest noninteractive fallback.
- [x] README covers controls, activation, storage/privacy, labels, timezone and measurement limits.
- [x] Full `npm test`, `npm run typecheck`, `npm run lint`; independent verification completed.
- [x] Active LSP diagnostics checked 8 TypeScript files: no compiler errors, 62 auxiliary AST warnings/hints remain, including pre-existing runtime findings.
- [x] Native review approved and exact acknowledgement completed; no delivery authorized.
- [x] Credential-free scripted PTY smoke passed 18/18 named assertions; human visual and provider-backed capture remain unverified.
- Writer observed RED 1 pass/7 fail, then GREEN 8 pass and expanded coverage to 11 lifecycle tests. Combined analytics tests: 37 passed. Full suite: 266 extension tests and 71 script tests passed; typecheck, lint and tracked diff whitespace passed. Independent verifier repeated all these commands successfully. Runtime change is 6 added lines.
- PTY used installed Pi 0.99.1 ProcessTerminal/TuiMainScreen with a synthetic snapshot, not authenticated Pi. Initial drivers exited 1 because of harness expectations; failed evidence was preserved. Correcting only the expected unmanaged label produced driver/child exit 0, 18/18 checks, 51 frames, 47 inputs, 2 reads, 0 fetches and 0 width violations at 12/32/100 columns. Successful evidence: `/var/folders/qg/r_11gk3n283_h43_7ncnf6r00000gn/T/osdy-usage-pty-final-56z71vsj/`.
- Native review: `review-5ec037b01a3f1d19`, medium, one consolidated reliability lens; approved. Exact acknowledgement returned `native-approved-acknowledgement-completed`, authority burned for target `sha256:b473221ca601d25a82be7f6f644567d5354d6b48af2394da7c655eb2d6a9c667`, consumed revision `sha256:6d2f4521ef1e02ee45a07467d9a41f0147faed588985ffa028365cbab6b14279`. Do not re-query or reuse this burned authority.
- Native assessment separately reported unassessable because of untracked declaration handling. The fail-closed independent verification path had already been satisfied. Post-acknowledgement assessment explicitly received closed outcome; this does not erase the assessment limitation.
- Focused command: `node --test --experimental-strip-types extensions/osdy-pi/usage-analytics.test.ts`.
- Rollback: collector/tests, minimal runtime import/registration and README section. Existing quota/account behavior unchanged.

### UA-4 — summary-first UX refinement

User subsequently authorized improving how analytics information is presented. Read-only mapping found disclaimers before totals, duplicated controls, and two full-width rows per time bucket. Keep one continuous dashboard rather than adding tabs or a navigation framework. Approximate delta: 400 authored lines including tests/docs; this is advisory, not a cap.

- [x] Headline tokens, recorded turns and estimated cost appear first as responsive metric cards/rows; unknown cost is distinct from recorded zero.
- [x] Compact range/filter header and controls, without repeated prose. Preserve existing d/w/m, arrows, p/v/f, x, r, scroll and close semantics.
- [x] Compact timeline overview with scale/context; exact bucket labels/values and timezone/DST offsets remain reachable below.
- [x] Profile/provider-model rankings sorted by consumption descending, deterministic ties, aligned bars/values/shares at wide widths; all groups remain reachable.
- [x] Short visible loading/stale/error/limited status; move explanatory caveats to a details section, never conceal data-integrity warnings.
- [x] Readable narrow/short layouts, Unicode-safe widths, clear empty/filter-empty states, retained labels and theme semantics. No color-only meaning.
- [x] RED/GREEN presentation tests, full analytics regression suite, typecheck, lint and full package tests.
- [x] Independent spot check and synthetic terminal smoke using current expectations; human visual confirmation explicitly separate.
- [x] Fresh native review for changed candidate; UA-3 approval was not reused.
- Writer observed RED 11 pass/4 fail before implementation; final 19 UI tests and 45 analytics tests passed. Full suite: 274 extension + 71 script tests. Typecheck, lint and tracked diff whitespace passed. A Unicode-profile fixture was corrected to respect ASCII-only profile names while keeping Unicode model coverage.
- Independent verifier repeated 45 analytics tests, typecheck and lint successfully. Synthetic PTY driver/child exit 0, 19/19 named checks, 51 frames, 47 inputs, 2 reads, 0 fetches, 0 width errors at 12/32/100 columns with a 96-column modal. Evidence: `/var/folders/qg/r_11gk3n283_h43_7ncnf6r00000gn/T/osdy-usage-pty-final-0kdd327n/`. This is not human visual or live-provider verification.
- Active LSP checked the 2 changed UI files: no compiler diagnostics; 11 auxiliary AST warnings remain in unchanged control code. No analytics storage, collection or runtime source changed in UA-4.
- Fresh native review `review-3748f1473590a5ee` approved; exact acknowledgement completed and burned authority for target `sha256:a9b5c30b4ebff678395b0b44a8e54cc158408d6cd8d6b337e771fea7f6770f58`, consumed revision `sha256:e6798d7f84cbbb9dbbde26a37f0e131d30123acb08996564817f3d6ca84dbc99`. One nonblocking informational warning remains for separate later work: `R3-lost-coverage-restart`, `extensions/osdy-pi/usage-analytics.ts:30`; no correction opened or offered. Do not reopen this candidate for it.
- Post-acknowledgement assessment again could not process the untracked declaration; explicit closed outcome and already-completed independent verification are recorded, not an inferred low-risk result.
- Allowed writer surfaces: `extensions/osdy-pi/usage-analytics-ui.ts`, `extensions/osdy-pi/usage-analytics-ui.test.ts`, and the analytics section of `README.md`. Existing untracked UI files are intended edit surfaces. No changes to collection, storage, aggregation, runtime, accounts or quotas.
- Commands: `node --test --experimental-strip-types extensions/osdy-pi/usage-analytics-ui.test.ts`; the three analytics test files together; `npm run typecheck`; `npm run lint`; `npm test`.
- Rollback: only UA-4 presentation/test/docs delta; preserve previously verified usage collection and history.

### UA-5 — progressive disclosure with four pages

User found the continuous dashboard too dense and explicitly chose internal pages rather than separate commands. This supersedes UA-4's continuous-layout decision, not its verified collection or history behavior. Keep one `/osdy-usage` command. Expected delta: approximately 300–500 authored lines across UI/tests/docs; advisory only, never omit tests or compress code to fit.

- [x] Default Summary page: headline tokens, recorded turns, estimated USD and compact general timeline only.
- [x] Profiles page: all profile consumption rankings; Models page: all provider/model rankings and token composition of the current selection; History page: temporal chart and exact buckets with timezone/DST offsets. Filter a model to inspect its composition.
- [x] Tab / Shift+Tab cycle four pages; 1–4 jump directly. Show active page even on narrow terminals. Preserve period, filters and snapshot; page changes reset scroll without extra reads or network work.
- [x] Move methodology/full control reference behind `?` help, with a clear return path. Preserve close semantics and existing period/filter/refresh controls; help must not discard selection.
- [x] Loading, stale/error, incomplete coverage and unavailable/partial-cost warnings remain visible on every page, separate from optional help. Keep empty/no-match states useful.
- [x] RED/GREEN navigation/rendering tests, narrow/short/Unicode layouts, shared-state and scroll regressions; all analytics tests, typecheck, lint and full suite.
- [x] Independent focused verification and synthetic terminal navigation spot check; record limits separately from human visual/live-provider acceptance.
- [x] Fresh native candidate review or exact recorded outcome; never reuse UA-4 authority.
- Allowed writer surfaces: `extensions/osdy-pi/usage-analytics-ui.ts`, `extensions/osdy-pi/usage-analytics-ui.test.ts`, and analytics documentation in `README.md`. Existing untracked UI files are intended edit surfaces.
- No changes to collector, storage, aggregation, runtime, quota, accounts, dependencies, versions or command registration. No commit/push/install/release.
- Checks: `node --test --experimental-strip-types extensions/osdy-pi/usage-analytics-ui.test.ts`; the three analytics tests together; `npm run typecheck`; `npm run lint`; `npm test`; `git diff --check`.
- Rollback: UA-5 presentation/navigation/test/docs delta only; preserve earlier analytics work.
- Writer evidence: RED 19 pass/2 fail before implementation; GREEN 21 then 27 UI tests. Final 53 analytics tests and 282 extension + 71 script tests passed; typecheck/lint/tracked diff whitespace passed. UI/state/test/docs only. Exact UA-5 authored delta unavailable because the pre-existing UI files were untracked without a saved baseline.
- Independent verifier repeated 53 analytics tests/typecheck/lint/whitespace successfully. PTY passed 92/101 assertions; driver exit 1, three children exit 0. Main run: 157 frames, 149 inputs, 2 reads, 0 fetches or width/row errors. Navigation and shared selection passed; nine warning-visibility assertions failed. Evidence preserved at `/var/folders/qg/r_11gk3n283_h43_7ncnf6r00000gn/T/osdy-ua5-verify-h7dtrq7w/`.
- Resolved blocker UA-5B: combined badges truncated partial-cost status at 12/32 columns; at 100x5 the incomplete-data badge disappeared. Correction now wraps/ packs distinct statuses and prioritizes them plus page identity over optional headings/body/footer. Physically smaller surfaces cannot guarantee all statuses. No scope expansion or native correction transaction was involved.
- Correction writer observed RED 27 pass/3 fail with real-panel dimension regressions, then GREEN 30 UI tests; 56 analytics, 285 extension + 71 script tests passed, typecheck/lint/tracked whitespace passed. Independent verifier repeated 56 analytics/typecheck/lint/whitespace successfully.
- Original PTY rerun preserved at `/var/folders/qg/r_11gk3n283_h43_7ncnf6r00000gn/T/osdy-ua5b-original-yfPErg2T/`: 97/101, driver 1, children 0. Four failures were contiguous-literal matching of complete `Partial` and `cost` visibly wrapped across rows. A new variant strips outer frame edges and normalizes whitespace only; all original assertions remain. Proof rejects all 16 pre-fix cropped frames and six negative controls, while recognizing all 16 corrected frames.
- Final PTY evidence: `/var/folders/qg/r_11gk3n283_h43_7ncnf6r00000gn/T/osdy-ua5b-wrapped-t8tocddu/`. Driver and children exited 0; 101/101 original + 24/24 supplemental checks passed. Main: 209 frames, 198 inputs, 2 reads; all children 0 fetches/width/row violations. Tested every page/help after End at 12x10, 32x16, 100x5, navigation, selection, refresh and close. Page/help changes cause no extra reads. Synthetic only, not human visual or live-provider acceptance.
- Active LSP checked the two UI files: no compiler diagnostics; 12 auxiliary AST warnings remain (11 pre-existing control-code patterns and one nested navigation ternary). README verification wording updated before review.
- Fresh native review `review-e5c391d3b973323a`, medium, one reliability lens, 1,971 lines/9 candidate files: approved. Exact acknowledgement returned `native-approved-acknowledgement-completed`; authority burned for target `sha256:7ea493189796d90907b1dca34a0099d61e2ddb9ca628e0dbedf908a1b7168a29`, consumed revision `sha256:1b9cf7e6bca416455c547bbaf7765c01cf73c24e16acd318b283d852e84855c5`. Do not re-query or reuse. Nonblocking informational advisory `R3-coverage-restart` at `extensions/osdy-pi/usage-analytics.ts:30` is separate later work, not an open correction.
- Native assessment before/after review remained unassessable due to untracked declaration handling. Explicit closed outcome was supplied only after acknowledgement; writer and independent checks already satisfied the fail-closed verification path.

## Current status and next step

UA-1 through UA-5 and UA-5B are implemented and checked on uncommitted `feat/usage-analytics` at `73871e4`. The four-page candidate has its own approved and acknowledged review. No commits, push, install, version bump or release occurred.

Next: load this checkout with `npm run pi:dev`, or `/reload` if already loaded, then `/osdy-usage`; use Tab / Shift+Tab or 1–4, and `?` for optional help. Human visual and real-provider capture confirmation remain pending; no old sessions are imported. The coverage-restart advisory is a separate later follow-up, not an open correction. Resolve commit/review-slice strategy only on a delivery request.

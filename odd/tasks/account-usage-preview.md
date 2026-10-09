# Account usage preview

## Intent
Switch displays names and active/default markers ONLY. V shows highlighted profile quota using `/usage` dashboard; Esc/b returns preserving highlight; Enter switches only from list. Keep unavailable profiles selectable and snapshot previews read-only. Four-concurrent eager requests remain; no preview auth refresh/persistence/activation.

## Tasks
- [x] T1 Initial selector/runtime/tests/README: delegated worker.
- [x] T2 Initial verification: delegated verifier.
- [x] T3 V custom dashboard/tests/README: delegated worker.
- [x] T4 Independent verification after fullscreen correction.
- [x] T5 Responsive capturing overlay/real SDK regressions.
- [x] T6 Hide list summaries; preserve V details; tests/README: delegated worker, multi-file trigger.
- [x] T7 Independent presentation verification: delegated verifier, verification trigger.

## Evidence
Historical RED/GREEN: initial 94 focused; V refinement 131; overlay correction 133. Real SDK mounting/fullscreen routing coverage resolves inline interception/clipping, tested 1×1–100×24.
T6 RED: three exact label failures, 28 passes. GREEN: 31 focused tests. Final writer and independent verifier both passed:
- `node --test --experimental-strip-types extensions/osdy-pi/account-profiles.test.ts extensions/osdy-pi/account-profile-selector.test.ts`: 31 passed.
- `npm run typecheck`, `npm run lint`, `git diff --check`: passed.
- `npm test`: 728 extension + 89 script tests passed, zero failures/skips.
Independent rerun served parent spot check. Source readback confirms clean labels and separate V snapshots, no extra detail requests or activation. Native assessment unassessable due untracked declaration; independent high-risk fallback complete. RDD off, no review start.
Live auth/hardware keys/appearance/real switching unverified; 1–2 rows cannot show all controls.

## Constraints and delivery
Preserved unrelated dirty audio-delivery.md/codex-banked-resets.md tasks. Git status unchanged by checks. User authorized one cohesive commit and push on feature branch, without merging main. Delivery strategy: exception-ok (explicit size exception). Branch: feat/account-usage-preview; base: 89f3886. Planned work-unit commit: feat(accounts): add V-key usage preview before switching. Combined feature above advisory 400 lines; meaningful regression tests retained.
Rollback surfaces: extensions/osdy-pi/account-profiles.ts/.test.ts, runtime.ts, account-profile-selector.ts/.test.ts and README.md.

## Next
Commit and push only this feature on feat/account-usage-preview. No PR or merge authorized. Reload extension for live visual confirmation; Switch shows only accounts and V shows details.

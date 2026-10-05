# Working activity patterns

## Intent and design
Six English activity labels, compact per-state glyphs and a Gentle Shell-inspired live-theme brightness pulse. Preserve centered placement, grapheme-safe text highlight and one 80 ms timer. No animals, emoji, hardcoded colors or external Shell dependency. Thinking means active agent without tools, not guaranteed reasoning; known reads/docs explore, mutations work, handoffs delegate, checks verify, unknown/ambiguous tools execute. Conservative bash/MCP classification; toolCallId tracking restores newest remaining tool; duplicates/unmatched ends harmless; reset/disable/shutdown cleanup intact.

| Label | Frames |
| --- | --- |
| Thinking... | ◌ ◎ ◉ ● |
| Exploring... | ✶ ✷ ✸ ✹ |
| Verifying... | ◇ ◈ ◆ ◈ |
| Working... | ✻ ✼ ✽ ❋ |
| Delegating... | ✧ ✦ ✧ |
| Executing... | ◴ ◷ ◶ ◵ |

Shared pulse: mdQuoteBorder, thinkingHigh, accent, borderAccent and back. All glyphs visibleWidth1; existing zero-width one-cell clipping/text highlight retained. Activity only, not percentage progress.

## Authority and work unit
User approved implementation and appearance, then README, commit, push, main merge and automatic next stable patch/latest publication on https://registry.npmjs.org/ through existing npm-publish.yml (human choice auto_patch_latest). No tag/GitHub Release/PR/workflow change/force/reset/stash/clean authorized or performed.

Feature feat/working-activity-patterns; base d415942b7668e23c987441a5133f392762b4fe95. Exact approved12paths committed as 545560153d13a25f1f0d840878a2a4813df669c0: feat(working): add activity states and theme-pulsing symbols. Feature pushed, main merged --ff-only and pushed. README accompanied behavior. Source/tests402 authored lines (+327/-75), approximately400-line heuristic; candidate slices250/152, no cosmetic reductions. Full commit397add77delete includes README/ODD record. One direct-main work unit requested, no PR.

Source package and both lock roots remain1.11.0 by existing CI contract; release metadata finalizes in disposable checkout, no version commit-back. Pre-existing odd/tasks/control-center-release.md excluded and preserved SHA25626c2e63e26b91e2bd25ae2ef2e93aeee8564c6ba916b589b164a7b91c9b7a480. Post-freeze updates to this excluded ODD document remain local/Engram; no extra mainpush merely for bookkeeping.

## Completed tasks and evidence
- [x] W1 — State classification and identity-aware routing; delegated worker.
  - RED61pass6fail, GREEN68; Context7 wrapper follow-up RED68pass1fail, GREEN69. Existing animation/UI63/63 and typecheck passed. Tested overlaps, duplicates, unknown ends, reset, disabled resume and timer/shutdown. Runtime forwarding is source assertions, not E2E TUI. User approved minimal runtime-helpers fixture after no-edit scope stop.
  - Rollback: activity module/controller/types/runtime and associated tests/fixtures.
- [x] W2 — Compact frames and shared pulse; delegated worker.
  - RED0pass14fail, GREEN14/14; controller/runtime/UI125/125, typecheck passed. One existing clock, live theme, widths/graphemes/centering preserved.
  - Rollback: constants/renderer/animation tests, preserving W1 fixture edit.
- [x] W3 — Combined verification and native code review.
  - Independent verifier: full562/562 (473extension+89script), spot83/83, typecheck/lint/diff-check passed; no failing/skipped/cancelled tests. LSP0diagnostics,6clean4inconclusive; typecheck conclusive. User confirmed appearance; performance benchmark not run.
  - Native review-d92810e7ff87ae1b four lenses approved, exact acknowledgement burned authority revision sha256:6a4a3e170cb2d2a4ceb7958af58c7ca52d213418bd4483b92f85b0b1a8ae38a6. No STATUS after burn. Native frozen411lines included untouched pre-existing9line release-doc delta; intended new code/test selected, ODD tracking excluded.
  - Passive README Status/indicator update verified structurally; meaningful RED not applicable, second native review skipped only for prose. No source edits afterward.
- [x] D1 — Release preflight and prior-outcome reconciliation; independent verifier.
  - Release12/12, focused83/83, full562/562, typecheck/lint/diff and unchanged release-input checks passed. Full README review: facts match source,23themes, roots1.11.0.
  - Remote main unprotected at base. Prior run37183673527 failed visibility window after accepted1.11.3; retained archive143members/source/SHA1/SRI now matched official1.11.3/latest. Definitive reconciliation before new mainpush; evidence /tmp/osdy-pi-release-evidence.23gVgub2. Expected test fixtures/pack--dry-run are not retained artifacts or repo-mutation evidence.
- [x] D2 — Commit/push/merge main; parent Git under explicit grant.
  - Exact12paths at545560153d13a25f1f0d840878a2a4813df669c0, feature push, --ff-only main merge/push succeeded; unrelated document untouched. No force/PR/tag/version bump.
- [x] D3 — Official registry and immutable artifact verification; independent verifier.
  - Registry-verified osdy-pi1.11.4 and latest1.11.4, releaseSource545560153d13a25f1f0d840878a2a4813df669c0.
  - Workflow https://github.com/OsdyOrtiz/Osdy-Pi/actions/runs/37197783096 remains completed/failure: checks succeeded; npm accepted processing exceeded CI visibility window, not authentication denial. One bounded reconciliation at2026-10-04T11:15:48Z returned HTTP200 exactversion/dist-tags with source/version/latest/bothhash matches; stopped immediately. No rerun or republish.
  - Retained /tmp/osdy-pi-d3-37197783096.YnGKCX/evidence.json and osdy-pi-1.11.4.tgz. Archive1735049bytes,145regularmembers,2639444unpackedbytes. Every member matched frozenGit, including README, except verified CI-finalized manifest version/releaseSource/repository. No duplicates, unsafe paths, links, excluded bookkeeping/caches/config or unexplained transformations. No lifecycle hooks; CIignore-scripts.
  - SHA1:827d218953c4fae916c9b5a1ecce627c0d79fd28.
  - SRI:sha512-wKyL28iqUwf7y/KgJg0r5v9ANHRd7Oyy1vp63WroV1xFUAhEFH2RGfoZgAyP3LMK3jg0Dyh5hsbK4sQdKKrMhQ==.
  - Independently computed hashes match evidence/npm. GitHub artifactZIPdigest/provenance not independently verified. User-file digest unchanged; only excluded ODD ledger and pre-existing release document dirty.

## Outcome and next step
Implementation, README, commit/push/main merge and npm1.11.4/latest publication are verified complete. CI result is honestly still failure from visibility timeout; no functional test failure. No retry required. Keep frozen source/artifact evidence; do not push excluded delivery bookkeeping as another publication. Future timeout-window changes would be separate authorized work, not part of this feature.

Mirror: odd/working-activity-patterns/tasks; locator: odd/tasks/working-activity-patterns.md.

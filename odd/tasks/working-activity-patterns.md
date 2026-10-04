# Working activity patterns

## Intent and constraints
Six English activity labels with compact per-state glyphs and a Gentle Shell-inspired theme-color pulse. Preserve centered placement, grapheme-safe traveling text highlight and one 80 ms timer. No animals, emoji, hardcoded colors or external Shell dependency.

Thinking denotes an active agent without tools, not guaranteed reasoning. Known reads/search/docs explore; mutations work; handoffs delegate; checks verify; unknown/ambiguous tools execute. Bash classification is conservative. Track toolCallId; newest remaining tool owns the display. Duplicate/unmatched events are harmless; reset/disable/shutdown cleanup remains intact.

## Design
| Label | Frames |
| --- | --- |
| Thinking... | ◌ ◎ ◉ ● |
| Exploring... | ✶ ✷ ✸ ✹ |
| Verifying... | ◇ ◈ ◆ ◈ |
| Working... | ✻ ✼ ✽ ❋ |
| Delegating... | ✧ ✦ ✧ |
| Executing... | ◴ ◷ ◶ ◵ |

Shared pulse: mdQuoteBorder, thinkingHigh, accent, borderAccent and back. Current theme is used per render; animation is activity, not percentage progress. All selected glyphs have one-cell visibleWidth; existing zero-width one-cell clipping is preserved.

## Delivery authority and identity
- Branch feat/working-activity-patterns; base/remote main d415942b7668e23c987441a5133f392762b4fe95. Remote OsdyOrtiz/Osdy-Pi; viewer ADMIN.
- User confirmed visual appearance and authorized README update, commit, push and merge main for publication. Human choice auto_patch_latest explicitly approved automatic next stable patch on https://registry.npmjs.org/ with latest through existing npm-publish.yml.
- Source manifest and both lock roots remain 1.11.0. CI allocates from greater of source/registry stable versions, finalizes metadata in disposable checkout, retains/validates exact archive and records releaseSource. No version commit-back/manual bump needed.
- No tag, GitHub Release, PR, workflow change, force push, reset, stash or clean authorized.
- Preserve and exclude pre-existing modified odd/tasks/control-center-release.md. Stage exact approved paths only.
- One coherent direct-main work unit requested; source/tests402 authored lines (+327/-75), approximately400-line heuristic. Candidate slices W1/W2 are250/152; no cosmetic reductions. README accompanies behavior; odd bookkeeping is excluded from npm.
- Commit: pending. Mirror odd/working-activity-patterns/tasks; locator odd/tasks/working-activity-patterns.md.

## Tasks and evidence
- [x] W1 — Six-state classification and identity-aware event routing.
  - Completed, delegated gentle-ai-worker. Controller/runtime RED61pass6fail then GREEN68; exact Context7 MCP selector follow-up RED68pass1fail then GREEN69. Existing animation/UI63/63 and typecheck passed.
  - Concurrent endings/duplicates/unmatched events, reset, disabled resume, one timer and shutdown tested. Runtime forwarding is source assertions, not interactive E2E.
  - User approved only minimal additional runtime-helpers.test.ts fixture update after a no-edit scope stop.
  - Rollback: activity module, controller/types/runtime and associated tests/fixtures.
- [x] W2 — Compact frames and shared live-theme pulse.
  - Completed, delegated worker. RED0pass14fail then GREEN14/14. Controller/runtime/UI125/125 and typecheck passed. Existing text highlight and plain symbol preserved.
  - Rollback: constants, renderer and animation tests, preserving W1 fixture change.
- [x] W3 — Combined checks and native code review.
  - Completed, independent gentle-ai-verify: npm test562/562 (473extension+89script), typecheck/lint/diff-check passed; designated spot check83/83. No failed/skipped/cancelled tests.
  - LSP: zero diagnostics, six confirmed clean and four inconclusive (push-only); typecheck conclusive. No performance benchmark. User later confirmed appearance.
  - Native lineage review-d92810e7ff87ae1b: high tier, four lenses captured, approved acknowledgement burned authority; consumed revision sha256:6a4a3e170cb2d2a4ceb7958af58c7ca52d213418bd4483b92f85b0b1a8ae38a6. No STATUS after burn. Frozen411lines includes pre-existing9line release-document delta untouched by this work. Intended untracked code/test selected; ODD bookkeeping excluded.
  - Passive README Status/indicator update after code review: diff-check passed, meaningful RED not applicable, second native review skipped only for passive prose. No source edits afterward.
- [x] D1 — Recheck release inputs, README and functional gates.
  - Completed; independent verifier: release12/12, focused83/83, full562/562; typecheck/lint/diff and unchanged release-input checks passed. Full README/source review found no factual mismatch;23theme resources and all source/lock roots1.11.0 confirmed.
  - Main unprotected at baseSHA; official latest1.11.3 maps that source. Prior failed run37183673527 accepted publication but timed out visibility; retained archive143regularmembers/source/SHA1/SRI now match official1.11.3/latest. Prior outcome definitively reconciled, not bypassed. Evidence /tmp/osdy-pi-release-evidence.23gVgub2.
  - Preserve unrelated document SHA25626c2e63e26b91e2bd25ae2ef2e93aeee8564c6ba916b589b164a7b91c9b7a480. Test fixtures/pack--dry-run are expected, not a retained release artifact; no unexpected Git changes observed.
- [ ] D2 — Commit approved feature/docs, push feature, merge and push main.
  - In progress; dependsD1. Parent Git under explicit grant; stage exact paths, exclude unrelated document. Record immutable sourceSHA. No force or unapproved delivery route.
- [ ] D3 — Verify CI publication and official registry evidence.
  - Pending; dependsD2. Read-only verifier: exact workflow/sourceSHA, version/latest, retained archive/inventory/SHA-1/SHA-512 must match. Failed/unknown publication never triggers blind rerun, republish or another push.

## Acceptance and next step
Six labels and exact frame families; theme pulse/text animation/centering retained; concurrent ownership and cleanup correct; required checks pass or blockers disclosed. User accepted appearance. Publication is complete only when official registry/source/integrity/tag match retained CI evidence, not merely when Git push succeeds.

Next: D2 exact staging and main delivery; D3 observe one triggered run and reconcile registry boundedly. Likely next patch1.11.4, but CI allocation authoritative. No commit/push performed yet; no second main push solely to update bookkeeping after publication.

# Osdy-Halloween mascot

## Goal and scope
Selectable `osdy-halloween` / **Osdy-Halloween**: Current raccoon with dark/crimson cape, ivory fangs reduced to 1×2 cells, and theme glow using `accent`/`mdHeading`/`mdLink`. Preserve Current/Bts, defaults, version-1 persistence, legacy migration and responsive bounds. No new dependencies/settings changes.

## Authorization
User approved delegated implementation, smaller fangs, then README update, commit of all owned branch changes, push and main integration for existing automatic public/latest npm publication. No manual publish, force push, tags or GitHub Release. RDD off.

## Tasks and routes
- [x] H1 — Implement mascot/tests/docs; delegated multi-file writer.
- [x] H2 — Independent verification; assessment unavailable for untracked doc, fail-closed verifier passed.
- [x] H3 — Review README and validate delivery candidate; delegated audit and verifier passed.
- [x] H4 — Commit all owned changes, push feature and fast-forward main; complete, parent Git coordination. Source `96f670c11788dfb1a336c664a266b8581546ff59` confirmed on both remote refs, local main clean at integration.
- [ ] H5 — Verify source-bound CI, retained archive and official registry; registry/artifact verification passed, but overall CI failed on visibility timeout. Keep open pending explicit decision about rerunning the failed job; do not republish.

## Checks and acceptance evidence
Writer RED: 183 passes/10 expected failures; GREEN: 211 focused. Original face/tail/art fingerprints preserved; bounded previews 58×35/46×28/32×19. Readability warning fixed with equivalent assignments; no other cleanup. Fang RED: four tips vs two; GREEN: 80 focused and 638 full. Final delivery verifier `subtask_gentle-ai-verify_1791180531416_3322f148`: 211 focused + 12 release tests + 549 extension/89 script tests; typecheck/lint/diff-check passed, zero failures/skips. Parent animation spot-check 4/4. LSP no errors; pre-existing auxiliary findings remain and one clean recheck inconclusive. User accepted visual appearance; no live TUI validation claimed.

## README and release gates
README completely reviewed (660 lines), blob `97fa145f44a5dbbb67069ae548797d83f5328432`, against source/settings/menu/manifest. Existing edits accurately describe exact label/key, costume, independent choice and theme glow; no extra cosmetic change needed.
Origin `https://github.com/OsdyOrtiz/Osdy-Pi.git`; branch `fix/subagent-action-only-labels`. Intake HEAD `175d519f0a2a5991bb805cd61c1934d2c0932492`, main `5e7c5215302d92dc19cf7aedea5d8b767cebd76a`; one prior excluded-evidence commit ahead, no divergence. Eleven dirty feature-owned tracked files plus this task document, index initially empty. Diff 180 additions/16 deletions excluding tracking, below advisory 400 lines; delivery strategy ask-on-risk.
Manifest/lock roots intentionally remain 1.11.0. Main-push CI checks then allocates next registry patch (latest at audit 1.11.9; expected next 1.11.10), using Trusted Publishing, immutable exact archive bytes/inventory/exclusions and SHA-1/SHA-512/source reconciliation. Main unprotected, no PR required. Avoid later evidence-only main pushes: they also publish.

## Delivery evidence
Source commit `96f670c11788dfb1a336c664a266b8581546ff59` (`feat(mascot): add theme-aware Osdy-Halloween raccoon`) includes all 12 owned paths. Feature and main pushed; fast-forward integration includes prior excluded evidence commit. CI run `37271351961` attempt 1: checks passed (12 release + 638 full tests, typecheck/lint/diff-check), publication accepted but visibility timeout caused red workflow. Independent registry verification confirms `osdy-pi@1.11.10`, latest, unique releaseSource and both hashes. No republish or rerun performed. Rollback: new choice/costume/labels/tests/docs only; unrelated behavior preserved.

## Next step
Ask whether to rerun only the failed CI job now that source is registry-verified; existing same-source path verifies rather than republishes. Preserve main release source. Evidence-only bookkeeping is committed/pushed on feature only, avoiding another main-triggered release.

## Immutable publication evidence
Verifier `subtask_gentle-ai-verify_1791180939600_2f23a463` confirmed official registry at 2026-10-05T06:18:08Z. Version/latest `1.11.10`, releaseSource `96f670c11788dfb1a336c664a266b8581546ff59`. Artifact `npm-release-37271351961-1`, ID 11328199193. Retained directory `/Users/osdy/osdy-pi-verification-37271351961-xm54FX1n`; archive `osdy-pi-1.11.10.tgz`, evidence `evidence.json`.
149 regular archive members: 148 exact source Git blobs (including README), manifest exactly documented version/source/repository transformation. Inventory/types/exclusions verified, no unexpected members. SHA-1 `bd1d8400d5fad13871a95b5c409b5f98da97d592`; SHA-512 `sha512-FIV4leYRHUYoEacymN6qEnWhflAS/iLrflKdIdK6eAi3RHRy7jC/LSBKCEVcK1TWGgwE+CMLQsxLlC54TWQzjw==`. Registry version metadata and package metadata agree with hashes/source/latest. Cryptographic provenance signatures not independently verified. Workflow remains red; npm publication is registry-verified.

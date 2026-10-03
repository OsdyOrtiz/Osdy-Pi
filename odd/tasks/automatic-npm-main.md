# Automatic npm publication from main

## Objective
Publish osdy-pi to https://registry.npmjs.org/ on every main push (merges and direct pushes), after checks, with automatic patch increments and latest dist-tag. Use GitHub-hosted Actions/npm Trusted Publishing, no persistent npm token.

## Authorization and scope
User approved automatic main publication, patch increments, owner binding setup and automation commit. User then explicitly approved the complete flow ("vamos con todo ese flujo"): finalize legitimate branch work/README and commits, push branch, integrate once into main, and automatic next-patch npm latest publication. No force/destructive Git, secrets/caches, blind publish retries or separate tag/GitHub Release.

Branch: experiment/mascot-message-marker. Base: 51192db1b4ff00301b75a43c5cf6c2b88e794bbf. Historical pending odd/tasks/release-1-10-0.md is now part of authorized legitimate branch documentation (hash cd845cb80d4d05e1f22559a21ba874a2062b21fe); preserve observations at their original time, not as current registry state. One writer; final tracking docs will be committed with authorized documentation.

## Tasks and routes
- [x] T1: Implement tested patch preparation, main-only OIDC publishing workflow and setup docs.
  - Status: completed; observed functional checks, commit and native review acknowledgement.
  - Route: gentle-ai-worker for multi-file implementation/corrections, gentle-ai-verify for independent commands/actual packing/fresh pre-commit checks, parent for guarded Git and native lifecycle.
  - Scope/rollback: .github/workflows/npm-publish.yml; scripts/npm-release.mjs; scripts/npm-release.test.mjs; scripts/native-odd-todo-package.test.mjs; README.md; docs/npm-publishing.md.
  - Commit: 7e2cc32a99eb5c201d0936c140fcb585e649075c — feat(release): publish npm patches automatically from main. Six paths, 542 additions/6 deletions. Before staging: empty index, expected branch/HEAD, six file hashes verified. Unrelated ledger unchanged after commit.
  - Acceptance met: main-only gated push; registry-aware stable patch; generated matching manifest/lock roots; external record validation; publish-only OIDC; retained byte/hash/source-validated archive; official registry reconciliation; safe same-source reruns; no main backwrites; README and setup guide reviewed.
  - Tests: RED before implementation; regression RED had 4 failures for missing repository metadata and malformed packuments; GREEN 10/10 focused tests. Final full npm test 393/393 (307 extension + 86 scripts), typecheck, lint and git diff --check passed. Independent verifier repeated all five before guarded commit.
  - Actual pack: independent corrected temp package verified all 125 files and bytes; npm hashes matched; repeat tarball byte-identical. Verification-only, not approved publication.
  - Native review: inspect committed range with untrackedScope=exclude isolated six paths. High tier, four lenses (risk/resilience/readability/reliability), 548 frozen lines. Lineage review-aa25db3c49c8fe38 approved with no correction; exact acknowledgement returned native-approved-acknowledgement-completed / authority burned. No STATUS after acknowledgement.
  - Nonblocking advisories: R3-001 at scripts/npm-release.mjs:237-250, R4-uncertain-next-run at :68-71. Informational future work only; no correction transition or re-review for this candidate.
- [ ] T3: Finalize whole-branch README/documentation and verify frozen release readiness.
  - Status: in_progress.
  - Route: gentle-ai-worker for README precision; gentle-ai-verify for fresh full checks, committed source packing and official registry reads. Parent owns tracking and Git.
  - Scope: README.md precision about publication attempts; legitimate pending historical ledger and this tracking document. Passive documentation gets structural checks, no fabricated RED.
  - Acceptance: README truthful about checks versus publication; historical facts preserved; checks and immutable real-package verification pass; doc work-unit commit; prior TODO/mascot/automation approved receipts reused without new accumulated-branch review.
- [ ] T2: Integrate all branch work into main and verify one automatic npm publication.
  - Status: pending, blocked on T3; delivery now authorized. Owner reported binding setup complete.
  - Route: parent guarded Git fast-forward/push and Actions observation; gentle-ai-verify for external artifact/registry reconciliation. Never collect credentials.
  - Acceptance: push feature branch; one non-force main update including all legitimate work; one matching Actions run; official registry version/source/hashes/latest verified. Binding OsdyOrtiz / Osdy-Pi / npm-publish.yml, environment blank.

## Design and delivery
Source manifest/lock remain 1.11.0. Release checkout generates next patch from source floor and registry stable maximum, synchronizes lock roots, adds releaseSource SHA and canonical repository URL, then packs once externally and revalidates before publishing exact archive. Never retry publication blindly. No bot commits/tags/main writeback. Historical feature-release README references stay historical.

Delivery strategy: exception-ok for the already approved coherent automation unit; existing TODO/mascot units remain separately reviewed. Full delivery is one main update, not one accumulated review. Branch baseline has 26 changed paths, 1883 additions/307 deletions and four ahead commits; remote main 2fa2754c8ae8b32cf471b75b5d4ec6e4923bb1eb is ancestor, public/unprotected and user has push rights. Prior TODO review review-903613972c003698 and mascot review review-84c56a699248614d approved/acknowledged. No re-review of burned authority.

Automation unit Initial forecast 350-400 lines; archive-byte validation, external schema validation, metadata/rerun safeguards and tests explain overage; no minification. Commit itself is reviewed candidate, not accumulated branch.

## Verification artifacts and limits
Final retained verification-only archive: /var/folders/qg/r_11gk3n283_h43_7ncnf6r00000gn/T/osdy-npm-final-verification-olZIkS/pack-1/osdy-pi-1.11.1.tgz, 1,678,710 bytes. SHA-1 aee275d1633aa1006fbe0fa6a0b0b5df7017fc8c; integrity sha512-YtEYdBKhF08S7bmbmDmLZmRbIGeiCEFgrT0O1E1WU9CVTzZT7JxCGjBVihHG+MDI+4Q+LlprijXUeR4PpH7n6Q==.

Live npm/OIDC, Ubuntu/Node-24 Actions execution and service-side workflow validation remain unverified. Local checks used macOS/Node 26/npm 11.12.1. Workflow/docs got structural verification, no real publish smoke test. queue:max retains at most 100 pending runs; order is waiting order, not guaranteed dispatch order. Registry-absent reruns stop even after checks-only failure; outside publishers may cause conflicts/tag mismatches.

Native ASSESS returned unassessable due to undeclared untracked bookkeeping even with committedOnly; treated as high and independent verifier ran. INSPECT accepted explicit exclusion, and review closed normally. Post-ack ASSESS explicitly passed nativeReviewOutcome=closed; still unassessable but returned no additional verifier required because closed native review is independent check. No failed functional checks.

Typecheck passed; final .mjs LSP sweep inconclusive. Auxiliary unchecked-JSON-call findings marked false positives: awaited top-level CLI catch handles them, independently tested. Awaited-member hints informational. Earlier verifier npm commands generated ordinary default logs outside temp, left untouched; repository/dependency metadata unchanged. No installs/credential handling/publication.

## Next step
Complete T3 README/checks/documentation commit, commit final excluded tracking before the only main update, then execute authorized T2 push/fast-forward integration and bounded first-run/npm verification. Stop on conflicts/check failure/publication uncertainty; no blind retry. No per-step permission prompts inside this approved scope.

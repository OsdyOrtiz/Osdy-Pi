# Automatic npm publication from main

## Objective and authority
Deliver all legitimate work from experiment/mascot-message-marker to main in one update, with accurate README and one automatic osdy-pi patch publication to https://registry.npmjs.org/ (latest). User approved complete flow: "vamos con todo ese flujo". Grants cover required source/docs fixes, commits, branch push, one main integration and automatic npm publication. No force/destructive Git, secrets/caches, blind publish retry or separate tag/GitHub Release.

Original main: 2fa2754c8ae8b32cf471b75b5d4ec6e4923bb1eb, public/unprotected, ancestor of feature branch; user has push rights. Original delivery scope: 26 paths, 1883 additions/307 deletions, four ahead commits. Existing TODO/mascot units and automation have approved reviews; full branch is not a new native review candidate. Historical pending release-1-10-0.md preserves observations at their time; now committed under complete delivery grant, not current registry claims.

## Tasks
- [x] T1: Implement and review automatic main patch publisher.
  - Completed: 7e2cc32a99eb5c201d0936c140fcb585e649075c, six paths, 542 additions/6 deletions, coherent size exception authorized.
  - Route: gentle-ai-worker; independent gentle-ai-verify; parent guarded Git/native lifecycle.
  - Checks: regression RED/GREEN; 10 focused/393 full tests, typecheck/lint/diff passed; independent 125-file actual pack, repeat byte-identical.
  - Native review review-aa25db3c49c8fe38 approved, exact acknowledgement burned authority. Informational advisories R3-001 (:237-250), R4-uncertain-next-run (:68-71), no correction/re-review. Prior TODO review-903613972c003698 and mascot review-84c56a699248614d approved/acknowledged.
  - Rollback: .github/workflows/npm-publish.yml; README.md; docs/npm-publishing.md; scripts/native-odd-todo-package.test.mjs; scripts/npm-release.mjs; scripts/npm-release.test.mjs.
- [x] T4: Fix official npm version-not-found JSON-string compatibility.
  - Status: completed. Commit b4b9d5ce1bd340f72fd6b0e6681534456e8043c2; minimal exact-string fix plus 25 regression test lines. RED 10 pass/1 fail, GREEN 12 focused/395 full tests/typecheck/lint/diff; live missing-version helper returned null. Fresh medium native review review-5481138fdc04cd5d approved and exact acknowledgement burned, no findings. Initial same-path npm config attempt failed before tests, then distinct configs passed.
  - Route: gentle-ai-worker for two-file boundary fix/regression tests; parent commit/fresh work-unit native review.
  - Surface: scripts/npm-release.mjs; scripts/npm-release.test.mjs. Minimal exact known 404 response support; unrelated error strings must fail closed.
  - Acceptance: deterministic RED then GREEN, full checks, live read-only absent-version probe, commit, native review as required. No publish in tests.
- [ ] T3: Finalize README/docs and verify frozen whole-branch readiness.
  - Status: in_progress; T4 resolved, final frozen-source readiness verification pending.
  - Route: worker README precision, independent verifier full checks/clean-checkout prepare/registry reads, parent Git.
  - Docs commit: 36599e9feaf94bcdd1ee205a678ce3eec637d609 (README precise about checks/publication attempts, historical 1.10 ledger, tracking plan).
  - Checks: 393 full tests/typecheck/lint/diff passed; passive prose had no meaningful RED. Independent actual prepare at exact clone with empty npm configs/cache/HOME succeeded without dependencies. 125 files matched all frozen bytes, manifest/lock roots generated 1.11.1, source SHA and canonical repo.
  - Original blocker resolved by T4: official npm404 JSON string now recognized exactly; mismatched/unexpected responses fail closed. Revalidate final frozen source before integration; no publication attempted.
- [ ] T2: Integrate whole branch and verify one automatic npm publication.
  - Status: pending, blocked on T3. Owner reported npm binding configured.
  - Route: parent non-force fast-forward/push and bounded Actions observation; verifier downloaded artifact/official registry reconciliation.
  - Acceptance: push branch, one final main update, exactly one matching Actions run, official version/releaseSource/SHA-1/SHA-512/latest match retained artifact. No blind retry.

## Release contract
Source manifest/lock remain 1.11.0; release checkout increments registry-aware stable patch, synchronizes roots, adds releaseSource SHA and canonical repository URL. Pack externally once, independently check archive types/inventory/bytes, publish exact archive and reconcile. No commits/tags written back to main by workflow. OIDC only publish job; no persistent npm token. queue:max supports 100 pending runs, waiting order not strict dispatch order. Registry-absent reruns fail closed, including checks-only prior failures; outside publishers may cause conflicts.

## Evidence and gaps
Official registry before integration: latest 1.11.0, stable max 1.11.0, proposed 1.11.1. Original failed404 probe is resolved; final-source prepublication verification remains pending. Verification-only old archive (invalid for later-source delivery): /var/folders/qg/r_11gk3n283_h43_7ncnf6r00000gn/T/osdy-frozen-verification-j7McAm/archive/osdy-pi-1.11.1.tgz,125 members,1,678,754 bytes; SHA-1 f8c20ebb09e7bcdcd009254d6b2eb4493f65c264; integrity sha512-PC4/Bpw+bDQZsyEak1OT2ely9iVjRnr/M3OLAYoYYUn/I8v1QCbNWDVljzCOTonAZduhg7SqL69xgQjX1O/FSA==.

Live npm/OIDC, Ubuntu/Node24 Actions and workflow service validation unverified. Local macOS Node26/npm11.12.1. Typecheck green; .mjs LSP sweep inconclusive. Auxiliary JSON-call warnings independently confirmed caught by awaited CLI catch (false positives); correct awaited-member hints informational. Native ASSESS unavailable (untracked declaration, then schema-incompatible) triggered independent verification. Earlier ordinary npm logs outside temp left untouched, repository/dependency metadata unchanged.

## Next step
Freeze this tracking state as excluded bookkeeping, independently verify exact final source for T3, then execute T2 with one main update. Later verification/evidence updates stay local to avoid a second release-triggering main push. Stop on conflicts/check failure/unknown publication; no blind retry.

# Automatic npm publication from main

## Goal and grants
Deliver all legitimate work from experiment/mascot-message-marker to main with accurate README and one automatic osdy-pi patch publication to https://registry.npmjs.org/ (latest). User approved complete flow: "vamos con todo ese flujo". Grants cover source/docs fixes, commits, branch push, main integration and automatic publication. No force/destructive Git, secrets/caches, blind retry or separate tag/GitHub Release. Owner later reported permissions npm publish/npm stage publish/npm dist-tag enabled and explicitly authorized ONE additional attempt ("dal otro intento"). Effective timing/configuration remains unverified; no established root-cause fix.

## Tasks
- [x] T1: Implement/review main patch publisher.
  - Commit 7e2cc32a99eb5c201d0936c140fcb585e649075c; six paths/548 lines with approved coherent exception. Worker RED/GREEN, independent checks/125-file actual packing.
  - Native four-lens review review-aa25db3c49c8fe38 approved and acknowledgement burned. Nonblocking advisories R3-001 and R4-uncertain-next-run remain follow-ups, no correction/re-review.
- [x] T4: Fix official npm version-not-found JSON-string compatibility.
  - Commit b4b9d5ce1bd340f72fd6b0e6681534456e8043c2. RED 10 pass/1 fail; GREEN 12 focused/395 full tests/typecheck/lint/diff; exact live404 returned null.
  - Medium native reliability review review-5481138fdc04cd5d approved/burned with no findings. Unexpected strings/mismatched versions/statuses/malformed JSON still fail closed.
- [x] T3: Finalize README/docs and verify frozen whole-branch readiness.
  - Docs commit 36599e9feaf94bcdd1ee205a678ce3eec637d609: truthful attempts-vs-guarantees README and legitimate historical1.10 ledger/tracking. Passive documentation received factual/structural checks, no invented RED.
  - Final freeze 9463d87125d6d7d1cc805a8d11300898fbc74068 (docs(odd): record release correction and delivery authority). Independent12/395 tests, typecheck/lint/diff, dependency-free temp-clone actual prepare and125-member inventory/types/all byte/hash verification passed. Next1.11.1 absent/latest1.11.0 observed preflight.
- [x] T5: Correct setup guidance and execute one owner-authorized fresh publication attempt.
  - Status: completed via commit d1e976e64df61fc489766e9512fdf59b7948e9ca on chore/npm-publish-permissions, delivered to main with one non-force update9463d87 ->d1e976e. Owner reports all actions enabled; missing permission/underlying prior403 cause remains unproven.
  - Route: gentle-ai-worker for docs/npm-publishing.md precision, parent guarded docs commit/push, gentle-ai-verify for bound run observation and registry/artifact checks.
  - Surface: docs/npm-publishing.md plus parent-owned excluded tracking. Passive docs require structural verification, no artificial RED. Keep workflow/scripts/guard unchanged.
  - Official permission requirements remain valid: npm publish must be allowed; stage is always allowed; dist-tag is independent/optional for this workflow. Expected binding remains OsdyOrtiz / Osdy-Pi / npm-publish.yml / blank environment, exact case.
  - Fresh read-only preflight2026-10-03T16:11:43Z:1.11.1 absent404 (also absent in200 packument), latest/stable max1.11.0, no old releaseSource, only failed run37132309097 attempt1, definitive final PUT403. No unknown network state or published-version conflict. Underlying cause unknown.
  - Acceptance: truthful setup/recovery docs, verification, coherent docs work-unit commit; ONE additional main update/new run_attempt1 approved (not a blind rerun2). Keep guard unchanged; stop on renewed denial/unknown outcome. Only one successful release desired; no unlimited attempts.
  - Implementation: docs/npm-publishing.md corrects required direct-publish permission, case-sensitive binding, attempts-vs-guarantee and guarded known-denial retry. Passive docs, no meaningful RED.
  - Independent checks:12 focused/395 full tests/typecheck/lint/diff passed; only docs/tracking changed, runtime/README/workflow/guard match9463d87. Prepush official2026-10-03T16:20:24Z confirms1.11.1 absent/latest1.11.0. ASSESS schema-incompatible led to independent verification; trivial passive docs exempt native review. Verifier spotted historical/current tracking phrasing; parent corrected before commit.
  - Retry result: run37137019202 attempt1 at d1e976e (push), checks passed12focused/395full/typecheck/lint/diff; Node24.21.0/npm11.19.0. ONE publish invocation16:30:04, npm+osdy-pi@1.11.1 at16:30:07. No403; initial registry verification failed16:30:58: Publication accepted but not visible. Terminal workflow failure remains, separately tracked T6.
  - Subsequent independent reconciliation verified official1.11.1/source/bothhashes/latest1.11.1 and official tarball byte-identical. No third attempt, rerun or further main update.
- [x] T2: Integrate branch and verify automatic npm publication.
  - Status: completed. Delivery commit d1e976e64df61fc489766e9512fdf59b7948e9ca; local main/remote main/remote chore/npm-publish-permissions match. Independent official/artifact verification and parent official spot-check2026-10-03T16:42:36Z confirm1.11.1/releaseSource/SHA1/SHA512/latest1.11.1. Publication achieved; workflow terminalfailure preserved as T6 follow-up, not a claim of green CI. Only local postrelease evidence document dirty; no further publication.
  - Route: parent guarded Git; independent verifier observed live Actions, downloaded retained artifact and reconciled official registry.
  - Git: branch pushed, one non-force fast-forward main update2fa2754c8ae8b32cf471b75b5d4ec6e4923bb1eb ->9463d87125d6d7d1cc805a8d11300898fbc74068. At original integration, remote feature/main and local main matched; the approved retry used chore/npm-publish-permissions and session returned to main after d1e976e delivery. Includes TODO opt-in, landing mascot, README, automation, fixes and historical docs. Prior TODO review-903613972c003698 and mascot review-84c56a699248614d approved/acknowledged; no accumulated-branch review.
  - Live run: https://github.com/OsdyOrtiz/Osdy-Pi/actions/runs/37132309097, exactly one matching push run, attempt1; conclusion failure. checks job succeeded12 focused/395 full tests/typecheck/lint/diff on Ubuntu Node24.21.0/npm11.19.0.
  - publish job111229778018 step5 attempted publication and was denied E403: OIDC permission denied for this action. No retry/rerun/extra main push.
  - Registry: six read-only polls30s apart over150.8s all returned404 for1.11.1; latest stayed1.11.0. No registry-verified publication or externally verified provenance. Signed provenance log is not success.

- [ ] T6: Diagnose initial registry visibility failure (follow-up).
  - Status: pending, outside the exhausted one-additional-attempt grant. Initial postpublication reads did not see the version within the window; later official reconciliation succeeded. Registry propagation/cache/read-window cause not established; diagnose before changing waits.
  - No source edit/main push/rerun/publication for this follow-up without a separately planned scope. Existing run remains failure; do not conceal it or republish1.11.1.

## Actual CI artifact evidence
Retained/downloaded exact archive: /private/tmp/osdy-pi-release-37132309097-1.4sJGHP/osdy-pi-1.11.1.tgz; evidence.json beside it.125 regular members,1,678,806 compressed bytes,2,393,506 unpacked. Independent member path/type/size/bytes check matched frozen Git9463d87 plus finalized version1.11.1 manifest/source/repository. Inventory extensions93/themes23/scripts3/bin2 plus README/LICENSE/package.json/mapche1.png; no duplicate/link/traversal/cache/credential/bookkeeping members.

SHA-1:410d9887edeccbf1c11ccdf8eaa4d8b8cb7bc164.
SHA-512:sha512-RZKFHAjvs51Nrcp7aG9QZG1v9pw/26CUWns6lVZosWIgdlSz05/+ktTJq/sh1aomcGaAVWQRdVJSOkB+1OFfqg==.
Both independently computed and matched retained evidence; SHA-1 also in publication logs. This is a verified prepared archive, not registry-published success.

## Successful publication artifact
Run37137019202 artifact11278198931, npm-release-37137019202-1. Archive /tmp/osdy-pi-run-37137019202-0emYZUmi/osdy-pi-1.11.1.tgz, evidence.json beside it.125 regular members,1,678,804 compressed bytes; independent complete inventory/types/paths/every member byte matched Gitd1e976e plus finalized1.11.1 manifest and canonical repository. README byte match verified; manifest releaseSource=d1e976e64df61fc489766e9512fdf59b7948e9ca.

SHA-1:024ac1b1a0445a829d06196f6df1de1f31ef3e27.
SHA-512:sha512-US/MvceZuc8t79HjDHxc9TpoKI/WW+ZKukdOfTVeinXzHAp9dGykrdFZC65QPNY2NwKAxadk1foBlS/DhIt69A==.
Independent retained archive hashes equal evidence and official exactversion/packument hashes/source/repository. Official tarball https://registry.npmjs.org/osdy-pi/-/osdy-pi-1.11.1.tgz returned200 and was byte-identical. latest=1.11.1; source maps uniquely to1.11.1. This proves registry publication, not a green workflow or an externally verified provenance signature.

## Contract and limitations
Source roots remain1.11.0; generated release roots1.11.1. Publish exact retained tgz, not mutable directory. No bot main backwrites/tags, permanent npm token or blind retries. queue:max retains100 pending runs and does not guarantee dispatch order. Wrong external registry hashes/tags or publication uncertainty stop delivery.

Original preflight404 shape defect resolved by T4; initial colliding npm config attempt failed before tests, corrected configs passed. Native ASSESS unavailable (untracked declaration/schema-incompatible) led to independent checks; source work-unit native reviews closed normally. Active LSP after T4 had only informational awaited-member hints; caught JSON.parse false positives disposed. Ordinary npm logs left untouched. Original403 root cause/effective permission-change timing remain unverified; subsequent actual publication and official integrity/source/latest verification succeeded. User authorization for one additional attempt was exercised exactly once. Read-only verifier wrong-repository/--limit5 incidents were diagnosed separately and corrected without retriggering; no false404 publication inference.

## Next step
Requested delivery/publication verified and T2/T5 closed. Preserve run terminalfailure and verified release evidence; T6 is separate follow-up for initial registry visibility. Postattempt completion evidence stays local to avoid another automatic publication; no third attempt, rerun, source change, tag or GitHub Release.

# Config and usage shortcuts delivery

## Objective and authority
Deliver Ctrl+Alt+O (`/osdyConfig`) and Ctrl+Alt+U (`/usage`), macOS Ctrl+Option+O/U. User confirmed physical delivery on one Mac terminal; authorized README first, commit, feature push, main merge/push and existing automatic npm publication. No local npm publication, tag, version, dependencies or workflow changes.

## Completed tasks
- [x] D1 Finalize README and verify candidate. Bounded worker corrected physical-QA claim; independent verifier: 12 release tests, 563 extension + 89 script tests, typecheck, lint, diff check all pass. Broader live-provider/account/audio behavior remains unverified.
- [x] D2 Commit/push feature. Source `9ebefd2922071673d1498d9a890065afc5dfe43d`, feature `feat/config-usage-shortcuts`, from main `602ba7a`; seven source files plus task evidence, no force pushes. Progress evidence `108d5648e4958aef1ae9390d14fcb8332867d0b7` changed only excluded odd bookkeeping.
- [x] D3 Fast-forward merge/main push and verify publication. Main pushed at `108d5648e4958aef1ae9390d14fcb8332867d0b7`. Independent verifier reconciled official `osdy-pi@1.11.11` and latest; registry releaseSource matches main. Published archive byte-identical to retained CI archive, 149 files.

## Release evidence and failure disclosure
Workflow https://github.com/OsdyOrtiz/Osdy-Pi/actions/runs/37569775286 completed with failure despite successful publication: all CI checks succeeded; npm accepted at 04:06:24Z, reconciliation stopped at 04:07:15Z before propagation. Official endpoints confirmed version/latest at 04:08:02Z, verified by 04:08:34Z. No publication retry. Follow-up: reconciliation propagation window is too short; no workflow fix authorized.
SHA-1: `6dd74989e53e9159aa6b244c158ae74fd11e8336`.
Integrity: `sha512-o2X5S506w4gPnRLFJOQPp5SrKlxWth2Keclik0xnyyBekscZuvCjl63H+YVmL3lF94pi0xUAceUs5BX2u5Kpiw==`.
Artifact: https://github.com/OsdyOrtiz/Osdy-Pi/actions/runs/37569775286/artifacts/11460054453 . Retained ZIP: `/var/folders/qg/r_11gk3n283_h43_7ncnf6r00000gn/T/osdy-pi-delivery-37569775286.r6lQen/npm-release-37569775286-1.zip`, containing evidence.json and osdy-pi-1.11.11.tgz.
Registry tarball matched retained bytes; GitHub artifact ZIP digest matched `8351a0c638c9b93fe8f28caf75b0a1e81d30b270932fea16d7c7ddaa36605746`.

## Constraints, review and next step
Source version/lock roots stay 1.11.0; CI auto allocates official registry-backed patch/latest. RDD off; independent verification, no native review ceremony. Active LSP account helper/test clean. Single direct merge explicitly chosen, approximately 585 authored source diff lines primarily regressions.
Final excluded evidence update stays on feature branch to avoid another main-push publication. Main's immutable releaseSource remains 108d564. Next: users update package; separately decide whether to fix automatic reconciliation timeout. No consumer runtime/provenance signature audit performed.

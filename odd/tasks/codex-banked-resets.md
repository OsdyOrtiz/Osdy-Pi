# Codex banked resets

## Goal and authorization
Counts, local expiries and explicitly confirmed active-account reset use in `/usage` and `/osdyconfig` Usage. Account → View usage remains read-only.
User approved README update, commits, feature push, merge/push main and existing automatic npm publication. No manual npm publish, tag or GitHub Release requested. Agents never consumed a real reset or inspected credentials; deterministic tests use synthetic fixtures.

## Safety design
- Authoritative count from usage summary; capped details never replace it. Zero/unknown separate, legacy credits unchanged, no footer action.
- Exact reset ID + one UUID per logical POST. Four definite codes: reset/nothing_to_reset/no_credit/already_redeemed; the last confirms same-key prior success. Post-dispatch failures remain unknown.
- Shared guard before dialogs, account/session revalidation before dispatch, Cancel-first confirmation. Durable private pending journal before POST; failed persistence/lock blocks. Explicit pending recovery reuses exact IDs, no automatic retry or stale-lock reclaim. GET changes cannot prove completion.
- No raw IDs/auth in display; business service, transport, filesystem and UI separated. RDD off; unassessable native assessment handled with independent high-risk verification.

## Tasks and evidence
- [x] BR-1: Counts. RED11/55 → GREEN55; independent checks pass.
- [x] BR-2: Expiry/fallback/spacing. RED10/166 → GREEN166; unread-body cleanup RED10/31 → GREEN31, full593+89/typecheck/lint pass; spacing RED2/37 → GREEN37, independent37 pass.
- [x] BR-3: Exact IDs and one-shot typed consume. RED15/98 → GREEN98, expanded100; full610+89/typecheck/lint, independent100 pass.
- [x] BR-4: Durable journal/workflow. Writer timeout diagnosed separately; historical RED unavailable, not claimed. Current independent73/store/workflow/typecheck/lint, full683+89 pass.
- [x] BR-5: Runtime/UI and README. Initial writer timeout diagnosed separately; current243 pass. Two races corrected RED8/92 → GREEN92; full708+89/typecheck/lint and final independent274/typecheck/lint/diff pass. Prior cached lint/TS errors disproven by current checks, no suppression hacks.
- [ ] BR-6 (in_progress): Authorized Git delivery complete; verify exact automatic release artifact/source/official registry before final closure.
  - README finalized before freeze: highlights, count/local expiry and unavailable/partial data, active-only use/check, Cancel-first, private pending journal, read-only previews and lock limitations.
  - Final precommit verifier: release tests12, full708 extension+89 script tests, typecheck/lint/diff all pass, no failures/skips.
  - Feature commit: `b015c4b63fa24c1599395d222b7fcd4530b72a9d`, Conventional Commit `feat(codex): add confirmed banked reset usage and expiry`;19 files,+2675/-70 including ledger. Feature branch pushed.
  - Main merge: `3939affdb14faf94efa56c142a1927670b0df954`, pushed to origin/main without conflicts or force; main clean immediately afterward.
  - Actions run: `37814291603`, https://github.com/OsdyOrtiz/Osdy-Pi/actions/runs/37814291603, completed with failure only at publication visibility reconciliation. Checks/preparation/upload succeeded; npm logged acceptance of1.11.12, not registry-verified completion. No403 observed.
  - Six additional read-only official registry checks10seconds apart all returned404/version absent, latest1.11.11 and no source mapping; stopped2026-10-08T17:14:46Z. BR-6 remains in progress due unresolved publication visibility, not source/check failure.
  - Retained artifact: /var/folders/qg/r_11gk3n283_h43_7ncnf6r00000gn/T/npm-release-37814291603-1.Chd7zU/osdy-pi-1.11.12.tgz, adjacent evidence.json. Verified155regularmembers, no unsafe/excluded paths;154 unchanged files exactly match immutable Git source including README/all Codex files. Generatedmanifest differs only approvedversion/repository/releaseSource; archive/evidence hashes equal.
  - SHA1:67beae3e28b865e75c483630281b0621fbca39bc. SHA512:sha512-FOb7nXO0hewiihv1Q0Q8tQevwMLKWDPr8qCotMYz1601RCBEMryOQZZYh3BQwlv68Al7hmL1NSEFH3wC6znwjg==. Registry hash/version/source/latest equality remains unavailable.

## Release and delivery constraints
Existing workflow chooses next stable patch and publishes `osdy-pi` to official npm registry with `latest`; source manifest and both lock roots stay1.11.0. CI retains verified archive/evidence for30days, never manual publish from this session.
Previous accepted1.11.11/source108d5648e4958aef1ae9390d14fcb8332867d0b7 reconciled exact SHA1/SHA512 and latest before newpush; failed Actions status was visibility deadline, not denied publication. Previous externalartifact directory: /var/folders/qg/r_11gk3n283_h43_7ncnf6r00000gn/T/osdy-pi-release-37569775286.KAB2mP.
User approved direct feature merge (`exception-ok`, no PR requested) despite advisory400-line overage; tests/readability retained. No live reset/TUI tests by agents; user reports feature looks good.
Ledger-only delivery progress updates are excluded from npm bytes. Avoid an extra main push just for bookkeeping because every main push triggers another release. Memory holds exact release outcome once observed.

## Next step
Await separate user authorization for later read-only reconciliation of1.11.12/source3939aff and retained hashes against official registry/latest. No rerun, republish or extra main push to bypass the unknown result. Implementation/README are committed and pushed on main; only excluded local ODD outcome bookkeeping has changed after release-source freeze.

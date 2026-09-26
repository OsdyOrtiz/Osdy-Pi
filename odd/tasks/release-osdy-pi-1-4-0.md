# Release osdy-pi 1.4.0

## Objective

Publish the explicit Joker agents setup from merged PR #13 in a new minor release of `osdy-pi`, without treating the current `1.3.0` npm package as if it included the command.

## Scope

- Prepare a version-only release candidate from verified `origin/main` at `65732a35f8018b43ca1f3c8405a2ba12109ecf8d`.
- Update package and lock metadata to the user-selected `1.4.0`, verify tests/typecheck/lint and inspect the exact packed artifact.
- Follow approved issue and review-PR policy for version metadata; publish only from the integrated source commit after verifying npm identity, registry, tag, artifact and exact user consent.

## Constraints

- Keep existing modified `odd/tasks/release-osdy-pi-1-3-0.md` and untracked `scripts/.gitignore` out of this work unit.
- No user-home installation or configuration changes. No tag, merge, publish, or replay of an uncertain publish result without separate authorization.
- Native RDD review authority remains unavailable (`package-local-binary-missing`); use independent read-only verification if needed.

## Delivery

- Branch: `chore/release-1.4.0`; one small reviewable work unit and a later separately approved publication action.
- Route: mechanical metadata edits inline; independent verification delegated. User authorized issue, version commit, push, PR merge and npm `latest` publication for `1.4.0`; release issue #14 approved.
- Visible todo projection unavailable; file and Engram mirror are the durable task record.

## Tasks

| ID | Task | Acceptance criteria | Progress |
| --- | --- | --- | --- |
| REL14-001 | Prepare verified version candidate | Version metadata agrees on `1.4.0`; focused RED/GREEN, full suite, typecheck, lint, tarball resource check and temp CLI smoke pass; commit identity recorded. | Complete — RED/GREEN, 175 tests, typecheck, lint, pack dry-run with setup service, isolated `account list` smoke; commit `d6d5baf`. |
| REL14-002 | Deliver reviewed release | Issue and PR approved/merged, exact integrated source packed, npm identity/registry/tag confirmed and `osdy-pi@1.4.0` read back as `latest` with matching integrity. | Complete — issue #14 and PR #15 merged at `79541da`; exact 66-file archive published as npm `latest=1.4.0`; fresh registry integrity SHA-512 `Fy1/TdnKyblP6ZM/PiZB9eFINeUW7jz37WD7lY9m78CESuvyn5/kQOq9v0ttp7H99BSqPmVLs90J7VqtbUBpIQ==` matches local. |

## Verification and next step

Published npm `latest` is now `1.4.0` and `origin/main` includes PRs #13 and #15. Candidate package+lock agree; independent read-only verification passed 175 tests, typecheck, lint, diff check and `npm pack --dry-run --json` (66 entries, setup service bundled). A sandboxed `account list` smoke succeeded without directory creation; `--help` is not a supported CLI flag (exit 1, unrelated pre-existing behavior). npm registry is https://registry.npmjs.org/ and authenticated user is `osdy`. Release candidate commit `d6d5baf` records version metadata and task. Approved issue #14 and PR #15 merged to main at `79541da`. The exact integrated source was packed as `osdy-pi-1.4.0.tgz` (66 files; setup service included; SHA-512 recorded above); npm `whoami=osdy` and registry `https://registry.npmjs.org/`. The initial publish returned EOTP, then the user completed browser authentication. A fresh pre-retry registry guard found `latest=1.4.0` and prevented duplicate publish. Independent readback confirms version, tarball URL, `latest` and exact SHA-512 integrity from integrated main. No live Pi setup or installed-package test performed.

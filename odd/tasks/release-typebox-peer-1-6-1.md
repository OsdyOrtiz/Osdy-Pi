# Release TypeBox host-peer fix 1.6.1

## Objective
Deliver the TypeBox host-peer correction on main and publish osdy-pi 1.6.1 to the public npm registry, preserving unrelated historical work.

## Scope and authorization
- User authorized main integration and publication; work in the existing checkout, no worktrees.
- Branch: `fix/typebox-peer-dependency`; base and live remote main: `3eab4b906ba3df6910c76cb775d20d8b31faa1e4`.
- Preserve the named historical ODD stash; do not update the installed home package.
- TypeBox is a wildcard host peer and development dependency, not a runtime dependency; retain locked version and integrity.
- Patch metadata in package.json/package-lock.json and the existing exact-version packaging assertion. Historical README feature versions stay unchanged.
- Registry: https://registry.npmjs.org/; tag: latest; public maintainer: osdy. Preflight latest 1.6.0; 1.6.1 absent (E404).
- npm identity/access checks currently return E401. Publishing requires human login and a fresh verified identity/artifact; never request credentials/OTP in chat or retry an ambiguous publication.

## Work routing and delivery
- REL161-001: delegated writer (multiple metadata/test surfaces); observed test-first metadata RED/GREEN, then full verification. One cohesive release-fix commit with tests.
- REL161-002: parent coordinates fast-forward integration and explicit push; delegate exact-commit archive verification/pack and registry readback. Direct-main route requested by user; no PR creation.
- Forecast: approximately 100-150 authored changed lines, generated lockfile excluded; strategy: ask-on-risk. One release slice, below 400 lines.
- Native review of original fix approved and acknowledged as review-ad962db2d590e076; changed release candidate requires fresh review. Review grants no delivery authority.

## Tasks
- [ ] REL161-001 Prepare verified release candidate (in progress). Acceptance: manifest and lock root 1.6.1; packaging assertion updated; host peers regression and packaging tests observe RED/GREEN; full tests/typecheck/lint/pack checks pass; final review outcome and work-unit commit recorded.
- [ ] REL161-002 Integrate and publish exact artifact (pending). Acceptance: fast-forward main and remote readback match intended commit; artifact from exact committed source verified; npm actor/access/version rechecked; one authorized publication attempt or explicit blocker recorded; registry integrity confirms exact artifact if published.

## Evidence
- Original fix RED: five failures/one pass; GREEN: six host-peer tests passed.
- Original fix verification: 224 extension + 67 script tests, typecheck, lint, diff check, npm pack dry-run (101 entries), LSP clean for three paths.
- Initial packaging check failed ENOTDIR due to /dev/null cache; isolated writable temporary cache resolved it without home changes.
- Release preflight: local/remote main equal base above; npm latest 1.6.0, 1.6.1 E404; actor and collaborator lookup E401. No publication attempted.
- Release candidate RED: packaging expectation 1.6.1 failed against 1.6.0 (3 passed, 1 failed); GREEN packaging 4/4 and host peers 6/6.
- Release candidate writer checks: 224 extension + 67 script tests, typecheck, lint, diff check and pack dry-run passed (osdy-pi 1.6.1, 101 entries), with a writable temporary cache.
- Runtime harness: manifest/lock regression and exact packed manifest readback are applicable boundaries; interactive Pi update/runtime smoke pending and outside this release's automated checks.
- Rollback: revert this release's package metadata and peer regression test; do not remove unrelated stash or other behavior. Published npm versions cannot be overwritten.

## Next step
Commit the verified release candidate on the feature branch and run native review of that committed slice. Integrate approved source, verify its exact tarball, then wait for npm authentication before attempting publication.

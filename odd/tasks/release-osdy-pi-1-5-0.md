# Release osdy-pi 1.5.0

## Objective
Publish the first-party session TODO and improved two-color Working animation already merged to `origin/main` as `osdy-pi@1.5.0` on npm `latest`.

## Why and scope
The integrated source at `dac24be` has new user-visible features, while the public npm `latest`, package manifest and lock still say `1.4.1`. Release metadata and README must accurately describe the shipped behavior and known validation gaps. Do not alter the TODO or Working implementation in this release.

## Constraints
- Base branch: `chore/release-1.5.0` from `origin/main` at `dac24be56f0cca8b36787fb5839c14c4a797d90e`.
- Preserve unrelated dirty `odd/tasks/release-osdy-pi-1-3-0.md`, `odd/tasks/theme-aware-working-animation.md`, untracked `odd/tasks/native-odd-todo-smoke-tests.md`, and `scripts/.gitignore`. Never stage or pack them.
- Release only an exact verified integrated commit, not this dirty checkout; treat ambiguous npm outcomes as unknown, never retry blindly.
- Normal issue-first PR delivery was superseded for this release by the user's explicit direct-`main` integration exception after no YAML Issue Form was found. Do not invent an issue or PR. npm account, target, artifact and one-time publication still require fresh confirmation before publish. No user-home install.
- Keep TODO limitations honest: compaction replay, language switching, visual strikethrough and installed-profile launch have not all been verified.

## Delivery plan
Delivery strategy: ask-on-risk. Forecast ~130-230 authored lines across candidate and evidence, below one ~400-line PR slice. Branch changes stay reviewable. Technical artifacts in English.

| ID | Task | Route and acceptance | Progress |
| --- | --- | --- | --- |
| REL150-001 | Prepare release candidate and verification | Delegate multi-file writer for `README.md`, `scripts/native-odd-todo-package.test.mjs`, `package.json`, `package-lock.json`; test-first for meaningful README/version assertions, then full tests, typecheck, lint and pack preview; one cohesive Conventional Commit and structural spot check. | Complete — `fc5a5e3132bb00dd276ab6bcfa3e7d271f42b16d`; RED/GREEN and independent checks passed. |
| REL150-002 | Integrate and publish exact release | Under explicit exception, fast-forward the verified candidate to `main` without PR; test and pack exact integrated source; confirm npm registry/account/version/artifact before one publish; independently read back. Record any blocker without claiming release. | In progress — direct-main route authorized; npm identity read returned E401, so publication awaits authentication. |

## Verification
- `node --test scripts/native-odd-todo-package.test.mjs`, `npm test`, `npm run typecheck`, `npm run lint`, `git diff --check`.
- `npm pack --dry-run --json` and an isolated archive/checkout check of the exact integrated commit for package version, files, entrypoint and content; no home-profile mutations.
- Compare package and lock root version, registry `latest` and published `dist.integrity` to the verified artifact.
- Runtime boundary for candidate: package tarball inclusion is the relevant boundary; interactive Pi TODO and Working behavior were exercised by prior feature work, not repeated in this metadata-only change.

## Evidence and next step
- Preflight: `origin/main` at `dac24be`; npm `latest` is `1.4.1`; package and lock are `1.4.1`. Merged source since 1.4.1 includes first-party TODO and Working wave updates. README still says TODO is an unreleased branch feature.
- Scout mapped release surfaces read-only; no repository-specific skill was loaded by the scout despite injected paths. Parent read skills directly and will inject paths to writer.
- Native todo projection is unavailable in this session (no callable `todo` tool); this file and its Engram mirror are the durable progress record.
- Candidate worker: focused regression test RED (two failures out of four before edits: 1.4.1 metadata and README lacking 1.5.0 statement), then GREEN (4/4). Full suite passed 189 extension and 60 script tests; typecheck, lint, `git diff --check` passed. `npm pack --dry-run --json` showed version 1.5.0 and 97 entries. Independent verifier repeated all checks without blockers; parent spot check repeated focused 4/4. No meaningful refactor required. Rollback boundary: README release phrasing, package+lock version, release test assertions and this release ledger; TODO/Working runtime remains untouched.
- Candidate work-unit commit `fc5a5e3132bb00dd276ab6bcfa3e7d271f42b16d` (`chore(release): prepare osdy-pi 1.5.0`), 57 insertions + 11 deletions. The source checkout still has only the four unrelated pre-existing dirty/untracked paths outside this task record.
- Native assessment for this committed candidate was unassessable (`package-local-binary-missing`, RDD switch unknown); independent verification followed high-risk fallback. Native inspect is blocked for the same missing package-local binary, no lineage created. No review receipt claimed.
- Live GitHub preflight: authenticated actor `OsdyOrtiz` has repository admin permission, `origin/main` targets `github.com/OsdyOrtiz/Osdy-Pi`, and no issue matching 1.5.0 exists among open/closed results. The remote repository root has no `.github` directory; `.github/ISSUE_TEMPLATE` returns 404. Current issue-creation policy requires a YAML Issue Form and forbids a Markdown/blank fallback. Historical release issues #10/#14/#17 and Working issue #29 are closed, not a conforming release issue. No remote mutation performed.
- User authorized exceptional direct integration into `main` with no PR or new issue. Fresh remote `main` remains `dac24be`; public npm `latest` remains `1.4.1`. Fresh `npm whoami --registry=https://registry.npmjs.org/` failed E401; no publication is permitted until authentication and identity are confirmed.
- Next: commit this scoped release-route record, fast-forward candidate to remote `main` and read back exact SHA. Verify and pack integrated source in isolation, then wait for npm login/account and exact artifact publication confirmation. Do not publish from local dirty files.

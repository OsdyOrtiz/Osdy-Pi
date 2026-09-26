# Release osdy-pi 1.5.0

## Objective
Publish the first-party session TODO and improved two-color Working animation already merged to `origin/main` as `osdy-pi@1.5.0` on npm `latest`.

## Why and scope
The integrated source at `dac24be` has new user-visible features, while the public npm `latest`, package manifest and lock still say `1.4.1`. Release metadata and README must accurately describe the shipped behavior and known validation gaps. Do not alter the TODO or Working implementation in this release.

## Constraints
- Base branch: `chore/release-1.5.0` from `origin/main` at `dac24be56f0cca8b36787fb5839c14c4a797d90e`.
- Preserve unrelated dirty `odd/tasks/release-osdy-pi-1-3-0.md`, `odd/tasks/theme-aware-working-animation.md`, untracked `odd/tasks/native-odd-todo-smoke-tests.md`, and `scripts/.gitignore`. Never stage or pack them.
- Release only an exact verified integrated commit, not this dirty checkout; treat ambiguous npm outcomes as unknown, never retry blindly.
- An approved issue and a reviewable PR are required by repository policy. Protected issue approval is a separate human/maintainer action; npm account, target, artifact and one-time publication require fresh confirmation before publish. No user-home install.
- Keep TODO limitations honest: compaction replay, language switching, visual strikethrough and installed-profile launch have not all been verified.

## Delivery plan
Delivery strategy: ask-on-risk. Forecast ~130-230 authored lines across candidate and evidence, below one ~400-line PR slice. Branch changes stay reviewable. Technical artifacts in English.

| ID | Task | Route and acceptance | Progress |
| --- | --- | --- | --- |
| REL150-001 | Prepare release candidate and verification | Delegate multi-file writer for `README.md`, `scripts/native-odd-todo-package.test.mjs`, `package.json`, `package-lock.json`; test-first for meaningful README/version assertions, then full tests, typecheck, lint and pack preview; one cohesive Conventional Commit and structural spot check. | Pending |
| REL150-002 | Integrate and publish exact release | Check issue/PR policy and approved issue; push PR and merge only after required checks and authorization; test and pack exact integrated source; confirm npm registry/account/version/artifact before one publish; independent readback. Record any blocker without claiming release. | Pending |

## Verification
- `node --test scripts/native-odd-todo-package.test.mjs`, `npm test`, `npm run typecheck`, `npm run lint`, `git diff --check`.
- `npm pack --dry-run --json` and an isolated archive/checkout check of the exact integrated commit for package version, files, entrypoint and content; no home-profile mutations.
- Compare package and lock root version, registry `latest` and published `dist.integrity` to the verified artifact.
- Runtime boundary for candidate: package tarball inclusion is the relevant boundary; interactive Pi TODO and Working behavior were exercised by prior feature work, not repeated in this metadata-only change.

## Evidence and next step
- Preflight: `origin/main` at `dac24be`; npm `latest` is `1.4.1`; package and lock are `1.4.1`. Merged source since 1.4.1 includes first-party TODO and Working wave updates. README still says TODO is an unreleased branch feature.
- Scout mapped release surfaces read-only; no repository-specific skill was loaded by the scout despite injected paths. Parent read skills directly and will inject paths to writer.
- Native todo projection is unavailable in this session (no callable `todo` tool); this file and its Engram mirror are the durable progress record.
- Next: delegate the bounded candidate writer. Do not publish from local dirty files.

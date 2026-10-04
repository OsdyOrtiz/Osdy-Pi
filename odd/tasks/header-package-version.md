# Header package version

## Objective
Show the installed osdy-pi version at the upper-right of the screen artwork header. User explicitly selected the screen header, not the editor border.

## Scope and constraints
- Read version from package.json relative to the extension module, never from cwd or Pi host version.
- Preserve existing logo/mascot layout and editor model/thinking text.
- Handle narrow terminals and unavailable/invalid manifests safely.
- No version bump, publication, push, PR, or commit authorized. Work-unit commit remains pending explicit user authorization.
- Preserve unrelated dirty odd files and current feature branch feat/osdy-control-center.
- Delivery strategy: ask-on-risk. Forecast: 100–200 authored changed lines, one cohesive work unit. Actual source/test diff: 127 lines (125 additions, 2 deletions).

## Tasks
- [x] T1: Add automatic right-aligned screen-header version with deterministic layout/version tests. Status: completed. Route: delegated gentle-ai-worker (two nontrivial source/test files and preparation trigger), independent spot check gentle-ai-verify.

## Acceptance and checks
- Header renders osdy-pi v<installed version> at the right edge; omitted if too narrow.
- Empty first artwork row reused, otherwise a label row prepended. Remaining artwork bytes preserved; editor border unchanged.
- Module-relative manifest lookup validates package identity and ASCII SemVer, silently omits unavailable/invalid version.

## Progress and evidence
Changed: extensions/osdy-pi/ui.ts and extensions/osdy-pi/ui.test.ts.
TDD: RED observed (5 missing-function failures); GREEN 18 tests passed; final alternate-case checks 19 passed.
Writer verification: node --test --experimental-strip-types extensions/osdy-pi/ui.test.ts 19/19; npm test 420 extension + 89 script tests passed; npm run typecheck passed; npm run lint passed; git diff --check passed.
Independent spot check: focused UI tests 19/19 and git diff --check passed, header-only integration inspected.
LSP: no reported diagnostics, but both paths inconclusive (server silent-on-clean); compiler typecheck provides confirmed typing evidence.
Native review: medium tier, review-reliability approved; lineage review-7d7967bad0450a08 acknowledged, authority burned. Projection also included the pre-existing tracked odd/tasks/automatic-npm-main.md change, untouched by this work; untracked tasks excluded.
Assessment after closure: unassessable because untracked declarations were required; returned plan used closed native review as independent check. Independent spot verification additionally completed.
Commit: pending explicit authorization; none created.
Rollback boundary: version loading/decoration in ui.ts and accompanying tests only.
Runtime visual check: unavailable without interactive UI; deterministic terminal-layout tests do not substitute for an actual screenshot.

## Next step
Reload the extension with /reload and visually confirm the header. Commit/publish only on explicit user request.

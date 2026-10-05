# Map subagent working states and glyphs

## Objective and authorization
Apply the user's original intent: subagent activity must select the same named states and corresponding animated glyphs as the principal agent, retaining the subagent name. When observable activity is unavailable, show `<agent> · Working...` with the Working glyph.

The user approved this correction after identifying that the previous release only changed fallback text, then explicitly requested delivery to main for automatic publication. Feature commits, branch push, safe main integration and main push are authorized. Use the existing CI release policy; no manual npm publish, source version bump, force push, tags, GitHub releases, external package, provider configuration or runtime changes.

## Problem and rationale
The previous implementation returns child text only. The controller retains the parent tool activity, so a read can display the delegation glyph and Working fallback can retain a delegation/execution glyph. Text-only assertions did not establish full state/glyph agreement.

## Baseline and scope
- Initial clean main: `fa08213880378e71ddcadea11cd71da3406d7cf6`.
- Correction branch: `feat/subagent-activity-state-mapping`.
- Allowed behavior edits: `extensions/osdy-pi/working-child-activity.ts`, `extensions/osdy-pi/working-controller.ts`, their two test files, and `README.md`.
- Parent-owned tracking: this document and Engram topic `odd/subagent-activity-state-mapping/tasks`.
- Runtime event forwarding, ordinary principal classification, renderer, frame constants and timer design remain unchanged.
- Existing provider limits remain: public Joker foreground snapshots can drive activity; Gentle and unavailable public progress use the generic fallback. No persistent background feed, polling or task cache is added.

## Mapping and invariants
| Public evidence | State and example |
| --- | --- |
| Thinking or response streaming | `scout · Thinking...` (`thinking`) |
| Named read/search/documentation tool recognized without arguments | `scout · Exploring...` (`exploring`) |
| Named diagnostic/check tool recognized without arguments | `scout · Verifying...` (`verifying`) |
| Named edit/write tool | `scout · Working...` (`working`) |
| Named delegation tool recognized without arguments | `scout · Delegating...` (`delegating`) |
| Named unknown/ambiguous tool | `scout · Executing...` (`executing`) |
| No usable observable activity | `scout · Working...` (`working` fallback) |

- Public tool snapshots expose names, not command arguments. `bash` and wrappers requiring selectors must not be guessed as tests or documentation; use the classifier's conservative Executing category.
- Running/completed/failed tool events while the child task is running can classify the reported tool category; they do not create new terminal states or claim task completion.
- Preserve current validated agent identity rules, including `Subagent` only for a continuation's absent agent field. Invalid/missing run identity fails closed to ordinary parent activity when no validated child identity is available.
- Keep first-running-child snapshot order and additional-child count; invalid/malformed/terminal/no-running snapshots restore the validated fallback.
- Ignore model labels and never read task, prompt, context, response content, trails or transcripts.
- Updates remain bound to the matching parent toolCallId/name. Latest remaining call owns the line; overlap restoration, duplicate starts, agent end and shutdown cleanup stay correct.

## Tasks and routes
- [x] M1 — Implement structured child state/label mapping, controller state selection, deterministic tests and README. Status: implemented, writer-verified and committed in work unit `86ef73aadc7591fa0bfb8293995c9bac206679d8`. Route: delegated `gentle-ai-worker`; triggered by two production files plus tests/docs. Behavioral RED and GREEN observed.
- [x] M2 — Independently verify mapped text/state/glyphs, regression/privacy/ownership behavior and changed-path scope. Status: independently verified; evidence belongs to work unit `86ef73aadc7591fa0bfb8293995c9bac206679d8`. Live TUI and publication acceptance excluded. Route: conservative native assessment fallback, delegated `gentle-ai-verify`, one bounded test-only writer follow-up, then final independent verifier and active LSP probes.

## Acceptance and checks
- Each of the six named states has tests asserting both activity and label from public metadata.
- Controller-to-renderer tests assert the corresponding existing glyph, including Working fallback, not text alone.
- No-activity, malformed/terminal updates and missing tool names use Working when validated identity exists; unknown named tools use Executing.
- Live updates override fallback, then fallback restores both text and glyph. Continuation, first-child/count, sanitized identity, tool-call ordering and cleanup are covered.
- Getter-based privacy regressions remain passing. Parent classifications remain unchanged.
- README documents six-state child mapping, corresponding glyph selection, honest fallback and current producer/background limitations.

Planned commands:
```sh
node --test --experimental-strip-types extensions/osdy-pi/working-child-activity.test.ts extensions/osdy-pi/working-controller.test.ts extensions/osdy-pi/working-animation.test.ts
node --test scripts/npm-release.test.mjs
npm run typecheck
npm run lint
npm test
git diff --check
```

## Verification evidence
- Read-only scout confirmed the renderer already selects frames from `state.activity`; no renderer production change needed.
- M1 writer: `openai-codex/gpt-6.1-sol`, medium effort. Behavioral RED: 33 passed, 2 failed (raw child text instead of structured Exploring state; fallback activity delegating instead of working). GREEN: 34 focused tests passed.
- Writer full checks: 523 extension + 89 script = 612 tests passed; typecheck, lint and diff check passed. No final test failures reported.
- Tests exercise all six child activities and every existing glyph frame, fallback restoration, metadata bounds, privacy getters, validation, continuation, child counts, ownership and cleanup.
- Parent readback of both production files and README confirmed structured selection, conservative public-name classification and state/glyph fallback without renderer or principal-classifier changes.
- First independent verification: focused 34 and full 612 tests, typecheck, lint and diff check passed; no source defect. An ordinary isolated-invalid-identity coverage gap was identified.
- Test-only follow-up added numeric-agent rejection, 4097-character rejection and valid 4096-character input truncated to 32 display characters, each with otherwise valid running/read activity. These tests cover already-correct behavior; no meaningful new RED was claimed.
- Final independent verification: focused 37; full 526 extension + 89 script = 615 tests passed, zero failures. Typecheck, lint and diff check passed. No unexpected candidate or tracker mutation during verification; production and README hashes remained unchanged through the test-only follow-up.
- Final feature diff: 271 authored lines (+193/-78), five allowed source/test/README paths; tracking excluded. Diff SHA-256: `9bfcf6ea181f8c25978aeaa0a98c9affe7746c85539be7e863774bf863f9f094`.
- Native ASSESS could not assess undeclared untracked files (the intentional tracker); its returned unassessable/high-conservative plan required independent verification, which was performed. No authority retry or bypass.
- Final active LSP probe: four changed TypeScript paths, zero reported diagnostics; two confirmed clean and two inconclusive due silent-on-clean server behavior. Typecheck passed independently.
- Fresh delivery verification repeated focused 37, release-script 12, full 615, typecheck, lint and diff check successfully; exact feature and tracker hashes remained unchanged during the verifier run.
- Mandatory README gate reviewed blob `65289e79a6f282eba0e78d6d2718450dab5e0b12`, Editor and working indicator section, against child/controller/classifier/renderer source and tests. Its factual mapping delta was frozen with the source commit; no further cosmetic edit needed.
- Existing `Publish npm from main` workflow gates publication on checks, assigns a registry-aware stable patch, validates a retained immutable archive and reconciles official-registry source/hashes/latest. Source manifest and both lock roots remain 1.11.0 intentionally. No local retained artifact or registry success is claimed.
- Native review switch: off. No review/consent lifecycle is started.
- Live TUI and external-provider runtime execution: not performed; deterministic controller/render tests are the functional harness for this scope.

## Work-unit and delivery boundaries
- One coherent behavior/tests/README unit, estimated 150–300 and observed 271 authored additions plus deletions; no code-golf or artificial split to meet a line target.
- Delivery strategy: `ask-on-risk`. Reassess if the forecast/actual review surface exceeds approximately 400 authored lines; generated files excluded. User explicitly authorized the current candidate's delivery.
- Commit the source/tests/README as one work unit, then the excluded implementation ledger separately. Push main once with both commits; CI determines the next stable patch and verifies its retained archive and official registry.
- Source work-unit commit: `86ef73aadc7591fa0bfb8293995c9bac206679d8` — `fix(working): map subagent activity states and glyphs`; 271 authored lines, five feature paths. M1 behavior and M2 checks remain one cohesive unit.
- This ledger is a separate passive implementation-evidence commit, excluded from npm via package inclusion rules and release checks; its own identity is in Git history, not a self-referential field.
- Rollback: child normalization/controller changes, corresponding test updates and README mapping claims; remove no unrelated behavior.

## Progress and next step
M1 implemented and M2 independently verified, with source/tests/README committed in the recorded work unit. The task file and full Engram mirror were created before source edits and synchronized at task transitions. User authorized the normal branch/main delivery and existing automatic publication path. Follow the exact main-push CI run for artifact/registry acceptance; current remote refs, integration and registry observations are captured in the delivery session evidence rather than this immutable implementation record. Live TUI/provider execution remain untested, two LSP checks remain inconclusive and the failed native assessment was covered by independent verification. Do not treat this ledger, a commit or a push as proof of npm publication.

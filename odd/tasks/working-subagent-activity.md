# Show subagent activity in working — Osdy-Pi only

## Objective and approved behavior
Show agent name + observable activity in the working indicator. The user approved an **Osdy-Pi-only** implementation: use real public child progress when available (Jok3r), otherwise show the submitted task label (Gentle), explicitly as an assignment rather than a claimed live tool operation.

## Scope and constraints
- Edit only this repository. Do not modify Jok3r, Gentle, installed packages, external task files/branches/configuration, dependencies or versions.
- Consume existing public Pi parent tool start/update/end events. No private manager imports, polling, transcripts, hidden reasoning, full prompts or arbitrary response text.
- Assignment metadata comes only from validated parent `agent` and optional `label` arguments; never extract a summary from `task`/`prompt`. Use fixed generic wording when identity/label is unavailable, never invent an agent/tool action.
- Real live progress takes precedence over the assignment. Missing/malformed/no-running-child progress falls back to valid assignment metadata, otherwise ordinary parent activity.
- Keep owned tool-call state, bounded/sanitized text, width-safe rendering, latest active-call selection and cleanup on tool/agent/session end. Support foreground run/continuation where public metadata exists. Background calls still have no persistent live feed after their parent call ends.
- Preserve unrelated dirty ODD documents. The user now authorizes parent-owned commit/push of `feat/working-subagent-activity`, then merge/push of `main`; execution and checks are tracked in [the delivery ledger](working-subagent-delivery.md). This supersedes the earlier no-delivery constraint, not the external-write restrictions. npm publication and version changes remain out of scope.

## Tasks and routes
- [x] S1 — Implement/test public Jok3r foreground progress consumption. Delegated writer; strict parser/controller/runtime and README completed.
- G1/P1 — Historical external proposal cancelled; all external write authority revoked. Foreign worker `muugoh5g-3-rt81` is cancelled and no Gentle source changes occurred. Earlier-created Gentle branch `feat/foreground-subagent-progress` and `odd/tasks/foreground-subagent-progress.md` remain untouched; cleanup requires separate explicit permission.
- [x] P2 — Add agent + task-assignment fallback and continuation handling inside Osdy, preserve live Jok3r precedence, test and document. Completed, visible #5. Delegated writer observed RED4 then focusedGREEN33 and all required commands passed; only five approved Osdy paths changed.
- [x] S2 — Independent verification, bounded structural readback and native review completed. Visible #2 completed; evidence below. Delivery was not authorized at S2 closure; current user authorization is tracked in [the delivery ledger](working-subagent-delivery.md).
- [ ] H1 — Observe the local TUI with these changes loaded and confirm assignment/live labels and cleanup. Visible #6 pending; actual visual acceptance is not inferred from tests.

## Acceptance and checks
- Start with valid agent/label: bounded assignment display immediately; no public update needed.
- Live update: current child operation replaces assignment; subsequent missing/malformed/finished update restores assignment or normal parent label.
- Continuation without agent identity uses honest generic copy; unrelated/late updates cannot hijack or leak labels.
- Missing/malformed args, multiple calls, duplicate starts, terminal/tool/agent/session/disposal paths, ANSI/control characters and Unicode width are covered.
- Applicable behavior uses observed RED before production changes, then GREEN and refactor checks.
- Focused: `node --test --experimental-strip-types extensions/osdy-pi/working-child-activity.test.ts extensions/osdy-pi/working-controller.test.ts extensions/osdy-pi/working-animation.test.ts`.
- Full: `npm run typecheck`, `npm run lint`, `npm test`, `git diff --check`; active LSP probe if available. Real TUI acceptance is separate, never inferred from unit tests.

## Evidence and delivery
- Branch `feat/working-subagent-activity`; base/HEAD `312ca263d7eaa2a151db46121380b97fc60f0831`. No work-unit commit created without explicit authorization.
- S1 RED:6 focused failures, then GREEN29/29. Writer and independent verifier passed focused29, typecheck, lint, full518 extension +89 script tests, diff check. Jok3r serializer contract was read-only confirmed; Jok3r was never edited.
- P2 RED4 intended failures with29 existing passing, then focusedGREEN33/33. Writer passed full522 extension +89 script tests, typecheck/lint/diff; secret task/prompt getters remain unread. Writer modelgpt-6.1-sol, effort unavailable.
- P2 reported105 authored lines; total feature274 across seven source/test/README files. No external package edits. Strategy `ask-on-risk` before future oversized delivery; no cosmetic shrinking.
- S2 independent commands ran once synchronously: focused33; `npm run typecheck`/`npm run lint` passed; `npm test`522 extension +89 script passed; `git diff --check` passed. Npm commands used ephemeral offline/notifier-disabled/no-logs settings; no persistent configs changed. All161 source/ODD/config file digests, index digest and status remained unchanged. Harness overflow log was automatic, not an intentional artifact.
- Parent readback of helper/controller/README found no blocker. Active LSP6paths: no TS errors, eleven pre-existing runtime auxiliary warnings, three confirmed-clean files and two inconclusive files. No complete LSP-clean or live-TUI claim.
- Native ASSESS initially unassessable due undeclared untracked scope, so independent verification was required and completed. Native inspect selected only new adapter/test source files; the frozen workspace candidate included seven feature paths plus two pre-existing tracked ODD docs (nine paths,365 lines), not this untracked feature tracker.
- Host-consented native lineage `review-b5f01ed6fea23a7a`: four provider-ordered lenses (risk, resilience, readability, reliability), approved without a correction. Exact acknowledgement successfully burned authority for target `sha256:6aae035a4452aa9e026cf8475a2d79696420816396dfcd47ed50494ac54b701b`, consumed revision `sha256:b5944e7889190aed7b80564faee044632fcdcc543bc1918dff8483809483e766`. Native metadata closure is not a source commit or delivery grant.
- Rollback only adapter/tests and their working hooks/assignment logic/README note, preserving unrelated working behavior and protected ODD changes.

## Progress and next step
Implementation/checks/native review are complete. No source writer is active; as of this documentation refresh, no source commit/push/npm publication or external change was performed. The user now authorizes commit/push/merge delivery by the parent; follow [the delivery ledger](working-subagent-delivery.md) for D1 checks and subsequent Git operations. H1 remains pending live TUI acceptance: load these local Osdy changes, then observe a foreground delegation and cleanup. Delivery authorization does not establish visual acceptance. Do not change upstream packages or pretend assignment copy is actual Gentle child activity.
Memory: `mem_save`/session-summary fail with `session has already ended`; owned `mem_update` works. Full mirror locator/topic: observation12857, `odd/working-subagent-activity/tasks`; readback is required after updates. User scope/authorization observation12868 supersedes any older external permission.

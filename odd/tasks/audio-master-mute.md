# Audio master mute

## Objective
Add a persistent master switch in Control Center → Sounds to silence automatic audio notifications without losing configured paths.

## Scope and decisions
- Default enabled; existing v1 settings without the new boolean keep current behavior.
- Disabled suppresses all automatic sounds, including startup-flag paths; visual notifications are unchanged.
- Explicit Test effective playback remains available while muted.
- Changes apply to subsequent events without reload. An already-started playback is not cancelled.
- Configure/clear and the legacy setup wizard preserve the master setting.
- Keep strict types, service/UI separation and existing path validation.
- No Linux backend, presets, temporary mute, publication or unrelated changes.

## Work and acceptance
- [x] T1 — Implement the complete audio master switch with deterministic compatibility, automatic gating, live refresh, explicit test bypass, and writer-preservation tests; update README; verify focused tests, full suite, typecheck and lint.

## Routing and checks
T1: delegated to gentle-ai-worker; mapping requires 4+ files and implementation touches multiple non-trivial files. Use test-first: observe failing new tests, minimal implementation, passing tests, then refactor/check. Independent verification follows native read-only ASSESS with RDD off.
Focused command: node --test --experimental-strip-types extensions/osdy-pi/audio-*.test.ts extensions/osdy-pi/control-center*.test.ts extensions/osdy-pi/sound-setup-wizard*.test.ts (only use matched existing/new files).
Full commands: npm run typecheck; npm run lint; npm test.
User-reported live audio smoke passed (see Progress); exhaustive Control Center/platform coverage remains unverified.

## Delivery and constraints
Branch: feat/audio-master-mute.
Delivery strategy: ask-on-risk; forecast approximately 200–350 authored diff lines, tests included. Reassess actual size without removing useful tests for cosmetic savings.
User explicitly authorized README update, one coherent combined audio commit, feature push, merge to main and main push to trigger automatic CI publication. Git operations remain parent-owned; source version stays 1.11.0 because CI allocates the patch.
Preserve pre-existing dirty odd/tasks/codex-banked-resets.md.
Rollback boundary: this feature's audio setting, gate, toggle, preservation tests and README changes only.

## Progress and evidence
T1 implementation and automated verification complete. RDD off; native review not started.
- Worker RED: 8 intended failures, 97 passing; GREEN: 105 focused tests passed.
- Independent verifier reran focused command: 105 passed; npm test: 713 extension and 89 script tests passed.
- npm run typecheck, npm run lint, git diff --check: passed independently.
- Parent structural readback confirmed service gate, discoverable toggle and README boundaries; verifier rerun also serves as reported-command spot check.
- LSP probe: 2 paths confirmed clean, 2 inconclusive, no findings; full TypeScript check passed.
- Native ASSESS unavailable because untracked paths require an explicit declaration; treated as high risk and independent verification completed. No review lifecycle started.
- Feature source/tests/docs: 13 files, +242/-35 (277 authored changed lines); ledger adds 35 lines at initial verification. No review-size escalation needed.
- Existing unrelated codex-banked-resets task changes preserved. No commits or pushes.
- User reports live sound works perfectly. This is user-reported smoke, not independently observed exhaustive Control Center or macOS/Windows coverage; Windows, Linux safe-skip behavior and other platform scenarios were not exhaustively tested live. This docs pass did not play speakers. Delayed-resolution/concurrent-writer races were not separately simulated. Historical RED is writer evidence, not replayed by verifier.
- README release highlights now summarize persistent master mute, shared 180 ms default, custom-path precedence and explicit tests while muted. Commit/main-push authorization is recorded above; no commit, push or publication claimed here.
- Settings read/parse failure retains the existing default-enabled fallback; flag-based sounds can resume if settings become unreadable.

## Next step
Complete independent final checks, then parent-owned scoped commit, feature push, merge and main push under the recorded authorization. Verify CI/registry outcome separately; do not claim publication until confirmed. Remaining exhaustive live platform coverage is not established by the user's smoke report.

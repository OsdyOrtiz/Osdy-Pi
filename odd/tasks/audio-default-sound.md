# Bundled default notification sound

## Objective and scope
Use one original, subtle, short bundled WAV for every audio event when no startup flag or global sound path is configured. Precedence: startup flag → global path → bundled default. Invalid explicit paths fail without fallback. Existing master mute gates automatic default playback; explicit Test effective remains available while muted. Visual alerts unchanged. No downloads, OS sounds, Linux backend, version bump or publication.

## Tasks
- [x] T1 — Bundle original deterministic WAV with provenance; implement module-relative fallback source and consistent Sounds/wizard copy; add precedence, invalid-path, mute/manual-test, WAV integrity and packed-asset tests; update README and verify.

## Routing and checks
T1 delegated worker: 4+ file mapping and multi-file nontrivial writing. Applicable test-first: RED, GREEN and refactor evidence required.
Focused: node --test --experimental-strip-types extensions/osdy-pi/audio-*.test.ts extensions/osdy-pi/control-center-sounds.test.ts extensions/osdy-pi/sound-setup-wizard.test.ts; node --test scripts/native-odd-todo-package.test.mjs.
Full: npm run typecheck; npm run lint; npm test; git diff --check.
Native read-only ASSESS after writer; RDD off, independent verification if risk/unavailability requires it.
User-reported live audio smoke passed (see Progress); exhaustive platform coverage remains unverified.

## Delivery and constraints
Continue feat/audio-master-mute; preserve its uncommitted verified implementation and unrelated odd/tasks/codex-banked-resets.md changes. User has explicitly authorized README update, commit, feature push, merge to main and main push; Git operations remain parent-owned.
Delivery strategy ask-on-risk; forecast 180–300 additional authored lines plus ~9 KB binary; combined uncommitted scope may exceed 400 lines. Keep feature units separately reviewable; user now requests one coherent combined audio commit, feature push, merge and main push for automatic CI publication. Do not remove useful tests to meet heuristic.
Rollback: remove bundled-default resolution, WAV/provenance and associated tests/docs while retaining master mute.

## Progress
T1 implemented and automatically verified; previous master-mute behavior preserved.
- Writer RED: 5 intended focused failures and missing-WAV package failure. GREEN reported; historical RED not independently replayed.
- Independent commands: broad focused tests 110 passed; package gate 4 passed; npm test 718 extension test nodes (711 top-level + 7 nested) and 89 script nodes passed.
- npm run typecheck, npm run lint, git diff --check: passed independently. Verifier reruns serve as parent reported-command spot check.
- LSP: 2 confirmed clean, 2 inconclusive, no findings; tsc includes control-center.test.ts and passed.
- Native ASSESS unavailable due untracked declaration, treated high risk with independent verification. RDD off, no review started.
- WAV: original 180ms mono PCM16 at 24kHz, 8684 bytes, peak 5.49%; all samples match provenance. SHA256 89f8e5e70edacb8c5232c3384d704906d5c6f8aa619f4c988a72be23636955dc. WAV and provenance each included once in npm dry-run package.
- Parent readback confirmed module-relative absent-only fallback and provenance. Verifier found no blockers and unchanged repository fingerprints before/after checks.
- Added approximately 212 authored lines + WAV; combined mute/default source/test/docs 443 insertions +44 deletions =487 lines, ledgers excluded. Earlier review-size guidance is superseded by the user's request for one coherent combined audio delivery.
- User reports live sound works perfectly. This is user-reported smoke and subjective-quality confirmation, not independently observed exhaustive macOS/Windows coverage; Windows, Linux safe-skip behavior and other platform scenarios were not exhaustively tested live. This docs pass did not play speakers.
- README release highlights now summarize the shared 180 ms default and master mute. User authorized commit, feature push, merge and main push to trigger CI publication; no commit, push or publication claimed here. Source version stays 1.11.0; CI allocates the patch.

## Next step
Complete independent final checks, then parent-owned scoped commit, feature push, merge and main push under the recorded authorization. Verify CI/registry outcome separately; do not claim publication until confirmed. Remaining exhaustive live platform coverage is not established by the user's smoke report.

# Increase message-card contrast

## Objective
Make every user and assistant conversation card easier to distinguish automatically in all bundled Osdy Pi themes, without modifying Pi or inserting markup into message content.

## Context and constraints
- User selected stronger automatic visual distinction, not manual message bookmarking or inline text highlighting.
- Pi already renders native cards using separate `userMessageBg` and `assistantMessageBg` tokens. Osdy supplies these, separate text colors, white user accent and theme-accent assistant stripe in 14 `themes/osdy-pi-*.json` palettes.
- Keep Pi-native streaming, copy/selection, theme switching, role accents and readable foregrounds intact. Avoid changing unrelated palette roles unless needed for readability.
- Base branch `feat/message-card-contrast` from `origin/main` `63d1e4719396b8bc25950cf0681d271ceccdd2dd`. The 1.5.0 candidate is integrated but unpublished; this feature is only a local candidate until separately integrated. Do not publish npm, push, or merge under the prior release-only exception.
- Preserve unrelated local edits in `odd/tasks/release-osdy-pi-1-3-0.md`, `odd/tasks/release-osdy-pi-1-5-0.md`, `odd/tasks/theme-aware-working-animation.md`, plus untracked `odd/tasks/native-odd-todo-smoke-tests.md` and `scripts/.gitignore`.

## Delivery plan
One coherent work unit, delegated writer (14 palette files plus test/docs). Forecast 80–180 authored diff lines; use `ask-on-risk` and keep this branch locally until visual feedback and delivery decision. Resolve named role colors to RGB before changing them; a theme's intended light/dark mood and text contrast matter more than a universal hard-coded color. No runnable RED for subjective perceived emphasis alone; add a deterministic regression check only for meaningful palette invariants and observe RED/GREEN if it can express the expected behavior.

| ID | Task | Acceptance and checks | Progress |
| --- | --- | --- | --- |
| CARD-CONTRAST-001 | Strengthen user/assistant card separation in all 14 themes | Resolve relevant colors, adjust only card backgrounds as needed; keep foreground readable and accents unchanged. Add proportional palette regression tests, update native message-card README, run focused/full tests, typecheck, lint and diff checks; validate a representative light and dark theme visually when available. Commit one reviewable work unit with test/docs; record any unavailable visual check. | Complete locally — `bd970aa96b71933670f26a222bfa1a83726606c5`; tests passed, visual trial pending user feedback. |

## Evidence and next step
- Existing README says native Pi cards have separate backgrounds/text/accents. Current theme values differ but may be too close; `osdy-pi-lucent-orange` has an empty user background, and aliases must be resolved before judging contrast.
- Mapping scout recommends theme-only background adjustment across all 14 palettes, no Pi runtime modification. No existing palette-contrast test found. The desired visual strength remains subjective; a real TUI trial is needed after deterministic checks.
- Native `todo` projection is not callable in this session; this file and the Engram mirror are the durable task record.
- Writer observed focused RED for Dark's 1.04:1 card-background contrast, then GREEN with seven targeted palette edits: Dark 1.28, Kanagawa Lotus 1.24, Lucent Orange 1.48 (explicit user background instead of unknown terminal default), Matrix 1.25, New 1.28, Sexy 1.27, Tokyo Night 1.46. Seven other themes already met the 1.2:1 background target. All 14 checked for role text contrast >=4.5:1 and unchanged white/theme assistant accents. This numerical threshold is a regression guard, not proof of visual quality in a terminal.
- Existing Tokyo Night `extensions/osdy-pi/runtime.test.ts` pinned its prior `elevated` assistant background and failed the initial full suite. User explicitly authorized adding only that test path to the writer's edit surface. The assertion was updated to the intended `#343b55` while text/stripe checks remained.
- Writer and independent verifier passed focused contrast 1/1, runtime 19/19, full suite 189 extension + 61 script tests, typecheck, lint and tracked `git diff --check`. The new test is untracked until staging; its whitespace will be checked when staged. Native assessment unavailable (`package-local-binary-missing`), so independent verifier served as the separate check. A representative light/dark live Pi TUI trial was skipped because no live session was available; the user must evaluate visual preference locally before delivery.
- Rollback boundary: seven `themes/osdy-pi-*.json` message background edits, `scripts/message-card-contrast.test.mjs`, the Tokyo Night assertion and README native message-card paragraph. No Pi runtime or release metadata changed. Parent spot-check passed 1/1; staged whitespace check included the new test and passed. Work-unit commit `bd970aa96b71933670f26a222bfa1a83726606c5` (`feat(themes): distinguish user and assistant cards`), 82 insertions + 9 deletions, only intended feature paths. Native committed-candidate assessment remained unassessable due to missing package-local binary; prior independent verifier covered the identical feature bytes, with no receipt claimed.
- Next: user evaluates light and dark Osdy themes in Pi; adjust only if feedback calls for it. Feature branch remains local, unpushed/unmerged. npm 1.5.0 publication remains blocked on authentication, and the release-only direct-main exception does not grant delivery for this feature.

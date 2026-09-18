# Publish native message cards release

## Goal

Publish the exact `test/native-message-cards` version to `main`, with clear README instructions for the complete optional Osdy Pi extension suite.

## Tasks

- [x] Document prerequisites, bundled capabilities, and every optional extension used by the complete Osdy Pi setup; verify the documentation; commit and push the branch; then align `main` to the verified branch tree with a safe fast-forward commit.

## Acceptance criteria

- `README.md` distinguishes required prerequisites, bundled Osdy Pi resources, and optional extensions.
- Every extra extension present in the maintained Osdy Pi setup is listed with an install command and purpose.
- Repository checks pass before delivery.
- `origin/test/native-message-cards` and `origin/main` resolve to the same verified Git tree.

## Evidence

- Work-unit commit: `f5928602a313032e21559cdfde716329e6d37629` (`docs: document complete Osdy Pi suite`)
- Main alignment commit: `a6545b8fdd31b10617a5598d87995037afb7ab60` (`chore: align main with native message cards release`)
- Verification: `git diff --check`, `npm run typecheck`, `npm run lint`, and `npm test` passed; 154 tests passed with 0 failures.
- Remote branch sync: after the alignment push, both remote branches resolved to tree `755f965ebfef9a98393d3ffcf447fe9c76ca8daa`.

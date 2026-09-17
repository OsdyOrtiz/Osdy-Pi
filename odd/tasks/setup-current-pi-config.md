# Setup Current Pi Configuration

## Objective

Add an idempotent `osdy-pi setup` command that recreates the non-secret, currently active Osdy Pi configuration on another installation.

## Problem

Osdy Pi currently installs only its own extension and themes. The active Pi environment also depends on companion packages, Gentle resources, model/UI preferences, subagent routing, and optional MCP configuration. Copying the active agent directory is unsafe because it is a symlink overlay containing credentials, sessions, caches, trust decisions, account state, and machine-local paths.

## Why

A single setup command should make Osdy Pi reproducible without leaking credentials or pretending machine-specific integrations are portable.

## Scope

- Add `osdy-pi setup` to reconcile a versioned configuration preset into the active Pi agent directory.
- Preserve unrelated user settings while normalizing the package set required by the current Osdy environment.
- Reproduce safe model and UI preferences.
- Seed safe Osdy UI preferences without absolute sound paths.
- Support optional credential-free MCP configuration with prerequisite warnings.
- Exclude auth, sessions, caches, trust, account metadata, local generated extensions, absolute audio paths, and other private/runtime state.
- Document installation, exclusions, prerequisites, and login/reload steps.

## Constraints

- Never read or copy `auth.json`, sessions, trust decisions, caches, account profiles, or credentials.
- Do not copy installed `node_modules`; configure pinned package sources and let Pi install them.
- Refuse unsafe or symlinked configuration targets.
- Preserve unrelated settings and package entries.
- Use atomic writes and deterministic, idempotent reconciliation.
- Keep command/service/presentation responsibilities separate.
- Technical artifacts and user-facing CLI copy remain in English.

## TDD

- Mode: enabled.
- Source: repository/session Gentle AI instruction requiring strict TDD when the existing test runner is available.
- Runner: `node --test scripts/osdy-pi-setup.test.mjs scripts/osdy-pi-cli.test.mjs`.
- Required sequence: observed RED before implementation, then GREEN, then refactor with tests remaining green.

## Delivery

- Strategy: `ask-on-risk`.
- Forecast: approximately 520 authored changed lines across service, tests, CLI integration, package manifest, and documentation.
- Chain strategy: `feature-branch-chain` (user selected).
- Current branch: `feat/setup-current-pi-config`.

## Tasks

- [ ] **OSDY-SETUP-1 — Specify safe preset reconciliation with failing tests**
  - Add tests for deterministic package normalization, preservation of unrelated settings, safe defaults, excluded private state, malformed input, symlink refusal, idempotence, and optional MCP behavior.
  - Check: focused setup tests fail for the expected missing implementation.
- [ ] **OSDY-SETUP-2 — Implement setup service and CLI dispatch**
  - Add `scripts/osdy-pi-setup.mjs` and wire `osdy-pi setup` through `bin/osdy-pi.mjs`.
  - Update the package allowlist for the new runtime script.
  - Check: focused setup and CLI tests pass.
- [ ] **OSDY-SETUP-3 — Document exact-clone behavior and exclusions**
  - Document the command, package/resource coverage, privacy exclusions, optional MCP prerequisites, `/login`, and `/reload`/restart behavior.
  - Check: documentation matches observed command output and packaged files.
- [ ] **OSDY-SETUP-4 — Verify the complete feature**
  - Run `npm run typecheck`, `npm run lint`, and `npm test`.
  - Inspect the packed file list and ensure no secret/private files or absolute user paths are present.
  - Check: all required verification passes or exact environmental failures are recorded.

## Acceptance Criteria

1. Running `osdy-pi setup` twice produces the same safe configuration.
2. The command preserves unrelated settings and package entries.
3. The configured preset reproduces the selected Osdy companion packages and safe UI/model preferences with deterministic sources.
4. No credential, session, trust, cache, account-profile, generated host extension, or absolute audio-path state is copied.
5. Unsafe symlinked targets and malformed configuration files fail before mutation.
6. Optional MCP configuration is explicit and reports missing prerequisites without exposing secrets.
7. A new installation is told to run `/login` and restart Pi or run `/reload`.
8. Tests, typecheck, lint, and package-content checks pass.

## Progress

- Read-only repository and active-environment mapping completed through a delegated explorer.
- User selected an exact local configuration clone while explicitly excluding credentials and private state.
- User authorized a feature branch and local Conventional Commit work-unit commits; push and PR creation remain unauthorized.
- User selected `feature-branch-chain` for any future delivery slicing.
- No source implementation has started.

## Verification Evidence

- Pending.

## Next Step

Delegate the bounded TDD implementation to one writer using this document as the task authority.

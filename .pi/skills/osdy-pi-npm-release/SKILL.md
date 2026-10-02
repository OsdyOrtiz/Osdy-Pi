---
name: osdy-pi-npm-release
description: "Trigger: osdy-pi npm release, publish, version bump. Prepare and verify an authorized release with README and immutable artifact gates."
license: MIT
metadata:
  author: "OsdyOrtiz"
  version: "1.0"
---

## Activation Contract

Load for project-local `osdy-pi` release preparation, version bumps, publication, or reconciliation. Read the [runbook](references/release-runbook.md) before acting. Invocation grants no publication or Git authority.

## Hard Rules

- Confirm package, target version, registry, identity, dist-tag, and separate user grants for commit, main changes, push, npm publication, and optional GitHub release.
- Preserve unrelated changes; coordinate one writer and the correct worktree.
- Review and update README before freeze/pack; if no factual delta exists, record review evidence instead of cosmetic edits.
- Align manifest, both lock roots, and current version test. Finalize docs before the immutable commit/tag and external artifact.
- Verify exact commit bytes, dynamic inventory, hashes, and exclusions. Retain the concrete absolute artifact path; rebuild/revalidate after source or README changes. Never replace a published version.
- Never request or persist credentials, tokens, or OTPs. Stop for human authentication; reconcile uncertain publication against the official registry before any retry.
- Use native review only under the runtime user-owned switch and current provider contract; never fabricate authority or raw lifecycle commands.

## Decision Gates

| Condition | Action |
|---|---|
| Missing grant or uncertain change ownership | Stop the affected action; preserve unrelated work. |
| E401 / EOTP | Human login / owner publishes the exact verified artifact interactively. |
| Accepted processing / E404 | Bounded read-only reconciliation; do not republish. |
| Existing matching / differing integrity | Resume verification / stop. |

## Execution Steps

1. Resolve authority and inspect current release inputs using the runbook.
2. Complete README, version alignment, relevant/full tests, typecheck, lint, and diff checks.
3. Follow applicable native review, then freeze authorized commit/tag; pack externally and verify immutable evidence.
4. Publish only the verified artifact with explicit npm grant; handle authentication and uncertainty through decision gates.
5. Verify official version, approved dist-tag, shasum, and SHA-512 integrity before completion. Create final GitHub notes only if authorized.

## Output Contract

Return grants, README review/delta, version/commit/tag, checks and gaps, retained artifact path/inventory/hashes, registry reconciliation evidence, optional GitHub outcome, and next action. Distinguish preparation, accepted processing, and registry-verified completion.

## References

- [Release runbook](references/release-runbook.md)

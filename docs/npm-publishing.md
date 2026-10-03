# Publish npm patches automatically from main

After owner setup, every push to `main`—merges **and direct pushes**—runs checks that gate an attempt to publish `osdy-pi` to `https://registry.npmjs.org/` with `latest`. Failed checks publish nothing; authentication, permissions, or registry failures can still prevent publication. No version commits, tags, or GitHub Releases are written back.

## Owner setup

1. Sign in to npm yourself and open **osdy-pi > Settings > Trusted publishing**.
2. Select **GitHub Actions** and enter:

   | Field | Exact value |
   | --- | --- |
   | Organization or user | `OsdyOrtiz` |
   | Repository | `Osdy-Pi` |
   | Workflow filename | `npm-publish.yml` |
   | Environment | Leave blank; this workflow has no environment |

   Binding values are case-sensitive. Use the workflow filename only (`npm-publish.yml`), not a path; leave the environment blank.

3. Under **Allowed actions**, enable **Allow npm publish**: it is **required** for this workflow's direct publication. **npm stage publish** is always allowed. **npm dist-tag** is independent and optional here: the workflow publishes with `--tag latest` but does not issue `npm dist-tag` commands.
4. Save the binding, then merge the workflow to `main` when ready for a publication attempt. This merge itself triggers the workflow. Never provide an npm token to the workflow or an agent.
5. Inspect the Actions run and retained `npm-release-*` artifact. Success means the official registry version, source commit, SHA-1, SHA-512 integrity, and `latest` all matched—not merely that npm accepted the command.

Trusted publishing uses GitHub-hosted Linux runners, Node 24, and npm **11.5.1 or newer**. The script checks that minimum and fails if the runner toolchain is too old. Only the publish job has `id-token: write`; repository access is read-only. Local tests do not prove the npm account binding or live OIDC publication.

## Release contract

| Boundary | Behavior |
| --- | --- |
| Checks | Deterministic release tests, full tests, typecheck, lint, and whitespace checks gate publication. |
| Version | Validate official package identity, every version record and SemVer key, key/version agreement, optional 40-character lowercase SHA `releaseSource`, and uniqueness of source mappings before allocation or workspace writes. Increment the patch of the greater of the source manifest and all registry stable versions (ignoring build metadata). Valid prereleases do not affect the maximum; malformed records fail closed. With a 1.11.0 source floor, the first candidate is at least 1.11.1. |
| Source | `main` stays at its source version (currently 1.11.0). Manifest and both lock roots change only in the disposable release checkout; dependencies do not change. |
| Traceability | Generated manifest `releaseSource` records the exact main-push SHA. For npm trusted publishing/provenance, the generated manifest also includes `repository: { "type": "git", "url": "git+https://github.com/OsdyOrtiz/Osdy-Pi.git" }`; conflicting existing repository metadata stops preparation. Source `package.json` remains untouched. Archive manifest bytes must match this finalized metadata; the archived README and every other packaged file are checked against the source commit. |
| Archive | Pack once outside checkout. Independently parse inventory/types/bytes against Git source plus the finalized manifest; reject unexpected members, duplicates, links, traversal, bookkeeping, and credential filenames. Unsupported inclusion rules or tar formats fail closed. |
| Publication | Hash the retained archive, revalidate it immediately before publishing, and publish that exact path. Existing versions must match source and both hashes; conflicts stop. |
| Rerun | A registry-visible same-source version is reused and verified, never blindly incremented. A rerun with no matching source stops because the prior outcome is uncertain—even if the prior run only failed checks. |

The concurrency group serializes the entire workflow with `queue: max` and `cancel-in-progress: false`. GitHub allows **100 waiting runs**; excess runs may be canceled. Waiting queue order is not strict dispatch order, so version order is not a guarantee of source-commit order. Avoid exceeding the queue; inspect any canceled runs. Another publisher outside this group can cause a version conflict or tag mismatch; automation stops rather than selecting another version.

## When publication is uncertain

Download the retained archive and `evidence.json` (30-day retention). The script makes **one publish attempt**, then at most six read-only version checks, separated by ten seconds when absent. Network/service failures, missing hash evidence, conflicts, or wrong `latest` fail closed. A timeout is not permission to publish again.

Reconcile the evidence's exact version, `releaseSource`, both hashes, and `latest` on the official registry before taking further action. If all match, rerun to verify without republishing. If the version exists with different bytes or `latest` has moved, stop for owner investigation; this workflow does not repair tags. There is no manual-dispatch trigger or automatic publish retry.

After a definitive denial, reconcile that exact version, source, both hashes, and tag before any retry. A rerun (`run_attempt=2`) with no registry-visible matching source is deliberately rejected by the guard, even after a known denial. Only after known rejection, no conflicting publication, and explicit owner approval may a fresh `main` update trigger a new `run_attempt=1`. Never use a new push to bypass an unknown outcome. An E403 on the final publication PUT establishes denial, not that the binding lacked rights or that a permissions change fixed the cause; effective permission timing remains unverified.

## Review and local checks

Review README feature facts and historical version introductions before merging. Automatic patches do not rewrite the README's historical introductions. The absolute GitHub setup link remains usable from the npm README; this document and release scripts are not bundled.

Run `node --test scripts/npm-release.test.mjs`, `npm test`, `npm run typecheck`, `npm run lint`, and `git diff --check`. Do not smoke-test with a real `npm publish`. The remaining deployment gate is owner configuration and the first authorized main-push run.

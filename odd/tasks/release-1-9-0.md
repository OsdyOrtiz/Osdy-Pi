# Release Osdy Pi 1.9.0

## Intent and authorization
User explicitly approved version edits, commit/push on main, tag/push v1.9.0, npm official registry publication under latest, and GitHub Release. Two Halloween palettes; 20 themes total. No force push, dependencies changes, credential/OTP handling or blind publication retries.

## Plan and scope
- [x] R1: Align manifest, both lock roots and current-version assertion; finalize README; run focused/full checks (delegated writer, multi-file trigger).
- [ ] R2: Follow native review when enabled; freeze authorized source commit/tag and push main/tag.
- [ ] R3: Pack committed source in fresh external directory, independently inspect inventory, compare every packaged byte to Git and verify hashes; publish exact archive and reconcile npm/GitHub.

One source work unit incorporating Halloween feature and version/docs. Forecast under 400 authored lines excluding evidence; ask-on-risk if materially exceeded. Rollback before publication: revert only scoped theme/version/docs/test changes. Published version and tag must remain immutable.

## Read-only evidence
Registry https://registry.npmjs.org/: npm whoami=osdy; latest=1.8.0; target 1.9.0 query returned E404 No match found. User explicitly confirmed identity osdy for 1.9.0/latest publication; registry maintainers list includes osdy. Remote origin=https://github.com/OsdyOrtiz/Osdy-Pi.git; main remote tip=9592c7fae21e53a146b883befee1c83dc93ba02a. Only known Halloween files and evidence modified/untracked. No npm pack lifecycle scripts declared. README 1.8.0-candidate wording inaccurate and must be corrected without claiming 1.9.0 publication prematurely.

## Checks
Focused package-version and theme tests, npm test, npm run typecheck, npm run lint, git diff --check. Independent tarball verification from frozen source, exclude odd/.pi/.pi-dev/.pi-lens/.codegraph/.atl and unrelated artifacts. Verify official version/latest/SHA1/SHA512 after publication. Live terminal aesthetics remain unverified.

Git HEAD equals remote main tip. GitHub default branch main and current account has push/admin permission. No configured core.hooksPath observed. Remote v1.9.0 tag absent.

## Source preparation evidence
Version test RED: 3 passed/1 failed (1.8.0 != 1.9.0), GREEN 4/4. Writer runtime24/24, contrast5/5, full300 (229+71), typecheck/lint/diff check pass; pack dry-run107 entries. Manifest and both lock roots aligned; lock diff exactly two replacements. README reviewed/finalized: accurate introduction versions, 20-theme catalog, no premature publication claim. Independent source verifier package4/4, contrast5/5 and diff check pass, no defects. Parent package-test spot check4/4 and diff check pass. Native ambient ASSESS unassessable due to untracked declaration; independent verifier obtained. Live terminal rendering unverified.

## Next step
Commit the known scoped source/evidence files on authorized main, then run native review over the exact committed range before push and external artifact build.

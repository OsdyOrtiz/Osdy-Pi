# Release Osdy Pi 1.9.0

## Intent and authorization
User explicitly approved version edits, commit/push on main, tag/push v1.9.0, npm official registry publication under latest, and GitHub Release. Two Halloween palettes; 20 themes total. No force push, dependencies changes, credential/OTP handling or blind publication retries.

## Plan and scope
- [x] R1: Align manifest, both lock roots and current-version assertion; finalize README; run focused/full checks (delegated writer, multi-file trigger).
- [x] R2: Follow native review when enabled; freeze authorized source commit/tag and push main/tag.
- [x] R3: Pack committed source in fresh external directory, independently inspect inventory, compare every packaged byte to Git and verify hashes; publish exact archive and reconcile npm/GitHub.

One source work unit incorporating Halloween feature and version/docs. Forecast under 400 authored lines excluding evidence; ask-on-risk if materially exceeded. Rollback before publication: revert only scoped theme/version/docs/test changes. Published version and tag must remain immutable.

## Read-only evidence
Registry https://registry.npmjs.org/: npm whoami=osdy; latest=1.8.0; target 1.9.0 query returned E404 No match found. User explicitly confirmed identity osdy for 1.9.0/latest publication; registry maintainers list includes osdy. Remote origin=https://github.com/OsdyOrtiz/Osdy-Pi.git; main remote tip=9592c7fae21e53a146b883befee1c83dc93ba02a. Only known Halloween files and evidence modified/untracked. No npm pack lifecycle scripts declared. README 1.8.0-candidate wording inaccurate and must be corrected without claiming 1.9.0 publication prematurely.

## Checks
Focused package-version and theme tests, npm test, npm run typecheck, npm run lint, git diff --check. Independent tarball verification from frozen source, exclude odd/.pi/.pi-dev/.pi-lens/.codegraph/.atl and unrelated artifacts. Verify official version/latest/SHA1/SHA512 after publication. Live terminal aesthetics remain unverified.

Git HEAD equals remote main tip. GitHub default branch main and current account has push/admin permission. No configured core.hooksPath observed. Remote v1.9.0 tag absent.

## Source preparation evidence
Version test RED: 3 passed/1 failed (1.8.0 != 1.9.0), GREEN 4/4. Writer runtime24/24, contrast5/5, full300 (229+71), typecheck/lint/diff check pass; pack dry-run107 entries. Manifest and both lock roots aligned; lock diff exactly two replacements. README reviewed/finalized: accurate introduction versions, 20-theme catalog, no premature publication claim. Independent source verifier package4/4, contrast5/5 and diff check pass, no defects. Parent package-test spot check4/4 and diff check pass. Native ambient ASSESS unassessable due to untracked declaration; independent verifier obtained. Live terminal rendering unverified.

## Frozen source and review
Source commit 9cbddbdd341f704bb96d4f60e4f5bd6535e622b8; 10 files, 283 additions/19 deletions (302 authored lines including bookkeeping). Native committed review review-8641fefe610728ee: medium, reliability lens, approved then acknowledged; authority burned. ASSESS schema-incompatible, no tier claimed from failed assessment. Main and annotated tag v1.9.0 pushed; remote peeled tag and main point to source commit.

Fresh external build via git archive (no dependency install or worktree) and npm pack. Retained artifact /var/folders/qg/r_11gk3n283_h43_7ncnf6r00000gn/T/osdy-pi-1.9.0-artifacts.4pqvOk/osdy-pi-1.9.0.tgz. Pack output107 entries; SHA1 ff9ecbe2db10afa4f6a42669a5ef1db11ca8723d; integrity sha512-UCCLQKeHVWnfsJ9U97L8O/oziPvWINnfq69VANXvYZ/vXlgj/2OaOwUXOgJ0r4mHyFRgSUzH92sG92HveNWNgQ==. Independent verifier confirmed107/107 regular files byte-equal frozen Git blobs, dynamic manifest inventory match, all20 registered themes/runtime resources present, prohibited paths/links/traversal absent. Full inventory evidence alongside archive in verification.json. Parent rechecked archive hashes and frozen HEAD before publication. Only excluded ODD evidence changes after freeze; source/README unchanged.

## Publication status
Official identity osdy and latest1.8.0 rechecked; 1.9.0 E404 before attempt. One exact-artifact npm publish attempt returned EOTP requiring human authentication; publication NOT confirmed. No OTP or token requested/retained and no retry performed. GitHub Release remains pending until registry verification.

## Completed publication evidence
Owner supplied accepted-processing output +osdy-pi@1.9.0 after interactive publication. Initial registry E404 treated as propagation pending; no republish. Independent bounded reconciliation (180-second maximum,30-second interval) succeeded on first verifier attempt at2026-10-02T04:49:24Z: official version1.9.0, latest1.9.0, SHA1 and SHA512 both exactly match verified retained artifact.
GitHub Release https://github.com/OsdyOrtiz/Osdy-Pi/releases/tag/v1.9.0 created and confirmed published2026-10-02T04:50:20Z; not draft/prerelease. Remote annotated tag peeled to frozen source9cbddbdd341f704bb96d4f60e4f5bd6535e622b8. Notes include both themes,20 total, installation, checks, verified npm and live-appearance limitation.

## Next step
Release complete. Commit/push this excluded evidence separately without moving the release tag or changing packaged source. Install with pi install npm:osdy-pi@1.9.0; reload and select either theme. Future packaged changes require a new version.

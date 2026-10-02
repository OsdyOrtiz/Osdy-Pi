# Release Osdy Pi 1.8.0

## Intent and authorization
User authorized 1.8.0 commit, main integration, push, GitHub and npm publication. Four new palettes: Gruvbox Dark, Nord, Rosé Pine, Daniela Cute; 18 themes total. No force-push, credential sharing or blind publish retries.

## Tasks
- [x] R1: Prepare and verify candidate (delegated writer plus independent artifact verifier).
- [x] R2: Commit, fast-forward main and confirm push.
- [x] R3: Publish exact tarball and verify npm/latest/integrity and GitHub tag/release.

## Verification and delivery evidence
- Version test observed RED (3 pass/1 fail), then GREEN (4 pass). Manifest and both lock roots 1.8.0; dependencies unchanged.
- Runtime24/24, contrast4/4, full299 tests (229 extension+70 script), typecheck/lint/diff/package checks passed.
- Source commit e777e43a42bc66b79a184efd38e4e5d159638992:10 files,482 authored lines (472 additions/10 deletions); committed native review review-873bb3d38320c065 approved/acknowledged, authority burned. ASSESS unavailable; independent verification obtained.
- Source fast-forwarded/pushed to main. Evidence commit fba67d960ff75ba889f7900090b00fee490944eb separately pushed; docs-only independent check passed.
- Exact inspected artifact: /var/folders/qg/r_11gk3n283_h43_7ncnf6r00000gn/T/tmp.Lo3KOULLsH/osdy-pi-1.8.0.tgz;105 files,18 themes, old Danielukis absent, ODD excluded. Twice105/105 entries byte-equal sources.
- Stable138-path source hash184b6eccb309e131da710dc5e6e746c8752ccf2459c545d0734c1f8b05e738f1. Earlier ambient433-file drift lacked per-file evidence; ignored .pi-lens state excluded, no source mismatch waived.
- Artifact and official registry SHA1:3fc247dabd9c40b06b42555255e223df294b039f.
- Artifact and official registry integrity:sha512-bMAdyEl2jMMb48+QkWQs4RrkYZ+HK3G2x144GfnOGYy1SZ+erxhZpKT6RNf1Ygo5pZNAQtW4xlTaI7By9Lohkg==.
- npm registry verified osdy-pi@1.8.0 and latest1.8.0 on2026-10-02 after processing delay. No republish.
- GitHub https://github.com/OsdyOrtiz/Osdy-Pi/releases/tag/v1.8.0 published2026-10-01T22:54:56Z, not draft/prerelease. Annotated tag peeled to exact source e777e43; notes now confirm verified npm publication and installation command.

## Authentication history and limitations
Initial E401 resolved by owner login; npm identity osdy, GitHub OsdyOrtiz. First publish returned EOTP; owner published exact artifact interactively. Initial post-acceptance E404 resolved after processing. No OTP/token requested or exposed.
Live TUI appearance remains unverified; no post-publish installed-TUI smoke claimed. Daniela Cute uses exact approved colors and authorized1.1 card/page floor; other themes1.2 and all text4.5 preserved.

## Next step
Release complete. Install with pi install npm:osdy-pi@1.8.0. Preserve immutable version/tag; future changes need a new version. New local release-skill work is separate and unpublished.

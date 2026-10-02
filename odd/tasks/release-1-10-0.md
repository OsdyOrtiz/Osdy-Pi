# Release Osdy Pi 1.10.0

## Intent and authority

Ship the completed four-page local usage analytics feature. The user explicitly approved `osdy-pi@1.10.0`, `latest` on `https://registry.npmjs.org/`, intended npm identity `osdy`, source/version/README edits, commit and push of `feat/usage-analytics`, integration and push to `main`, creation/push of `v1.10.0`, and a GitHub Release after registry verification. A fresh external build copy and retained artifact are authorized. No dependency changes, installs, force pushes, credential/OTP handling or blind publish retries.

Delivery strategy: `exception-ok`, direct coherent feature/release work unit without chained PRs, explicitly accepted after disclosing the approximately 1,971-line feature candidate. Feature implementation and prior evidence are in `odd/tasks/usage-analytics.md` (Engram mirror `odd/usage-analytics/tasks`). This new release authorization supersedes that document's earlier no-delivery constraint. Forecast approximately 2,100 authored feature/release lines, excluding evidence; do not compress or omit tests for size.

## Starting evidence

- Worktree `/Users/osdy/Documents/GitHub/Osdy-Pi`; branch `feat/usage-analytics`; source base/local main/remote main `73871e4e52d34a5fda3b16ef6afaa8391bdc6a31`.
- Origin `https://github.com/OsdyOrtiz/Osdy-Pi.git`; no remote feature branch or `v1.10.0` tag at preflight. Sibling native-subagents worktree is excluded.
- Known dirty scope: README, six-line runtime integration, seven untracked analytics source/test files, usage task ledger. No staged changes or unrelated edits observed.
- Manifest `osdy-pi@1.9.0`; no npm lifecycle packing hooks. Current-version assertion is `scripts/native-odd-todo-package.test.mjs`; both lock roots must align.
- Prior feature verification: 30 UI / 56 analytics / 356 full tests, typecheck/lint, synthetic PTY 125 checks. Human visual and live-provider capture remain unverified. Prior native review authority is burned; never reuse it.
- npm identity check returned E401. The user approved the release plan but has not confirmed successful login. Publication is blocked on human authentication; public version/dist-tag state and current package rights remain unverified.

## Tasks and route

| ID | Task | Route | Status | Commit |
| --- | --- | --- | --- | --- |
| R110-1 | Finalize README/version assertions, verify and freeze source | delegated writer; multi-file writes | completed | dea780026cd17adcbf1e70136ef9324f09811569 |
| R110-2 | Review frozen candidate, integrate/push Git, verify immutable artifact | delegated verifier; commands/archive inspection; parent Git/review | completed | 3ab79f7759eb187c362917070a2a402de5581dd6 (excluded source-verification evidence) |
| R110-3 | Authenticate, publish/reconcile npm, create GitHub Release and close evidence | human authentication; parent delivery; delegated verification | pending | Pending |
| R110-A | Restore npm authentication | human login; parent waits | in_progress | N/A |
| R110-B | Resolve overstrict artifact verifier assumptions | delegated read-only incident diagnosis and supplemental verification | completed | No product changes |

### R110-1 acceptance
- [x] Manifest and both lock roots use 1.10.0; only current-version assertion updated; no dependency churn.
- [x] README reviewed against source/manifest and finalized before commit/pack: 1.10.0 feature highlights, no checkout-only analytics labels or premature publication claim, preserve honest coverage/live-test limits and 20-theme catalog.
- [x] Deterministic version assertion RED/GREEN; package and analytics tests, full tests, typecheck/lint/diff checks pass.
- [x] Explicitly stage only authorized files; freeze source in a Conventional Commit on the feature branch, record full identity. No unrelated work included.

### R110-2 acceptance
- [x] Fresh native review under enabled user switch reaches exact recorded outcome; previous feature approval is not reused for changed release bytes.
- [x] Remote main rechecked before safe integration; push feature/main/tag without force and verify remote commit/tag bindings.
- [x] Fresh external source copy from frozen Git commit; inspect hooks, pack externally without installs, retain exact tarball path.
- [x] Dynamic archive inventory: reject links/duplicates/traversal/unexpected entries and prohibited local paths, compare every regular member with frozen Git blob, verify registered runtime/theme resources and manifest inclusion rules.
- [x] Independently compute SHA-1 and SHA-512 SRI, compare pack output, retain inventory/hash/README/source evidence. Never repack or publish mutable `.`.

### R110-3 acceptance
- [ ] Human login confirmed; official npm identity and package rights match approved `osdy`.
- [ ] Query chosen version and dist-tags before publish. Existing same integrity means verification only; mismatch or unknown state stops publication.
- [ ] Publish exactly the verified archive with public access and latest, or hand it to owner for interactive EOTP. Never collect credentials or OTPs.
- [ ] Bounded registry reconciliation: up to 180 seconds at 30-second intervals, no republish; verify version/latest/SHA-1/SHA-512.
- [ ] Create GitHub Release only after npm verification, bound to the exact release tag. Commit/push excluded evidence separately without moving tag or changing packaged bytes.

## Checks and rollback

Focused package and three analytics test files; `npm test`; `npm run typecheck`; `npm run lint`; `git diff --check`; independent immutable artifact inspection. Version-only edits use meaningful version-assertion RED/GREEN; documentation uses structural checks. Source rollback before publication is scoped to this feature/version/docs/tests; do not remove unrelated work or user history. Published version/tag remain immutable; fixes need a new approved version.

## Evidence and next step

Source preparation complete. Writer changed only manifest, two lock-root versions, current package-version assertion and README. RED 3 pass/1 fail, GREEN 4 package tests; 56 analytics and 356 full tests (285 extension + 71 script) passed, typecheck/lint/diff checks passed. Independent verifier repeated package 4/4, analytics 56/56 and diff check, reviewed README/source/theme registrations with no defect. Active LSP package test: no diagnostics. README fully reviewed against analytics modules and all 20 registered theme resources; exact source is frozen below.

Source commit `dea780026cd17adcbf1e70136ef9324f09811569` on `feat/usage-analytics`: 14 intended files, 2,163 additions/11 deletions including excluded task evidence; clean immediately after commit. Message: `feat(analytics): add paged usage history and prepare 1.10.0`. No dependency or unrelated source edits. Git and artifact delivery evidence follows; npm publication has not been attempted.

Public registry reads succeeded: `latest=1.9.0`; target `1.10.0` returned actual E404; maintainer name `osdy`. This does not establish current authenticated identity. E401/human-login blocker remains.

## Review and Git delivery

Committed native review `review-05f587851c02fb28` covered the exact source range from base `73871e4e52d34a5fda3b16ef6afaa8391bdc6a31`: medium, one reliability lens, 2,174 authored lines/14 files. Approved and exactly acknowledged; authority burned for target `sha256:77ae737d45f5a3906b09c235b9cc61c3ff7d4133ccccb8560bb1c92fa6803c72`, consumed revision `sha256:d4072bddd6a0c396c2d47cd025fc10a9a6955aeabeaeca99e02c93bbad5a0106`. Do not re-query or reuse. Informational `R3-coverage-restart` at collector line 30 is separate later work, not an open correction. Native ASSESS was schema-incompatible before/after review; independent verification already satisfied its fail-closed path.

After fresh remote-main confirmation, excluded source-verification evidence was committed as `3ab79f7759eb187c362917070a2a402de5581dd6`. Feature branch pushed; local main fast-forwarded and main/tag atomically pushed without force. Remote main and feature tip were confirmed at `3ab79f7759eb187c362917070a2a402de5581dd6`. Annotated `v1.10.0` object `354e18a427521ccf3bf99a48a6d07fe7744cfee8` peels to immutable source `dea780026cd17adcbf1e70136ef9324f09811569`. Subsequent commits may contain excluded release evidence only; do not move the tag.

## Immutable artifact evidence

Fresh external source from `git archive` of the frozen commit; no installs or worktrees, no npm packing lifecycle hooks, no scripts bypass. One `npm pack --json --pack-destination` execution produced retained artifact:

`/private/var/folders/qg/r_11gk3n283_h43_7ncnf6r00000gn/T/osdy-pi-1.10.0-evidence-8xnrh2h0/osdy-pi-1.10.0.tgz`

- Source tree: `3101f59a0523d3c90e3ea6ab277b66b16f216471`.
- README frozen blob: `5e5cd6961c71d2ee4316632279bad8c09ce94a62`.
- Dynamic inventory: 114 regular files, exact frozen-manifest inclusion set, all bytes equal their Git blobs; prohibited local paths, duplicates, traversal and links absent. Verified 20 themes, 54-module/123-edge local import closure, analytics, locale/image resources and license/README facts.
- SHA-1: `a5269b0f6e3daa24240b9c4d45176ad10a700e56`.
- SHA-512 SRI: `sha512-A/gpXYFaAE384ArXKJw86PpamjzotLsJyyAad6WQFX3QiMQtIXoZAVgfiLzUej9VTp4Ukj5nQtx7zVi9IFXGDQ==`.
- Full original inventory in sibling `verification.json`, SHA-256 `11ddbbfc0d5e37d5c8d7a0c1474dc5456ab87fa5102d3481142c26951ce79c61`; original partial proof preserved. `verification-supplemental.json` records observed independent supplemental checks and links that inventory. Pack output, command logs and original proof script retained alongside.

Original proof exited 1 on an additional unsupported requirement that committed bin files use mode 100755. Separate read-only diagnosis found unchanged base/HEAD 100644 and TAR 0644, regular byte-exact Node-shebang targets. Installed npm 11.12.1 documentation and bin-links linking/shimming/permission code confirm that normal npm installation applies execute permissions. Neither Git nor TAR executable bits are required by the release runbook; installation itself was not exercised. No product change or repack was needed.

Supplemental independent read-only verification completed all mandatory gates: 480/480 checks, exit 0, including previously unreached README/license and final source/artifact immutability checks. The only repository stat delta was ignored `.pi-lens/sessions/01a0fd4d-4255-71f6-b66a-93b03668d694.json`, absent from Git-tracked inputs and archive; its writer was not inferred. All tracked source, packaged inputs, external source, ledger and archive bytes remained unchanged. Failed exploratory commands (`python` unavailable; one absent npm-doc path) were resolved with `python3` and installed manpage evidence; no failed required artifact checks remain.

## Next step and publication boundary

Git delivery and exact artifact verification are complete; npm and GitHub Release publication are pending. Human must run `npm login --registry=https://registry.npmjs.org/` and confirm completion; do not infer login from release-plan approval. Then recheck `npm whoami`, approved identity/rights, official target version/dist-tags and exact retained archive hashes before publishing. Never publish `.` or repack, never request credentials/OTP. EOTP requires the owner to publish this exact archive interactively. Create GitHub Release only after official version/latest and both archive hashes match. Human visual/live-provider capture and an installation smoke test remain unverified.

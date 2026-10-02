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
| R110-1 | Finalize README/version assertions, verify and freeze source | delegated writer; multi-file writes | in_progress | Pending |
| R110-2 | Review frozen candidate, integrate/push Git, verify immutable artifact | delegated verifier; commands/archive inspection; parent Git/review | pending | Pending |
| R110-3 | Authenticate, publish/reconcile npm, create GitHub Release and close evidence | human authentication; parent delivery; delegated verification | pending | Pending |

### R110-1 acceptance
- [ ] Manifest and both lock roots use 1.10.0; only current-version assertion updated; no dependency churn.
- [ ] README reviewed against source/manifest and finalized before commit/pack: 1.10.0 feature highlights, no checkout-only analytics labels or premature publication claim, preserve honest coverage/live-test limits and 20-theme catalog.
- [ ] Deterministic version assertion RED/GREEN; package and analytics tests, full tests, typecheck/lint/diff checks pass.
- [ ] Explicitly stage only authorized files; freeze source in a Conventional Commit on the feature branch, record full identity. No unrelated work included.

### R110-2 acceptance
- [ ] Fresh native review under enabled user switch reaches exact recorded outcome; previous feature approval is not reused for changed release bytes.
- [ ] Remote main rechecked before safe integration; push feature/main/tag without force and verify remote commit/tag bindings.
- [ ] Fresh external source copy from frozen Git commit; inspect hooks, pack externally without installs, retain exact tarball path.
- [ ] Dynamic archive inventory: reject links/duplicates/traversal/unexpected entries and prohibited local paths, compare every regular member with frozen Git blob, verify registered runtime/theme resources and manifest inclusion rules.
- [ ] Independently compute SHA-1 and SHA-512 SRI, compare pack output, retain inventory/hash/README/source evidence. Never repack or publish mutable `.`.

### R110-3 acceptance
- [ ] Human login confirmed; official npm identity and package rights match approved `osdy`.
- [ ] Query chosen version and dist-tags before publish. Existing same integrity means verification only; mismatch or unknown state stops publication.
- [ ] Publish exactly the verified archive with public access and latest, or hand it to owner for interactive EOTP. Never collect credentials or OTPs.
- [ ] Bounded registry reconciliation: up to 180 seconds at 30-second intervals, no republish; verify version/latest/SHA-1/SHA-512.
- [ ] Create GitHub Release only after npm verification, bound to the exact release tag. Commit/push excluded evidence separately without moving tag or changing packaged bytes.

## Checks and rollback

Focused package and three analytics test files; `npm test`; `npm run typecheck`; `npm run lint`; `git diff --check`; independent immutable artifact inspection. Version-only edits use meaningful version-assertion RED/GREEN; documentation uses structural checks. Source rollback before publication is scoped to this feature/version/docs/tests; do not remove unrelated work or user history. Published version/tag remain immutable; fixes need a new approved version.

## Evidence and next step

Preparation pending. No commit/push/tag/pack/publication in this release yet. First run one bounded writer over manifest, lock roots, package-version assertion and README; retain all analytics behavior. npm authentication remains a separate human blocker, not permission to delay safe authorized source preparation.

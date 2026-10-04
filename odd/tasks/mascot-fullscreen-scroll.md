# Assistant mascot scrolling through Herdr

## Objective and scope
Keep the PNG mascot visible when its transcript entry returns after scrolling. User authorized correction preserving the mascot, confirmed every affected connection goes through Herdr, and explicitly prioritized Herdr with Ghostty. Moshi is no longer an investigation target.

- Branch: `fix/mascot-fullscreen-scroll`, from main `db95251d5b6a8a60eaf0b4e21b2c44e2afa359f9`.
- Preserve original mascot asset, compact size, assistant-only lifecycle, settings/capability checks and safe unsupported-terminal emoji fallback.
- Initial patch surfaces: `extensions/osdy-pi/message-role-marker-image.ts` and `extensions/osdy-pi/message-role-marker-image.test.ts`; expand only for demonstrated integration cause.
- No installed-package/configuration changes, live pane/server mutations, other UI surfaces or unrelated features. Diagnosis and Osdy-Pi correction are authorized; fresh commits, push, PR, merge, upgrades and publication are not.
- Protected files: dirty `odd/tasks/automatic-npm-main.md` diff SHA-256 `51ece837a8fccf941a9e206d99464dd5f9bb79841f0020c07329a3702e543ad8`; untracked `odd/tasks/editor-last-profile.md` SHA-256 `25c20baa4a9bdec4a45f5dd014130856431df34da25e7399e83e33c44c554bb2`.

## Tasks
- [ ] **T1 — Reproduce and correct mascot rendering.** Status: in_progress, blocked on T3.
  - Reproduce the actual failing path. For a deterministic application defect, observe RED before a minimal fix, then GREEN/refactor checks. Do not equate modeled protocol or source intent with real terminal behavior.
  - No speculative cache invalidation, core monkey patch or claimed correction while the cause remains unknown.
- [ ] **T2 — Verify the correction and live scroll.** Status: pending; depends on T1.
  - Focused/full tests, typecheck, lint, diff checks, active LSP and independent spot check after a patch; visual Herdr/Ghostty traversal separately.
  - Native review follows the user-owned switch/exact new candidate, not historical receipts or mixed work. Commit requires explicit authorization.
- [ ] **T3 — Obtain the missing live reproduction evidence.** Status: pending; blocks T1.
  - Shared Herdr transport is confirmed. Do not ask terminal names or Moshi connection again.
  - Compare the same marker/scroll in Ghostty directly versus through Herdr, or obtain a brief current-pane recording.
  - Supported current-pane metadata does not expose retained images or active screen; no unrelated content or live control changes.

## Routing and delivery
Delegated scouts mapped 4+ files. `gentle-ai-verify` ran protocol reproduction, published transport research and scoped runtime diagnostics. A proven multi-file patch goes to one bounded `gentle-ai-worker`, with parent-owned tracking and independent spot check as needed.
Test-first applies to a demonstrated deterministic defect, not fabricated visual RED. Conditional forecast: 30–150 authored lines, `ask-on-risk`, no PR requested. One coherent future work unit includes fix/tests/evidence; commit pending authorization. Roll back only this bugfix's helper/test changes, preserving original mascot commit `dffead6`.

## Evidence and limitations
- Historical feature file/full memory mirror matched; original basic display acceptance did not establish scroll behavior. User selected Pi fullscreen, but actual active buffer remains unverified.
- Passed 16 focused tests and 88 Pi-only in-memory fullscreen scenarios on local Pi 0.99.1/global Pi 1.0.1: stable IDs, cropping, retained uploads, return placement and twenty-marker eviction/reupload. Two initial harness resize/invalidation errors were diagnosed/corrected, not product RED.
- Herdr CLI 0.9.3 and published release `7b116c05bfda646af39d2524c54e70c751f57ee8` source retain placement-deleted data and up to16 offscreen images/64MiB, explicitly naming Pi scroll-return. This is intended source behavior, not actual forwarding proof. Older issue1167 concerns virtual placeholders and is not evidence of this defect or a released fix.
- Scoped inherited current-pane IDs matched Herdr current/get. Metadata: scroll offset0, maximum824, viewport55rows. No active-buffer/image-storage fields were exposed by documented APIs.
- Serialized visible ANSI snapshot:55lines/7853bytes, zero image/DEC1049 sequences. Serialization excludes retained graphics; this does NOT prove images are missing or fullscreen disabled. No pane text/raw argv/unrelated snapshots were returned.
- Narrow Pi setting: terminal.showImages=true. Environment-only Herdr detection images:null; prior protocol harness forced Kitty. Effective runtime capability/module identity still unverified; installed loaders intend host-shared modules.
- Two-row placement then erase-line remains only an unproven lead. No live visual failure, actual transport loss or extension-local defect has been independently demonstrated.
- Protected hashes stayed unchanged. First diff check passed. No source/package/config edits, live pane/server changes, staging, commits or native review. Further diagnostics did not rerun tests.
- Full suite/typecheck/lint/LSP skipped because there is no source patch. Visual verification and correction remain pending.

## Checks and next step
Focused: `node --test --experimental-strip-types extensions/osdy-pi/message-role-markers.test.ts extensions/osdy-pi/message-role-marker-image.test.ts`.
After a patch: `npm test`, `npm run typecheck`, `npm run lint`, `git diff --check`, changed-file LSP, independent focused spot check and live Herdr/Ghostty traversal.
Ask the user to run Pi in a new Ghostty tab outside Herdr and compare the same mascot scroll. A short recording may substitute if that comparison is unavailable. Do not keep researching Moshi or claim an unproven fix.

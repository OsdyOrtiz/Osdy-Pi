# Osdy Pi npm release skill

## Intent and scope
Created project-local osdy-pi-npm-release capturing the verified release path. User explicitly requires README review/update before source commit and packing; skill invocation never grants Git/publication permission or bypasses human OTP.
Files: .pi/skills/osdy-pi-npm-release/SKILL.md, references/release-runbook.md, AGENTS.md registration and narrow .gitignore exceptions. No registry/config creation, npm resource distribution, scripts, dependency or runtime changes. English artifacts; bundled skill-creator style guide used because repository guide absent.

## Tasks
- [x] S1: Create skill and runbook, register and structurally verify.
  - Route: delegated worker (multi-file instructions), separate read-only verifier, one bounded inline runbook correction.
  - Acceptance: complete frontmatter/sections/local links; mandatory README gate; explicit authority/version/registry/artifact checks; safe E401/EOTP/processing handling; no blind retries or secret requests; final version/dist-tag/hashes before success.
  - Rollback: remove skill and only its AGENTS/ignore registration.

## Verification evidence
- No meaningful behavior RED for passive instructions; structural and scenario checks used instead. No real publishing/authentication smoke test.
- Writer passed git diff --check, metadata/description/section order/local links/registration checks and eight scenario walkthroughs. Main body350 words; token estimates525-653, not tokenizer-measured, under recommended approximate budget.
- Exact two-file ignore exceptions verified; .pi settings, agents and other skills remain ignored. Package manifest unchanged, skill not implicitly npm-bundled.
- Independent review found two bounded issues: overly broad doc invalidation including excluded ODD, and implicit public access. Corrected to packaged/build input invalidation, bookkeeping exemption only with unchanged inventory/hashes and original frozen commit preserved; command explicitly uses --access public and approved tag.
- Final independent PASS: git diff --check clean; read-only Node frontmatter/local-reference checks passed; ignore boundaries passed. README-before-commit/pack and README-after-pack rebuild requirements preserved; matching published artifact resumes verification, not republish.
- Live Pi reload/authentication/release execution not tested. Skill is an instruction contract, not an executable release service.

## Delivery and next step
Branch feat/npm-release-skill, baseline d6c54e8da35a9b4d7fa370b0f55d539ac48d6078. Source release1.8.0 completed separately. User now explicitly authorized skill commit, main integration and push; no npm publication requested.
- [ ] S2 (in progress): Commit only the two skill files, AGENTS.md, .gitignore and this ledger; safely fast-forward main and confirm remote push. Route parent for Git coordination, verification evidence from completed independent S1 checks. Rollback by reverting this work unit, no force-push.
Fresh fetch confirmed main/origin/main/HEAD all at the baseline; no other sessions live in this worktree. Only intended five paths changed/untracked. Local skill loads through /reload and /skill:osdy-pi-npm-release. No additional registry created; direct discovery and AGENTS registration used.

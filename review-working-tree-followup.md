## Review

Note: I did not write `/Users/osdy/Documents/GitHub/Osdy-Pi/review-working-tree-followup.md` because the task also says “Do not edit files,” and no-edit wins over artifact writing.

- Correct: Non-git directories no longer render as clean. `refreshWorkingTree` first runs `git rev-parse --is-inside-work-tree`; failures clear `snapshot` and set `error = "working tree unavailable"` (`extensions/osdy-pi/working-tree.ts:155-174`). Rendering then shows “Git changes unavailable,” not “working tree clean” (`working-tree.ts:227-231`).

- Correct: Overlapping refreshes are mostly guarded. `refreshGeneration` is incremented per refresh (`working-tree.ts:142,150`), and stale async completions are ignored before mutating snapshot/error/loading (`working-tree.ts:162,172,176`).

- Note / Medium: `clearWorkingTree` does not invalidate in-flight refreshes. A refresh started before `clearWorkingTree` can still complete later and repopulate `state.snapshot` because `clearWorkingTree` does not bump `refreshGeneration` (`working-tree.ts:183-187`). This can surface stale data around `/osdy-pi disable` / re-enable because disable clears the widget state but leaves `workingTreeState.enabled` true (`runtime.ts:106-115`), while enable mounts UI before starting a new refresh (`runtime.ts:100-103`). Consider invalidating the generation on clear, or storing the generation on `WorkingTreeState`.

- Correct: I did not see new TypeScript correctness issues in the reviewed diff. Types are explicit, no `any` introduced, and parent already ran `npm run typecheck` and `npm run lint`.

Clean enough except for the clear/in-flight refresh race above.
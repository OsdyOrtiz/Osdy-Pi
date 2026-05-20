Did not write `/Users/osdy/Documents/GitHub/Osdy-Pi/review-position-diff-panel.md` because the task also said “Do not edit files”; no files changed.

## Review

- Correct: `npm run typecheck` and `npm run lint` both pass. Widget placement uses Pi-supported values (`aboveEditor` / `belowEditor`) in `extensions/osdy-pi/types.ts:7` and `extensions/osdy-pi/runtime-helpers.ts:72-75`.

- Blocker: **High UX issue** — `/osdy-pi diff` can open an invisible, non-closable pending overlay on terminals narrower than 100 columns. `extensions/osdy-pi/diff-panel.ts:217-229` awaits `ctx.ui.custom(...)` with `visible: termWidth => termWidth >= 100`. Pi TUI only focuses overlays when visible (`node_modules/@earendil-works/pi-tui/dist/tui.js:177-180`), so the panel may never receive `q`/`esc`. Add a width precheck/notification or render a compact fallback instead of hiding the overlay.

- Note: **Medium UX issue** — file navigation supports all files, but the list always renders only `this.files.slice(0, 8)`. Once `selectedIndex > 7`, the selected diff changes while the visible list has no selected marker. See `extensions/osdy-pi/diff-panel.ts:139-143` and `extensions/osdy-pi/diff-panel.ts:182-186`.

- Note: **Medium correctness/UX issue** — untracked files show `+0/-0` stats even though the diff panel renders their content as added lines. Untracked status only sets flags in `extensions/osdy-pi/working-tree.ts:85-90`; numstat collection only covers staged/unstaged tracked diffs in `extensions/osdy-pi/working-tree.ts:169-178`; the panel displays those zero stats at `extensions/osdy-pi/diff-panel.ts:185`.

- Note: **Low robustness issue** — one stale/missing/unreadable file can reject the whole diff panel because `Promise.all` loads every file patch without per-file fallback. See `extensions/osdy-pi/diff-panel.ts:78-82`, `extensions/osdy-pi/diff-panel.ts:25-27`, and `extensions/osdy-pi/diff-panel.ts:41-42`.
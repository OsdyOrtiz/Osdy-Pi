# Osdy Pi — a themed, responsive Pi workspace

Osdy Pi gives [Pi](https://github.com/earendil-works/pi) a themed, responsive terminal presentation with a header, editor, working indicator, and Git view. Visit the [Osdy landing page](https://landing-osdy.vercel.app/).

<img width="1857" height="847" alt="Osdy Pi interface" src="https://github.com/user-attachments/assets/028eeb14-3f43-4f1c-9603-0c55a8d2856d" />

## Quick start

Install from npm:

```bash
pi install npm:osdy-pi
```

Or install directly from GitHub:

```bash
pi install git:github.com/OsdyOrtiz/Osdy-Pi
```

Start Pi normally:

```bash
pi
```

On session start, Osdy Pi enables its UI when a UI is available and preserves your selected Pi theme.

## What ships

| Area | Included behavior |
| --- | --- |
| Themes | `osdy-pi-new`, `osdy-pi-dark`, `osdy-pi-sexy`, and `osdy-pi-tokyo-night` |
| Header | Selectable `osdy-theme` and `classic` header/mascot styles |
| Input | Framed editor in normal mode, with Pi's native editor as the small-mode fallback |
| Status | Custom working spinner, responsive footer metrics, and dynamic extension statuses |
| Git | Working-tree summary and a centered, filterable diff panel |
| Audio | Optional event sounds on macOS and Windows |

<img width="1280" height="433" alt="Osdy Pi header and editor" src="https://github.com/user-attachments/assets/20c7624d-9ad8-4494-97fb-6b6d81aaf328" />

## Appearance

### Themes

| Theme | Use |
| --- | --- |
| `osdy-pi-new` | Landing palette: cyan, violet, silver, and navy. |
| `osdy-pi-dark` | Dark alternative. |
| `osdy-pi-sexy` | Gentleman neon pink palette. |
| `osdy-pi-tokyo-night` | Tokyo Night dark palette. |

Osdy Pi preserves your selected Pi theme when it enables, reapplies, or disables its UI. Choose any theme in Pi:

```text
/settings
```

Or set the theme in Pi's `settings.json`:

```json
{
  "theme": "osdy-pi-sexy"
}
```

### Header, mascot, and animation

`osdy-theme` is the default header style; `classic` is the alternative. In normal mode, both styles render their full selected header and mascot. The header animation and mascot edge glow resolve through the active theme, so `osdy-pi-sexy` uses its neon pink accents while `osdy-pi-tokyo-night` uses its blue, purple, and cyan palette. Use `/osdy-pi osdy-theme` or `/osdy-pi classic`, or their direct aliases `/osdy-pi-osdy-theme` and `/osdy-pi-classic`.

Animation is enabled by default with an intro animation. Configure it through `OSDY_PI_ANIMATION`:

| Value | Result |
| --- | --- |
| `0`, `off` | Static art |
| `1`, `on`, `continuous` | Continuous animation |
| `intro` | Intro animation, then static art |

### Responsive layout

| Terminal mode | Header and mascot | Editor and Git | Footer |
| --- | --- | --- | --- |
| Normal | Full selected header and mascot side by side | Framed editor when the desired editor toggle is on; Git summary when the desired working-tree toggle is on | Path/branch, then dynamic extension statuses |
| Compact (72+ columns) | Proportionally scaled mascot above a readable header, reduced only when needed | Existing normal/small editor and Git behavior | Existing normal/small footer behavior |
| Small (<72 columns) | Mascot only; art and tone map scale proportionally | Pi native editor; Git summary hidden | Model + styled thinking level, usage, path/branch, then dynamic extension statuses (except Pi Lens) |

Small and compact modes trim only fully empty mascot-art and tone-map margins before applying one proportional width-and-height scale; mascot width starts near four-fifths of the available width. The header moves below the mascot as soon as side-by-side width would force the mascot into an additional width-limited reduction. Compact headers retain their source art when it fits and reduce proportionally only when a width or row bound requires it. Compact headers and mascots share a bounded terminal-row budget, so the header is omitted rather than collapsed into an unreadable one-row logo when there is not enough vertical space. The small-mode footer places the model and styled bare thinking level above usage, path/branch, and dynamic extension statuses. Pi Lens's footer status is hidden in small mode, but Pi Lens continues running. Usage includes input/output/cache-read/cache-write tokens, cost, and context. Extension statuses are supplied dynamically by Pi/extensions and may include Osdy Pi, MCP, or LSP; they are not hardcoded.

The editor and working-tree controls record the desired state for the current session. Their desired settings and working-tree placement are restored when the terminal moves normal → small → normal.

## Commands

| Group | Command |
| --- | --- |
| Main | `/osdy-pi` |
| Main | `/osdy-pi enable\|disable\|status` |
| Header | `/osdy-pi osdy-theme\|classic` |
| Editor | `/osdy-pi editor on\|off\|toggle\|status` |
| Working tree | `/osdy-pi working-tree on\|off\|toggle\|status` |
| Working tree | `/osdy-pi working-tree position top\|bottom\|status` |
| Audio | `/osdy-pi sound setup` |
| Diff | `/osdy-pi diff` |
| Alias | `/osdy-pi-osdy-theme` |
| Alias | `/osdy-pi-classic` |

`/osdy-pi` reports status. `enable` applies the Osdy Pi UI without changing the selected Pi theme; `disable` restores Pi's built-in header, editor, footer, and working row while preserving that theme. UI toggles are current-session desired state; only sound configuration persists globally.

## Editor and working indicator

In normal mode, the framed editor shows the model and thinking level in its title and session usage in its footer. Usage covers input, output, cache read, cache write when present, cost, and context. If Pi supports autocomplete, the editor uses Pi's native autocomplete rendering while the completion UI is visible.

A custom spinner appears above the editor while work is active. Osdy Pi hides Pi's built-in working row while enabled to avoid a duplicate indicator. Small mode always uses Pi's native editor.

## Working tree and diff

The working-tree summary is enabled by default. It reads the repository state at session start, including existing changes, and reports staged, unstaged, and untracked counts with total `+/-` changes. It also has clean and unavailable states. After successful `edit`, `write`, `ast_grep_replace`, or `bash` tool execution, it refreshes.

Use `working-tree position top` or `bottom` to place the summary above or below the editor. The widget supplies trailing blank space and adds leading separation when it is below the editor or the spinner is active, keeping the surrounding layout readable without promising a fixed number of blank lines in every state.

`/osdy-pi diff` opens a centered diff panel. Type to filter paths, then inspect staged, unstaged, or untracked patches for a file.

| Action | Controls |
| --- | --- |
| Move selection | Arrow keys or `j` / `k` |
| Open a patch | `enter`, `right`, `space`, or `l` |
| Scroll a patch | `PgUp` / `PgDn` (or `space` forward) |
| Go back | `esc`, `backspace`, `left`, or `h` |
| Close | `q` or `ctrl+c` |

## Audio notifications

Osdy Pi can play readable `.mp3` or `.wav` files on macOS and Windows. Other platforms safely skip playback.

| Event | Current meaning |
| --- | --- |
| `completion` | An agent run ends. |
| `error` | The first failed tool execution in an agent run. |
| `permission` | Hook is available but dormant until an explicit Pi approval integration uses it. |
| `question` | Hook is available but dormant until an explicit Pi question integration uses it. |

Run the guided wizard:

```text
/osdy-pi sound setup
```

It configures `completion`, `error`, `permission`, and `question`; validates selected readable audio files; and saves global settings to `~/.pi/agent/extensions/osdy-pi/audio-notifications.json`, or `$PI_CODING_AGENT_DIR/extensions/osdy-pi/audio-notifications.json` when `PI_CODING_AGENT_DIR` is set.

Startup flags can override a saved path per event:

```bash
pi \
  --osdy-pi-sound-completion /absolute/path/completion.wav \
  --osdy-pi-sound-error /absolute/path/error.mp3 \
  --osdy-pi-sound-permission /absolute/path/permission.wav \
  --osdy-pi-sound-question /absolute/path/question.wav
```

Precedence is startup flag, then saved global setting, then unconfigured. Empty flags do not override saved settings; relative startup paths resolve from the current working directory, while the wizard saves normalized absolute paths. Missing, unreadable, or unsupported files are skipped safely.

## Local install and development

For an isolated local launcher, use:

```bash
npm run pi:dev
```

It launches `pi -e .` with `PI_CODING_AGENT_DIR=.pi-dev`, separating local Pi configuration, packages, and extensions from a global installation. The manual equivalent is:

```bash
PI_CODING_AGENT_DIR="$PWD/.pi-dev" pi -e .
```

Install a local checkout into Pi with:

```bash
pi install /absolute/path/to/Osdy-Pi
```

After changing a local extension, run `/reload` or restart Pi.

For package checks and local development:

```bash
npm run typecheck
npm run lint
npm run pi:dev
```

![Osdy Pi preview](https://raw.githubusercontent.com/OsdyOrtiz/Osdy-Pi/main/mapche1.png)

## Limits and troubleshooting

- The custom UI requires a Pi session with a UI; otherwise it does not mount.
- A compact terminal stacks a scaled mascot over a source-size header when it fits, reducing the header only when needed; below 72 columns it switches to mascot-only, native editor, and no Git summary until space returns.
- The Git summary reports unavailable when Git commands cannot read a working tree.
- Diff patches depend on readable repository files; a file whose patch cannot load shows the reported error in the panel.
- Audio playback is limited to macOS and Windows and to readable `.mp3`/`.wav` files.

## Disable, uninstall, and license

Temporarily turn off the custom UI:

```text
/osdy-pi disable
```

To remove the package, use Pi's package-management command for installed packages.

MIT

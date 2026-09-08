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

`pi install` installs Osdy Pi's extension resources. When you later run plain `pi`, a valid Osdy default account automatically hands off once to the bundled launcher and resumes the saved session under that profile. With no default, Pi remains unmanaged; run `/osdy-account` to create a profile and establish a default. On session start, Osdy Pi restores its persisted enabled state when a UI is available and preserves your selected Pi theme. When disabled, it leaves Gentle Shell (or Pi's native UI) untouched.

## Gentle coexistence setup

To persistently load a local Gentle checkout while keeping Osdy Pi's UI authoritative, run:

```bash
osdy-pi gentle setup /absolute/path/to/gentle-pi
```

The command validates that the absolute source is a readable `gentle-pi` package with Gentle's todo and agents extensions before atomically updating `$PI_CODING_AGENT_DIR/settings.json` (or `~/.pi/agent/settings.json`). It registers the local package immediately before the first configured Osdy Pi package entry, so Gentle Shell initializes first, with exclusions only for Gentle's `gentle-todo.ts` and `gentle-agents.ts`, plus `themes: []`. Restart Pi or run `/reload` after setup.

Gentle Shell intentionally remains fully active underneath Osdy, including its footer and widgets. While Osdy is enabled, Osdy claims the footer and editor; disabling Osdy restores the editor Gentle Shell provided at session startup. Gentle's changes widget may coexist with Osdy's visual widgets.

This intentionally leaves `pi-subagents-j0k3r`, `@juicesharp/rpiv-todo`, and `@juicesharp/rpiv-ask-user-question` package entries untouched, so their external todo, subagent, and question plugins remain authoritative.

## OpenAI account profiles

Osdy Pi can keep multiple ChatGPT Plus/Pro accounts authenticated and let you choose which one starts Pi. `personal` and `work` are only examples—you can create as many named profiles as you need.

### Create and use profiles

**In Pi, run `/osdy-account`** to open the complete account manager:

| Action | Behavior |
| --- | --- |
| **Switch** | Restarts Pi safely with another profile, resumes the current saved session, and makes that profile the default. |
| **Add** | Creates an isolated profile without restarting or changing the default. Select it with **Switch**, then run `/login`. |
| **Default** | Shows, changes, or clears the profile used by future plain installed `pi` and `npm run pi:dev` launches. It does not switch the current process. |
| **Rename** | Renames an inactive profile. The default follows the new name when applicable. |
| **Remove** | Permanently deletes an inactive profile after exact-name confirmation. Removing the default requires a replacement. |
| **Account info** | Shows the available profiles and marks the active and default profiles without reading credentials. |

Pi does not expose a supported API for extensions to invoke its OAuth login dialog. After switching to a newly created profile, run Pi's native `/login` and choose **ChatGPT Plus/Pro (Codex)**. This is the only step that remains a separate Pi command; it does not require leaving Pi or opening another terminal.

Terminal commands remain available as recovery and automation alternatives:

```bash
# Create a profile without launching or changing the default.
osdy-pi account create personal

# Legacy recovery flow: create a profile and open Pi for /login.
osdy-pi account add work

# List profiles, choose the default, or launch one now.
osdy-pi account list
osdy-pi account default personal
osdy-pi account default
osdy-pi account use personal

# Rename a profile, or permanently remove an inactive profile.
osdy-pi account rename work consulting
osdy-pi account remove consulting --confirm consulting

# Removing the default requires an existing replacement.
osdy-pi account remove personal --confirm personal --replacement work

# Remove the preference without removing any profile.
osdy-pi account default --clear
```

Profile names accept lowercase letters, numbers, and hyphens, up to 63 characters. Spaces, paths, uppercase letters, and the reserved names `default`, `profiles`, and `auth.json` are rejected. `account add` opens a profile for login but does not change the default.

### See and switch the active account

When Pi was launched through a profile, Osdy Pi shows its profile name in the editor:

- **Simple/native editor:** beside the model, for example `gpt-5.6-sol · personal · think high`.
- **Extended/framed editor:** `personal` replaces the `Osdy-Pi` title.
- **No managed profile:** the existing model line and `Osdy-Pi` title remain unchanged.

`account use <name>` saves that existing profile as the default before it starts Pi. Inside Pi, `/osdy-account` does the same after you select another profile. Osdy Pi waits for active work to finish, starts the replacement Pi with the current saved session, confirms that the new Pi process started, and only then closes the previous process. This is a controlled restart, not an in-process credential swap.

To resume a specific session directly from the terminal:

```bash
osdy-pi account use work -- --session /absolute/path/to/session.jsonl
```

> **Privacy:** only Pi's managed `auth.json` is isolated per profile. Session history, settings, installed packages, and extension resources are shared, so every profile can access that local state. Osdy Pi never reads, copies, prints, or passes OAuth credentials. It keeps Pi's canonical `openai-codex` provider and delegates authentication to Pi's built-in `/login` flow.

### Rename and permanently remove profiles

Use `osdy-pi account rename <old> <new>` to rename an existing inactive profile. If it was the default, its default selection follows the new name.

Use `osdy-pi account remove <name> --confirm <name>` for a non-default profile. This permanently deletes its isolated profile directory. Removing the default additionally requires `--replacement <other>`; the existing, different replacement becomes the default before deletion. A replacement is rejected for non-default removal.

Before rename or removal, close this Pi process when it uses the target and **manually close every other Pi process using that target profile**. Osdy Pi does not scan or stop other processes. Inside Pi, use `/osdy-account` (or `/osdy-account rename` / `remove`); the guided flow shows the active profile but refuses changes to it until you Switch first, asks for a new default when needed, and requires typing the exact profile name. Cancellation changes nothing. Do not start two Pi processes with the same `--session` path.

## What ships

| Area | Included behavior |
| --- | --- |
| Themes | 14 built-in themes, including Osdy, Kanagawa, Dracula, Catppuccin, Matrix, and Lucent Orange palettes |
| Header | Selectable `osdy-theme` and `classic` header/mascot styles |
| Input | Responsive auto editor by default, with selectable simple Pi-native or extended framed modes |
| Status | Custom working spinner, responsive footer metrics, dynamic extension statuses, and Codex subscription quota |
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
| `osdy-pi-kanagawa-wave` | Kanagawa Wave dark palette. |
| `osdy-pi-kanagawa-dragon` | Kanagawa Dragon dark palette. |
| `osdy-pi-kanagawa-lotus` | Kanagawa Lotus light palette. |
| `osdy-pi-dracula` | Dracula Classic dark palette. |
| `osdy-pi-catppuccin-latte` | Catppuccin Latte light palette. |
| `osdy-pi-catppuccin-frappe` | Catppuccin Frappé dark palette. |
| `osdy-pi-catppuccin-macchiato` | Catppuccin Macchiato dark palette. |
| `osdy-pi-catppuccin-mocha` | Catppuccin Mocha dark palette. |
| `osdy-pi-matrix` | OpenCode Matrix dark palette. |
| `osdy-pi-lucent-orange` | Lucent Orange dark palette with terminal-background passthrough. |

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

`osdy-theme` is the default header style; `classic` is the alternative. In normal mode, both styles render their full selected header and mascot. The header animation and mascot edge glow resolve through the active theme, so each installed palette supplies its own accents. Use `/osdy-pi osdy-theme` or `/osdy-pi classic`, or their direct aliases `/osdy-pi-osdy-theme` and `/osdy-pi-classic`.

Animation is enabled by default with an intro animation. Configure it through `OSDY_PI_ANIMATION`:

| Value | Result |
| --- | --- |
| `0`, `off` | Static art |
| `1`, `on`, `continuous` | Continuous animation |
| `intro` | Intro animation, then static art |

### Responsive layout

| Terminal mode | Header and mascot | Editor and Git | Footer |
| --- | --- | --- | --- |
| Normal | Full selected header and mascot side by side | Auto mode shows the framed editor by default; simple selects Pi's native editor and extended selects the framed editor; Git summary when enabled | Native editor: model/thinking, usage, path/branch, then statuses; framed editor: path/branch then statuses |
| Compact (72+ columns) | Proportionally scaled mascot above a readable header, reduced only when needed | Selected editor mode and Git behavior | Same editor-aware footer behavior as normal/small modes |
| Small (<72 columns) | Mascot only; art and tone map scale proportionally | Pi native editor for every editor mode; Git summary hidden | Model + styled thinking level, usage, path/branch, then dynamic extension statuses (except Pi Lens) |

Small and compact modes trim only fully empty mascot-art and tone-map margins before applying one proportional width-and-height scale; mascot width starts near four-fifths of the available width. The header moves below the mascot as soon as side-by-side width would force the mascot into an additional width-limited reduction. Compact headers retain their source art when it fits and reduce proportionally only when a width or row bound requires it. Compact headers and mascots share a bounded terminal-row budget, so the header is omitted rather than collapsed into an unreadable one-row logo when there is not enough vertical space. The small-mode footer places the model and styled bare thinking level above usage, path/branch, and dynamic extension statuses. Pi Lens's footer status is hidden in small mode, but Pi Lens continues running. Usage includes input/output/cache-read/cache-write tokens, cost, and context. Extension statuses are supplied dynamically by Pi/extensions and may include Osdy Pi, MCP, or LSP; they are not hardcoded.

The enabled state, editor mode, and working-tree visibility preference persist globally across Pi reloads and sessions, shared by all projects. They are saved in `$PI_CODING_AGENT_DIR/extensions/osdy-pi/settings.json`, or `~/.pi/agent/extensions/osdy-pi/settings.json` when `PI_CODING_AGENT_DIR` is unset. The selected editor mode and working-tree placement are restored when the terminal moves normal → small → normal.

## Commands

| Group | Command |
| --- | --- |
| Main | `/osdy-pi` |
| Main | `/osdy-pi enable\|disable\|on\|off\|status` |
| Accounts | `/osdy-account` |
| Header | `/osdy-pi osdy-theme\|classic` |
| Editor | `/osdy-pi editor auto\|extended\|simple\|on\|off\|toggle\|status` |
| Working tree | `/osdy-pi working-tree on\|off\|toggle\|status` |
| Working tree | `/osdy-pi working-tree position top\|bottom\|status` |
| Audio | `/osdy-pi sound setup` |
| Diff | `/osdy-pi diff` |
| Codex subscription | `/usage` |
| Alias | `/osdy-pi-osdy-theme` |
| Alias | `/osdy-pi-classic` |

`/osdy-pi` reports status. `enable` (or `on`) applies the Osdy Pi UI without changing the selected Pi theme; `disable` (or `off`) restores the Gentle Shell or Pi UI captured at session startup while preserving that theme. The enabled state, editor mode, working-tree visibility, and sound configuration persist globally.

### Codex subscription usage

Run `/usage` to open the Codex subscription dashboard for the active managed `openai-codex` profile and model. Press `r` to refresh; `esc` or `q` closes it. The dashboard shows these controls at the bottom.

The main windows are labeled **Session** and **Weekly** (the API/domain remains primary/secondary). Their remaining-capacity bars are full at 100% remaining and empty at 0%; labels use the active theme's bold accent, Session uses the accent fill, Weekly uses `mdLink`, and empty segments are muted. A double themed frame, section dividers, and spacing separate the display. Detail cards show each duration and relative, local, and UTC reset times. Plan, availability, credits/reset count, and additional buckets appear only when the service supplies them; absent optional values are omitted.

At wide widths, the modal pairs the Session and Weekly detail cards. Below 72 content columns, cards and bars stack and account/model data wraps. The native footer and extended editor also show compact Session/Weekly remaining-capacity bars below model and thinking metadata whenever a current Codex snapshot exists. Wide widths combine those bars; narrow widths stack them. Additional buckets appear only in `/usage`.

Usage loads once when the session starts and refreshes when the modal opens or `r` is pressed; it does not poll. A refresh clears the previous snapshot before authentication resolves, and shutdown clears state, so quota data cannot cross account or profile boundaries.

> **Privacy:** OAuth is resolved only through Pi's `modelRegistry`. Osdy Pi does not read `auth.json`, persist or log credentials, or display account IDs, tokens, response bodies, or endpoint internals in the UI. Requests use a fixed HTTPS endpoint with bounded timeout, response size, and redirects.

## Editor and working indicator

The default `auto` editor mode preserves the responsive behavior: it uses the framed editor when space permits and Pi's native editor on small terminals. Select `simple` for Pi's native editor at every width, or `extended` to request the framed editor explicitly: `/osdy-pi editor auto|extended|simple`. Simple mode actually unmounts the custom editor component rather than hiding it. Small terminals always use Pi's native editor, including when `extended` is selected. The legacy commands remain compatible where feasible: `on` maps to `extended`, `off` maps to `simple`, and `toggle` switches between extended and simple.

In auto or extended mode at a non-small width, the framed editor shows the model and thinking level in its title and session usage in its footer. For an account-profile launch, the left title shows the active profile name instead of `Osdy-Pi`. When the native editor is effective (simple mode or any small terminal), the Osdy footer instead shows model, active profile when present, thinking, and usage rows before its path/branch and status rows. It uses the currently active Pi/Osdy theme palette; no separate editor theme selector exists. Usage covers input, output, cache read, cache write when present, cost, and context. If Pi supports autocomplete, the editor uses Pi's native autocomplete rendering while the completion UI is visible.

A custom spinner appears above the editor while work is active. Osdy Pi hides Pi's built-in working row while enabled to avoid a duplicate indicator.

## Working tree and diff

The working-tree summary is enabled by default. It reads the repository state at session start, including existing changes, and reports staged, unstaged, and untracked counts with total `+/-` changes. It also has clean and unavailable states. `working-tree off` unregisters the widget completely, and a persisted disabled preference leaves it unmounted when the next session starts. `working-tree on` remounts and refreshes it without requiring a restart. After successful `edit`, `write`, `ast_grep_replace`, or `bash` tool execution, it refreshes.

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

For the normal in-Pi development flow, no global `osdy-pi` link is required:

1. Start the local extension:

   ```bash
   npm run pi:dev
   ```

2. Inside Pi, run `/osdy-account`.
3. Choose **Add**, enter a profile name, then choose **Switch** and select it.
4. After the managed restart, run `/login` and choose **ChatGPT Plus/Pro (Codex)**.
5. From then on, `npm run pi:dev` starts the default profile automatically. Use `/osdy-account` for every profile-management action.

The terminal interface remains available for recovery and automated testing:

```bash
npm run pi:dev -- account create personal
npm run pi:dev -- account list
npm run pi:dev -- account use personal
npm run pi:dev -- account default personal
npm run pi:dev -- account rename personal private
npm run pi:dev -- account remove private --confirm private
```

`npm run pi:dev` launches `pi -e <absolute repository root>` with `PI_CODING_AGENT_DIR=<absolute repository root>/.pi-dev` when no default is set. If its `.pi-dev` metadata names a valid profile, it routes through this checkout's local launcher and starts that profile while retaining `-e <absolute repository root>`. The development `.pi-dev` profile store and the installed Pi profile store are separate. For an installed package, plain `pi` loads extension resources; at startup Osdy Pi hands off through its bundled launcher when the installed store has a valid default, while no default leaves ordinary unmanaged Pi running. Account commands use this checkout's local launcher, so no global `osdy-pi` link is needed. The development extension root is inherited by profile launches, keeping the local extension loaded after an `/osdy-account` handoff. The manual equivalent is:

```bash
PI_CODING_AGENT_DIR="$PWD/.pi-dev" OSDY_PI_DEV_EXTENSION_ROOT="$PWD" pi -e "$PWD"
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
- `/usage` requires an active `openai-codex` login. Run `/login` and choose **ChatGPT Plus/Pro (Codex)**; run `/reload` after local extension changes.
- A `401` indicates an expired session, while a `403` means usage is unavailable. Optional backend fields may be absent and simply do not render.

## Disable, uninstall, and license

Turn off the custom UI persistently (including across `/reload`):

```text
/osdy-pi disable
# Alias: /osdy-pi off
```

Restore it with `/osdy-pi enable` or `/osdy-pi on`.

To remove the package, use Pi's package-management command for installed packages.

MIT

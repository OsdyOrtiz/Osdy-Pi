# Osdy Pi — a themed, responsive Pi workspace

Osdy Pi gives [Pi](https://github.com/earendil-works/pi) a themed, responsive terminal presentation with a header, editor, working indicator, and Git view. Visit the [Osdy landing page](https://osdy-pi.vercel.app/).

<img width="1857" height="847" alt="Osdy Pi interface" src="https://github.com/user-attachments/assets/028eeb14-3f43-4f1c-9603-0c55a8d2856d" />

## Release highlights

**1.11.0 adds three Spider-Man-inspired dark palettes**, bringing the bundle to **23 themes**. It retains the four-page local usage analytics introduced in 1.10.0, with shared period and profile/provider/model filters, keyboard navigation, and metadata-only history. These version introductions are historical, not a fixed latest-version claim. After npm Trusted Publishing is configured, pushes to main (including direct pushes) run checks and attempt to publish an automatically allocated patch to npm. Failed checks publish nothing; authentication or registry failures can also stop publication. Verify the resolved npm version before installing. Maintainers: [automatic npm publishing setup](https://github.com/OsdyOrtiz/Osdy-Pi/blob/main/docs/npm-publishing.md).

| Area | What ships |
| --- | --- |
| Local analytics (1.10.0) | `/osdy-usage` opens Summary, Profiles, Models, and History pages for recorded tokens and estimated cost—not billing or subscription quota. |
| Themes introduced in 1.11.0 | Spider-Man Classic, Miles Morales, and Spider-Verse add three distinct dark palettes. |
| Themes introduced in 1.9.0 | Halloween and Halloween Killer add two dark palettes. |
| Themes introduced in 1.8.0 | Gruvbox Dark, Nord, Rosé Pine base dark, and Daniela Cute. |
| Message cards | Pi-native colored user cards without emojis and plain assistant Markdown preceded by a separate `🦝` transcript row. |
| Header and mascot | A theme-aware `neon` header and selectable `bts` mascot, both responsive and persisted independently. |
| Accounts | `/osdy-account` switches Codex profiles in place with atomic activation, rollback, bounded auth files, and process-safe locks. |
| Quota | `/usage` and compact bars emphasize remaining Codex quota at warning (40% or less) and error (15% or less) thresholds. |
| TODO (starting in 1.5.0, opt-in) | Default-off first-party `todo` snapshots track the Pi session branch; `/todos` reads them without editing. ODD Markdown remains separate. |

## Prerequisites

- [Pi](https://github.com/earendil-works/pi)
- Node.js **22.19.0 or later**
- Git, for Osdy Pi's working-tree and diff features (and for Git-based installs)

## Quick start

1. Install Osdy Pi from npm:

   ```bash
   pi install npm:osdy-pi
   ```

   Or install directly from GitHub:

   ```bash
   pi install git:github.com/OsdyOrtiz/Osdy-Pi
   ```

   Check the resolved npm version: the Spider-Man-inspired themes require 1.11.0 or later; local analytics requires 1.10.0 or later. To pin the historical feature release explicitly, use `pi install npm:osdy-pi@1.11.0` if that version is available on npm; automatic patches may already be newer. For an unpinned installation, use `pi update`; it does not move a pinned version, so replace an older pin explicitly. First-party TODO is included starting in 1.5.0; `/osdy-pi uninstall` and explicit agent provider modes start in 1.6.0. Installing Osdy does not automatically install Joker; see [explicit agent provider modes](#explicit-agent-provider-modes-in-normal-pi).

2. Start Pi:

   ```bash
   pi
   ```

**Osdy TODO is off by default**, so installing Osdy alongside Gentle Shell does not register a competing `todo`, `/todos`, or TODO widget. To select Osdy explicitly, run `/osdy-pi todo on`, confirm the active profile target, then check `/osdy-pi todo status`. See [TODO selection](#explicit-todo-selection).

Osdy Pi's own extension and themes are bundled—do not install them separately. Starting with **1.11.0**, the package bundles **23 themes**, including Spider-Man Classic, Miles Morales, and Spider-Verse: Gruvbox Dark, Nord, Rosé Pine base dark, and Daniela Cute were introduced in 1.8.0; Halloween and Halloween Killer were added in 1.9.0. Check your installed npm version to see which themes are available. Launch through `osdy-pi` (or `npm run pi:dev`) to activate a valid Osdy default account into Pi's shared agent directory before Pi starts. With no default, Pi remains unmanaged; run `/osdy-account` to create a profile and establish a default. On session start, Osdy Pi restores its persisted enabled state when a UI is available and preserves your selected Pi theme. When disabled, it leaves Gentle Shell (or Pi's native UI) untouched.

### Control Center in Pi

Run **`/osdyConfig`** in interactive Pi to open the Osdy Control Center. **Theme, Header, Mascot, Editor, Git, Sounds, Account, Usage, TODO, and Agents** provide inline controls or data in the same modal. Existing commands remain available.

- Use **↑/↓**, **Home/End**, or **Page Up/Down** to navigate; **Tab** or **←/→** switches between categories and details. **Enter** selects.
- TODO shows configured selection, current eligibility, and actually loaded SDK registration separately. Opt-in/out requires an idle session and a Cancel-first inline confirmation naming the target, owned Gentle filter effects, and reload. Successful selection closes/disposes the panel and releases its editor hold before reloading once; restart Pi if reload fails. Rejections stay in the panel. No installs or task-history changes occur; legacy `/osdy-pi todo on|off|status` remains available.
- Agents inspects Joker/Gentle configuration without activating anything. Selection is idle-only and Cancel-first confirmed, naming the real target, possible Joker installation, owned agent filters, and preserved unrelated resources. Normal personal Pi only: `pi:dev` and isolated/override sessions are blocked, never redirected to personal settings. Success closes/disposes the panel and releases its editor hold before reloading once; restart Pi if reload fails. Legacy `/osdy-pi agents setup|on|off|status` is unchanged.
- Theme lists Pi's available themes and marks the current theme. A successful selection applies live and saves globally in the active Pi agent directory; project settings can override it at startup. Failures appear in the modal.
- Header offers **osdy-theme / neon**; Mascot offers **current / Bts**; Editor offers **auto / extended / simple**, with the current preference marked. Editor also shows the effective mode: small terminals stay simple/native even with extended selected.
- Preferences save immediately through the same runtime and global Osdy settings store as `/osdy-pi` commands (`<agent-dir>/extensions/osdy-pi/settings.json`). Header/Mascot apply live without closing the panel. Editor replacement waits until all overlays close; if another overlay remains, the next existing responsive watcher tick applies the latest choice. The effective mode reports the actually mounted editor while queued. Opening a category only reads values; while Osdy is disabled, choices save for later without enabling it.
- A selection shows **Saving** until persistence finishes and **Saved globally** only on success. Failed saves retain the live preference but report **could not be saved**; select again to retry. Application errors report **Not saved**, without claiming the runtime change succeeded. Duplicate selections are ignored while saving.
- **Git** shows the current branch (or detached HEAD), changed-entry count/clean status, and the current widget position as a read-only session detail. Working-tree enablement applies and saves through the same owner as `/osdy-pi working-tree`; Git inspection never writes Git. `/osdy-pi diff` and position commands are unchanged.
- **Sounds** shows each event's saved and effective path/source. Configure opens a single-line path editor **inside this overlay**: enter a readable `.mp3`/`.wav` path, then **Enter** to validate and save immediately, or **Esc** to cancel editing. Relative paths resolve against the project directory and save as absolute paths. Clear removes only that event's saved path from the existing v1 audio store (`<agent-dir>/extensions/osdy-pi/audio-notifications.json`). Notifications read this store afresh; refresh failures are reported separately from save failures.
- Sounds' master enablement is **unavailable**: the existing schema has paths, not an enable switch or presets. Startup `--osdy-pi-sound-<event>` flags override saved paths, so **clearing a saved path does not disable flag-configured playback**. Only **Test effective** explicitly plays a sound; opening categories and configuring paths never play. Tests report unavailable files/platforms or playback failures; playback remains macOS/Windows only. The legacy `/osdy-pi sound setup` wizard is preserved.
- **Account** lists validated profile names and current/default metadata only. Switch, set default, and clear default require an **in-screen confirmation** with Cancel selected initially; **Esc** cancels confirmation without closing the overlay. Resize if the confirmation cannot fit. Switching waits for Pi to become idle, activates through the existing backend, and refreshes subscription usage. Login remains Pi-owned (`/login`); create/rename/remove remain available in `/osdy-account`. Category navigation never changes profiles or credentials.
- **Usage** shows the runtime's cached subscription quota (used percentage, window, reset/fetch times) and the existing local history owner's recorded token/cache totals, cost gaps, and model detail. Select **Range: day/week/month** for the current local calendar period; toggle **Accounts: all/current** for local analytics (unmanaged when no valid current profile exists). Quota always belongs to the active account, not the analytics filter. Select **Refresh quota and local history** explicitly; rendering and filters never fetch. Empty, loading, unavailable, and limited/incomplete coverage are reported honestly. Estimates are not billing or subscription quota. `/usage` and `/osdy-usage` remain unchanged.
- **Esc** closes without undoing live or saved changes; an in-flight operation still finishes and is not claimed cancelled. Late results cannot replace a closed overlay or another category. On narrow terminals, categories and details share the viewport; use Tab to switch.

This modal requires Pi's terminal UI, not RPC, JSON, or print mode. `/osdy-pi` remains the legacy extension command; the external shell command `osdy` (`bin/osdy.mjs`) remains the isolated launcher described below.

### Optional: isolated `osdy` command

Use this path when you want **installed, normal Pi** with Osdy-specific settings and sessions, without changing the official Pi profile. `pi install` loads package resources in Pi; it does not guarantee that package executables are available on your shell's `PATH`. To use the packaged commands, install the CLI separately (or run the scripts directly from a checkout):

```bash
npm install --global osdy-pi
osdy-pi setup
osdy
```

From an Osdy Pi checkout, `node bin/osdy-pi.mjs setup` or `node bin/osdy.mjs setup` works without a global CLI installation; `node bin/osdy.mjs` launches Pi. `osdy-pi setup` is explicit and repeatable; `osdy` also checks/reconciles the isolated profile before each launch and forwards its arguments to the installed `pi` executable. The default source is `~/.pi/agent`, the isolated destination is `~/.pi/osdy-agent`, and the Osdy source is the package containing the CLI. Set `OSDY_PI_SOURCE_AGENT_DIR`, `OSDY_PI_AGENT_DIR`, or `OSDY_PI_EXTENSION_ROOT` to override them with absolute paths. The setup needs one valid local `gentle-pi` checkout declared as an absolute source in official Pi's package settings; if none or several match, set `GENTLE_PI_EXTENSION_ROOT=/absolute/path/to/gentle-pi` before setup and launch. Missing or invalid Gentle sources fail with an actionable error rather than silently omitting Gentle. No Pi fork, build, or PATH shim is required.

**What is isolated?** Official `~/.pi/agent/settings.json` is read but never rewritten by `osdy-pi setup` or `osdy`. Osdy keeps its own settings, selected theme, sessions, crash logs, and command history. Other existing top-level official resources are linked into the isolated profile only when absent—including `auth.json`, so credentials are **shared**, not isolated. Existing isolated files and symlinks are not replaced; the managed isolated settings are reconciled atomically. Named Codex accounts under `/osdy-account` are a separate feature, not this profile separation.

**Already have `~/.local/bin/osdy`?** Check `type -a osdy` (or `command -v osdy`) before using the new command: a home-local launcher earlier on `PATH` still wins. Setup does **not** remove or replace it. To try the packaged launcher without changing PATH, use `node "$(npm root -g)/osdy-pi/bin/osdy.mjs" --version` after installing the CLI; `node "$(npm root -g)/osdy-pi/bin/osdy.mjs" setup` runs the same explicit setup. Compare `pi --version` and `osdy --version` once the intended command resolves. Keep the old launcher until you confirm which executable you want; migration/removal is manual.

## Optional: complete Osdy Pi suite

Add these maintained extensions after installing Osdy Pi. They are optional; each extends Pi independently.

| Package | Purpose |
| --- | --- |
| `gentle-engram` | Persistent memory shared across sessions, compactions, and MCP agents. |
| `pi-intercom` | Brokered communication between Pi agents and sessions. |
| `@juicesharp/rpiv-ask-user-question` | Structured, typed questionnaires when an agent needs clarification. |
| `pi-web-access` | Web search and URL fetching, plus repository, PDF, YouTube, and local-video analysis. |
| `pi-lens` | Real-time code feedback through LSP, linters, formatters, type checking, and structural analysis. |
| `pi-btw` | Parallel side conversations through `/btw`. |
| `@open-pets/pi` | OpenPets integration for Pi. |
| `pi-playwright` | Playwright browser-automation skills. |
| `pi-mcp-adapter` | MCP server and tool adapter for Pi. |
| `pi-subagents-j0k3r` | Markdown-defined subagents, delegation tools, history, and model profiles. |
| `gentle-pi` | The Gentle senior-architect harness, with SDD/OpenSpec, subagents, TDD evidence, and skills. |

Install the ordinary npm packages once:

```bash
pi install npm:gentle-engram
pi install npm:pi-intercom
pi install npm:@juicesharp/rpiv-ask-user-question
pi install npm:pi-web-access
pi install npm:pi-lens
pi install npm:pi-btw
pi install npm:@open-pets/pi
pi install npm:pi-playwright
pi install npm:pi-mcp-adapter
pi install npm:pi-subagents-j0k3r
```

`gentle-pi` is deliberately not included in that package-install block: clone and register it through the coexistence setup below, which applies Osdy-specific exclusions instead of adding a duplicate ordinary package entry.

```bash
git clone https://github.com/Gentleman-Programming/gentle-pi.git
osdy-pi gentle setup "$(pwd)/gentle-pi"
```

## Explicit agent provider modes in normal Pi

After `pi install npm:osdy-pi`, open **normal personal Pi** (not `osdy`'s isolated profile) and run:

```text
/osdy-pi agents setup
```

`/osdy-pi agents setup` and `/osdy-pi agents on` ensure **Joker mode**: install Joker with Pi if absent, enable its package extension (`./index.ts`), and exclude only `-extensions/gentle-agents.ts` from eligible Gentle entries. `/osdy-pi agents off` selects **Gentle mode**: require an eligible Gentle package first, exclude only Joker's `./index.ts` using `-./index.ts` in its package entry (if installed), and remove Gentle's agents exclusion. Both packages and all unrelated resources stay installed. `/osdy-pi agents status` reports the settings-derived mode (`joker`, `gentle`, `mixed`, or `unavailable`) without writing. Confirm the named `~/.pi/agent/settings.json` change; after success Pi reloads resources, or prompts a restart if reload fails. Cancel changes nothing; repeating either mode is safe. No runtime task-failure fallback is provided.

A pre-existing Joker `-./index.ts` filter without Osdy's ownership marker is ambiguous and blocks switching rather than being removed. Osdy records ownership in the personal settings field `osdyPiJokerExclusionOwned` while it owns that filter and removes the field on return to Joker mode. Existing Gentle agents exclusions are removed by `off`, including exclusions configured before this feature; review that change before confirming. Other package fields and extension filters remain intact. An extension allowlist that omits the agent extension needed for the selected mode blocks switching rather than silently reporting success.

Gentle package detection supports `npm:gentle-pi` and validated local checkouts (absolute, settings-relative, `~/`, and `file:` paths). Remote Git/HTTPS Gentle sources are not reconciled: when recognized, setup stops before installing Joker rather than reporting a false success. Register a local Gentle checkout or npm Gentle source in personal Pi first; the existing `osdy-pi gentle setup /absolute/path/to/gentle-pi` command can configure local coexistence if you have that CLI. Mode switching refuses an isolated/custom `$PI_CODING_AGENT_DIR` or a project-local Gentle override because a personal filter cannot reliably control those contexts. Run it in normal Pi without a conflicting project package; an invalid settings file or failed install produces an error rather than silently applying only part of the filter. It does not edit credentials.

## Gentle coexistence setup

To load a local `gentle-pi` checkout while keeping Osdy Pi's UI authoritative, run:

```bash
osdy-pi gentle setup /absolute/path/to/gentle-pi
```

The command validates that the absolute source is a readable `gentle-pi` package with Gentle's todo and agents extensions before atomically updating `$PI_CODING_AGENT_DIR/settings.json` (or `~/.pi/agent/settings.json`). For a new registration, it places the local package before the first configured Osdy Pi entry, with exclusions for `ask-user-question.ts` and `gentle-agents.ts`, plus `themes: []`. Existing Gentle entries, deliberate filters and resource selections are preserved. Gentle TODO remains eligible by default; an existing explicit Osdy TODO opt-in retains its TODO exclusion and ownership. Restart Pi or run `/reload` after setup.

Gentle Shell intentionally remains fully active underneath Osdy, including its footer and widgets. While Osdy is enabled, Osdy claims the footer and editor; disabling Osdy restores the editor Gentle Shell provided at session startup. Gentle's changes widget may coexist with Osdy's visual widgets.

The default exclusions prevent Gentle's questionnaire and agents extensions from competing with the suite, without selecting Osdy TODO. Pre-existing Gentle TODO exclusions remain unowned and are not erased or treated as opt-in. When explicitly selected, Osdy's session-branch snapshots are authoritative for its `todo` tool and read-only `/todos` command; `pi-subagents-j0k3r` is the subagent system in Joker mode (Gentle agents in Gentle mode) and `@juicesharp/rpiv-ask-user-question` remains the structured-question plugin. This setup does **not** remove an independently installed `@juicesharp/rpiv-todo` package or edit its package entry. Remove that package yourself as described below to avoid duplicate `todo` and `/todos` registrations.

## Explicit TODO selection

```text
/osdy-pi todo on
/osdy-pi todo status
/osdy-pi todo off
```

`on` requires confirmation showing the active `$PI_CODING_AGENT_DIR/settings.json` (otherwise `~/.pi/agent/settings.json`). It atomically saves opt-in and only the necessary `-extensions/gentle-todo.ts` exclusions in the `osdyPiTodoProvider` namespace (`version: 1`, `enabled`, `ownedExclusions`). `off` opts out and removes only exclusions actually added by this selector; pre-existing user/legacy exclusions stay intact. Both preserve unrelated settings and task history. Successful switches notify before reloading; restart Pi if reload fails. Manual settings changes require `/reload` or restart. `status` distinguishes configured selection, actual registration in this runtime and current settings eligibility; legacy filters can leave no provider and are reported rather than repaired silently. `/osdy-pi off` remains visual-only.

Supported scope: active personal, custom or isolated profiles with npm Gentle or validated local packages (absolute, settings-relative, `~/`, `file:`); duplicate entries are checked individually. Project Gentle overrides, malformed/symlink settings, direct-extension settings, unsupported identities and uncertain allowlists refuse activation without writes. Disabled `extensions: []` is never broadened by a negative filter. Startup fails closed if an opted-on profile later gains an unfiltered Gentle source. Startup never writes defaults or infers opt-in from old filters. Only an explicit opt-in runs a bounded read-only Node cwd probe through `pi.exec`; the awaited factory checks the SDK working directory before registering TODO surfaces and fails closed if it cannot obtain a valid cwd. Reordering selector-owned package entries requires resolving ownership before switching; the selector refuses ambiguous restoration.

This is a supported-settings guarantee, not detection of arbitrary CLI/SDK-injected competing tools. SDK-only `agentDir` overrides must also set `PI_CODING_AGENT_DIR`. No project settings, installed packages, task snapshots, credentials or upstream Gentle code are changed. A new isolated setup defaults off and removes only proven selector-owned inherited TODO exclusions before remapping package sources; malformed or ambiguous ownership refuses setup before writes. User/legacy exclusions remain intact. Repeat setup preserves its existing explicit selection and resource filters.

## First-party TODO included starting in 1.5.0

The surfaces below register only after explicit TODO opt-in.

The model-facing `todo` tool supports `create`, `update`, `list`, `get`, `delete`, and `clear`. Tool results carry full task snapshots; Pi's current session branch is the TODO authority. Session switches and compaction replay the latest valid branch snapshot, rather than sharing one project-wide list. `/todos` opens a read-only, grouped modal (pending, in progress, completed) in interactive Pi; scroll with arrow or Page Up/Down keys and close with Esc or q. The refreshed modal adds a completed-task progress meter, theme-aware status groups and a scroll-position footer while keeping every task reachable. It is not an interactive Markdown editor. In non-terminal modes with UI support, it retains notification output. ODD's `odd/tasks/*.md` ledger and Engram are separate orchestration records: there is no automatic sync with these Pi TODOs.

In interactive Pi, the persistent widget appears above the editor while visible tasks exist. Its compact preview shows up to three task rows (excluding heading, overflow hint, and spacer), prioritizes unfinished tasks on overflow, and crosses out completed subjects. In fullscreen Pi, left-click the heading to expand or return to preview; wheel over the expanded widget to move one task at a time beneath the fixed heading. The final task can reach the first task row even in a short dock. A heading-only or hidden dock cannot display tasks; use `/todos` for the full keyboard-accessible list. Regular mode stays compact; Pi's tool-output expansion does not change this widget. `ctrl+shift+t` retains the separate fully collapsed view.

Expansion and scroll position survive same-session refresh, tree navigation, and compaction, with offsets clamped as tasks change. Foreground session replacement and shutdown reset the view; background sessions do not affect it. Task data and `/todos` are unchanged.

### Try session TODO

Run `/osdy-pi todo on` in this checkout (or a package containing the three-task preview), confirm and let Pi reload, then ask the agent to track a task with `todo`, then run `/todos`. The modal shows the entire grouped list with arrow/Page Up/Down scrolling. `maxWidgetLines: 7` permits five task rows in the expanded fullscreen widget; the preview remains capped at three. Smaller budgets also constrain the preview. Fullscreen widget mouse handling uses Pi's public 0.99.1 component APIs.

**Verification to date (not complete):** The user confirmed fullscreen appearance and behavior via `pi:dev`. Automated PTY interaction passed 27 assertions, but fixture cleanup failed and the final task snapshot remains unverified; this was not a full end-to-end pass. Prior feature checks passed 187 extension tests, 60 script tests, typecheck, and lint. A disposable Pi TUI with seeded tasks showed the modal's progress meter, grouped rows, scroll footer, and close behavior. Authenticated RPC turns exercised all six `todo` actions, and an authenticated TUI smoke observed widget and `/todos` updates. An RPC lifecycle check observed an empty new session and the completed task on switching back. Compaction replay remains unverified because Pi returned “Nothing to compact (session too small).” Language switching in the authenticated TODO flow remains unverified (an isolated TUI with both extensions did switch English to Spanish). Visual strikethrough of completed rows in the authenticated TUI remains unverified. Launch under an installed Osdy account profile remains unverified. These checks do not establish full feature parity or validate a published npm artifact.

### TODO configuration and language

Create `$XDG_CONFIG_HOME/rpiv-todo/config.json` (with an absolute `XDG_CONFIG_HOME`); when absent, Osdy falls back to `~/.config/rpiv-todo/config.json`. Invalid JSON uses defaults. For example:

```json
{
  "maxWidgetLines": 7,
  "collapseKey": "ctrl+shift+t",
  "guidance": {
    "promptSnippet": "Track multi-step work",
    "promptGuidelines": ["Update task status as work progresses"]
  }
}
```

`maxWidgetLines` must be a number >= 3 (otherwise 7); it is read on widget renders. `collapseKey` accepts a key combination or `"off"` to disable the shortcut; the shortcut binds at extension load, so restart Pi or run `/reload` after changing it. `guidance.promptSnippet` and `guidance.promptGuidelines` override the tool's model guidance at registration; reload after changing them. The optional `@juicesharp/rpiv-i18n` peer enables nine bundled locales (`de`, `en`, `es`, `fr`, `pt-BR`, `pt`, `ru`, `uk`, `zh`); without the SDK the UI uses English. To use `/languages`, also load its Pi extension (for example, `pi install npm:@juicesharp/rpiv-i18n` in your chosen profile); the peer dependency alone does not register that command. An isolated Pi TUI with both extensions loaded switched the TODO widget and `/todos` from English to Spanish.

**Already installed `@juicesharp/rpiv-todo`?** Both packages can register `todo` and `/todos`. Check `pi list` in the Pi profile you intend to use; to use Osdy's first-party implementation, explicitly remove the standalone package in that same profile:

```bash
pi remove npm:@juicesharp/rpiv-todo
```

For a project-local installation, run `pi remove -l npm:@juicesharp/rpiv-todo` in that project instead. Restart Pi or run `/reload`, then check `/todos` shows session tasks, not a document panel. Osdy never uninstalls another package or silently changes package settings. If you need the standalone package, disable the conflicting extension via Pi package configuration instead.

## OpenAI account profiles

Osdy Pi can keep multiple ChatGPT Plus/Pro accounts authenticated and let you choose which one starts Pi. `personal` and `work` are only examples—you can create as many named profiles as you need.

### Create and use profiles

**In Pi, run `/osdy-account`** to open the complete account manager:

| Action | Behavior |
| --- | --- |
| **Switch** | Waits for idle, safely replaces Pi's canonical auth with the selected profile, and updates active/default together without restarting Pi. |
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

Profile names accept ASCII letters, numbers, and hyphens, up to 63 characters, preserving their spelling (for example, `Personal` or `WORK`). Spaces, paths, and the reserved names `default`, `profiles`, and `auth.json` (in any casing) are rejected. Profile identity is case-insensitive, so names that differ only by casing cannot coexist. `account add` opens a profile for login but does not change the default.

### See and switch the active account

Direct `pi` startup restores the last activated profile label from valid active-account metadata. A valid explicit launcher profile (`OSDY_PI_PROFILE_NAME`) takes precedence. Osdy Pi shows the profile name in the editor:

- **Simple/native editor:** beside the model, for example `gpt-5.6-sol · personal · think high`.
- **Extended/framed editor:** `personal` replaces the `Osdy-Pi` title.
- **No managed profile:** the existing model line and `Osdy-Pi` title remain unchanged.

Label recovery is visual only: it does not switch credentials or change the configured default. Missing, invalid, unreadable, or stale active-account metadata keeps the existing fallback.

`account use <name>` activates the profile in Pi's shared agent directory, saves it as active/default, then starts Pi. Inside Pi, `/osdy-account` waits for active work to finish and swaps the canonical `auth.json` in place; the next request resolves the new account without a spawn, shutdown, session handoff, or restart.

To resume a specific session directly from the terminal:

```bash
osdy-pi account use work -- --session /absolute/path/to/session.jsonl
```

> **Privacy:** each profile keeps a private `auth.json`; Pi runs against its canonical shared `auth.json`. Osdy Pi atomically copies opaque auth files between those private locations only to activate or preserve an account; it never parses, prints, logs, or passes OAuth credentials. Session history, settings, installed packages, and extension resources are shared, so every profile can access that local state. It keeps Pi's canonical `openai-codex` provider and delegates authentication to Pi's built-in `/login` flow.

Account switching is serialized in-process and protected by a private cross-process lock. Osdy Pi accepts only bounded regular auth files, refuses symlink-based auth sources, writes replacements with private permissions, and restores the previous canonical auth and account metadata when activation fails. A separate namespace lock protects concurrent profile creation, rename, and removal. Launchers activate the selected auth before starting Pi while continuing to use the shared agent directory; existing managed-directory links from earlier profile layouts are resolved for compatibility.

### Rename and permanently remove profiles

Use `osdy-pi account rename <old> <new>` to rename an existing inactive profile. If it was the default, its default selection follows the new name.

Use `osdy-pi account remove <name> --confirm <name>` for a non-default profile. This permanently deletes its isolated profile directory. Removing the default additionally requires `--replacement <other>`; the existing, different replacement becomes the default before deletion. A replacement is rejected for non-default removal.

Before rename or removal, close this Pi process when it uses the target and **manually close every other Pi process using that target profile**. Osdy Pi does not scan or stop other processes. Inside Pi, use `/osdy-account` (or `/osdy-account rename` / `remove`); the guided flow shows the active profile but refuses changes to it until you Switch first, asks for a new default when needed, and requires typing the exact profile name. Cancellation changes nothing. Do not start two Pi processes with the same `--session` path.

## What ships

| Area | Included behavior |
| --- | --- |
| Themes | 23 built-in themes, including Osdy, Kanagawa, Dracula, Gruvbox, Nord, Rosé Pine, Daniela Cute, Halloween, Halloween Killer, Catppuccin, Matrix, Lucent Orange, and three Spider-Man-inspired palettes |
| Header and mascot | Independently selectable `osdy-theme`/`neon` headers and `current`/`bts` mascots |
| Messages | Native colored user cards without emojis and plain assistant Markdown with a separate assistant `🦝` row |
| Input | Responsive auto editor by default, with selectable simple Pi-native or extended framed modes |
| Status | Theme-aware Braille spinner and animated working label, responsive footer metrics, dynamic extension statuses, and Codex subscription quota with low-capacity emphasis |
| Local analytics | Four keyboard-selectable pages with shared filters, token charts, estimated cost, and private metadata-only history from new assistant turns |
| Git | Working-tree summary and a centered, filterable diff panel |
| Audio | Optional event sounds on macOS and Windows |

<img width="1280" height="433" alt="Osdy Pi header and editor" src="https://github.com/user-attachments/assets/20c7624d-9ad8-4494-97fb-6b6d81aaf328" />

## Appearance

### Themes

The **1.11.0** release introduced a **23-theme** bundle, including Spider-Man Classic, Miles Morales, and Spider-Verse. Gruvbox Dark, Nord, Rosé Pine base dark, and Daniela Cute were introduced in **1.8.0**; Halloween and Halloween Killer were added in **1.9.0**. To try the themes from a checkout:

1. Run `npm run pi:dev` from a checkout containing these themes, or `/reload` if that checkout is already loaded in Pi.
2. Open `/settings` → **Theme** and select `osdy-pi-spider-man-classic`, `osdy-pi-miles-morales`, `osdy-pi-spider-verse`, or another name below.

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
| `osdy-pi-gruvbox-dark` | [Gruvbox](https://github.com/morhetz/gruvbox#palette) dark palette: warm, retro colors on the medium-contrast background. |
| `osdy-pi-nord` | [Nord](https://www.nordtheme.com/docs/colors-and-palettes) dark palette: cool, restrained Polar Night, Snow Storm, Frost, and Aurora colors. |
| `osdy-pi-rose-pine` | [Rosé Pine](https://rosepinetheme.com/palette/ingredients/) base dark palette: soft colors, not Moon or Dawn. |
| `osdy-pi-daniela-cute` | Daniela Cute: navy panels/export page (`#0B1220`), blue cards (`#111F33`), borders (`#253A55`), blue accents (`#3584E4`), main text (`#D8E2EF`), secondary text (`#93A6BE`), and selection (`#193655`). Distinct status and syntax colors remain; the terminal background remains unchanged. |
| `osdy-pi-halloween` | Pumpkin orange, spectral violet, and lime accents on dark plum panels, with warm text and distinct success/error colors. |
| `osdy-pi-halloween-killer` | Gothic/slasher dark palette: near-black panels, blood-red and violet accents, bone-colored text, and sage success indicators distinct from red errors. |
| `osdy-pi-catppuccin-latte` | Catppuccin Latte light palette. |
| `osdy-pi-catppuccin-frappe` | Catppuccin Frappé dark palette. |
| `osdy-pi-catppuccin-macchiato` | Catppuccin Macchiato dark palette. |
| `osdy-pi-catppuccin-mocha` | Catppuccin Mocha dark palette. |
| `osdy-pi-matrix` | OpenCode Matrix dark palette. |
| `osdy-pi-lucent-orange` | Lucent Orange dark palette with terminal-background passthrough. |
| `osdy-pi-spider-man-classic` | Classic Peter Parker: night-blue panels, red accents, and web-white text, with blue links and distinct green success/yellow warning indicators. |
| `osdy-pi-miles-morales` | Miles Morales: black and charcoal panels with intense red accents, pale text, and distinct green success/yellow warning indicators. |
| `osdy-pi-spider-verse` | Spider-Verse: dark violet panels, red, electric-blue, and magenta highlights, with readable syntax and distinct green success/yellow warning indicators. |

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

Header and mascot choices are independent:

| Element | Choices | Command |
| --- | --- | --- |
| Header | `osdy-theme` (default), `neon` | `/osdy-pi header osdy-theme|neon` |
| Mascot | `current` (default), `bts` | `/osdy-pi mascot current|bts` |

Both commands update the UI immediately. Add `status` instead of a choice to inspect the current selection. Choices persist in the global Osdy Pi settings across reloads and sessions. The old top-level style commands and `classic` header aliases are no longer registered.

In normal mode, the selected header and mascot render side by side. The Neon header derives its highlights from the active theme rather than using one fixed palette. Each mascot keeps its own tone map while its animated edge glow can resolve through theme colors. Header and mascot scaling remain independent, so any combination follows the same responsive layout rules.

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

In the extended framed editor, the active thinking level is rendered in bold in the top-right model metadata so it remains easy to scan.

Small and compact modes trim only fully empty mascot-art and tone-map margins before applying one proportional width-and-height scale; mascot width starts near four-fifths of the available width. The header moves below the mascot as soon as side-by-side width would force the mascot into an additional width-limited reduction. Compact headers retain their source art when it fits and reduce proportionally only when a width or row bound requires it. Compact headers and mascots share a bounded terminal-row budget, so the header is omitted rather than collapsed into an unreadable one-row logo when there is not enough vertical space. The small-mode footer places the model and styled bare thinking level above usage, path/branch, and dynamic extension statuses. Pi Lens's footer status is hidden in small mode, but Pi Lens continues running. Usage includes input/output/cache-read/cache-write tokens, cost, and context. Extension statuses are supplied dynamically by Pi/extensions and may include Osdy Pi, MCP, or LSP; they are not hardcoded.

The enabled state, editor mode, working-tree visibility preference, header, and mascot persist globally across Pi reloads and sessions, shared by all projects. They are saved in `$PI_CODING_AGENT_DIR/extensions/osdy-pi/settings.json`, or `~/.pi/agent/extensions/osdy-pi/settings.json` when `PI_CODING_AGENT_DIR` is unset. Existing settings without the new visual fields safely default to `osdy-theme` and `current`; the former `raccoon` mascot value migrates to `bts`. The selected editor mode and working-tree placement are restored when the terminal moves normal → small → normal.

## Commands

| Group | Command |
| --- | --- |
| Main | `/osdy-pi` |
| Main | `/osdy-pi enable\|disable\|on\|off\|status` |
| Accounts | `/osdy-account` |
| TODO selection | `/osdy-pi todo on\|off\|status` |
| Session TODO (opt-in, starting in 1.5.0) | `/todos` (read-only) |
| Header | `/osdy-pi header osdy-theme\|neon\|status` |
| Mascot | `/osdy-pi mascot current\|bts\|status` |
| Editor | `/osdy-pi editor auto\|extended\|simple\|on\|off\|toggle\|status` |
| Working tree | `/osdy-pi working-tree on\|off\|toggle\|status` |
| Working tree | `/osdy-pi working-tree position top\|bottom\|status` |
| Audio | `/osdy-pi sound setup` |
| Diff | `/osdy-pi diff` |
| Package | `/osdy-pi uninstall` |
| Codex subscription | `/usage` |
| Local usage analytics (starting in 1.10.0) | `/osdy-usage` |

`/osdy-pi uninstall` finds a unique Osdy Pi package in Pi's configured package list and asks you to confirm its exact source and user/project scope before calling Pi's `remove` command. Run it from a trusted project with interactive UI. Git registrations are checked against Pi's host/path identity; a local registration must point to this running extension's package root and have a matching manifest. Ambiguous or changed registrations, unrecognized sources, and cancelled confirmation remove nothing. It removes only the Pi package registration, not Osdy profiles, accounts, the globally installed CLI, or other packages. Restart Pi afterward to unload the extension. If no unique source is found, inspect `pi list` and use `pi remove <source> [-l]` manually.

`/osdy-pi` reports status. `enable` (or `on`) applies the Osdy Pi UI without changing the selected Pi theme; `disable` (or `off`) restores the Gentle Shell or Pi UI captured at session startup while preserving that theme. The enabled state, editor mode, working-tree visibility, and sound configuration persist globally.

### Codex subscription usage

Run `/usage` to open the Codex subscription dashboard for the active managed `openai-codex` profile and model. Press `r` to refresh; `esc` or `q` closes it. The dashboard shows these controls at the bottom.

The main windows are labeled **Session** and **Weekly** (the API/domain remains primary/secondary). Their remaining-capacity bars are full at 100% remaining and empty at 0%; labels use the active theme's bold accent, Session uses the accent fill, Weekly uses `mdLink`, and empty segments are muted. The remaining percentage stays muted above 40%, changes to the theme's warning color at 40% or less, and changes to its error color at 15% or less. The same thresholds apply in the `/usage` dashboard and compact footer/editor quota bars. A double themed frame, section dividers, and spacing separate the display. Detail cards show each duration and relative, local, and UTC reset times. Plan, availability, credits/reset count, and additional buckets appear only when the service supplies them; absent optional values are omitted.

At wide widths, the modal pairs the Session and Weekly detail cards. Below 72 content columns, cards and bars stack and account/model data wraps. The native footer and extended editor also show compact Session/Weekly remaining-capacity bars below model and thinking metadata whenever a current Codex snapshot exists. Wide widths combine those bars; narrow widths stack them. Additional buckets appear only in `/usage`.

Usage loads once when the session starts and refreshes when the modal opens or `r` is pressed; it does not poll. A refresh clears the previous snapshot before authentication resolves, and shutdown clears state, so quota data cannot cross account or profile boundaries.

> **Privacy:** OAuth is resolved only through Pi's `modelRegistry`. Osdy Pi does not read `auth.json`, persist or log credentials, or display account IDs, tokens, response bodies, or endpoint internals in the UI. Requests use a fixed HTTPS endpoint with bounded timeout, response size, and redirects.

### Local usage analytics (starting in 1.10.0)

Run `/osdy-usage` in interactive terminal Pi. **Summary** opens by default; use Tab / Shift+Tab or `1`–`4` to choose a focused page. Period, filters and the loaded snapshot are shared; switching pages resets scroll without reading history or making network requests.

| Page | Content |
| --- | --- |
| `1` Summary | Total tokens, recorded turns, estimated USD and compact timeline |
| `2` Profiles | Every profile's consumption ranking |
| `3` Models | Every provider/model ranking and exact input/output/cache composition of the selection; use `f` to inspect one model |
| `4` History | Timeline and exact local bucket values, timezone and repeated DST hours with UTC offsets |

Narrow terminals stack metrics and wrap names; every group remains reachable by scrolling. Shares use the selected total tokens; bars scale to each ranking's maximum. Loading, stale, scan-limit/warning and unpriced/partial-cost states remain on every page and in help. Sticky status lines wrap instead of concealing cost status behind scan warnings, including at End. When height is scarce, statuses take priority over optional headings, charts and footer controls; the active page remains visible when space permits. Press `?` for methodology and full controls, then `?` again to return. Choosing a page also leaves help without discarding filters.

This is separate from the unchanged `/usage` subscription quota panel. RPC, JSON and print modes receive a short notification instead of charts. The four-page UI passed independent scripted synthetic PTY checks for navigation, shared selection and responsive statuses at 12/32/100 columns, including a five-row terminal. Human visual confirmation and provider-backed capture remain unverified.

| Control | Action |
| --- | --- |
| Tab / Shift+Tab, `1` / `2` / `3` / `4` | Cycle pages with wrap; jump to Summary / Profiles / Models / History |
| `?` | Toggle methodology/control help; `?` returns to the selected page |
| `d` / `w` / `m`, left / right | Local calendar day, Monday-based week or month; previous / next range (not pages) |
| `p` / `v` / `f`, `x` | Cycle profile / provider / model filters; reset filters |
| `r`, arrows / Page Up / Page Down / Home / End | Refresh history; scroll |
| Esc / `q` / Ctrl+C | Close, including from help |

**Collection starts with new assistant turns begun while Osdy is enabled**, after session settings finish loading. `/osdy-pi off` stops collection; `/osdy-pi on` enables it for subsequent turns. Existing history remains viewable while disabled. No old-session import or replay/compaction backfill occurs. Processes without this extension and non-message/background usage (including summaries and cache warming) are not recorded.

**Storage and privacy:** metadata-only private JSONL shards live at `<active agent dir>/extensions/osdy-pi/usage-analytics/`: an absolute `PI_CODING_AGENT_DIR`, otherwise `~/.pi/agent/extensions/osdy-pi/usage-analytics/`. No files are created until an actual append. Same-agent profiles share history; isolated agent directories keep separate histories. Records contain timestamps, session/entry IDs, the selected Codex profile label, actual provider/model, token counts and nullable estimated cost—no prompts, responses, credentials, account IDs or session paths. Analytics never reads auth files. No automatic deletion or retention engine is provided.

Codex labels are snapshotted at turn start, not verified account identities; later switches cannot reattribute that turn. Other providers or missing labels are **unmanaged**. Rename/delete does not rewrite old labels; case-only differences share profile identity. Calendar ranges use the machine's local timezone (shown in the panel), including daylight-saving boundaries.

Costs are Pi's per-message estimates, **not quota, a provider bill, or confirmed spending**. No matching records, entirely unavailable costs and reported zero are distinct states. Partial estimates show the unpriced turn count. Zero-priced models remain zero; absent prices remain unknown. History scans are bounded and prefer recent data, so limited/corrupt coverage warnings mean totals may omit records. Write failures produce generic warnings; subsequent reads report unavailable/incomplete coverage rather than presenting those totals as complete.

## Native message cards

Pi renders the colored user card and assistant Markdown natively. User messages have no emoji; Osdy Pi places a separate `🦝` transcript entry before each assistant response with visible text, not inside message content. Previously saved user `👤` entries remain in session history but render no row on replay. Selecting only the native message keeps its body clean; a wide selection that includes the emoji row copies the emoji too. Assistant markers persist with the session but do not enter model context. Earlier checks on Pi 0.87.1 found that it did not use `assistantMessage*` theme palette keys; these keys alone should not be assumed to create a native assistant card. Osdy does not install a Markdown transformer or change streaming. The current user card colors remain unchanged. Try both roles in your selected theme with `npm run pi:dev`; terminal rendering and selection still need a live visual check. When disabled, Osdy does not add new markers.

## Editor and working indicator

The default `auto` editor mode preserves the responsive behavior: it uses the framed editor when space permits and Pi's native editor on small terminals. Select `simple` for Pi's native editor at every width, or `extended` to request the framed editor explicitly: `/osdy-pi editor auto|extended|simple`. Simple mode actually unmounts the custom editor component rather than hiding it. Small terminals always use Pi's native editor, including when `extended` is selected. The legacy commands remain compatible where feasible: `on` maps to `extended`, `off` maps to `simple`, and `toggle` switches between extended and simple.

In auto or extended mode at a non-small width, the framed editor shows the model and thinking level in its title and session usage in its footer. For an account-profile launch, the left title shows the active profile name instead of `Osdy-Pi`. When the native editor is effective (simple mode or any small terminal), the Osdy footer instead shows model, active profile when present, thinking, and usage rows before its path/branch and status rows. It uses the currently active Pi/Osdy theme palette; no separate editor theme selector exists. Usage covers input, output, cache read, cache write when present, cost, and context. If Pi supports autocomplete, the editor uses Pi's native autocomplete rendering while the completion UI is visible.

While work is active, Osdy Pi shows the original Braille spinner above the editor in the selected theme's accent color. A two-color wave travels across the `Working...` and `Running ...` letters: the current letter uses the active theme's `accent`, the trailing letter uses `warning`, and the rest use `text`. Only the current `accent` letter tries the active theme's bold styling; this is a terminal-dependent visual trial, not a change to font size. The trailing `warning` letter stays plain, as does the accent spinner. The spinner and label update when the theme changes. Osdy Pi hides Pi's built-in working row while enabled to avoid a duplicate indicator.

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

Osdy Pi can play readable `.mp3` or `.wav` files on macOS and Windows. Other platforms safely skip playback. macOS playback requires the system `afplay` command; Windows playback requires `powershell.exe` and the Windows Media Player COM component (`WMPlayer.OCX`).

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

1. Install the checkout's dependencies:

   ```bash
   npm install
   ```

2. Start the local extension:

   ```bash
   npm run pi:dev
   ```

3. Inside Pi, run `/osdy-account`.
4. Choose **Add**, enter a profile name, then choose **Switch** and select it.
5. Without restarting, run `/login` and choose **ChatGPT Plus/Pro (Codex)**.
6. From then on, `npm run pi:dev` starts the default profile automatically. Use `/osdy-account` for every profile-management action.

The terminal interface remains available for recovery and automated testing:

```bash
npm run pi:dev -- account create personal
npm run pi:dev -- account list
npm run pi:dev -- account use personal
npm run pi:dev -- account default personal
npm run pi:dev -- account rename personal private
npm run pi:dev -- account remove private --confirm private
```

`npm run pi:dev` launches `pi -e <absolute repository root>` with `PI_CODING_AGENT_DIR=<absolute repository root>/.pi-dev`. If its `.pi-dev` metadata names a valid profile, it activates that profile's auth before launching Pi and retains `-e <absolute repository root>`. The development `.pi-dev` profile store and the installed Pi profile store are separate. Account commands use this checkout's local launcher, so no global `osdy-pi` link is needed. The development extension root remains loaded after an in-process `/osdy-account` switch. The manual equivalent is:

```bash
PI_CODING_AGENT_DIR="$PWD/.pi-dev" OSDY_PI_DEV_EXTENSION_ROOT="$PWD" pi -e "$PWD"
```

### Control Center manual smoke

From this checkout with dependencies and Pi already available:

```bash
npm run pi:dev -- --no-session
```

This launches `pi` from `PATH`, loads this checkout with `-e`, and uses `.pi-dev` as the Pi agent directory.
The explicit argument bypasses the launcher's default-account activation; Pi's `--no-session` disables session persistence, **not settings writes or provider access**.
An isolated agent directory does **not** make custom audio paths or real provider accounts harmless. Use intentional disposable test profiles/files for profile writes, switches, default confirmations, and audio tests; do not assume an isolated account store makes real credentials safe.

- Open `/osdyConfig` in regular and fullscreen Pi. Check arrows/Home/End/Page Up/Down, Tab or left/right, Enter, and Esc; shrink and restore the terminal, checking both panes remain reachable.
- In disposable settings, change a visual preference, wait for **Saved globally**, close and reopen, then reload/restart to check persistence. Esc does not undo changes; distinguish save/application errors from success.
- Account (manual): with disposable profiles only, check Cancel-first switch/set-default/clear-default confirmations, Esc cancellation, idle switching, and current/default labels. V1 is switch/default only; create/rename/remove stay in `/osdy-account`, login in `/login`.
- Usage (manual): check day/week/month and all/current filters, empty/unavailable/limited states, and explicit refresh. Authenticated quota and post-switch account correctness need an intentionally authorized live provider check; local estimates are not billing.
- Sounds (manual): use disposable readable `.mp3`/`.wav` files to check configure, cancel, clear, and startup-flag precedence. Only choose **Test effective** when playback is intended; actual macOS/Windows playback still needs a live check.

Live TUI appearance, real account switching/authenticated quota, and actual audio playback remain unverified; this checklist is not a recorded pass.

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

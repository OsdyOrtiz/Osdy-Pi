# Osdy Pi

<img width="1857" height="847" alt="image" src="https://github.com/user-attachments/assets/028eeb14-3f43-4f1c-9603-0c55a8d2856d" />

Theme package for [Pi](https://github.com/earendil-works/pi) with the Osdy terminal style: neon pink/purple colors, a custom ASCII header, and a framed editor experience.

Visit the Osdy landing page: [landing-osdy.vercel.app](https://landing-osdy.vercel.app/).

## What you get

- **Dark theme:** `osdy-pi-dark`, enabled by default when the package starts.
- **Light theme:** `osdy-pi-light`, with the same Osdy palette adapted for light terminals.
- **Simple theme:** `osdy-pi-simple`, a blue/red/slate console theme for the full Pi interface.
- **Custom header:** two selectable header styles with responsive status metadata: `osdy-theme` (default) and `classic`.
- **Custom editor:** full-width framed input area with model, thinking, token, cost, and context status.
- **Custom working indicator:** a dedicated working widget/spinner appears above the text box, outside the editor frame.
- **Clean layout:** the built-in working row is hidden while Osdy Pi is enabled to avoid duplicated UI.
- **Optional audio notifications:** configurable `.mp3`/`.wav` files for `completion`, `error`, `permission`, and `question` events on macOS and Windows.

<img width="1280" height="433" alt="image" src="https://github.com/user-attachments/assets/20c7624d-9ad8-4494-97fb-6b6d81aaf328" />

## Install in Pi

Install the published package from npm:

```bash
pi install npm:osdy-pi
```

You can also install it directly from GitHub:

```bash
pi install git:github.com/OsdyOrtiz/Osdy-Pi
```

Then start Pi normally:

```bash
pi
```

Osdy Pi enables the `osdy-pi-dark` theme and custom UI automatically on `session_start`.

## Choose the theme manually

If you only want to switch themes, open Pi settings:

```text
/settings
```

Then select one of these theme names:

```text
osdy-pi-dark
osdy-pi-light
osdy-pi-simple
```

You can also set it in your Pi `settings.json`:

```json
{
  "theme": "osdy-pi-dark"
}
```

Use `osdy-pi-light` if you prefer the light version, or `osdy-pi-simple` if you want the blue/red/slate palette across the whole console.

## Commands

Osdy Pi includes a small command group:

```text
/osdy-pi enable
/osdy-pi disable
/osdy-pi status
/osdy-pi sound setup
/osdy-pi osdy-theme
/osdy-pi classic
/osdy-pi-osdy-theme
/osdy-pi-classic
```

- `enable` applies the dark Osdy theme, custom header, custom editor, and clean layout.
- `disable` restores Pi's built-in header, editor, footer, and working visibility, then switches back to the previous theme or `dark`.
- `status` shows whether the Osdy Pi UI is currently enabled, including the active style.
- `sound setup` opens the guided global sound-setup wizard for audio notifications.
- `osdy-theme` is the default OsdyTheme header with pink, cyan, and purple styling, plus the mascot glow on the right edge.
- `classic` keeps the previous classic header shape with the shared mascot.
- `/osdy-pi-osdy-theme` and `/osdy-pi-classic` are direct aliases.

After changing a local extension, run `/reload` or restart Pi so the updated commands are registered.

## Audio notifications

Osdy Pi can play your own sound files for these product-level events:

- `completion`: the full orchestrator flow finishes and Pi returns control to input.
- `error`: a real tool execution failure occurs during the flow.
- `permission`: reserved for future explicit Pi approval hooks, dormant by default today.
- `question`: reserved for future explicit Pi question hooks, dormant by default today.

Initial audio playback support is implemented for:

- macOS
- Windows

Unsupported platforms fall back safely without crashing Osdy Pi.

### Supported files

Only readable `.mp3` and `.wav` files are accepted.

### Configure sounds

The preferred setup path is the guided Osdy Pi wizard:

```text
/osdy-pi sound setup
```

The wizard:

- walks through `completion`, `error`, `permission`, and `question`;
- lets you keep, replace, clear, or skip each event;
- validates every selected path before save;
- blocks save if any selected file is missing, unreadable, not a regular file, or not `.mp3`/`.wav`;
- stores accepted settings globally at `~/.pi/agent/extensions/osdy-pi/audio-notifications.json` (or `$PI_CODING_AGENT_DIR/extensions/osdy-pi/audio-notifications.json` when that env var is set).

Saved global sound paths apply across restarts and projects that use Osdy Pi.

### Startup flags still work

You can still pass sound paths as Pi flags when starting the session:

```bash
pi \
  --osdy-pi-sound-completion /absolute/path/completion.wav \
  --osdy-pi-sound-error /absolute/path/error.mp3 \
  --osdy-pi-sound-permission /absolute/path/permission.wav \
  --osdy-pi-sound-question /absolute/path/question.wav
```

Precedence is per event:

1. startup flag
2. saved global Osdy Pi setting
3. unconfigured

Notes:

- Empty or omitted flags mean that event does not override the saved global setting.
- Relative startup-flag paths resolve from the current working directory.
- The setup wizard saves normalized absolute paths for global settings.
- `~` expands to your home directory.
- Invalid, unreadable, or unsupported files are skipped at playback time without changing existing UI behavior.
- If a file was valid when saved but later disappears or becomes unreadable, Osdy Pi fails safely and skips playback for that event.
- Audio notifications and sound setup are additive only, they do not change the current header, editor, footer, working indicator, theme, or commands.

## Local install

If you cloned this repository and want to test it locally:

```bash
pi -e .
```

To install it from a local path:

```bash
pi install /absolute/path/to/Osdy-Pi
```

![Osdy Pi preview](https://raw.githubusercontent.com/OsdyOrtiz/Osdy-Pi/main/mapche1.png)

## Package contents

```text
themes/osdy-pi-dark.json
themes/osdy-pi-light.json
themes/osdy-pi-simple.json
extensions/osdy-pi.ts
extensions/osdy-pi/
```

`extensions/osdy-pi.ts` is the package entrypoint. The implementation lives in the modular `extensions/osdy-pi/` folder (runtime, UI, metrics, working controller, animation, border, and formatting helpers).

The Pi manifest is declared in `package.json` through `pi.themes` and `pi.extensions`, so Pi can discover the themes and extension after installation.

## Development

If you are working on the package locally, you can run:

```bash
npm run typecheck
npm run lint
```

## Uninstall or turn off

To temporarily turn off the custom UI inside Pi:

```text
/osdy-pi disable
```

To remove the package completely, use Pi's package management command for installed packages.

## License

MIT

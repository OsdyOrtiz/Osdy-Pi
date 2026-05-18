# Osdy Pi

<img width="1857" height="847" alt="image" src="https://github.com/user-attachments/assets/028eeb14-3f43-4f1c-9603-0c55a8d2856d" />

Theme package for [Pi](https://github.com/earendil-works/pi) with the Osdy terminal style: neon pink/purple colors, a custom ASCII header, and a framed editor experience.

Visit the Osdy landing page: [landing-osdy.vercel.app](https://landing-osdy.vercel.app/).

## What you get

- **Dark theme:** `osdy-pi-dark`, enabled by default when the package starts.
- **Light theme:** `osdy-pi-light`, with the same Osdy palette adapted for light terminals.
- **Simple theme:** `osdy-pi-simple`, a blue/red/slate console theme for the full Pi interface.
- **Custom header:** centered Osdy-Pi ASCII branding with responsive status metadata.
- **Custom editor:** full-width framed input area with model, thinking, token, cost, and context status.
- **Custom working indicator:** a dedicated working widget/spinner appears above the text box, outside the editor frame.
- **Clean layout:** the built-in working row is hidden while Osdy Pi is enabled to avoid duplicated UI.

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
/osdy-pi osdy-theme
/osdy-pi classic
/osdy-pi-osdy-theme
/osdy-pi-classic
```

- `enable` applies the dark Osdy theme, custom header, custom editor, and clean layout.
- `disable` restores Pi's built-in header, editor, footer, and working visibility, then switches back to the previous theme or `dark`.
- `status` shows whether the Osdy Pi UI is currently enabled, including the active style.
- `osdy-theme` is the default OsdyTheme header with pink, cyan, and purple styling.
- `classic` keeps the previous classic header shape.
- `/osdy-pi-osdy-theme` and `/osdy-pi-classic` are direct aliases.

After changing a local extension, run `/reload` or restart Pi so the updated commands are registered.

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

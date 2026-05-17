# Osdy Pi

![Osdy Pi preview](https://raw.githubusercontent.com/OsdyOrtiz/Osdy-Pi/main/mapche1.png)

Theme package for [Pi](https://github.com/earendil-works/pi) with the Osdy terminal style: neon pink/purple colors, a custom ASCII header, and a framed editor experience.

Visit the Osdy landing page: [landing-osdy.vercel.app](https://landing-osdy.vercel.app/).

## What you get

- **Dark theme:** `osdy-pi-dark`, enabled by default when the package starts.
- **Light theme:** `osdy-pi-light`, with the same Osdy palette adapted for light terminals.
- **Custom header:** centered Osdy-Pi ASCII branding with responsive status metadata.
- **Custom editor:** full-width framed input area with model, thinking, token, cost, and context status.
- **Clean layout:** the built-in footer/working row is hidden while Osdy Pi is enabled to avoid duplicated UI.

<img width="1280" height="433" alt="image" src="https://github.com/user-attachments/assets/20c7624d-9ad8-4494-97fb-6b6d81aaf328" />

## Install in Pi

Install the package directly from GitHub:

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
```

You can also set it in your Pi `settings.json`:

```json
{
  "theme": "osdy-pi-dark"
}
```

Use `osdy-pi-light` instead if you prefer the light version.

## Commands

Osdy Pi includes a small command group:

```text
/osdy-pi enable
/osdy-pi disable
/osdy-pi status
```

- `enable` applies the dark Osdy theme, custom header, custom editor, and clean layout.
- `disable` restores Pi's built-in header, editor, footer, and working visibility, then switches back to the previous theme or `dark`.
- `status` shows whether the Osdy Pi UI is currently enabled.

## Local install

If you cloned this repository and want to test it locally:

```bash
pi -e .
```

To install it from a local path:

```bash
pi install /absolute/path/to/Osdy-Pi
```

## Package contents

```text
themes/osdy-pi-dark.json
themes/osdy-pi-light.json
extensions/osdy-pi.ts
```

The Pi manifest is declared in `package.json` through `pi.themes` and `pi.extensions`, so Pi can discover the themes and extension after installation.

## Uninstall or turn off

To temporarily turn off the custom UI inside Pi:

```text
/osdy-pi disable
```

To remove the package completely, use Pi's package management command for installed packages.

## License

MIT

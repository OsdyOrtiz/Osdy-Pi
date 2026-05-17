# osdy-pi

Pi package for the Osdy terminal experience.

## Features

- `osdy-pi-dark` neon pink/purple theme enabled by default on `session_start`.
- `osdy-pi-light` neon pink/purple companion theme included.
- Centered custom Osdy-Pi ASCII header with responsive Git, path, MCP, plugins, AGENTS, extensions, Pi version, and tools status.
- Custom editor with four internal lines by default and smaller responsive fallback.
- Full-width Osdy editor frame with complete top, bottom, and side borders in normal terminal widths.
- Editor border status:
  - top-right: current model and thinking level;
  - bottom-left: input/output/cache tokens, accumulated cost, and context percentage/window.
- Animation disabled.

## Install

Pi packages are not uploaded to a separate Pi registry. They are shared through npm, git, or a local path.

### From npm

After publishing this package to npm:

```bash
pi install npm:osdy-pi
```

### From GitHub

After pushing this package to a GitHub repository:

```bash
pi install git:github.com/<owner>/osdy-pi
```

You can also pin a tag or branch:

```bash
pi install git:github.com/<owner>/osdy-pi@v0.1.0
```

### Local development

To test this package from this repository without installing it permanently:

```bash
pi -e .
```

To install it from a local path:

```bash
pi install /absolute/path/to/osdy-pi
```

## Publishing

### npm

```bash
npm login
npm pack --dry-run
npm publish
```

Then verify with:

```bash
pi install npm:osdy-pi
```

### GitHub

Initialize the repository, commit the package, push it to GitHub, then install it with the `git:` source shown above.

## Commands

```text
/osdy-pi enable
/osdy-pi disable
/osdy-pi status
```

`enable` applies the `osdy-pi-dark` theme, custom header, custom editor, and hides the built-in footer/working row to avoid duplicate status UI.

`disable` restores the built-in header, editor, footer, and working visibility, then switches back to the previously captured theme or `dark`.

## Package resources

The Pi manifest is declared in `package.json`:

- themes: `themes/osdy-pi-dark.json`, `themes/osdy-pi-light.json`
- extension: `extensions/osdy-pi.ts`

## License

MIT

The engine discovers its assets through a Vite glob passed to the `AsciiEngine` constructor. The glob must be eager and resolve to URLs

NOTE: If not using Vite it should be possible to replicate this blob.

```ts
const assets: Record<string, string> = import.meta.glob('./assets/**/*', {
  query: '?url',
  eager: true,
  import: 'default',
})

const engine = new AsciiEngine(container, assets)
```

The engine scans the resulting path → URL map at construction time and picks out the files it recognises by path shape. Everything else in the glob is ignored.

---
## Recognised files

### `engine-settings.toml`

Any file whose path ends with `/engine-settings.toml` is treated as the config file. Only the first match is used.

```
assets/
  engine-settings.toml   ✓ picked up
```

See [[engine-settings]] for configurations

### base.css

Any file whose path ends with `/base.css` is treated as the base game css and loaded in the page during initialization

Use this file to set default values for your [[Adding a Tile Style|custom tile styles]]
Recommendation: Use css variables to simplify theme editing

See [[render/Theming|theming]] for how to write the base css file, it's the same.

### Theme CSS files

Any file whose path contains `/themes/` and ends with `.css` is registered as a theme. The filename (without `.css`) becomes the theme name.

```
assets/
  themes/
    My Theme.css          →  theme name: "My Theme"
    Another.css           →  theme name: "Another"
```

Themes registered this way extend the built-in engine themes and can override them by name. 
See [[render/Theming|theming]] for how to write a theme file.

---
## Recommended structure

```
assets/
  engine-settings.toml
  themes/
    My Theme.css
```

Subdirectory depth doesn't matter — the engine matches by path shape, not by folder level. The following also works:

```
assets/
  config/
    engine-settings.toml
  ui/
    themes/
      My Theme.css
```

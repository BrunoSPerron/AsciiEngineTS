`ThemeManager` registers, stores, and applies color themes at runtime. It is accessible at `engine.renderer.themeManager` after `engine.init()` resolves.

`ThemeManager` extends [[engine/EngineObject|EngineObject]] and is initialized as part of the renderer's `_init()` call.

---

## Runtime API

### `set(name)`

Apply a theme by name. The match is case-insensitive. The transition animates over 250ms via CSS `@property` on the custom color variables.

```ts
engine.renderer.themeManager.set('Midnight')
```

If the name doesn't match any registered theme, the call is silently ignored.

### `getThemeNames()`

Returns the names of all currently registered themes, in registration order.

```ts
const names = engine.renderer.themeManager.getThemeNames() // string[]
```

### `current`

Read-only string. The name of the currently active theme as registered (preserving original casing).

```ts
engine.renderer.themeManager.current // e.g. 'Midnight'
```

---

## How themes are loaded

At `_init()` time `ThemeManager` does two things in order:

1. **User themes** — any `.css` files discovered under a `themes/` folder in the asset glob are registered as URL-based themes. A user theme with the same name as a built-in replaces it.
2. **Engine themes** — built-in themes listed in `engine_themes` (from `engine-settings.toml`) are registered as inline CSS strings.
3. **Initial theme** — `initial_theme` from config is applied.

See [[engine/Assets|Assets]] for how theme files are discovered, and [[engine/engine-settings|engine-settings]] for the `initial_theme` and `engine_themes` config keys.

---

## Registering a theme manually

```ts
engine.renderer.themeManager.register('My Theme', cssString)
```

Pass `true` as the third argument if the second argument is a URL rather than inline CSS:

```ts
engine.renderer.themeManager.register('My Theme', '/themes/my-theme.css', true)
```

Manual registration is typically not needed — themes are discovered automatically from the asset glob.

---

## Writing a theme

See [[render/Theming|Theming]] for the full guide. The short version: a theme is a CSS file that sets CSS variables on `.ascii-game-engine`.

```css
.ascii-game-engine {
  --color-bg: #1a1a2e;
  --color-text: #e0e0e0;
}
```

The two base variables drive everything else. All color variables are declared with `@property` in the engine's base CSS, which makes them animatable — theme transitions are handled entirely by the browser.

---

## Related

- [[render/Theming|Theming]] — CSS variables, built-in themes, tile styles, and writing theme files
- [[engine/Assets|Assets]] — how theme files are discovered from the asset glob
- [[engine/engine-settings|engine-settings]] — `initial_theme` and `engine_themes` config keys
- [[engine/EngineObject|EngineObject]] — base class

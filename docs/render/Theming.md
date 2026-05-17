Themes control the color palette of the engine. Each theme is a CSS file that sets a small set of CSS variables on the `.ascii-engine` root element. Switching themes transitions all colors smoothly.

---

## Creating a theme

Add a `.css` file under a `themes/` folder anywhere in your asset glob. The filename becomes the theme name.

```css
/* assets/themes/My Theme.css */

.ascii-engine {
  --color-bg: #1a1a2e;
  --color-text: #e0e0e0;
}
```

That's the minimum. The two variables `--color-bg` and `--color-text` are the foundation — all other engine colors derive from them by default.

See [[Assets]] for how theme files are discovered and registered.

---

## CSS variables

### Base palette

These two variables define the theme. Set them and everything else adjusts automatically.

| Variable       | Default | Used for                         |
| -------------- | ------- | -------------------------------- |
| `--color-bg`   | `#222`  | Background of the game container |
| `--color-text` | `#bbb`  | Default foreground text          |

### Derived variables

These are computed from the base palette unless you override them explicitly.

| Variable          | Default value       | Used for                               |
| ----------------- | ------------------- | -------------------------------------- |
| `--ui-bg`         | `var(--color-bg)`   | UI panel and menu backgrounds          |
| `--ui-text`       | `var(--color-text)` | UI panel and menu text                 |
| `--selected-bg`   | `var(--ui-text)`    | Highlighted / selected item background |
| `--selected-text` | `var(--ui-bg)`      | Highlighted / selected item text       |
| `--actor-bg`      | `var(--color-bg)`   | Actor cell background                  |
| `--actor-text`    | `var(--color-text)` | Actor glyph color                      |

Override any of these in your theme file to break from the derived defaults:

```css
.ascii-engine {
  --color-bg: #0a174e;
  --color-text: #f5d042;

  --actor-bg: #000000;
  --actor-text: #ffffff;

  --ui-bg: #12352a;
  --ui-text: #f04f4f;
}
```

### Typography

The font size is set once in `base.css` and used throughout. Override it in your theme if needed.

| Variable        | Default            | Description                               |
| --------------- | ------------------ | ----------------------------------------- |
| `--font-size`   | `18px`             | Monospace glyph size                      |
| `--line-height` | `var(--font-size)` | Row height — tied to font size by default |

Changing `--font-size` affects tile metrics. If you do this, be aware that tile width and height are measured from a live DOM element after fonts are ready. The engine handles this, but any hardcoded pixel math in your own code will need to account for it.

---

## Tile styles

Tile styles let you color individual background tiles beyond the theme palette. They are CSS classes applied to `<span>` elements wrapping runs of same-styled tiles in each chunk row.

Define a tile style in your theme file (or any CSS loaded into the page):

```css
.ascii-engine .tile-water {
  color: #adefd1;
  background-color: #00203f;
}
```

The class name must be `tile-` followed by your style name. Apply it to world tiles via:

```ts
engine.world.setTilesStyle('water', [
  [10, 5],
  [11, 5],
  [12, 5],
])
```

To keep tile styles theme-agnostic, reference CSS variables instead of hardcoded colors:

```css
.ascii-engine .tile-highlight {
  color: var(--color-bg);
  background-color: var(--color-text);
}
```

See [[guides/Adding a Tile Style]] for a full walkthrough.

---

## Switching themes at runtime

```ts
engine.renderer.themeManager.set('Midnight')
```

The transition is animated over 250ms

To get the list of available themes:

```ts
engine.renderer.themeManager.getThemeNames() // string[]
```

To read the currently active theme:

```ts
engine.renderer.themeManager.current // string
```

The built-in palette picker menu wires all of this up automatically if you register it:

```ts
escapeMenu.registerPaletteSelect()
```

---

## Setting the default theme

Set `initial_theme` in your config file. The value must match a registered theme name exactly (case-insensitive).

```toml
[game]
initial_theme = "My Theme"
```

If the name doesn't match any registered theme, the call is silently ignored and no theme is applied.

---

## Built-in themes

The engine ships these themes out of the box:

| Name           | Background | Text      |
| -------------- | ---------- | --------- |
| Baby Blue      | `#3f7ca3`  | `#f5e49d` |
| Burgundy Pink  | `#510109`  | `#f4b8c2` |
| Chiffon        | `#0e3a61`  | `#f0e8c2` |
| Copper         | `#2d2926`  | `#ed6f63` |
| Creamy Pink    | `#b1787e`  | `#f3efe4` |
| Deep Sea       | `#00203f`  | `#adefd1` |
| Flamingo       | `#1e3756`  | `#ea8a7a` |
| Flower         | `#2b1760`  | `#fa78be` |
| Grey and Beige | `#323043`  | `#d2ceb1` |
| Linen          | `#646662`  | `#e1ddd5` |
| Midnight       | `#19243a`  | `#7487a2` |
| Old Parchment  | `#a07855`  | `#d4b996` |
| Purple Space   | `#331b3f`  | `#acc7b4` |
| Raspberry      | `#62033a`  | `#c2c97e` |
| Retro Gold     | `#36341d`  | `#daa03d` |
| Saphire Peach  | `#061f42`  | `#e9bcc6` |

A local theme with the same name as a built-in will replace it.

---

## Additional CSS

Your theme file is a full CSS file — it can contain anything beyond variable declarations. Use this to add world layer effects, custom animations, or tile class styles alongside your palette.

```css
.ascii-engine {
  --color-bg: #0a174e;
  --color-text: #f5d042;
}

.ascii-engine .tile-wall {
  color: #ed6f63;
  background-color: #2d2926;
}

.ascii-engine .layer-ui::before {
  content: '';
  position: fixed;
  inset: 0;
  background: radial-gradient(circle, #f5d04255 0 1px, transparent 2px) 0 0 / 24px 24px;
  animation: glitter 1.5s linear infinite;
}

@keyframes glitter {
  50% {
    opacity: 0.25;
  }
  100% {
    top: -24px;
  }
}
```

All selectors should be scoped under `.ascii-engine` to avoid affecting elements outside the game container.

---

## Related

- [[Assets]] — how theme files are discovered from the asset glob
- [[Engine]] — `initial_theme` config key
- [[guides/Adding a Tile Style]] — per-tile CSS styling

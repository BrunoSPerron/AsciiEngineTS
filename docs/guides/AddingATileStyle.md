# Adding a Tile Style

Tile styles let you assign per-cell colors to world tiles without touching engine internals. 

---
## Steps

### 1. Define the CSS class

Add your style to your base css or theme file under `.ascii-engine`. The class name must be `tile-` followed by your style name.

```css
.ascii-engine .tile-water {
  color: #adefd1;
  background-color: #00203f;
}
```

Both `color` and `background-color` are optional — omit either to inherit from the active [[Theming|theme]].

### 2. Set the style on a tile

Assign the style name (without the `tile-` prefix) to the `style` field of a [[Tile]]:

```ts
chunk.tiles[i] = {
  glyph: '~',
  solid: false,
  style: 'water',
}
```

`style` is optional. Leaving it `undefined` renders the tile with no wrapping span, using the theme's default `--color-text` and `--color-bg`.

### 3. Mark the chunk dirty

The renderer only rebuilds a chunk's HTML when `chunk.dirty` is `true`. If you're mutating tiles after initial generation, set it manually:

```ts
chunk.dirty = true
```

Newly created chunks start dirty by default. See [[Chunk]] for chunk lifecycle details.

---

## CSS variable integration

Your tile styles can reference the theme's CSS variables to stay in sync across palette changes:

```css
.ascii-engine .tile-highlight {
  color: var(--color-bg);
  background-color: var(--color-text);
}
```

This inverts the current theme colors, making the style theme-agnostic. See [[Theming]] for the full list of available variables.

---

## Naming conventions

|Style name|Class|Use|
|---|---|---|
|`water`|`tile-water`|Traversable liquid|
|`lava`|`tile-lava`|Hazard terrain|
|`path`|`tile-path`|Navigable floor variant|

- Use lowercase, hyphenated names: `my-style`, not `myStyle` or `MyStyle`
- Names should describe terrain or function, not color: `lava` not `red-floor`

---

## Related

- [[Chunk]] — how tiles are grouped and rendere
- [[Theming]] — CSS variables and theme structure
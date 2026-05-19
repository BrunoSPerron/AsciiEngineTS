Tile styles let you assign per-cell colors to background tiles.

---
## Steps

### 1. Define the CSS class

Add your style to your base.css or theme file under `.ascii-engine`. The class name must be `tile-` followed by your style name.

```css
.ascii-engine .tile-water {
  color: #adefd1;
  background-color: #00203f;
}
```

Technical note: The class is applied using `<span>` elements containing all adjacent glyphs with the same style on each row
### 2. Apply the style to tiles

#### Option A - Use engine methods
 Use `world.setTilesStyle()` to apply a style to one or more world-space positions:

```ts
world.setTilesStyle('water', [
  [10, 5],
  [11, 5],
  [12, 5],
])
```

Any method exposed by the engine handles chunk invalidation automatically, no need to touch `chunk.dirty` directly.
#### Option B - Change the style directly on the tiles
Style can be updated directly on the [[Chunk#Tiles|tile]] but doing so outside [[Chunk#Chunk generation|chunk generation]] requires setting `chunk.dirty = true` to update the html.

---
## CSS variable integration

Your tile styles in `base.css` should reference CSS variables so the themes can easily change them:

```css
.ascii-engine .tile-highlight {
  color: var(--color-bg);
  background-color: var(--color-text);
}
```

This inverts the current theme colors, making the style theme-agnostic. See [[Theming]] for the full list of available variables.

---

## Naming conventions

| Style name | Class        | Use                     |
| ---------- | ------------ | ----------------------- |
| `water`    | `tile-water` | Traversable liquid      |
| `lava`     | `tile-lava`  | Hazard terrain          |
| `path`     | `tile-path`  | Navigable floor variant |

- Use lowercase, hyphenated names: `my-style`, not `myStyle` or `MyStyle`
- Names should describe terrain or function, not color: `lava` not `red-floor`

---

## Related

- [[Chunk]] — how tiles are grouped and rendered
- [[Theming]] — CSS variables and theme structure

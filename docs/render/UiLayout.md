`UILayout` manages the viewport frame and all line-based UI layout. It owns the outer border drawn around the game window, positions [[UILayoutElement#UILayoutElement|UILayoutElements]] within it, and automatically reconciles border intersections into the correct box-drawing glyphs when elements share edges.

Available at `engine.renderer.ui` after engine initialization.

---
## The frame

`UILayout` always draws a double-line box around the full viewport. It redraws automatically on resize. Elements placed near the frame edges will merge their borders with it using the appropriate junction glyphs (`╠`, `╦`, `╬`, etc.).

---
## Creating elements

```ts
const uiEl = new UISelectElement()
const id = this.engine.renderer.ui.addElement({
  w: 40,
  h: 10,
  xPercent: 50,
  yPercent: 100,
})
```

`addElement` returns the assigned index, also set on the element. Hold a reference to one or the other if you need to remove or update it later.

To remove an element:

```ts
engine.renderer.ui.removeElement(uiEl.id)
```

This removes the element from the layout and reconciles.

---
## Positioning

Elements can be positioned in two ways, which can be combined.

### Percent-based (recommended)

`xPercent` and `yPercent` pin the **center** of the element to a percentage of the container dimensions. `x` and `y` are then applied as a tile offset on top of that.

|Value|Meaning|
|---|---|
|`xPercent: 0`|Left edge|
|`xPercent: 50`|Horizontally centered|
|`xPercent: 100`|Right edge|
|`yPercent: 0`|Top edge|
|`yPercent: 50`|Vertically centered|
|`yPercent: 100`|Bottom edge|

```ts
// Centered horizontally, flush to the bottom
engine.renderer.ui.addElement(my_element, {
  w: 30, h: 5, xPercent: 50, yPercent: 100
})

// Top-right corner with a 2-tile inset
engine.renderer.ui.addElement(my_element, {
  w: 20, h: 8, xPercent: 100, yPercent: 0, x: -2, y: 2
})
```

### Absolute

When no percent values are set, `x` and `y` are used directly as the top-left corner in viewport tile coordinates.
### Clamping

Elements are always clamped to the layout bounds. If after clamping the available space is smaller than `minW` / `minH`, the element is hidden rather than clipped.

---
## Sizing

|Property|Description|
|---|---|
|`w`|Width of the interior in tiles. Also the maximum width.|
|`h`|Height of the interior in tiles. Also the maximum height.|
|`minW`|Minimum width. Defaults to `w`.|
|`minH`|Minimum height. Defaults to `h`.|
|`maxWPercent`|Caps width to a percentage of the container.|
|`maxHPercent`|Caps height to a percentage of the container.|

```ts
// At most 80% of the container width, minimum 20 tiles wide
engine.renderer.ui.addElement(myElement, {
  w: 60,
  h: 12,
  minW: 20,
  maxWPercent: 80,
  xPercent: 50,
  yPercent: 50,
})
```

---
## Priority

When two elements overlap, `priority` controls which one's on top

```ts
engine.renderer.ui.addElement(myElement, {
  w: 30, h: 10, xPercent: 50, yPercent: 50, priority: 1
})
```

The frame always sits at the lowest priority (`-Infinity`), so any element border will override it at shared cells.

---
## Related

- [[UILayoutElement]] — `UILayoutElement` and its content API
- [[ThemeManager]] — CSS variables used to style the frame and element borders
- [[engine/Engine|Engine]] — `engine.renderer.ui` access point
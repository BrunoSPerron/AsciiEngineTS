`UILayoutElement` is a managed region within [[UiLayout|UILayout]]. It occupies a rectangular area of the viewport, gets a double-line border drawn around it by `UILayout`, and exposes a DOM element for your content.

---

## Getting a UILayoutElement

Elements are created through `UILayout`, never directly:

```ts
const el = engine.renderer.ui.addElement(myElement, {
  w: 40,
  h: 10,
  xPercent: 50,
  yPercent: 50,
})
```

See [[UiLayout]] for the full positioning and sizing reference.

---

### Config

These are the attribute of the object passed to uiLayout.createElement()
All fields except `w` and `h` are optional.

| Field         | Type     | Default | Description                                                                                                                              |
| ------------- | -------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `w`           | `number` | —       | Interior width in tiles. Also the initial maximum width.                                                                                 |
| `h`           | `number` | —       | Interior height in tiles. Also the initial maximum height.                                                                               |
| `x`           | `number` | `0`     | Tile offset applied to the left edge, or added on top of the percent-based center position when `xPercent` is set.                       |
| `y`           | `number` | `0`     | Tile offset applied to the top edge, or added on top of the percent-based center position when `yPercent` is set.                        |
| `minW`        | `number` | `w`     | Minimum width in tiles. If the element cannot fit at this width, it is hidden.                                                           |
| `minH`        | `number` | `h`     | Minimum height in tiles. If the element cannot fit at this height, it is hidden.                                                         |
| `xPercent`    | `number` | —       | Pins the horizontal center of the element to this percentage of the container width. `0` = left edge, `50` = center, `100` = right edge. |
| `yPercent`    | `number` | —       | Pins the vertical center of the element to this percentage of the container height. `0` = top edge, `50` = center, `100` = bottom edge.  |
| `maxWPercent` | `number` | —       | Caps the resolved width to this percentage of the container width. Applied before clamping to `minW` / `maxW`.                           |
| `maxHPercent` | `number` | —       | Caps the resolved height to this percentage of the container height. Applied before clamping to `minH` / `maxH`.                         |
| `priority`    | `number` | `0`     | Border intersection priority. When two elements share a border cell, the higher priority wins. The frame is always `-Infinity`.          |

---

## Placing content

`UILayoutElement` exposes an `el` property — a plain `HTMLDivElement` sized to the element's interior. Append whatever DOM nodes you need into it.

```ts
const panel = engine.renderer.ui.addElement(myElement, {
  w: 30,
  h: 6,
  xPercent: 50,
  yPercent: 50,
})

const p = document.createElement('p')
p.textContent = 'Hello world'
panel.el.appendChild(p)
```

`el` is already positioned and sized by `UILayout`. You only need to manage its children.

---

## Properties

| Property   | Type             | Description                                                                             |
| ---------- | ---------------- | --------------------------------------------------------------------------------------- |
| `id`       | `number`         | Unique identifier. Use this to remove the element.                                      |
| `el`       | `HTMLDivElement` | Content container. Sized to the interior in pixels.                                     |
| `x`        | `number`         | Top-left column of the interior, in viewport tile coords.                               |
| `y`        | `number`         | Top-left row of the interior, in viewport tile coords.                                  |
| `w`        | `number`         | Interior width in tiles.                                                                |
| `h`        | `number`         | Interior height in tiles.                                                               |
| `hidden`   | `boolean`        | `true` when the element was hidden because it couldn't fit the minimum size. Read-only. |
| `priority` | `number`         | Border intersection priority. Higher wins over lower.                                   |

---

## Lifecycle

### Removal

```ts
engine.renderer.ui.removeElement(panel.id)
```

This removes the border from the layout, reconciles intersections, and calls `destroy()` on the element, which removes `el` from the DOM.

### Resize

`UILayout` calls `reflow()` on every element when the window resizes. The element's `x`, `y`, `w`, and `h` properties are updated, and `el` is repositioned and resized automatically. If you have content that depends on the element's tile dimensions (e.g. a character grid), override `layout()` in a subclass to re-render it after a reflow.

### Subclassing

`UILayoutElement` is designed to be subclassed for content that needs to respond to layout changes.

```ts
import { UILayoutElement, type UISpatialConfig } from 'ascii-engine'
import type { TileMetricsData } from 'ascii-engine'

class StatusBar extends UILayoutElement {
  constructor(config: UISpatialConfig, el: HTMLDivElement, tileMetrics: TileMetricsData) {
    super(config, el, tileMetrics)
  }

  layout(x: number, y: number, w: number, h: number): void {
    super.layout(x, y, w, h)
    this._render()
  }

  destroy(): void {
    // clean up any listeners or timers here
    super.destroy()
  }

  private _render() {
    this.el.textContent = '─'.repeat(this.w)
  }
}
```

`layout()` is called by `UILayout` after every reflow with the resolved tile coordinates and dimensions. Always call `super.layout()` first — it updates `x`, `y`, `w`, `h`, and repositions `el`.

---

## Coordinate reference

All coordinates are in **viewport-local tile grid coordinates** — (0, 0) is the top-left tile inside the frame. The border drawn by `UILayout` sits one tile outside the interior on each side, so an element at `x: 2, y: 2` has its top border at row 1.

---

## Related

- [[UiLayout]] — creates and manages UILayoutElements, handles positioning and border reconciliation
- [[engine/Engine|Engine]] — `engine.renderer.ui` access point

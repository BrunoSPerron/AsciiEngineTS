`UILayoutElement` is a managed region within [[UiLayout|UILayout]]. It occupies a rectangular area of the viewport, gets a double-line border drawn around it by `UILayout`, and exposes a DOM element for your content.

---

## Getting a UILayoutElement

Elements are created through `UILayout`, never directly:

```ts
const el = new MyElement()
engine.renderer.ui.addElement(el, {
  w: 40,
  h: 10,
  xPercent: 50,
  yPercent: 50,
})
```

See [[UiLayout]] for the full positioning and sizing reference.

---

## Subclassing

`UILayoutElement` is designed to be subclassed. Override lifecycle hooks to build content and clean up after yourself. They are called by the engine.

```ts
import { UILayoutElement, type UISpatialConfig } from 'ascii-engine'

class StatusBar extends UILayoutElement {
  private _unlisten: (() => void) | null = null

  onLoad(): void {
    this._render()
    this._unlisten = this.engine.actionManager.onActionKeyDown(() => this._render())
  }

  onResize(): void {
    this._render()
  }

  onUnload(): void {
    this._unlisten?.()
  }

  private _render(): void {
    this.el.textContent = '─'.repeat(this.w)
  }
}
```

---

## Lifecycle hooks

Override any of these in your subclass. All have empty default implementations — call `super` only if you override `layout()` or `destroy()`.

### `onLoad()`

Called once after the element is fully mounted into the layout. `this.engine`, `this.w`, `this.h`, `this.x`, `this.y`, and `this.tileMetrics` are all available. Use this to build DOM content, push an input context, and register listeners.

### `onResize()`

Called after every layout pass — on initial placement and on every window resize. `this.x / y / w / h` already reflect the new values when this fires. Use this to re-render anything that depends on element dimensions.

### `onUnload()`

Called before the element is removed from the layout. Use this to pop input contexts, unsubscribe listeners, and cancel timers. The DOM element is still alive at this point — it is removed in `destroy()` which fires immediately after.

### `layout(x, y, w, h)`

Called by `UILayout` on add and every resize, before `onResize()`. Updates `x / y / w / h`, repositions `this.el`, then calls `onResize()`. Override only if you need the raw resolved coords before `onResize` fires. Always call `super.layout(x, y, w, h)` first.

### `destroy()`

Called by `UILayout` after `onUnload()`. Removes `this.el` from the DOM. Override to add teardown beyond what `onUnload` covers, and always call `super.destroy()`.

---

## Spatial config

These are the fields of the object passed to `engine.renderer.ui.addElement()`. Only `w` and `h` are required.

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
| `maxWPercent` | `number` | —       | Caps the resolved width to this percentage of the container width. Applied before clamping to `minW`.                                    |
| `maxHPercent` | `number` | —       | Caps the resolved height to this percentage of the container height. Applied before clamping to `minH`.                                  |
| `priority`    | `number` | `0`     | Border intersection priority. When two elements share a border cell, the higher priority wins. The frame is always `-Infinity`.          |

---

## Properties

These are available inside lifecycle hooks and at any point after `onLoad()` fires.

| Property      | Type              | Description                                                                             |
| ------------- | ----------------- | --------------------------------------------------------------------------------------- |
| `id`          | `number`          | Unique identifier assigned by `UILayout`. Use this to remove the element.               |
| `el`          | `HTMLDivElement`  | Content container. Sized to the interior in pixels. Append your DOM nodes here.         |
| `engine`      | `AsciiEngine`     | Reference to the engine. Available from `onLoad()` onwards.                             |
| `tileMetrics` | `TileMetricsData` | Current tile pixel dimensions `{ w, h }`. Use for pixel-precise DOM positioning.        |
| `x`           | `number`          | Top-left column of the interior, in viewport tile coords.                               |
| `y`           | `number`          | Top-left row of the interior, in viewport tile coords.                                  |
| `w`           | `number`          | Interior width in tiles.                                                                |
| `h`           | `number`          | Interior height in tiles.                                                               |
| `hidden`      | `boolean`         | `true` when the element was hidden because it couldn't fit the minimum size. Read-only. |
| `priority`    | `number`          | Border intersection priority.                                                           |

---

## Placing content

`el` is already positioned and sized by `UILayout`. Append whatever DOM nodes you need into it.

```ts
onLoad(): void {
  const p = document.createElement('p')
  p.textContent = 'Hello world'
  this.el.appendChild(p)
}
```

For content that needs to fill the full width with a highlighted selection (like a menu list), pad text strings to the element width in characters using `this.w` and `whiteSpace: pre`. This ensures `background-color` fills the full row on selection. See [[UISelectElement]] for a worked example.

---

## Input and context

Elements that capture input should push an input context on `onLoad` and pop it on `onUnload`. This prevents the game from receiving input while the element is active.

```ts
private _contextName = ''
private _unlisten: (() => void) | null = null

onLoad(): void {
  this._contextName = `my_element_${this.id}`
  this.engine.contextManager.pushContext(this._contextName)
  this._unlisten = this.engine.actionManager.onActionKeyDown((action) => {
    if (action === 'pause') this._close()
  })
}

onUnload(): void {
  this._unlisten?.()
  this.engine.contextManager.popContext(this._contextName)
}
```

Using `this.id` in the context name avoids collisions when multiple instances of the same element type are open at once.

---

## Removing an element

Elements can remove themselves or be removed externally.

```ts
// from inside the element
this.engine.renderer.ui.removeElement(this.id)

// from outside
engine.renderer.ui.removeElement(myElement.id)
```

Either way, `onUnload` fires first, then `destroy`. After `destroy`, `this.el` is removed from the DOM.

---

## Coordinate reference

All coordinates are in **viewport-local tile grid coordinates** — `(0, 0)` is the top-left tile inside the frame. The border drawn by `UILayout` sits one tile outside the interior on each side, so an element at `x: 2, y: 2` has its top border at row 1.

---

## Related

- [[UiLayout]] — creates and manages UILayoutElements, handles positioning and border reconciliation
- [[UISelectElement]] — a ready-made select list built on UILayoutElement
- [[input/ContextManager|ContextManager]] — input context stack
- [[engine/Engine|Engine]] — `engine.renderer.ui` access point

`UINode` is a managed region within [[render/UiLayout|UILayout]]. It occupies a rectangular area of the viewport, gets a double-line border drawn around it by `UILayout`, and exposes a DOM element for your content.

`UINode` extends [[engine/EngineObject|EngineObject]], so the full event bus and managed subscription API (`on`, `listen`, etc.) is available inside lifecycle hooks.

---

## Getting a UINode

Elements are created through `UILayout`, never directly:

```ts
const el = new MyElement()
engine.renderer.ui.addElement(el, {
  w: 40,
  h: 10,
  anchorX: 50,
  anchorY: 50,
})
```

See [[render/UiLayout|UILayout]] for the full positioning and sizing reference.

---

## Subclassing

`UINode` is designed to be subclassed. Override lifecycle hooks to build content and clean up after yourself. The engine calls them at the right time.

```ts
import { UINode } from 'ascii-game-engine'

class StatusBar extends UINode {
  loaded(): void {
    this._render()
    // listen() auto-cancels when this element is removed
    this.listen(this.engine.actionManager.onActionKeyDown(() => this._render()))
  }

  resized(): void {
    this._render()
  }

  unloaded(): void {
    // Manual cleanup if needed; listen() subscriptions are handled automatically
  }

  private _render(): void {
    this.el.textContent = '─'.repeat(this.w)
  }
}
```

---

## Lifecycle hooks

Override any of these in your subclass. All have empty default implementations.

### `loaded()`

Called once after the element is fully mounted into the layout. `this.engine`, `this.w`, `this.h`, `this.x`, `this.y`, and `this.tileMetrics` are all available. Use this to build DOM content, push an input context, and register listeners.

Subscriptions registered via `this.listen()` are cancelled automatically when `unloaded()` fires — you don't need to track them manually unless you want early cancellation.

Technical note: `loaded()` is invoked via `queueMicrotask` after `addElement` returns, so it fires after the current task completes. The element is visible and positioned before `loaded()` runs, but input listeners and context pushes take effect on the next microtask.

### `resized()`

Called after every layout pass — on initial placement and on every window resize. `this.x / y / w / h` already reflect the new values when this fires. Use this to re-render anything that depends on element dimensions.

### `unloaded()`

Called before the element is removed from the layout. Any subscriptions registered via `this.listen()` are cancelled automatically after this hook returns. Use this to pop input contexts or cancel subscriptions you need to cancel before the element is gone.

### `layout(x, y, w, h)`

Called by `UILayout` on add and every resize, before `resized()`. Updates `x / y / w / h`, repositions `this.el`, then calls `resized()`. Override only if you need the raw resolved coords before `resized` fires. Always call `super.layout(x, y, w, h)` first.

### `destroy()`

Called by `UILayout` after `unloaded()`. Removes `this.el` from the DOM. Override to add teardown beyond what `unloaded` covers, and always call `super.destroy()`.

---

## Spatial config

These are the fields of the object passed to `engine.renderer.ui.addElement()`. Only `w` and `h` are required.

| Field         | Type                                     | Default                 | Description                                                                                                                              |
| ------------- | ---------------------------------------- | ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `w`           | `number`                                 | —                       | Interior width in tiles. Also the initial maximum width.                                                                                 |
| `h`           | `number`                                 | —                       | Interior height in tiles. Also the initial maximum height.                                                                               |
| `x`           | `number`                                 | `0`                     | Tile offset applied to the left edge, or added on top of the percent-based center position when `anchorX` is set.                        |
| `y`           | `number`                                 | `0`                     | Tile offset applied to the top edge, or added on top of the percent-based center position when `anchorY` is set.                         |
| `minW`        | `number`                                 | `w`                     | Minimum width in tiles. If the element cannot fit at this width, it is hidden.                                                           |
| `minH`        | `number`                                 | `h`                     | Minimum height in tiles. If the element cannot fit at this height, it is hidden.                                                         |
| `anchorX`     | `number`                                 | —                       | Pins the horizontal center of the element to this percentage of the container width. `0` = left edge, `50` = center, `100` = right edge. |
| `anchorY`     | `number`                                 | —                       | Pins the vertical center of the element to this percentage of the container height. `0` = top edge, `50` = center, `100` = bottom edge.  |
| `pivotX`      | `number`                                 | `50` (when anchorX set) | The point on the element that anchorX pins to. `0` = left edge, `50` = center, `100` = right edge.                                       |
| `pivotY`      | `number`                                 | `50` (when anchorY set) | The point on the element that anchorY pins to. `0` = top edge, `50` = center, `100` = bottom edge.                                       |
| `maxWPercent` | `number`                                 | —                       | Caps the resolved width to this percentage of the container width. Applied before clamping to `minW`.                                    |
| `maxHPercent` | `number`                                 | —                       | Caps the resolved height to this percentage of the container height. Applied before clamping to `minH`.                                  |
| `priority`    | `number`                                 | `0`                     | Border intersection priority. When two elements share a border cell, the higher priority wins. The frame is always `-Infinity`.          |
| `dock`        | `'left' \| 'right' \| 'top' \| 'bottom'` | —                       | Pins the element to an edge of the content rect, spanning its full extent. When set, `x/y/anchor*` are ignored.                          |

---

## `addElement` options

`addElement` accepts an optional third argument to control the open animation:

```ts
engine.renderer.ui.addElement(el, spatialConfig) // animated (default)
engine.renderer.ui.addElement(el, spatialConfig, false) // instant, no animation
```

---

## Properties

These are available inside lifecycle hooks and at any point after `loaded()` fires.

| Property      | Type              | Description                                                                             |
| ------------- | ----------------- | --------------------------------------------------------------------------------------- |
| `id`          | `number`          | Unique identifier assigned by `UILayout`. Use this to remove the element.               |
| `el`          | `HTMLDivElement`  | Content container. Sized to the interior in pixels. Append your DOM nodes here.         |
| `engine`      | `AsciiEngine`     | Reference to the engine.                                                                |
| `tileMetrics` | `TileMetricsData` | Current UI tile pixel dimensions `{ w, h }`. Use for pixel-precise DOM positioning.     |
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
loaded(): void {
  const p = document.createElement('p')
  p.textContent = 'Hello world'
  this.el.appendChild(p)
}
```

---

## Input and context

Elements that capture input should push an input context on `loaded` and pop it on `unloaded`. This prevents the game from receiving input while the element is active.

```ts
private _contextName = ''

loaded(): void {
  this._contextName = `my_element_${this.id}`
  this.engine.contextManager.pushContext(this._contextName)

  this.listen(
    this.engine.actionManager.onActionKeyDown((action) => {
      if (action === 'pause') this._close()
    })
  )
}

unloaded(): void {
  this.engine.contextManager.popContext(this._contextName)
  // listen() subscriptions are cancelled automatically after this
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

`removeElement` also accepts an optional second argument to skip the close animation:

```ts
engine.renderer.ui.removeElement(myElement.id, false) // instant, no animation
```

Either way, `unloaded` fires first, then `destroy`. After `destroy`, `this.el` is removed from the DOM.

---

## Coordinate reference

All coordinates are in **viewport-local tile grid coordinates** — `(0, 0)` is the top-left tile inside the frame. The border drawn by `UILayout` sits one tile outside the interior on each side, so an element at `x: 2, y: 2` has its top border at row 1.

---

## Related

- [[engine/EngineObject|EngineObject]] — base class, `listen()` pattern, event bus
- [[render/UiLayout|UILayout]] — creates and manages UINodes, handles positioning and border reconciliation
- [[render/UISelectNode|UISelectNode]] — a ready-made select list built on UINode
- [[input/ContextManager|ContextManager]] — input context stack
- [[engine/Engine|Engine]] — `engine.renderer.ui` access point

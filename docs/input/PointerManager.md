`PointerManager` translates raw pointer events into two parallel streams: **UI events** (cell coordinates in the fixed UI grid) and **world events** (tile coordinates in the scrolling world, accounting for camera position). Like `ActionManager`, it is context-aware and implements `ContextListener`.

Available after `engine.init()` resolves, at `engine.pointerManager`.

---

## Coordinate systems

All callbacks receive pre-converted coordinates — you never deal with raw pixels.

| Stream | X / Y meaning                                                  |
| ------ | -------------------------------------------------------------- |
| UI     | Column / row in the UI grid (origin: top-left of the viewport) |
| World  | World-space tile position, offset by `camera.pos`              |

Hover and click on a UI cell suppresses the world event for that position — UI always takes priority.

---

## UI events

Fired when the cursor is over a cell that has at least one UI node registered in `RendererUI.cellStack`.

### `onUIHover(fn)`

```ts
const unlisten = engine.pointerManager.onUIHover((nodeId, cellX, cellY) => {
  // nodeId: topmost node ID at this cell, or null
  // cellX, cellY: UI grid position
})
```

Fires when the cursor enters a new UI cell. Does **not** repeat while the cursor stays in the same cell.

### `onUIHoverEnd(fn)`

```ts
const unlisten = engine.pointerManager.onUIHoverEnd((nodeId, cellX, cellY) => {
  // fired when the cursor leaves a UI cell
})
```

### `onUIPointerDown(fn)` / `onUIPointerUp(fn)`

```ts
const unlisten = engine.pointerManager.onUIPointerDown((nodeId, cellX, cellY, button) => {
  // button: 0 = left, 1 = middle, 2 = right
})
```

---

## World events

Fired when the cursor is over a position not covered by any UI node.

### `onWorldHover(fn)`

```ts
const unlisten = engine.pointerManager.onWorldHover((wx, wy) => {
  // wx, wy: world-space tile coordinates
})
```

### `onWorldHoverEnd(fn)`

```ts
const unlisten = engine.pointerManager.onWorldHoverEnd((wx, wy) => {})
```

### `onWorldPointerDown(fn)` / `onWorldPointerUp(fn)`

```ts
const unlisten = engine.pointerManager.onWorldPointerDown((wx, wy, button) => {
  if (button === 0) inspect(wx, wy)
})
```

---

## All listeners return an unsubscribe function

```ts
const unlisten = engine.pointerManager.onWorldPointerDown(handler)
// ...
unlisten() // remove the listener
```

---

## Context awareness

Listeners are registered on the **currently active** context. When a new context is pushed:

- `PointerHoverEnd` is emitted into the outgoing context for any currently hovered cell
- When the context is later popped, `PointerHoverStart` is re-emitted into the restored context

This means pointer listeners attached to `root` go silent while a menu context is active, and resume automatically when the menu closes.

See [[input/ContextManager]] for how contexts work.

---

## Pointer leave

When the cursor leaves the game container entirely, both UI and world hover-end events fire and the tracked hover state is cleared. No further events fire until the cursor re-enters.

---

## Lifecycle

`PointerManager` attaches its listeners to the game container element passed at construction. Call `engine.pointerManager.destroy()` (or `engine.destroy()`) to remove them.

---

## Related

- [[input/ContextManager|Context Manager]] — context stack that scopes event delivery
- [[input/ActionManager|Action Manager]] — keyboard counterpart, same context model
- [[engine/Engine|Engine]] — `pointerManager` is available after `init()` resolves

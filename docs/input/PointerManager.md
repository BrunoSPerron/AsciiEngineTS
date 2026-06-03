`PointerManager` translates raw pointer events into two parallel streams: **UI events** (fired from registered UI hit elements) and **world events** (tile coordinates in the scrolling world, accounting for camera position). Like `ActionManager`, it is context-aware and implements `ContextListener`.

Available after `engine.init()` resolves, at `engine.pointerManager`.

---

## Coordinate systems

All world callbacks receive pre-converted tile coordinates — you never deal with raw pixels.

| Stream | X / Y meaning                                     |
| ------ | ------------------------------------------------- |
| UI     | Fired directly from the registered DOM element    |
| World  | World-space tile position, offset by `camera.pos` |

UI elements take pointer priority — while the cursor is over a registered UI element, world events for that position are suppressed.

---

## UI element registration

Use `registerUIElement` to attach pointer handlers to any DOM element. This is the primary way UI components participate in the pointer system — the engine's built-in elements (`UISelectElement` and others) use it internally for their hit zones.

### `registerUIElement(el, handlers)`

Registers pointer handlers on a DOM element and returns a dispose function. The element is tracked in the UI hover set, which suppresses world events while the cursor is over it.

```ts
const dispose = engine.pointerManager.registerUIElement(myEl, {
  hover: () => myEl.classList.add('hovered'),
  hoverEnd: () => myEl.classList.remove('hovered'),
  pointerDown: (button) => {
    if (button === 0) handleClick()
  },
  pointerUp: (button) => {},
})

// Remove all listeners and release the element from the UI hover set:
dispose()
```

All handlers are optional — only provide the ones you need.

| Handler       | Signature                  | Fires when                                     |
| ------------- | -------------------------- | ---------------------------------------------- |
| `hover`       | `() => void`               | Cursor enters the element                      |
| `hoverEnd`    | `() => void`               | Cursor leaves the element                      |
| `pointerDown` | `(button: number) => void` | Pointer button pressed while over the element  |
| `pointerUp`   | `(button: number) => void` | Pointer button released while over the element |

Button values: `0` = left, `1` = middle, `2` = right.

Call `dispose()` whenever the element is removed from the DOM to avoid stale entries in the UI hover set (which would permanently suppress world events).

---

## World events

Fired when the cursor is over a position not covered by any registered UI element.

### `onWorldHover(fn)`

Fires when the cursor enters a new world tile. Does not repeat while the cursor stays in the same tile.

```ts
const unlisten = engine.pointerManager.onWorldHover((wx, wy) => {
  highlightTile(wx, wy)
})
```

### `onWorldHoverEnd(fn)`

Fires when the cursor leaves a world tile.

```ts
const unlisten = engine.pointerManager.onWorldHoverEnd((wx, wy) => {
  clearHighlight(wx, wy)
})
```

### `onWorldPointerDown(fn)` / `onWorldPointerUp(fn)`

```ts
const unlisten = engine.pointerManager.onWorldPointerDown((wx, wy, button) => {
  if (button === 0) inspect(wx, wy)
})
```

All world listeners return an unsubscribe function:

```ts
const unlisten = engine.pointerManager.onWorldPointerDown(handler)
// ...
unlisten()
```

---

## Context awareness

World listeners are registered on the **currently active** context. When a new context is pushed:

- `onWorldHoverEnd` fires into the outgoing context for any currently hovered tile
- When the context is later popped, `onWorldHover` re-fires into the restored context for the same tile

This means world listeners attached to `root` go silent while a menu context is active, and resume automatically when the menu closes.

See [[input/ContextManager]] for how contexts work.

---

## Pointer leave

When the cursor leaves the game container entirely, world hover-end events fire and the tracked hover state is cleared. No further events fire until the cursor re-enters.

---

## Lifecycle

`PointerManager` attaches its listeners to the game container element passed at construction. Call `engine.destroy()` to remove them. You don't need to call it manually.

---

## Related

- [[input/ContextManager|Context Manager]] — context stack that scopes event delivery
- [[input/ActionManager|Action Manager]] — keyboard counterpart, same context model
- [[engine/Engine|Engine]] — `pointerManager` is available after `init()` resolves
- [[render/UINode|UINode]] — uses `registerUIElement` for interactive content

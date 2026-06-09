`UISelectNode` is a ready-made [[UINode]] that renders a keyboard- and pointer-navigable list of options. It supports three display modes depending on the element size and item count, and notifies listeners when the selection changes or is confirmed.

---

## Usage

```ts
const select = new UISelectNode(['New Game', 'Load Game', 'Settings'])
engine.renderer.ui.addElement(select, {
  w: 24,
  h: 5,
  anchorX: 50,
  anchorY: 50,
})

select.on('select', (index) => {
  if (index === -1) return // cancelled
  if (select[index] == 'New Game') this.startNewGame()
  // ...
})
```

`addElement` mounts the element and starts the open animation. The element removes itself from the layout automatically after a confirmed or cancelled selection (see `closeOnSelect`).

---

## Display modes

The mode is resolved automatically from `h` and the number of items. You don't set it directly.

| Mode     | Condition | Behaviour                                                                        |
| -------- | --------- | -------------------------------------------------------------------------------- |
| `list`   | items ≤ h | All items visible; a highlight bar slides to the selected row.                   |
| `roller` | items > h | Vertically scrolling list; the highlight bar stays fixed at the vertical center. |
| `single` | h === 1   | A single line with left/right arrows for cycling through items.                  |

The mode is re-evaluated on every resize, so the same element can switch between modes as the window shrinks.

---

## Sizing

`w` and `h` in the spatial config control the interior dimensions.

`w` should comfortably fit the longest label plus 2 characters of padding. Labels longer than `w - 1` are cropped with a trailing `…`.

`h` controls both the number of visible rows and the mode threshold. Set it to `items.length` for a plain list, or smaller to get a roller. Setting `h` to `1` always produces single-line mode regardless of item count.

```ts
const items = ['Short', 'A much longer option', 'Medium item']
engine.renderer.ui.addElement(select, {
  w: 24, // longest label (20 chars) + padding
  h: items.length,
  anchorX: 50,
  anchorY: 50,
})
```

Elements with `h === 1` and `w < 5` are hidden automatically.

---

## Controls

| Input     | Effect (list / roller)        | Effect (single)         |
| --------- | ----------------------------- | ----------------------- |
| `up`      | Move selection up             | —                       |
| `down`    | Move selection down           | —                       |
| `left`    | —                             | Move selection left     |
| `right`   | —                             | Move selection right    |
| `confirm` | Resolve with current index    | —                       |
| `cancel`  | Resolve with `-1`             | —                       |
| Hover     | Move selection to hovered row | —                       |
| Click     | Confirm hovered row           | Cycle via arrow buttons |

Selection wraps around at both ends in all modes.

`UISelectNode` pushes its own input context on `loaded`, so game input is suppressed while the list is active. The context is popped automatically on close.

---

## Listeners

See [[EngineObject#Event bus]] for more info

### `change`

Fires whenever the highlighted index changes.

```ts
select.on('change', (index) => {
  previewTheme(themes[index])
})
```

Returns an unsubscribe function.

### `select`

Fires once when the user confirms or cancels. `index` is the confirmed 0-based item index, or `-1` on cancellation.

```ts
select.on('select', (index) => {
  switch (index) {
    case 0:
      startNewGame()
      break
    case 1:
      openLoadMenu()
      break
    case -1:
    default:
      break
  }
})
```

Returns an unsubscribe function.

If `closeOnSelect` is `true` (default), the element removes itself before the listener fires.

---

## Properties and methods

| Member            | Type          | Description                                                                                                        |
| ----------------- | ------------- | ------------------------------------------------------------------------------------------------------------------ |
| `currentIndex`    | `number`      | Get or set the highlighted index. Setting it triggers `change` listeners and updates the display.                  |
| `closeOnSelect`   | `boolean`     | When `true` (default), the element removes itself after a confirmed selection or cancellation.                     |
| `suppressOnClose` | `Set<string>` | Action names suppressed in the restored context when the element closes. Defaults to `confirm`, `cancel`, `pause`. |
| `confirm()`       | `void`        | Programmatically confirm the current selection.                                                                    |
| `cancel()`        | `void`        | Programmatically cancel (equivalent to the user pressing `cancel`).                                                |

---

## Implementing `IUSelectInterface`

`UISelectNode` implements [[UISelectBase|IUSelectInterface]]. When writing code that accepts a select element such as a helper that wraps `addPaletteElement` depend on the interface rather than the concrete class so custom implementations can be substituted.

---

## Related

- [[UINode]] — base class, lifecycle hooks, and spatial config reference
- [[UISelectBase|IUSelectInterface]] — the interface `UISelectNode` implements
- [[UiLayout]] — `addElement`, `removeElement`, and layout management
- [[input/ContextManager|ContextManager]] — how input contexts work

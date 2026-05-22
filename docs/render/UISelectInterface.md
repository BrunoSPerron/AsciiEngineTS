`IUSelectInterface` is the public contract shared by [[UISelectElement]] and any custom select implementation. Code that consumes a select element, such as `addPaletteElement` or your own menu helpers should depend on this interface rather than `UISelectElement` directly, so alternate implementations can be substituted.

Lifecycle concerns (`loaded`, `resized`, `unloaded`, `el`, `id`, and so on) are inherited from [[UILayoutElement]] and are intentionally excluded here. If you need those, depend on `UILayoutElement` directly.

---

## Interface

```ts
interface IUSelectInterface {
  currentIndex: number
  closeOnSelect: boolean
  suppressOnClose: Set<string>

  onChange(fn: (index: number) => void): () => void
  onSelect(fn: (index: number) => void): () => void
}
```

---

## Members

### `currentIndex`

The currently highlighted item index. Readable and writable. Setting it triggers `onChange` listeners and updates the display immediately.

```ts
select.currentIndex = 2
```

### `closeOnSelect`

When `true`, the element removes itself from the layout after a confirmed selection or cancellation. Defaults to `true` in `UISelectElement`.

Set to `false` if you want the element to stay open after selection, for example, a persistent settings panel where each selection takes effect without closing the menu.

```ts
const select = new UISelectElement(themes, false) // stays open
select.onChange((index) => themeManager.set(themes[index]))
```

### `suppressOnClose`

A set of action names that are suppressed in the incoming (restored) context when the element closes. This prevents a `confirm` keystroke that closes the menu from also triggering the game action that `confirm` is bound to.

`UISelectElement` defaults to `new Set(['confirm', 'cancel', 'pause'])`. Override it before mounting if your menu uses different actions:

```ts
select.suppressOnClose = new Set(['confirm', 'pause'])
```

---

## Listeners

### `onChange(fn)`

Fires whenever the highlighted index changes. Returns an unsubscribe function.

```ts
const unlisten = select.onChange((index) => {
  preview(index)
})
// later:
unlisten()
```

### `onSelect(fn)`

Fires once when the user confirms or cancels. `index` is the confirmed 0-based item index, or `-1` on cancellation. Returns an unsubscribe function.

```ts
select.onSelect((index) => {
  if (index === -1) return
  applyChoice(index)
})
```

---

## Custom implementations

Implement this interface to create a drop-in replacement for `UISelectElement`. Your class must also extend `UILayoutElement` so it can be passed to `addElement`.

```ts
import { UILayoutElement } from 'ascii-engine'
import type { IUSelectInterface } from 'ascii-engine'

class MyCustomSelect extends UILayoutElement implements IUSelectInterface {
  currentIndex = 0
  closeOnSelect = true
  suppressOnClose = new Set(['confirm', 'cancel', 'pause'])

  onChange(fn: (index: number) => void): () => void { /* ... */ }
  onSelect(fn: (index: number) => void): () => void { /* ... */ }

  loaded(): void { /* build DOM, register listeners */ }
  unloaded(): void { /* clean up */ }
}
```

---

## Related

- [[UISelectElement]] — the built-in implementation
- [[UILayoutElement]] — base class for all layout elements
- [[UiLayout]] — `addElement` and `addPaletteElement`
`UISelectBase` is the abstract base class shared by [[UISelectNode]] and any custom select implementation. Code that consumes a select element such as `addPaletteElement` or your own menu helpers should depend on this class rather than `UISelectNode` directly, so alternate implementations can be substituted.

Lifecycle concerns (`loaded`, `resized`, `unloaded`, `el`, `id`, and so on) from the parent [[UINode]] class are inherited

---

### Class

```ts
abstract class UISelectBase extends UINode {
  abstract currentIndex: number
  closeOnSelect: boolean
  suppressOnClose: Set<string>
}
```

---

### Members

#### `currentIndex`

Abstract. The currently highlighted item index. Readable and writable. Implementations must handle display updates and emit `change` listeners when set.

```ts
export class UISelectNode extends UISelectBase {
  private _currentIndex: number = 0

  set currentIndex(value: number) {
    this._currentIndex = value
    this.myUpdateDisplay()
    this.emit('change', value)
  }
}
```

So it emit as intended on direct assignation

```ts
select.currentIndex = 2
```

#### `closeOnSelect`

When `true`, the element removes itself from the layout after a confirmed selection or cancellation. Defaults to `true`.

Set to `false` if you want the element to stay open after selection, for example a persistent settings panel where each selection takes effect without closing the menu.

```ts
const select = new UISelectNode(themes, false) // stays open
select.on('change', (index) => themeManager.set(themes[index]))
```

#### `suppressOnClose`

A set of action names that are suppressed in the incoming (restored) context when the element closes. This prevents a `confirm` keystroke that closes the menu from also triggering the game action that `confirm` is bound to.

Defaults to `new Set(['confirm', 'cancel', 'pause'])`. Override it before mounting if your menu uses different actions:

```ts
select.suppressOnClose = new Set(['confirm', 'pause'])
```

---

### Custom implementations

Subclass `UISelectBase` to create a drop-in replacement for `UISelectNode`. Implement `currentIndex` and the `UINode` lifecycle hooks.

```ts
import { UISelectBase } from 'ascii-game-engine'

class MyCustomSelect extends UISelectBase {
  private _index = 0

  get currentIndex(): number {
    return this._index
  }

  set currentIndex(value: number) {
    this._index = value
    this.emit('change', value)
    // update display...
  }

  loaded(): void {
    // build DOM, register listeners
  }

  unloaded(): void {
    // clean up
  }
}
```

---

### Related

- [[UISelectNode]] — the built-in implementation
- [[UINode]] — base class for all layout elements
- [[UiLayout]] — `addElement` and `addPaletteElement`

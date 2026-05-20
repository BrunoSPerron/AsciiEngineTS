`ActionManager` translates raw keyboard events into named actions and dispatches them to listeners scoped to the current input context. It implements `ContextListener` so it integrates automatically with the context stack.

Available after `engine.init()` resolves, at `engine.actionManager`.

---

## Bindings

Actions are defined in `engine-settings.toml` under `[bindings]`. Each key is an action name; each value is a list of `KeyboardEvent.code` strings that trigger it.

```toml
[bindings]
pause   = ["Escape"]
confirm = ["Enter", "NumpadEnter", "Space"]
up      = ["KeyW", "ArrowUp", "Numpad7", "Numpad8", "Numpad9"]
down    = ["KeyS", "ArrowDown", "Numpad1", "Numpad2", "Numpad3"]
left    = ["KeyA", "ArrowLeft", "Numpad1", "Numpad4", "Numpad7"]
right   = ["KeyD", "ArrowRight", "Numpad3", "Numpad6", "Numpad9"]
```

Multiple keys can map to the same action. One key can trigger multiple actions if it appears in several lists. Add any action name you need, there is no fixed set beyond the engine defaults.

See [[engine-settings]] for the full default binding table.

---

## Listening for input

### `onActionKeyDown(fn)`

Fires once when an action transitions from un-pressed to pressed. Registered on the currently active context.

```ts
const unlisten = engine.actionManager.onActionKeyDown((action) => {
  if (action === 'confirm') {
    // handle confirm
  }
})

// Remove the listener when done:
unlisten()
```

### `onActionKeyUp(fn)`

Fires once when an action is released.

```ts
const unlisten = engine.actionManager.onActionKeyUp((action) => {
  if (action === 'up') stopMoving()
})
```

Both methods return an unsubscribe function. Call it in `OnUnload()` or when the listener is no longer needed to avoid leaks.

---

## Querying held state

```ts
engine.actionManager.isActionKeyDown('up', 'root') // boolean
```

Returns `true` if the action is currently held **and** the given context is the active one. Useful inside `act()` when you want to read held direction keys without registering a listener.

Tips

---

## Context awareness

Listeners registered via `onActionKeyDown` / `onActionKeyUp` are scoped to whichever context is active at registration time. When a new context is pushed onto the stack:

- any held actions emit a synthetic `keyUp` into the outgoing context
- those same held actions emit a synthetic `keyDown` into the incoming context

This means a listener in the `root` context will not receive events while a menu context is active, and will automatically "re-receive" any held keys when the menu closes.

See [[input/ContextManager|context manager]] for how to push and pop contexts.

---

## Usage inside entities

Register the active context and listeners in `OnLoad()`. Clean the listeners in `OnUnload()`.

```ts
export class PlayerEntity extends Entity {
  private _unlisten: () => void = () => {}
  private _inputCtx: string = ""

  OnLoad(): void {
	this._inputCtx = this.engine.contextManager.active
	
    this._unlisten = this.engine.actionManager.onActionKeyDown((action) => {
      if (action === 'confirm') this.shoot()
    })
  }

  OnUnload(): void {
    this._unlisten()
  }
  
  act(): number {
    if (actionManager.isActionKeyDown('down', this._inputCtx))
      this.pos.y++
      return this._speed
    )
    return 0
  }
}
```

This should only be used for off-turn actions in `act()` you likely want to [[ActionManager#Querying held state|query held states]] instead.

---

## Lifecycle

`ActionManager` attaches event listeners to `window` on construction and removes them in `destroy()`. The engine calls `destroy()` from `engine.destroy()`. You don't need to call it manually.

The manager also clears all held state on `window blur` and `visibilitychange`, so no phantom key-held states accumulate when the tab loses focus.

---

## Related

- [[input/ContextManager|Context Manager]] — context stack that scopes input delivery
- [[engine/engine-settings|engine-settings]] — binding configuration
- [[world/Entity|Entity]] — `OnLoad` / `OnUnload` for registering listeners safely

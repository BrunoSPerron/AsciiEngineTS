`ContextManager` maintains a stack of named modal contexts and a tree of focus zones that together control which input listeners are active at any given moment. Both `ActionManager` and `PointerManager` implement `ContextListener` and respond to these transitions automatically.

Available at `engine.contextManager`.

---

## The active context

The context that currently receives input is determined by the following priority:

1. **Modal stack** — if any modal is on the stack, the topmost name is active.
2. **Focused zone** — if no modals are active and a zone is focused, that zone name is active.
3. **Root** — if neither applies, the active context is `'root'`.

```ts
engine.contextManager.active // string, see above
engine.contextManager.stack // readonly string[] - full modal stack, bottom to top
engine.contextManager.focusedZone // string | null - currently focused zone name
```

---

## Modal API

Modals are named contexts pushed and popped as a stack. The engine's built-in menus push and pop their own contexts automatically. Use this API when building custom overlays.

### `pushContext(name)`

Pushes a context onto the modal stack and notifies all listeners. The pushed name becomes the active context immediately.

```ts
engine.contextManager.pushContext('my-menu')
```

### `popContext(name, suppressActions?)`

Finds the last occurrence of `name` in the modal stack and removes it. Silently no-ops if the name isn't present.

```ts
engine.contextManager.popContext('my-menu')
```

Pass a `Set<string>` of action names as the second argument to suppress those actions from firing in the restored context when the modal closes. This prevents a `confirm` keypress that closes a menu from also triggering the game's `confirm` handler.

```ts
engine.contextManager.popContext('my-menu', new Set(['confirm', 'cancel']))
```

If you push the same name multiple times, each push creates an independent entry. Each must be popped individually.

---

## Zone API

Zones are a tree-structured focus system for non-modal UI — persistent panels, sidebars, form fields, and similar. Unlike modals, zones don't stack; only one zone is focused at a time and focus moves between siblings when `cycle_focus` is triggered (Tab by default).

### `registerZone(name, options?)`

Registers a zone and immediately steals focus. Returns an unregister function that restores focus to the previous zone.

```ts
const unregister = engine.contextManager.registerZone('inventory')
// later:
unregister()
```

Options:

| Option   | Type     | Description                                                                  |
| -------- | -------- | ---------------------------------------------------------------------------- |
| `group`  | `string` | Zones sharing a group cycle together when Tab is pressed.                    |
| `parent` | `string` | The zone that receives focus when this group's Tab cycle climbs up the tree. |

```ts
// A root panel that never cycles out
engine.contextManager.registerZone('game_world')

// Two sidebars that cycle with Tab, returning to game_world when done
engine.contextManager.registerZone('panel_a', { group: 'sidebar', parent: 'game_world' })
engine.contextManager.registerZone('panel_b', { group: 'sidebar', parent: 'game_world' })

// Form fields nested inside panel_b
engine.contextManager.registerZone('field_name', { group: 'form', parent: 'panel_b' })
engine.contextManager.registerZone('field_email', { group: 'form', parent: 'panel_b' })
```

### `focusZone(name)`

Programmatically move focus to a registered zone.

```ts
engine.contextManager.focusZone('panel_a')
```

No-op if the zone is not registered.

### `cycleFocus(direction)`

Cycle focus among siblings in the currently focused zone's group. The engine calls this automatically when the `cycle_focus` action fires (Tab by default), so you rarely need to call it directly.

```ts
engine.contextManager.cycleFocus(1) // forward (Tab)
engine.contextManager.cycleFocus(-1) // backward (Shift+Tab, if bound)
```

- No-op if the focused zone has no group.
- No-op if any modals are on the stack.
- Wraps within the group. When the group has only one member, climbs to the parent zone instead.

---

## Naming conventions

Built-in menus use names like `select_element_<id>` where the id is the panel's numeric node ID, avoiding collisions when multiple menus open sequentially.

For your own contexts, use descriptive names scoped to the feature: `inventory`, `dialogue_npc_42`, `cutscene`.

---

## Related

- [[input/ActionManager|Action Manager]] — scopes keyboard listeners to the active context
- [[input/PointerManager|Pointer Manager]] — scopes pointer listeners to the active context
- [[engine/engine-settings|engine-settings]] — `cycle_focus` binding configuration

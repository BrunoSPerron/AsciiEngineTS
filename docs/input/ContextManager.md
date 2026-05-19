`ContextManager` maintains a stack of named contexts that controls which input listeners are active at any given moment. When a menu opens it pushes a context; when it closes it pops. Both `ActionManager` and `PointerManager` implement `ContextListener` and respond to these transitions automatically.

Available at `engine.contextManager`.

---

## The context stack

The stack always starts with `"root"` at the bottom. The topmost entry is the **active context** — the one that receives keyboard and pointer events.

```
[ "root", "select_menu_3" ]
           ↑ active
```

Pushing a new context suspends the layer below it. Popping restores it. If you push the same name multiple times, each push creates an independent entry that must be popped individually.

---

## Reading the active context

```ts
engine.contextManager.active // string — the topmost context name
engine.contextManager.stack // readonly string[] — full stack, bottom to top
```

---

## Pushing and popping

```ts
engine.contextManager.pushContext('my-menu')
// ... do menu things ...
engine.contextManager.popContext('my-menu')
```

`popContext` finds the **last** occurrence of the given name in the stack and removes it. This is safe to call even if the name is no longer present, it silently does nothing.

The engine's built-in menus (`SelectMenuList`, `SelectMenuRoller`) push and pop their own contexts automatically. You only need to manage contexts manually when building custom overlays.

---

## Naming conventions

Built-in menus use names like `select_menu_<id>` and `roller_menu_<id>` where the id is the panel's numeric node ID. This avoids collisions when multiple menus are opened sequentially.

For your own contexts, use descriptive names scoped to the feature: `inventory`, `dialogue_npc_42`, `cutscene`.

---

## Related

- [[input/ActionManager|Action Manager]] — scopes keyboard listeners to the active context
- [[input/PointerManager|Pointer Manager]] — scopes pointer listeners to the active context

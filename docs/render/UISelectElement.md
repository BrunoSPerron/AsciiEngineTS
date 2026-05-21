`UISelectElement` is a ready-made [[UILayoutElement]] that renders a keyboard- and pointer-navigable list of options. Add it to the layout and `await` its `result` promise to get the selected index.

---

## Usage

```ts
const select = new UISelectElement(['New Game', 'Load Game', 'Settings'])
engine.renderer.ui.addElement(select, {
  w: 24,
  h: 5,
  xPercent: 50,
  yPercent: 50,
})

const chosen = await select.result
// chosen: 0-based index of the confirmed item, or -1 if cancelled
```

`addElement` mounts the element and calls `onLoad` synchronously, so the list is visible immediately. `result` resolves when the user confirms or cancels, at which point the element removes itself from the layout.

---

## Sizing

`w` and `h` in the spatial config control the interior dimensions:

- `w` — should comfortably fit the longest item label plus 2 characters of padding (1 each side). Labels longer than `w - 2` are not truncated but the trailing highlight fill will be shorter than the row.
- `h` — should be at least as tall as the number of items (1 tile per row). Extra height is unused.

```ts
const items = ['Short', 'A much longer option', 'Medium item']
// longest label is 20 chars → w: 24 gives comfortable padding
engine.renderer.ui.addElement(select, { w: 24, h: items.length, xPercent: 50, yPercent: 50 })
```

---

## Controls

|Input|Effect|
|---|---|
|`up`|Move selection up|
|`down`|Move selection down|
|`confirm`|Resolve `result` with index|
|`pause`|Resolve `result` with `-1`|
|Hover|Move selection to hovered row|
|Click|Confirm hovered row|

Selection wraps around at both ends.

`UISelectElement` pushes its own input context on open, so game input is suppressed while the list is active. The context is popped automatically on close.

---

## Result

`result` is a `Promise<number>` set up in the constructor. It resolves with:

- the 0-based index of the confirmed item
- `-1` if the user cancelled (`pause` action or equivalent)

```ts
const chosen = await select.result
if (chosen === -1) return  // cancelled

switch (chosen) {
  case 0: startNewGame(); break
  case 1: openLoadMenu(); break
}
```

The element removes itself from the layout before the promise resolves, so there is no need to call `removeElement` manually.

---

## Related

- [[UILayoutElement]] — base class, lifecycle hooks, and spatial config reference
- [[UiLayout]] — `addElement` and layout management
- [[input/ContextManager|ContextManager]] — how input contexts work
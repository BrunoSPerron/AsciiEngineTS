`AsciiEngine` is the root object of the engine. It owns every subsystem (world, renderer, camera, input, etc...) and coordinates their lifecycle.

---

## Setup

Instantiate the engine with a container element and an asset glob, then call `init()` and `start()`.

```ts
import { AsciiEngine } from 'ascii-engine'

const container = document.querySelector<HTMLDivElement>('#asciiEngine')!

const assets: Record<string, string> = import.meta.glob('./assets/**/*', {
  query: '?url',
  eager: true,
  import: 'default',
})

const engine = new AsciiEngine(container, assets)
await engine.init()

// configure your world, spawn entities, etc.

engine.start()
```

The asset glob is optional. Pass an empty object if you have no local assets.

---

## Lifecycle

### `new AsciiEngine(root, glob?)`

Creates the engine and its subsystems. The DOM structure is built here — a host wrapper and a game container div are appended to `root`. The world, renderer, camera, and context manager are instantiated but not yet configured.

### `await engine.init()`

Loads the config file if one was found in the asset glob (`engine-settings.toml`), waits for fonts to be ready, then finishes initialising the action manager, renderer, and mouse manager. Must be awaited before calling `start()`.

### `engine.start()`

Begins the game loop. Loads the initial chunks around the camera's starting position, snaps the camera to its target, and starts the RAF loop and entity action timers. Call this after you have set up your world and spawned your entities.

### `engine.destroy()`

Tears everything down. Stops the loop, unschedules all entities, destroys the mouse manager, and removes global event listeners. Call this if you're removing the engine from the page.

---

## Pause / unpause

```ts
engine.pause()
engine.unpause()
```

`pause()` suspends all entity action timers, storing the remaining time for each. `unpause()` restores them so entities resume from where they left off rather than getting a full reset. The camera RAF loop continues running during pause so the UI remains responsive.

---

## Auto-suspend

The engine suspends itself automatically when the page is hidden (`visibilitychange`) or the window is minimised (inner width or height = 0). It resumes when the page becomes visible again. You don't need to handle this manually.

---
## Subsystems

Once initialised, subsystems are accessible as properties:

| Property                   | Type             | Description                          |
| -------------------------- | ---------------- | ------------------------------------ |
| `engine.world`             | `World`          | Chunk and entity management          |
| `engine.renderer`          | `Renderer`       | Background, actor, and UI rendering  |
| `engine.renderer.uiLayout` | `UILayout`       | Grid-based UI overlay                |
| `engine.actionManager`     | `ActionManager`  | Keyboard input and action bindings   |
| `engine.mouseManager`      | `MouseManager`   | Mouse events for UI and world layers |
| `engine.contextManager`    | `ContextManager` | Input context stack                  |
| `engine.assets`            | `GameAssets`     | Resolved asset URLs from the glob    |

`actionManager`, `mouseManager`, and `config` are only available after `init()` resolves.

---

## State flags

```ts
// true between pause() and unpause(), or when the game loop is inactive
engine.paused
```

---

## Related

- [[world/Chunk|Chunk]] — chunk loading and generation
- [[world/Entity|Entity]] — entity lifecycle and movement
- [[render/Theming|Theming]] — themes and CSS 

- [[render/UiLayout|UI Layout]] — Default UI, Grid-based overlay
- [[input/ActionManager|Action Manager]] — bindings and input event controller
- [[input/MouseManager|Mouse Manager]] — bindings and mouse input event controller
- [[input/ContextManager|Context Manager]] — input context stack
- [[engine/Assets|Assets]] — game assets

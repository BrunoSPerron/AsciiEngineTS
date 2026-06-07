`AsciiEngine` is the root object of the engine. It owns every subsystem (world, renderer, camera, input, etc.) and coordinates their lifecycle.

---

## Setup

Instantiate the engine with a container element and an [[engine/Assets|asset glob]], then call `init()` and `start()`.

```ts
import { AsciiEngine } from 'ascii-game-engine'

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

The [[engine/Assets|asset glob]] is optional. Pass an empty object if you have no local assets.

---

## Lifecycle

### `new AsciiEngine(root, glob?)`

Creates the engine and instantiates all subsystems. The DOM structure is built here. The world, renderer, camera, context manager, action manager, and pointer manager are all constructed but not yet initialized. Subsystems do not receive the engine reference until `init()` is called.

### `await engine.init()`

Loads the config file if one was found in the asset glob (`engine-settings.toml`), waits for fonts to be ready, then calls `_init(engine)` on every subsystem in dependency order. This is when subsystems wire up their event listeners and become operational. Must be awaited before calling `start()`.

### `engine.start()`

Begins the game loop. Loads the initial chunks around the camera's starting position, snaps the camera to its target, and starts the [[render/Camera|camera]] RAF loop and [[world/Entity|entity]] action timers. Call this after you have set up your world and spawned your entities.

### `engine.destroy()`

Tears everything down. Stops the loop, unschedules all entities, destroys the pointer manager, and removes global event listeners. Call this if you're removing the engine from the page.

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

Once initialized, subsystems are accessible as properties. All subsystems extend [[engine/EngineObject|EngineObject]] and have their engine reference injected during `init()`.

| Property                 | Type             | Description                            |
| ------------------------ | ---------------- | -------------------------------------- |
| `engine.world`           | `World`          | Chunk and entity management            |
| `engine.renderer`        | `Renderer`       | Background, actor, and UI rendering    |
| `engine.renderer.ui`     | `UILayout`       | Grid-based UI overlay management       |
| `engine.renderer.camera` | `Camera`         | Smooth camera with RAF loop            |
| `engine.actionManager`   | `ActionManager`  | Keyboard input and action bindings     |
| `engine.pointerManager`  | `PointerManager` | Pointer events for UI and world layers |
| `engine.contextManager`  | `ContextManager` | Input context stack                    |
| `engine.assets`          | `GameAssets`     | Resolved asset URLs from the glob      |

`actionManager`, `pointerManager`, and `config` are only available after `init()` resolves.

---

## State flags

```ts
// true between pause() and unpause(), or when the game loop is inactive
engine.paused
```

---

## Related

- [[engine/EngineObject|EngineObject]] — base class for all subsystems and entities
- [[world/Chunk|Chunk]] — chunk loading and generation
- [[world/Entity|Entity]] — entity lifecycle and movement
- [[render/Theming|Theming]] — themes and CSS
- [[render/UiLayout|UI Layout]] — default UI, grid-based overlay
- [[input/ActionManager|Action Manager]] — bindings and input event controller
- [[input/PointerManager|Pointer Manager]] — bindings and pointer input event controller
- [[input/ContextManager|Context Manager]] — input context stack
- [[engine/Assets|Assets]] — game assets

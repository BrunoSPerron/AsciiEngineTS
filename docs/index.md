# Documentation for Ascii Engine TS

An ASCII game engine in TypeScript.

---

## Engine

| Page                                        | Description                                                                   |
| ------------------------------------------- | ----------------------------------------------------------------------------- |
| [[engine/Engine\|Engine]]                   | Root object, lifecycle (`init`, `start`, `destroy`), pause, auto-suspend      |
| [[engine/EngineObject\|EngineObject]]       | Base class for all subsystems and entities — event bus, `listen()`, `_init()` |
| [[engine/engine-settings\|engine-settings]] | `engine-settings.toml` reference — all config keys and defaults               |
| [[engine/Assets\|Assets]]                   | Asset discovery via Vite glob — config, CSS, and theme files                  |

---

## World

| Page                     | Description                                                       |
| ------------------------ | ----------------------------------------------------------------- |
| [[world/Entity\|Entity]] | Creating entities, spawning, movement, lifecycle hooks, collision |
| [[world/Chunk\|Chunk]]   | Chunk structure, tile fields, lazy loading, chunk generation      |
| [[world/Region\|Region]] | Logical groupings of chunks                                       |

---

## Input

| Page                                     | Description                                              |
| ---------------------------------------- | -------------------------------------------------------- |
| [[input/ActionManager\|ActionManager]]   | Key bindings, action listeners, held-state queries       |
| [[input/ContextManager\|ContextManager]] | Input context stack; pushing, popping, scoping listeners |
| [[input/PointerManager\|PointerManager]] | World and UI mouse events, coordinate systems            |

---

## Rendering

| Page                                  | Description                                                         |
| ------------------------------------- | ------------------------------------------------------------------- |
| [[render/Theming\|Theming]]           | CSS variables, built-in themes, tile styles, runtime switching      |
| [[render/ThemeManager\|ThemeManager]] | Runtime theme API — `set`, `current`, `getThemeNames`               |
| [[render/UiLayout\|UILayout]]         | Viewport frame, layout elements, positioning, border reconciliation |
| [[render/UINode\|UINode]]             | Content container API, subclassing, resize hook                     |

---

## Guides

| Page                                                | Description                          |
| --------------------------------------------------- | ------------------------------------ |
| [[guides/Adding a Tile Style\|Adding a Tile Style]] | Define and apply per-tile CSS styles |

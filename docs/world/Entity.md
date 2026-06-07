An Entity is a living object in the world: a player, an NPC, a projectile, anything that has a position, acts on a timer, and can move. Entities are the primary unit of gameplay logic in AsciiEngine.

`Entity` extends [[engine/EngineObject|EngineObject]], so the full event bus and managed subscription API (`on`, `listen`, etc.) is available inside lifecycle hooks.

---

## Creating an entity

Subclass `Entity` and override `act()` to define behavior. The constructor takes a glyph, a starting position, and a speed in milliseconds.

```ts
import { Entity, GridVector } from 'ascii-game-engine'

export class Goblin extends Entity {
  act(): number {
    // Move one tile to the right every action
    this.pos.x += 1
    return this.speed // delay until next act(), in ms
  }
}

const goblin = new Goblin('g', new GridVector(10, 10), 500)
```

The return value of `act()` controls how long the engine waits before calling it again. The minimum is clamped to `MIN_ACTION_INTERVAL` (16ms).

---

## Spawning and despawning

Entities must be added to the world through `world.spawnEntity()`. This registers the entity, calls `_init(engine)` on it, then calls `loaded()`, and starts its action timer.

```ts
const goblin = engine.world.spawnEntity(new Goblin('☺', new GridVector(20, 20), 80))
```

`spawnEntity` returns the same entity, typed correctly, so you can hold a reference to it.

To remove an entity, use `world.extractEntity(uid)`. This unschedules it, calls `unloaded()`, removes it from the world, and fires despawn listeners for the renderer to clean up.

---

## Lifecycle hooks

| Method       | When it's called                            |
| ------------ | ------------------------------------------- |
| `loaded()`   | After the entity is added to the world      |
| `unloaded()` | Before the entity is removed from the world |

Use `loaded()` to register input listeners and start any entity-specific logic. Use `unloaded()` to clean up those listeners.

`this.engine` is available in both hooks. Use `this.listen()` to register subscriptions that are automatically cancelled when the entity is extracted.

```ts
export class PlayerEntity extends Entity {
  private _unlisten: () => void = () => {}

  loaded(): void {
    // Listeners registered via this.listen() are cancelled automatically
    // when world.extractEntity() is called.
    this.listen(
      this.engine.actionManager.onActionKeyDown((action) => {
        // handle input
      }),
    )

    // Or store the unsubscribe manually for early cancellation:
    this._unlisten = this.engine.world.on('spawn', (e) => {
      console.log('something spawned near me', e.uid)
    })
  }

  unloaded(): void {
    this._unlisten()
  }
}
```

---

## Movement

Move the entity by mutating `this.pos` inside `act()`. The engine smoothly interpolates the rendered position between `previousPos` and `pos` based on elapsed time and `currentActMs`.

```ts
act(): number {
  this.pos.x += 1
  return this.speed
}
```

`previousPos` is snapshotted automatically before each `act()` call — you don't need to update it manually.

### Collision

The world doesn't enforce collision automatically. Query tile solidity inside `act()` before committing a move:

```ts
act(): number {
  const target = this.engine.world.getTileXY(this.pos.x + 1, this.pos.y)
  if (!target.solid) {
    this.pos.x += 1
  }
  return this.speed
}
```

---

## Properties

| Property       | Type                     | Description                                                                   |
| -------------- | ------------------------ | ----------------------------------------------------------------------------- |
| `uid`          | `number`                 | Unique ID assigned by the world on spawn. `-1` before spawn.                  |
| `glyph`        | `string`                 | The character rendered to represent this entity.                              |
| `pos`          | `GridVector`             | Current world position. Mutate this inside `act()` to move.                   |
| `previousPos`  | `GridVector`             | Position at the start of the current tick. Set automatically.                 |
| `speed`        | `number`                 | Default delay between actions, in milliseconds. Minimum `16`.                 |
| `currentActMs` | `number`                 | Actual delay used for the current tick (may differ from `speed`).             |
| `engine`       | `AsciiEngine`            | Reference to the engine. Available after spawn (inside `loaded()` and later). |
| `el`           | `HTMLDivElement \| null` | The actor's DOM element. Available after spawn.                               |

---

## Move events

Entities emit a `'move'` event after each `act()` call where the position changed. Subscribe with `on('move', fn)` — either from outside the entity or via `listen()` inside it.

```ts
// From outside:
const unlisten = entity.on('move', (e) => {
  console.log(`Entity moved to ${e.pos.x}, ${e.pos.y}`)
})

// Later:
unlisten()
```

```ts
// From inside another EngineObject:
this.listen(entity.on('move', (e) => this._syncPosition(e)))
```

The `'chunkchange'` event fires when the entity crosses a chunk boundary:

```ts
entity.on('chunkchange', (oldChunk, newChunk) => {
  // oldChunk / newChunk may be undefined at world edges
})
```

---

## CSS classes

Entities render as `div.actor` elements. Additional CSS classes can be added and removed at any time:

```ts
entity.addCss('player-one')
entity.removeCss('player-one')
```

Classes passed to `addCss` before spawn (e.g. in the constructor via `this.extraCss.add(...)`) are applied when the actor element is created.

---

## Usage inside entities

Register listeners in `loaded()` and clean them up in `unloaded()` (or use `listen()` for automatic cleanup). Store the active context at load time if you need `isActionKeyDown` to work correctly.

```ts
export class PlayerEntity extends Entity {
  private _inputCtx: string = ''

  loaded(): void {
    this._inputCtx = this.engine.contextManager.active

    this.listen(
      this.engine.actionManager.onActionKeyDown((action) => {
        if (action === 'confirm') this.shoot()
      }),
    )
  }

  act(): number {
    if (this.engine.actionManager.isActionKeyDown('down', this._inputCtx)) {
      this.pos.y++
    }
    return this._speed
  }
}
```

---

## Related

- [[engine/EngineObject|EngineObject]] — base class, event bus, and `listen()` pattern
- [[engine/Engine|Engine]] — lifecycle, pause/unpause, and the action loop

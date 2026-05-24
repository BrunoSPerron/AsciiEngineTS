An Entity is a living object in the world: a player, an NPC, a projectile, anything that has a position, acts on a timer, and can move. Entities are the primary unit of gameplay logic in AsciiEngine.

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

The return value of `act()` controls how long the engine waits before calling it again. The return value minimum is clamped to (16ms). `MIN_ACTION_INTERVAL`

---

## Spawning and despawning

Entities must be added to the world through `world.spawnEntity()`. This registers the entity, calls `loaded()`, and starts its action timer.

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

```ts
export class PlayerEntity extends Entity {
  private _unlisten: () => void = () => {}

  loaded(): void {
    this._unlisten = this.engine.actionManager.onActionKeyDown((action) => {
      // handle input
    })
  }

  unloaded(): void {
    this._unlisten()
  }
}
```

The `engine` property is injected before `loaded()` is called, so it's safe to access `this.engine` inside both hooks.

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

| Property       | Type          | Description                                                       |
| -------------- | ------------- | ----------------------------------------------------------------- |
| `uid`          | `number`      | Unique ID assigned by the world on spawn. `-1` before spawn.      |
| `glyph`        | `string`      | The character rendered to represent this entity.                  |
| `pos`          | `GridVector`  | Current world position. Mutate this inside `act()` to move.       |
| `previousPos`  | `GridVector`  | Position at the start of the current tick. Set automatically.     |
| `speed`        | `number`      | Default delay between actions, in milliseconds. Minimum `32`.     |
| `currentActMs` | `number`      | Actual delay used for the current tick (may differ from `speed`). |
| `engine`       | `AsciiEngine` | Reference to the engine. Available after `unloaded()`.            |

---

## Move listeners

Subscribe to an entity's movement with `onMove()`. The callback fires after each `act()` call where the position changed. Returns an unsubscribe function.

```ts
const unlisten = entity.onMove((e) => {
  console.log(`Entity moved to ${e.pos.x}, ${e.pos.y}`)
})

// Later:
unlisten()
```

You can use it to trigger sound, fog-of-war updates, or any position-dependent logic.

---

## Related

- [[Engine]] — lifecycle, pause/unpause, and the action loop

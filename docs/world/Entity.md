# Entity

An Entity is a living object in the world — a player, an NPC, a projectile, anything that has a position, acts on a timer, and can move. Entities are the primary unit of gameplay logic in AsciiEngine.

---

## Creating an entity

Subclass `Entity` and override `act()` to define behavior. The constructor takes a glyph, a starting position, and a speed in milliseconds.

```ts
import { Entity, GridVector } from 'ascii-engine'

export class Goblin extends Entity {
  act(): number {
    // Move one tile to the right every tick
    this.pos.x += 1
    return this.speed  // delay until next act(), in ms
  }
}

const goblin = new Goblin('g', new GridVector(10, 10), 500)
```

The return value of `act()` controls how long the engine waits before calling it again. Returning `0` skips movement interpolation and schedules the next call immediately (useful for idle states).

---

## Spawning and despawning

Entities must be added to the world through `world.spawnEntity()`. This registers the entity, calls `OnLoad()`, and starts its action timer.

```ts
const hero = engine.world.spawnEntity(new ActionHero('☺', new GridVector(20, 20), 80))
```

`spawnEntity` returns the same entity, typed correctly, so you can hold a reference to it.

To remove an entity, use `world.extractEntity(uid)`. This unschedules it, calls `OnUnload()`, removes it from the world, and fires despawn listeners for the renderer to clean up.

---

## Lifecycle hooks

|Method|When it's called|
|---|---|
|`OnLoad()`|After the entity is added to the world|
|`OnUnload()`|Before the entity is removed from the world|

Use `OnLoad()` to register input listeners and start any entity-specific logic. Use `OnUnload()` to clean up those listeners.

```ts
export class ActionHero extends Entity {
  private _unlisten: () => void = () => {}

  OnLoad(): void {
    this._unlisten = this.engine.actionManager.onActionKeyDown((action) => {
      // handle input
    })
  }

  OnUnload(): void {
    this._unlisten()
  }
}
```

The `engine` property is injected before `OnLoad()` is called, so it's safe to access `this.engine` inside both hooks.

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

|Property|Type|Description|
|---|---|---|
|`uid`|`number`|Unique ID assigned by the world on spawn. `-1` before spawn.|
|`glyph`|`string`|The character rendered to represent this entity.|
|`pos`|`GridVector`|Current world position. Mutate this inside `act()` to move.|
|`previousPos`|`GridVector`|Position at the start of the current tick. Set automatically.|
|`speed`|`number`|Default delay between actions, in milliseconds. Minimum `32`.|
|`currentActMs`|`number`|Actual delay used for the current tick (may differ from `speed`).|
|`engine`|`AsciiEngine`|Reference to the engine. Available after `OnLoad()`.|

---

## Smooth rendering and `visualPosition`

The renderer calls `visualPosition(now)` each frame to compute the interpolated on-screen position between `previousPos` and `pos`. You don't call this directly, but it's what drives smooth motion — the entity visually slides from its old position to its new one over exactly `currentActMs` milliseconds.

Returning a non-standard value from `act()` (e.g. a longer delay for diagonal movement) automatically adjusts the interpolation duration:

```ts
act(): number {
  // Diagonal moves take ~41% longer to preserve visual speed
  const isDiagonal = this._dir.x !== 0 && this._dir.y !== 0
  this.pos.add(this._dir)
  return isDiagonal ? this.speed * 1.414 : this.speed
}
```

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

The camera uses this internally to track its target. You can use it to trigger sound, fog-of-war updates, or any position-dependent logic.

---

## Scheduling

Entities are driven by `setTimeout`-based scheduling. The engine accounts for timer drift, each callback measures how late it fired and subtracts that from the next interval.

|Method|Description|
|---|---|
|`scheduleFirst(delay?)`|Starts the action loop. Called automatically on spawn.|
|`unschedule()`|Stops the loop. Returns remaining ms until the next scheduled tick.|

You generally don't call these directly. The engine calls them during spawn/despawn and pause/unpause.

---

## Setting the camera target

After spawning the player entity, point the camera at it:

```ts
const player = engine.world.spawnEntity(new ActionHero('☺', new GridVector(20, 20), 80))
engine.renderer.camera.target = player
```

The camera will smoothly follow the player from that point on, with the lag controlled by `camera.half_life` in your config.

---

## Related

- [[World]] — spawning, despawning, and querying entities
- [[Engine]] — lifecycle, pause/unpause, and the action loop
- [[guides/AddingATileStyle]] — per-tile styling for the world entities navigate
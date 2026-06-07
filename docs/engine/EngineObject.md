`EngineObject` is the base class for every major object in the engine: subsystems, entities, UI nodes, and so on. It provides three things: a typed event bus, managed subscription tracking, and the engine reference lifecycle.

---

## Engine reference

`EngineObject` holds a lazy reference to the engine that is injected at initialization time, not at construction. Accessing `this.engine` before `_init()` has been called throws.

`_init` is internal, called by the engine when an EngineObject is added.
Calling it a second time will throws.

---

## Event bus

`EngineObject` is generic over an event map. The map is a plain object type whose keys are event names and values are tuples of argument types.

```ts
type MyEvents = {
  ready: []
  changed: [value: number]
}

class MyThing extends EngineObject<MyEvents> {
  doSomething() {
    this.emit('changed', 42)
  }
}
```

### `on(event, fn)`

Subscribe to an event. Returns an unsubscribe function.

```ts
const unlisten = myThing.on('changed', (value) => {
  console.log('changed to', value)
})

// later:
unlisten()
```

### `once(event, fn)`

Subscribe to an event for a single firing. Automatically unsubscribes after the first call.

```ts
myThing.once('ready', () => {
  console.log('ready, and this handler is now gone')
})
```

### `emit(event, ...args)` _(protected)_

Fire an event. Only callable from within the class or subclasses. No-ops after the object is destroyed.

```ts
protected doWork() {
  this.emit('changed', this._value)
}
```

---

## Managed subscriptions

When one `EngineObject` subscribes to events on another, it should use `listen()` to track the subscription. All tracked subscriptions are cancelled automatically when the object is destroyed.

### `listen(unsub)`

Registers an unsubscribe function and returns it. Pass the return value of `on()` directly.

```ts
_init(engine: AsciiEngine) {
  super._init(engine)
  // Automatically cleaned up when this object is destroyed
  this.listen(engine.world.on('spawn', (e) => this._onSpawn(e)))
}
```

`listen()` returns the same unsubscribe function, so you can still cancel early if needed:

```ts
const unlisten = this.listen(someObject.on('event', handler))
// later, before destroy:
unlisten()
```

---

## Lifecycle hooks

| Method                                                     | When it's called                                                |
| ---------------------------------------------------------- | --------------------------------------------------------------- |
| `destroyed()`                                              | Before the object is fully destroyed, listener are still active |
| Note: You're probably looking for [[Entity#Lifecycle hooks | entity "unloaded"]]                                             |

## Usage patterns

### Subsystem

```ts
class MySystem extends EngineObject<MySystemEvents> {
  _init(engine: AsciiEngine) {
    super._init(engine)
    this.listen(this.engine.world.on('spawn', (now) => this._onSpawn(now)))
  }

  private _onSpawn(now: number) {
    // ...
  }
}
```

### Cross-object subscription in Entity

```ts
export class MyEntity extends Entity {
  loaded(): void {
    // entity.listen() auto-cancels when the entity is extracted
    this.listen(
      this.engine.world.on('spawn', (e) => {
        console.log('something spawned', e.uid)
      }),
    )
  }
}
```

---

## Related

- [[world/Entity|Entity]] — extends `EngineObject`, uses `listen()` in `loaded()`
- [[engine/Engine|Engine]] — calls `_init()` on all subsystems during `engine.init()`
- [[render/UINode|UINode]] — extends `EngineObject`, `listen()` available in `loaded()`

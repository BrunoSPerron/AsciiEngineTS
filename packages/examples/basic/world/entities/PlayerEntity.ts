import { Entity, Vector2 } from 'ascii-engine'

//TODO add constant default vectors
const KEY_TO_DIR: Record<string, Vector2> = {
  w: Vector2.UP,
  a: Vector2.LEFT,
  s: Vector2.DOWN,
  d: Vector2.RIGHT,
  ArrowUp: Vector2.UP,
  ArrowLeft: Vector2.LEFT,
  ArrowDown: Vector2.DOWN,
  ArrowRight: Vector2.RIGHT,
  Numpad1: Vector2.DOWN_LEFT,
  Numpad2: Vector2.DOWN,
  Numpad3: Vector2.DOWN_RIGHT,
  Numpad4: Vector2.LEFT,
  Numpad6: Vector2.RIGHT,
  Numpad7: Vector2.UP_LEFT,
  Numpad8: Vector2.UP,
  Numpad9: Vector2.UP_RIGHT,
}

export class PlayerEntity extends Entity {
  private _heldKeys = new Set<string>()
  private _unlistenDown = ''
  private _unlistenUp = ''

  OnLoad(): void {
    const inputManager = this.engine.inputManager
    this._unlistenDown = inputManager.onKeyDown((e) => {
      const key = KEY_TO_DIR[e.code] ? e.code : KEY_TO_DIR[e.key] ? e.key : null
      if (key) this._heldKeys.add(key)
    })
    this._unlistenUp = inputManager.onKeyUp((e) => {
      this._heldKeys.delete(e.code)
      this._heldKeys.delete(e.key)
    })
  }

  OnUnload(): void {
    this.engine.inputManager.unlisten(this._unlistenDown)
    this.engine.inputManager.unlisten(this._unlistenUp)
    this._heldKeys.clear()
  }

  act(): number {
    const d = Vector2.ZERO
    for (const [key, vec] of Object.entries(KEY_TO_DIR)) {
      if (this._heldKeys.has(key)) {
        d.add(vec)
      }
    }
    d.clamp()
    if (d.equal(Vector2.ZERO)) return 0

    d.add(this.pos)
    const target = this.engine.world.getTile(d)
    if (target.solid) return 0

    this.pos = d
    this.emitMove()
    return this.moveSpeed
  }
}

import { Entity, Vector2 } from 'ascii-engine'

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

  private _dir = new Vector2()
  private _targetPos = new Vector2()

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
    this._dir.set(0, 0)

    for (const [key, vec] of Object.entries(KEY_TO_DIR)) {
      if (this._heldKeys.has(key)) {
        this._dir.add(vec)
      }
    }

    this._dir.clamp()
    if (this._dir.equal(Vector2.ZERO)) return 0

    this._targetPos.set(this.pos.x, this.pos.y).add(this._dir)
    const target = this.engine.world.getTile(this._targetPos)

    if (target.solid) {
      const ok = this.resolveDiagonalCollision(this._dir)
      if (!ok) return 0
    }

    this.pos.set(this._targetPos.x, this._targetPos.y)
    this.emitMove()

    return this.speed
  }

  private resolveDiagonalCollision(dir: Vector2): boolean {
    const { x, y } = this.pos
    const w = this.engine.world

    const up = y - 1
    const down = y + 1
    const left = x - 1
    const right = x + 1

    const upTile = () => w.getTileXY(x, up)
    const downTile = () => w.getTileXY(x, down)
    const leftTile = () => w.getTileXY(left, y)
    const rightTile = () => w.getTileXY(right, y)

    this._targetPos.set(x, y)

    if (dir.equal(Vector2.UP_LEFT)) {
      const u = upTile()
      const l = leftTile()
      if (u.solid && !l.solid) this._targetPos.x -= 1
      else if (!u.solid && l.solid) this._targetPos.y -= 1
      else return false
      return true
    }
    if (dir.equal(Vector2.UP_RIGHT)) {
      const u = upTile()
      const r = rightTile()
      if (u.solid && !r.solid) this._targetPos.x += 1
      else if (!u.solid && r.solid) this._targetPos.y -= 1
      else return false
      return true
    }
    if (dir.equal(Vector2.DOWN_LEFT)) {
      const d = downTile()
      const l = leftTile()
      if (d.solid && !l.solid) this._targetPos.x -= 1
      else if (!d.solid && l.solid) this._targetPos.y += 1
      else return false
      return true
    }
    if (dir.equal(Vector2.DOWN_RIGHT)) {
      const d = downTile()
      const r = rightTile()
      if (d.solid && !r.solid) this._targetPos.x += 1
      else if (!d.solid && r.solid) this._targetPos.y += 1
      else return false
      return true
    }
    return false
  }
}

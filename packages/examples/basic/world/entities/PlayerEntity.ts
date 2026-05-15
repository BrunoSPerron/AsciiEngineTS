import { Entity, GridVector } from 'ascii-engine'

const KEY_TO_DIR: Record<string, GridVector> = {
  w: GridVector.UP,
  a: GridVector.LEFT,
  s: GridVector.DOWN,
  d: GridVector.RIGHT,
  ArrowUp: GridVector.UP,
  ArrowLeft: GridVector.LEFT,
  ArrowDown: GridVector.DOWN,
  ArrowRight: GridVector.RIGHT,
  Numpad1: GridVector.DOWN_LEFT,
  Numpad2: GridVector.DOWN,
  Numpad3: GridVector.DOWN_RIGHT,
  Numpad4: GridVector.LEFT,
  Numpad6: GridVector.RIGHT,
  Numpad7: GridVector.UP_LEFT,
  Numpad8: GridVector.UP,
  Numpad9: GridVector.UP_RIGHT,
}

export class PlayerEntity extends Entity {
  private _heldKeys = new Set<string>()
  private _unlistenDown = ''
  private _unlistenUp = ''

  private _dir = new GridVector()
  private _targetPos = new GridVector()

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
    this._dir.setXY(0, 0)

    for (const [key, vec] of Object.entries(KEY_TO_DIR)) {
      if (this._heldKeys.has(key)) {
        this._dir.add(vec)
      }
    }

    this._dir.clamp()
    if (this._dir.equal(GridVector.ZERO)) return 0

    this._targetPos.set(this.pos).add(this._dir)
    const target = this.engine.world.getTile(this._targetPos)

    if (target.solid) {
      const ok = this.resolveDiagonalCollision(this._dir)
      if (!ok) return 0
    }

    this.pos.set(this._targetPos)

    return this.speed
  }

  private resolveDiagonalCollision(dir: GridVector): boolean {
    const { x, y } = this.pos
    const w = this.engine.world

    const upTile = () => w.getTileXY(x, y - 1)
    const downTile = () => w.getTileXY(x, y + 1)
    const leftTile = () => w.getTileXY(x - 1, y)
    const rightTile = () => w.getTileXY(x + 1, y)

    this._targetPos.setXY(x, y)

    if (dir.equal(GridVector.UP_LEFT)) {
      const u = upTile()
      const l = leftTile()
      if (u.solid && !l.solid) this._targetPos.x -= 1
      else if (!u.solid && l.solid) this._targetPos.y -= 1
      else return false
      return true
    }
    if (dir.equal(GridVector.UP_RIGHT)) {
      const u = upTile()
      const r = rightTile()
      if (u.solid && !r.solid) this._targetPos.x += 1
      else if (!u.solid && r.solid) this._targetPos.y -= 1
      else return false
      return true
    }
    if (dir.equal(GridVector.DOWN_LEFT)) {
      const d = downTile()
      const l = leftTile()
      if (d.solid && !l.solid) this._targetPos.x -= 1
      else if (!d.solid && l.solid) this._targetPos.y += 1
      else return false
      return true
    }
    if (dir.equal(GridVector.DOWN_RIGHT)) {
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

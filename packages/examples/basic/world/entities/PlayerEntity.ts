import { Entity, GridVector } from 'ascii-engine'

const ACTION_TO_DIR: Record<string, GridVector> = {
  up: GridVector.UP,
  left: GridVector.LEFT,
  down: GridVector.DOWN,
  right: GridVector.RIGHT,
}

export class PlayerEntity extends Entity {
  private _heldActions = new Set<string>()
  private _unlistenDown: () => void = () => {}
  private _unlistenUp: () => void = () => {}

  private _dir = new GridVector()
  private _targetPos = new GridVector()

  OnLoad(): void {
    const actionManager = this.engine.actionManager

    this._unlistenDown = actionManager.onActionKeyDown((action) => {
      if (action in ACTION_TO_DIR) this._heldActions.add(action)
    })

    this._unlistenUp = actionManager.onActionKeyUp((action) => {
      this._heldActions.delete(action)
    })
  }

  OnUnload(): void {
    this._unlistenDown()
    this._unlistenUp()
    this._heldActions.clear()
  }

  act(): number {
    this._dir.setXY(0, 0)

    for (const [action, vec] of Object.entries(ACTION_TO_DIR)) {
      if (this._heldActions.has(action)) {
        this._dir.add(vec)
      }
    }

    this._dir.clamp()
    if (this._dir.equal(GridVector.ZERO)) return 0

    this._targetPos.set(this.pos).add(this._dir)
    const target = this.engine.world.getTile(this._targetPos)

    if (target.solid && !this.resolveDiagonalCollision(this._dir)) return 0

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

import { Entity, GridVector } from 'ascii-game-engine'

const ACTION_TO_DIR: Record<string, GridVector> = {
  up: GridVector.UP,
  left: GridVector.LEFT,
  down: GridVector.DOWN,
  right: GridVector.RIGHT,
}

export class ActionHero extends Entity {
  private _heldActions = new Set<string>()
  private _unlistenDown: () => void = () => {}
  private _unlistenUp: () => void = () => {}

  private _dir = new GridVector()
  private _targetPos = new GridVector()

  loaded(): void {
    const actionManager = this.engine.actionManager

    // TODO: Use actionManager.isActionKeyDown instead of tracking here
    //   keep the listener for action trigger (on a separate cooldown)
    this._unlistenDown = actionManager.onActionKeyDown((action) => {
      if (action in ACTION_TO_DIR) this._heldActions.add(action)
    })

    this._unlistenUp = actionManager.onActionKeyUp((action) => {
      this._heldActions.delete(action)
    })
  }

  unloaded(): void {
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

    if (target.solid && !this.resolveCollision(this._dir)) return 0

    this.pos.set(this._targetPos)

    if (this.isDiagonal(this._dir)) {
      // GridVector use a simplified 1.5 unit for diagonal distance.
      // This is the actual ratio.
      return this.speed * 1.414
    }
    return this.speed
  }

  private isDiagonal(v: GridVector) {
    return Math.abs(v.x) === 1 && Math.abs(v.y) === 1
  }

  private resolveCollision(dir: GridVector): boolean {
    const { x, y } = this.pos
    const world = this.engine.world

    let a, b
    if (dir.equal(GridVector.UP_LEFT)) {
      a = [x, y - 1]
      b = [x - 1, y]
    } else if (dir.equal(GridVector.UP_RIGHT)) {
      a = [x, y - 1]
      b = [x + 1, y]
    } else if (dir.equal(GridVector.DOWN_LEFT)) {
      a = [x, y + 1]
      b = [x - 1, y]
    } else if (dir.equal(GridVector.DOWN_RIGHT)) {
      a = [x, y + 1]
      b = [x + 1, y]
    } else if (dir.equal(GridVector.UP)) {
      a = [x - 1, y - 1]
      b = [x + 1, y - 1]
    } else if (dir.equal(GridVector.RIGHT)) {
      a = [x + 1, y - 1]
      b = [x + 1, y + 1]
    } else if (dir.equal(GridVector.LEFT)) {
      a = [x - 1, y - 1]
      b = [x - 1, y + 1]
    } else if (dir.equal(GridVector.DOWN)) {
      a = [x - 1, y + 1]
      b = [x + 1, y + 1]
    } else {
      return false
    }

    const aIsSolid = world.getTileXY(a[0], a[1]).solid
    const bIsSolid = world.getTileXY(b[0], b[1]).solid

    if (aIsSolid && !bIsSolid) {
      this._targetPos.setXY(b[0], b[1])
      this._dir.setXY(b[0] - this.pos.x, b[1] - this.pos.y)
    } else if (!aIsSolid && bIsSolid) {
      this._targetPos.setXY(a[0], a[1])
      this._dir.setXY(a[0] - this.pos.x, a[1] - this.pos.y)
    } else return false

    return true
  }
}

import { MIN_ACTION_INTERVAL } from '../../core/constants'
import type { AsciiEngine } from '../../core/Engine'
import { clamp } from '../../util/math'
import { Entity } from './Entity'

const KEY_TO_DIR: Record<string, [number, number]> = {
  w: [0, -1],
  a: [-1, 0],
  s: [0, 1],
  d: [1, 0],
  ArrowUp: [0, -1],
  ArrowLeft: [-1, 0],
  ArrowDown: [0, 1],
  ArrowRight: [1, 0],
  Numpad1: [-1, 1],
  Numpad2: [0, 1],
  Numpad3: [1, 1],
  Numpad4: [-1, 0],
  Numpad6: [1, 0],
  Numpad7: [-1, -1],
  Numpad8: [0, -1],
  Numpad9: [1, -1],
}

export class PlayerUnit extends Entity {
  private _heldKeys = new Set<string>()
  private _unlistenDown = ''
  private _unlistenUp = ''

  scheduleFirst(engine: AsciiEngine): void {
    super.scheduleFirst(engine)
    this._unlistenDown = this.engine.inputManager.onKeyDown((e) => {
      const key = KEY_TO_DIR[e.code] ? e.code : KEY_TO_DIR[e.key] ? e.key : null
      if (key) this._heldKeys.add(key)
    })
    this._unlistenUp = this.engine.inputManager.onKeyUp((e) => {
      this._heldKeys.delete(e.code)
      this._heldKeys.delete(e.key)
    })
  }

  unschedule(): void {
    super.unschedule()
    this.engine.inputManager.unlisten(this._unlistenDown)
    this.engine.inputManager.unlisten(this._unlistenUp)
    this._heldKeys.clear()
  }

  act(): number {
    let dx = 0
    let dy = 0
    for (const [key, [kx, ky]] of Object.entries(KEY_TO_DIR)) {
      if (this._heldKeys.has(key)) {
        dx += kx
        dy += ky
      }
    }
    dx = clamp(Math.sign(dx), -1, 1)
    dy = clamp(Math.sign(dy), -1, 1)

    if (dx === 0 && dy === 0) return MIN_ACTION_INTERVAL

    this.x += dx
    this.y += dy
    this.emitMove()
    return this.moveSpeed
  }
}

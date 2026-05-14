import { MIN_ACTION_INTERVAL } from '../../core/constants'
import { lerp } from '../../math/utils'
import type { AsciiEngine } from '../../core/Engine'
import type { Vector2 } from '../../math/Vector2'

type MoveHandler = (entity: Entity) => void

export class Entity {
  uid = -1
  glyph: string

  pos: Vector2
  previousPos: Vector2

  protected engine!: AsciiEngine

  private _moveSpeed: number = 1000
  private _timeoutId: ReturnType<typeof setTimeout> | null = null
  private _lastActTime: number = performance.now()
  private _nextActDelay: number = 0

  private _moveListeners = new Set<MoveHandler>()

  constructor(glyph: string, pos: Vector2, moveSpeed: number = 0) {
    this.glyph = glyph

    this.pos = pos
    this.previousPos = pos.clone()

    this.moveSpeed = moveSpeed
  }

  public get moveSpeed(): number {
    return this._moveSpeed
  }

  public set moveSpeed(value: number) {
    this._moveSpeed = Math.max(value, MIN_ACTION_INTERVAL)
  }

  /**
   * Interpolated position for smooth rendering, based on wall time.
   */
  public visualPosition(now: number): [number, number] {
    const elapsed = now - this._lastActTime
    const alpha = Math.min(elapsed / this._nextActDelay, 1)
    return [
      lerp(this.previousPos.x, this.pos.x, alpha),
      lerp(this.previousPos.y, this.pos.y, alpha),
    ]
  }

  onMove = (fn: MoveHandler): (() => void) => {
    this._moveListeners.add(fn)
    return () => this._moveListeners.delete(fn)
  }

  OnLoad() {}

  OnUnload() {}

  scheduleFirst(engine: AsciiEngine) {
    if (this._timeoutId !== null) return
    this.engine = engine
    this._schedule(this._moveSpeed)
  }

  private _schedule(delay: number) {
    const scheduledAt = performance.now()
    this._nextActDelay = delay
    this._timeoutId = setTimeout(() => {
      const now = performance.now()
      this._lastActTime = now
      this.previousPos.set(this.pos.x, this.pos.y)

      const next = this.act()
      const clamped = Math.max(next, MIN_ACTION_INTERVAL)
      this._nextActDelay = clamped

      const drift = now - (scheduledAt + delay)
      const corrected = Math.max(clamped - drift, 0)

      this._schedule(corrected)
    }, delay)
  }

  unschedule() {
    if (this._timeoutId !== null) {
      clearTimeout(this._timeoutId)
      this._timeoutId = null
    }
  }

  /**
   * @returns delay until next action, in milliseconds
   */
  act(): number {
    return this._moveSpeed
  }

  protected emitMove() {
    for (const fn of this._moveListeners) fn(this)
  }
}

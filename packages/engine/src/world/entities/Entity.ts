import { MIN_ACTION_INTERVAL } from '../../core/constants'
import { lerp } from '../../math/utils'
import type { AsciiEngine } from '../../core/Engine'
import type { GridVector } from '../../math/GridVector'

type MoveHandler = (entity: Entity) => void

export class Entity {
  uid = -1
  glyph: string

  pos: GridVector
  previousPos: GridVector

  engine!: AsciiEngine

  private _currentActMs: number = MIN_ACTION_INTERVAL
  private _speed: number = 1000
  private _timeoutId: ReturnType<typeof setTimeout> | null = null
  private _lastActTime: number = performance.now()
  private _scheduledAt: number = 0

  private _moveListeners = new Set<MoveHandler>()

  constructor(glyph: string, pos: GridVector, speed: number = 0) {
    this.glyph = glyph

    this.pos = pos
    this.previousPos = pos.clone()

    this._speed = speed
    this.currentActMs = this._speed
  }

  public get currentActMs(): number {
    return this._currentActMs
  }

  public set currentActMs(value: number) {
    this._currentActMs = Math.max(value, MIN_ACTION_INTERVAL)
  }

  public get speed(): number {
    return this._speed
  }

  public set speed(value: number) {
    this._speed = Math.max(value, MIN_ACTION_INTERVAL)
  }

  /**
   * Interpolated position for smooth rendering, based on wall time.
   */
  public visualPosition(now: number): [number, number] {
    const elapsed = now - this._lastActTime
    const alpha = Math.min(elapsed / this.currentActMs, 1)
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

  scheduleFirst(delay: number = -1) {
    if (this._timeoutId !== null) return
    if (delay < 0) delay = this._speed
    this._schedule(delay)
  }

  private _schedule(delay: number) {
    this._scheduledAt = performance.now()
    this.currentActMs = delay

    this._timeoutId = setTimeout(() => {
      const now = performance.now()
      this._lastActTime = now
      this.previousPos.setXY(this.pos.x, this.pos.y)

      this.currentActMs = this.act()
      if (!this.pos.equal(this.previousPos)) {
        this._emitMove()
      }

      const drift = now - (this._scheduledAt + delay)
      const corrected = Math.max(this.currentActMs - drift, 0)

      this._schedule(corrected)
    }, delay)
  }

  unschedule(): number {
    if (this._timeoutId === null) return 0

    clearTimeout(this._timeoutId)
    this._timeoutId = null

    const now = performance.now()
    const remaining = Math.max(this._scheduledAt + this.currentActMs - now, 0)

    return remaining
  }

  /**
   * @returns delay until next action, in milliseconds
   */
  act(): number {
    return this._speed
  }

  private _emitMove() {
    for (const fn of this._moveListeners) fn(this)
  }
}

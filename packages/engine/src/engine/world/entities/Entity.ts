import { MIN_ACTION_INTERVAL } from '../../core/constants'
import { lerp } from '../../util/math'
import type { AsciiEngine } from '../../core/Engine'

type MoveHandler = (entity: Entity) => void

export class Entity {
  uid = -1
  glyph: string

  x: number
  y: number

  prevX: number
  prevY: number

  protected engine!: AsciiEngine

  private _moveSpeed: number = 1000
  private _timeoutId: ReturnType<typeof setTimeout> | null = null
  private _lastActTime: number = performance.now()
  private _nextActDelay: number = 0

  private _moveListeners: Set<MoveHandler> = new Set()

  constructor(glyph: string, x: number, y: number, moveSpeed: number = 0) {
    this.glyph = glyph

    this.x = x
    this.y = y
    this.prevX = x
    this.prevY = y

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
    return [lerp(this.prevX, this.x, alpha), lerp(this.prevY, this.y, alpha)]
  }

  public onMove(handler: MoveHandler): () => void {
    this._moveListeners.add(handler)
    return () => this._moveListeners.delete(handler)
  }

  protected emitMove() {
    for (const fn of this._moveListeners) fn(this)
  }

  OnLoad() {}

  OnUnload() {
    this.unschedule()
  }

  scheduleFirst(engine: AsciiEngine) {
    if (this._timeoutId !== null) return
    this.engine = engine
    this._schedule(this._moveSpeed)
  }

  private _schedule(delay: number) {
    this._nextActDelay = delay
    this._timeoutId = setTimeout(() => {
      this._lastActTime = performance.now()
      this.prevX = this.x
      this.prevY = this.y

      const next = this.act()

      this._schedule(Math.max(next, MIN_ACTION_INTERVAL))
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
}

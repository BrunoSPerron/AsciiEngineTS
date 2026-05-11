import { lerp } from '../util/math'
import type { Entity } from '../world/entities/Entity'
import type { TileMetricsData } from './tileMetrics'

export class Camera {
  x = 0
  y = 0

  private _target: Entity
  private tileMetrics: TileMetricsData
  private _unlistenMove: (() => void) | null = null

  private _rafId = 0
  private _last = 0

  viewport: HTMLDivElement

  onChunksInvalidated: (() => void) | null = null
  onFrame: ((now: number) => void) | null = null

  constructor(viewport: HTMLDivElement, target: Entity, tileMetrics: TileMetricsData) {
    this.viewport = viewport
    this._target = target
    this.tileMetrics = tileMetrics
    this._listenToTarget()
  }

  get target(): Entity {
    return this._target
  }

  setTarget(target: Entity) {
    this._unlistenMove?.()
    this._target = target
    this._listenToTarget()
  }

  private _listenToTarget() {
    this._unlistenMove = this._target.onMove(() => {
      this.onChunksInvalidated?.()
    })
  }

  jumpToTarget() {
    const now = performance.now()
    const pos = this._target.visualPosition(now)
    const clientRect = this.viewport.getBoundingClientRect()
    this.x = pos[0] - clientRect.width / this.tileMetrics.w / 2
    this.y = pos[1] - clientRect.height / this.tileMetrics.h / 2
  }

  start() {
    if (this._rafId) return
    this._last = 0
    this._rafId = requestAnimationFrame(this._frame)
  }

  suspend() {
    if (!this._rafId) return
    cancelAnimationFrame(this._rafId)
    this._rafId = 0
    this._last = 0
  }

  resume() {
    this.start()
  }

  private _frame = (now: number) => {
    if (this._last === 0) this._last = now
    const delta = now - this._last
    this._last = now

    this._update(now, delta)
    this.onFrame?.(now)

    this._rafId = requestAnimationFrame(this._frame)
  }

  private _update(now: number, delta: number) {
    const pos = this._target.visualPosition(now)
    const clientRect = this.viewport.getBoundingClientRect()
    const tx = pos[0] - clientRect.width / this.tileMetrics.w / 2
    const ty = pos[1] - clientRect.height / this.tileMetrics.h / 2

    const alpha = Math.min(delta * 0.005, 1)

    this.x = lerp(this.x, tx, alpha)
    this.y = lerp(this.y, ty, alpha)
  }
}

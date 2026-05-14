import { lerp } from '../math'
import { Entity } from '../world/entities/Entity'
import type { TileMetricsData } from './tileMetrics'

export class Camera {
  x = 0
  y = 0

  private _target: Entity
  private _placeholder: Entity | null
  private _halfLife: number = 120
  private tileMetrics: TileMetricsData
  private _unlistenMove: (() => void) | null = null

  private _rafId = 0
  private _last = 0

  viewport: HTMLDivElement

  private _chunksInvalidatedListeners = new Set<() => void>()
  private _frameListeners = new Set<(now: number) => void>()

  constructor(viewport: HTMLDivElement, tileMetrics: TileMetricsData) {
    this.viewport = viewport
    this.tileMetrics = tileMetrics

    const placeholder = new Entity(' ', 0, 0)
    this._placeholder = placeholder
    this._target = placeholder
    this._listenToTarget()
  }

  get target(): Entity {
    return this._target
  }

  set target(entity: Entity) {
    this._unlistenMove?.()
    this._placeholder = null
    this._target = entity
    this._listenToTarget()
    for (const fn of this._chunksInvalidatedListeners) fn()
  }

  set halfLife(halfLife: number) {
    this._halfLife = Math.max(halfLife, 0)
  }

  onChunksInvalidated = (fn: () => void): (() => void) => {
    this._chunksInvalidatedListeners.add(fn)
    return () => this._chunksInvalidatedListeners.delete(fn)
  }

  onFrame = (fn: (now: number) => void): (() => void) => {
    this._frameListeners.add(fn)
    return () => this._frameListeners.delete(fn)
  }

  private _listenToTarget() {
    this._unlistenMove = this._target.onMove(() => {
      for (const fn of this._chunksInvalidatedListeners) fn()
    })
  }

  setInitialPosition(x: number, y: number) {
    if (this._placeholder === null) return
    this._placeholder.x = x
    this._placeholder.y = y
    this._placeholder.prevX = x
    this._placeholder.prevY = y
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
    for (const fn of this._frameListeners) fn(now)

    this._rafId = requestAnimationFrame(this._frame)
  }

  private _update(now: number, delta: number) {
    const pos = this._target.visualPosition(now)
    const clientRect = this.viewport.getBoundingClientRect()
    const tx = pos[0] - clientRect.width / this.tileMetrics.w / 2
    const ty = pos[1] - clientRect.height / this.tileMetrics.h / 2

    const alpha = 1 - Math.pow(0.5, delta / this._halfLife)
    this.x = lerp(this.x, tx, alpha)
    this.y = lerp(this.y, ty, alpha)
  }
}

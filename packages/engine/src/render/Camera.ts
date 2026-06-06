import { lerp } from '../math/utils'
import { GridVector } from '../math/GridVector'
import { Entity } from '../world/entities/Entity'
import type { TileMetricsData } from './tileMetrics'
import { EngineObject } from '../core/EngineObject'

export type CameraEvent = {
  frame: [now: number]
  chunkinvalidated: []
}

export class Camera extends EngineObject<CameraEvent> {
  pos = new GridVector()

  private _target: Entity
  private _placeholder: Entity | null
  private _halfLife: number = 120
  private tileMetrics: TileMetricsData

  private _targetUnlisten: () => void = () => {}

  /** Returns the content-center offset in **pixels**. */
  private _getContentOffset: () => { x: number; y: number } = () => ({ x: 0, y: 0 })

  private _rafId = 0
  private _last = 0

  viewport: HTMLDivElement

  constructor(viewport: HTMLDivElement, tileMetrics: TileMetricsData) {
    super()
    this.viewport = viewport
    this.tileMetrics = tileMetrics

    this._placeholder = new Entity(' ', new GridVector(0, 0), 0)
    this._target = this._placeholder
    this._listenToTarget()
  }

  get target(): Entity {
    return this._target
  }

  set target(entity: Entity) {
    this._placeholder = null
    this._target = entity
    this._listenToTarget()
    this.emit('chunkinvalidated')
  }

  set halfLife(halfLife: number) {
    this._halfLife = Math.max(halfLife, 0)
  }

  /** Provider must return the offset in **pixels**. */
  setContentOffsetProvider(fn: () => { x: number; y: number }) {
    this._getContentOffset = fn
  }

  private _listenToTarget() {
    this._targetUnlisten()
    this._targetUnlisten = this.listen(
      this._target.on('chunkchange', () => {
        this.emit('chunkinvalidated')
      }),
    )
  }

  setInitialPosition(x: number, y: number) {
    if (this._placeholder === null) return
    this._placeholder.pos.x = x
    this._placeholder.pos.y = y
    this._placeholder.previousPos.x = x
    this._placeholder.previousPos.y = y
  }

  jumpToTarget() {
    const now = performance.now()
    const pos = this._target.visualPosition(now)
    const clientRect = this.viewport.getBoundingClientRect()
    const offsetPx = this._getContentOffset()
    this.pos.x =
      pos[0] - clientRect.width / this.tileMetrics.w / 2 - offsetPx.x / this.tileMetrics.w + 0.5
    this.pos.y =
      pos[1] - clientRect.height / this.tileMetrics.h / 2 - offsetPx.y / this.tileMetrics.h + 0.5
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
    this.emit('frame', now)

    this._rafId = requestAnimationFrame(this._frame)
  }

  private _update(now: number, delta: number) {
    const pos = this._target.visualPosition(now)
    const clientRect = this.viewport.getBoundingClientRect()
    const offsetPx = this._getContentOffset()
    const tx =
      pos[0] - clientRect.width / this.tileMetrics.w / 2 - offsetPx.x / this.tileMetrics.w + 0.5
    const ty =
      pos[1] - clientRect.height / this.tileMetrics.h / 2 - offsetPx.y / this.tileMetrics.h + 0.5
    const alpha = 1 - Math.pow(0.5, delta / this._halfLife)
    this.pos.x = lerp(this.pos.x, tx, alpha)
    this.pos.y = lerp(this.pos.y, ty, alpha)
  }
}

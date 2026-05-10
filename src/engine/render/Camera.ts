import { lerp } from '../util/math'
import type { Entity } from '../world/entities/Entity'
import { TileMetrics } from './tileMetrics'

export class Camera {
  x = 0
  y = 0

  private _target: Entity
  private _unlistenMove: (() => void) | null = null

  viewport: HTMLDivElement

  onChunksInvalidated: (() => void) | null = null

  constructor(viewport: HTMLDivElement, target: Entity) {
    this.viewport = viewport
    this._target = target
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

  jumpToTarget(now: number) {
    const pos = this._target.visualPosition(now)
    const clientRect = this.viewport.getBoundingClientRect()
    this.x = pos[0] - clientRect.width / TileMetrics.w / 2
    this.y = pos[1] - clientRect.height / TileMetrics.h / 2
  }

  update(now: number) {
    const pos = this._target.visualPosition(now)
    const clientRect = this.viewport.getBoundingClientRect()
    const tx = pos[0] - clientRect.width / TileMetrics.w / 2
    const ty = pos[1] - clientRect.height / TileMetrics.h / 2

    // Alpha scaled by time since last frame for frame-rate-independent lerp
    const alpha = Math.min((now % 1000) * 0.005, 1)

    this.x = lerp(this.x, tx, alpha)
    this.y = lerp(this.y, ty, alpha)
  }
}

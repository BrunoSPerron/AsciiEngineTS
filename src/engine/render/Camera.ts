import { lerp } from "../util/math"
import type { Entity } from "../world/entities/Entity"
import { TileMetrics } from "./TileMetrics"

export class Camera {
  x = 0
  y = 0

  target: Entity = null

  viewport: HTMLDivElement

  constructor(viewport: HTMLDivElement, target: Entity) {
    this.viewport = viewport
    this.target = target
  }

  setTarget(target: Entity) {
    this.target = target
  }

  jumpToTarget() {
    const pos = this.target.visualPosition
    const clientRect = this.viewport.getBoundingClientRect()
    this.x = pos[0] - clientRect.width / TileMetrics.w / 2
    this.y = pos[1] - clientRect.height / TileMetrics.h / 2
  }

  update(deltaTime: number) {
    const pos = this.target.visualPosition
    const clientRect = this.viewport.getBoundingClientRect()
    const tx = pos[0] - clientRect.width / TileMetrics.w / 2
    const ty = pos[1] - clientRect.height / TileMetrics.h / 2
    
    const alpha = deltaTime * 0.005

    this.x = lerp(this.x, tx, alpha)
    this.y = lerp(this.y, ty, alpha)
  }
}

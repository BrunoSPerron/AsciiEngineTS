import { lerp } from "../util/math"
import type { Entity } from "../world/Entities/Entity"
import { TILE_H, TILE_W } from "./Renderer"

export class Camera {
  x = 0
  y = 0

  target: Entity = null
  targetY = 0

  viewport: HTMLDivElement

  constructor(viewport: HTMLDivElement, target: Entity) {
    this.viewport = viewport
    this.target = target
  }

  setTarget(target: Entity) {
    this.target = target
  }

  update(deltaTime: number) {
    const pos = this.target.visualPosition
    const clientRect = this.viewport.getBoundingClientRect()

    const tx = pos[0] - clientRect.width / TILE_W / 2
    const ty = pos[1] - clientRect.height / TILE_H / 2
    
    const alpha = deltaTime * 0.0025

    this.x = lerp(this.x, tx, alpha)
    this.y = lerp(this.y, ty, alpha)
  }
}

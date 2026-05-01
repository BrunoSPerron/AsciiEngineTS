import type { LocalWorld } from "../LocalWorld"
import { Entity } from "./Entity"

export class PlayerUnit extends Entity {

  constructor(glyph: string, x: number, y: number, moveSpeed: number) {
    super(glyph, x, y, moveSpeed)
  }

  act(world: LocalWorld) {
    super.act(world)
    this.x ++
    this.y ++
    return this.moveSpeed
  }
}

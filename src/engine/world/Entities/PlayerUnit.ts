import type { LocalWorld } from "../LocalWorld"
import { Entity } from "./Entity"

export class PlayerUnit extends Entity {

  constructor(id: number, glyph: string, x: number, y: number, moveSpeed: number) {
    super(id, glyph, x, y, moveSpeed)
  }

  act(world: LocalWorld) {
    super.act(world)
    this.x ++
    this.y ++
    return this.moveSpeed
  }
}

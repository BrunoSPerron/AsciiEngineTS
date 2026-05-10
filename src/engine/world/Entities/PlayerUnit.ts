import type { AsciiEngine } from '../../core/Engine'
import { Entity } from './Entity'

export class PlayerUnit extends Entity {
  constructor(glyph: string, x: number, y: number, moveSpeed: number) {
    super(glyph, x, y, moveSpeed)
  }

  act(_engine: AsciiEngine): number {
    this.x++
    this.y++
    this.emitMove()
    return this.moveSpeed
  }
}

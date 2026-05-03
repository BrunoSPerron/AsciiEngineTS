import { STEP } from "../../core/Engine"
import { lerp } from "../../util/math"
import type { LocalWorld } from "../LocalWorld"

export class Entity {
  uid: number
  glyph: string

  x: number
  y: number

  prevX: number
  prevY: number

  private _moveSpeed: number
  nextAction: number

  constructor(
      glyph: string,
      x: number,
      y: number,
      moveSpeed: number = 0,
    ) {
    this.glyph = glyph
    
    this.x = x
    this.y = y
    this.prevX = x
    this.prevY = y

    this.moveSpeed = moveSpeed
    this.nextAction = moveSpeed
  }

  /**
   * @returns time until next move, in ms
   */
  public get moveSpeed(): number {
    return this._moveSpeed
  }

  public set moveSpeed(value: number) {
    if (value >= 10) {
      this._moveSpeed = value
    } else {
      this._moveSpeed = STEP
    }
  }

  public get visualPosition(): Array<number> {
    let alpha = 1 - this.nextAction / this.moveSpeed
    return [
      lerp(this.prevX, this.x, alpha),
      lerp(this.prevY, this.y, alpha)
    ]
  }

  OnLoad() {
    
  }

  OnUnload() {
    
  }

  /**
   * @returns time until the next action, in milliseconds
   */
  act(_world: LocalWorld): number {
    this.prevX = this.x
    this.prevY = this.y
    return this._moveSpeed
  }
}

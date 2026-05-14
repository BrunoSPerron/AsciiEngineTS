import { clamp } from './utils'

export class Vector2 {
  static readonly ZERO = new Vector2(0, 0)

  static readonly UP: Readonly<Vector2> = Object.freeze(new Vector2(0, -1))
  static readonly DOWN: Readonly<Vector2> = Object.freeze(new Vector2(0, 1))
  static readonly LEFT: Readonly<Vector2> = Object.freeze(new Vector2(-1, 0))
  static readonly RIGHT: Readonly<Vector2> = Object.freeze(new Vector2(1, 0))

  static readonly UP_LEFT: Readonly<Vector2> = Object.freeze(new Vector2(-1, -1))
  static readonly UP_RIGHT: Readonly<Vector2> = Object.freeze(new Vector2(1, -1))
  static readonly DOWN_LEFT: Readonly<Vector2> = Object.freeze(new Vector2(-1, 1))
  static readonly DOWN_RIGHT: Readonly<Vector2> = Object.freeze(new Vector2(1, 1))

  public x: number
  public y: number

  constructor(x?: number | Vector2, y?: number) {
    if (x instanceof Vector2) {
      this.x = x.x
      this.y = x.y
    } else {
      this.x = x ?? 0
      this.y = y ?? x ?? 0
    }
  }

  add(v: Vector2) {
    this.x += v.x
    this.y += v.y
    return this
  }

  sub(v: Vector2) {
    this.x -= v.x
    this.y -= v.y
    return this
  }

  equal(v: Vector2) {
    return this.x === v.x && this.y === v.y
  }

  clamp(min: number = -1, max: number = 1) {
    this.x = clamp(this.x, min, max)
    this.y = clamp(this.y, min, max)
    return this
  }

  clampLength(_max: number) {
    // TODO Adapt from normalize
  }

  scale(s: number) {
    this.x *= s
    this.y *= s
    return this
  }

  length() {
    // Simplified for grid system: Diagonals = 1.5 unit
    return this.x + this.y - Math.min(this.x, this.y) * 0.5
  }

  normalize() {
    //TODO Adapt to fit with our simplified length()
    const len = this.length()
    if (len > 0) this.scale(1 / len)
    return this
  }

  clone() {
    return new Vector2(this.x, this.y)
  }
}

import { clamp } from './utils'

export class Vector2 {
  static readonly ZERO: Readonly<Vector2> = Object.freeze(new Vector2(0, 0))

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

  set(x: number, y: number): Vector2 {
    this.x = x
    this.y = y
    return this
  }

  add(v: Vector2): Vector2 {
    this.x += v.x
    this.y += v.y
    return this
  }

  sub(v: Vector2): Vector2 {
    this.x -= v.x
    this.y -= v.y
    return this
  }

  equal(v: Vector2): boolean {
    return this.x === v.x && this.y === v.y
  }

  clamp(min: number = -1, max: number = 1): Vector2 {
    this.x = clamp(this.x, min, max)
    this.y = clamp(this.y, min, max)
    return this
  }

  clampLength(max: number): Vector2 {
    const len = this.length()
    if (len > max) this.scale(max / len)
    return this
  }

  scale(s: number): Vector2 {
    this.x *= s
    this.y *= s
    return this
  }

  length(): number {
    // Simplified for grid system: Diagonals = 1.5 unit
    const ax = Math.abs(this.x)
    const ay = Math.abs(this.y)
    return ax + ay - Math.min(ax, ay) * 0.5
  }

  normalize(): Vector2 {
    const len = this.length()
    if (len > 0) this.scale(1 / len)
    return this
  }

  clone(): Vector2 {
    return new Vector2(this.x, this.y)
  }

  toString() {
    return `x: (${this.x} - y: ${this.y})`
  }
}

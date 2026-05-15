import { clamp } from './utils'

export class GridVector {
  static readonly ZERO: Readonly<GridVector> = Object.freeze(new GridVector(0, 0))

  static readonly UP: Readonly<GridVector> = Object.freeze(new GridVector(0, -1))
  static readonly DOWN: Readonly<GridVector> = Object.freeze(new GridVector(0, 1))
  static readonly LEFT: Readonly<GridVector> = Object.freeze(new GridVector(-1, 0))
  static readonly RIGHT: Readonly<GridVector> = Object.freeze(new GridVector(1, 0))

  static readonly UP_LEFT: Readonly<GridVector> = Object.freeze(new GridVector(-1, -1))
  static readonly UP_RIGHT: Readonly<GridVector> = Object.freeze(new GridVector(1, -1))
  static readonly DOWN_LEFT: Readonly<GridVector> = Object.freeze(new GridVector(-1, 1))
  static readonly DOWN_RIGHT: Readonly<GridVector> = Object.freeze(new GridVector(1, 1))

  public x: number
  public y: number

  constructor(x?: number | GridVector, y?: number) {
    if (x instanceof GridVector) {
      this.x = x.x
      this.y = x.y
    } else {
      this.x = x ?? 0
      this.y = y ?? x ?? 0
    }
  }

  set(vector: GridVector): GridVector {
    this.x = vector.x
    this.y = vector.y
    return this
  }

  setXY(x: number, y: number): GridVector {
    this.x = x
    this.y = y
    return this
  }

  add(v: GridVector): GridVector {
    this.x += v.x
    this.y += v.y
    return this
  }

  sub(v: GridVector): GridVector {
    this.x -= v.x
    this.y -= v.y
    return this
  }

  equal(v: GridVector): boolean {
    return this.x === v.x && this.y === v.y
  }

  clamp(min: number = -1, max: number = 1): GridVector {
    this.x = clamp(this.x, min, max)
    this.y = clamp(this.y, min, max)
    return this
  }

  clampLength(max: number): GridVector {
    const len = this.length()
    if (len > max) this.scale(max / len)
    return this
  }

  scale(s: number): GridVector {
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

  normalize(): GridVector {
    const len = this.length()
    if (len > 0) this.scale(1 / len)
    return this
  }

  clone(): GridVector {
    return new GridVector(this.x, this.y)
  }

  toString() {
    return `x: (${this.x} - y: ${this.y})`
  }
}

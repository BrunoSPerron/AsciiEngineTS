import { TileMetrics } from "../TileMetrics"
import { UINode } from "./UINode"

export const LINE_GLYPHS: Record<number, string> = {
  0b00000: " ",
  0b00001: " ",

  0b01010: "─",
  0b00010: "─",
  0b01000: "─",
  0b01011: "═",
  0b00011: "═",
  0b01001: "═",

  0b10100: "│",
  0b00100: "│",
  0b10000: "│",
  0b10101: "║",
  0b00101: "║",
  0b10001: "║",

  0b01100: "┌",
  0b01101: "╔",

  0b00110: "┐",
  0b00111: "╗",

  0b11000: "└",
  0b11001: "╚",

  0b10010: "┘",
  0b10011: "╝",

  0b11100: "├",
  0b11101: "╠",

  0b10110: "┤",
  0b10111: "╣",

  0b11010: "┴",
  0b11011: "╩",

  0b01110: "┬",
  0b01111: "╦",

  0b11110: "┼",
  0b11111: "╬",
}

export const TOP    = 0b10000
export const RIGHT  = 0b01000
export const BOTTOM = 0b00100
export const LEFT   = 0b00010
export const DOUBLE = 0b00001

export const OPPOSITE: Record<number, number> = {
  [TOP]:    BOTTOM,
  [BOTTOM]: TOP,
  [LEFT]:   RIGHT,
  [RIGHT]:  LEFT,
}

export function maskToGlyph(mask: number): string {
  return LINE_GLYPHS[mask] ?? "?"
}

export class LineNode extends UINode {
  ownMasks: Map<string, number> = new Map()

  constructor(
    id: number,
    kind: "hline" | "vline",
    el: HTMLDivElement,
    x: number,
    y: number,
    w: number,
    h: number,
  ) {
    super(id, kind, el, x, y, w, h, [])
  }

  setOwnMask(x: number, y: number, mask: number) {
    this.ownMasks.set(`${x},${y}`, mask)
  }

  getOwnMask(x: number, y: number): number {
    return this.ownMasks.get(`${x},${y}`) ?? 0
  }

  /**
   * Grant a directional bit toward a neighbor at (nx, ny).
   * The neighbor gets the reciprocal bit back toward us.
   * DOUBLE is granted only when both nodes are double-line.
   */
  grantBit(
    x: number, y: number, bit: number,
    neighbor: LineNode, nx: number, ny: number
  ) {
    const myDouble    = (this.getOwnMask(x, y) & DOUBLE) !== 0
    const theirDouble = (neighbor.getOwnMask(nx, ny) & DOUBLE) !== 0
    const bothDouble  = myDouble && theirDouble ? DOUBLE : 0

    this.ownMasks.set(
      `${x},${y}`,
      (this.getOwnMask(x, y) | bit | bothDouble)
    )
    neighbor.ownMasks.set(
      `${nx},${ny}`,
      (neighbor.getOwnMask(nx, ny) | OPPOSITE[bit] | bothDouble)
    )
  }

  /**
   * Withdraw a directional bit toward a neighbor at (nx, ny).
   * Clears our bit toward them and their reciprocal bit toward us.
   * Also clears DOUBLE on both sides of this junction.
   */
  withdrawBit(
    x: number, y: number, bit: number,
    neighbor: LineNode, nx: number, ny: number
  ) {
    this.ownMasks.set(
      `${x},${y}`,
      (this.getOwnMask(x, y) & ~bit & ~DOUBLE)
    )
    neighbor.ownMasks.set(
      `${nx},${ny}`,
      (neighbor.getOwnMask(nx, ny) & ~OPPOSITE[bit] & ~DOUBLE)
    )
  }

  refresh() {
    if (this.kind === "vline") {
      const lines: string[] = []
      for (let i = 0; i < this.h; i++) {
        const glyph = maskToGlyph(this.getOwnMask(this.x, this.y + i))
        this.chars[i] = glyph
        lines.push(glyph)
      }
      this.el.textContent = lines.join("\n")
    } else {
      let text = ""
      for (let i = 0; i < this.w; i++) {
        const glyph = maskToGlyph(this.getOwnMask(this.x + i, this.y))
        this.chars[i] = glyph
        text += glyph
      }
      this.el.textContent = text
    }
  }

  applyVerticalStyle() {
    this.el.style.whiteSpace = "pre"
    this.el.style.lineHeight = `${TileMetrics.h}px`
  }
}

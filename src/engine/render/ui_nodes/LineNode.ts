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

export function maskToGlyph(mask: number): string {
  return LINE_GLYPHS[mask] ?? "?"
}

export class LineNode extends UINode {

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

  registerNodeInMask(mask: Map<string, boolean>) {
    for (const [x, y] of this.cellCoords()) {
      mask.set(`${x},${y}`, true)
    }
  }

  unregisterNodeInMask(mask: Map<string, boolean>) {
    for (const [x, y] of this.cellCoords()) {
      mask.delete(`${x},${y}`)
    }
  }

  private cellCoords(): Array<[number, number]> {
    if (this.kind === "vline") {
      return Array.from({ length: this.h }, (_, i): [number, number] => [this.x, this.y + i])
    } else {
      return Array.from({ length: this.w }, (_, i): [number, number] => [this.x + i, this.y])
    }
  }

  refresh() {
    if (this.kind === "vline") {
      this.el.textContent = this.chars.join("\n")
      return
    }
    this.el.textContent = this.chars.join("")
  }

  applyVerticalStyle() {
    this.el.style.whiteSpace = "pre"
    this.el.style.lineHeight = `${TileMetrics.h}px`
  }
}

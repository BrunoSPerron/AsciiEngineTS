import { TileMetrics } from "../TileMetrics"
import { UINode } from "./UINode"

/**
 * Maps a line mask to its box-drawing glyph.
 * Mask bits: top right bottom left double
 */
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

/**
 * A LineNode owns its own mask contributions for every cell it covers.
 * It never reads from a global mask map — RendererUI hands it the merged
 * mask (from all LineNodes in the cell's z-stack) when asking it to refresh.
 */
export class LineNode extends UINode {
  /** Per-cell mask contributions owned by THIS node only. Key: "x,y" */
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
   * Rebuild glyphs from this node's own masks only and flush to DOM.
   * Only call this during initial construction or after a move.
   * After drawing, reconcileAt() in RendererUI writes merged glyphs
   * directly into chars[] and updates the DOM itself.
   */
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

  /**
   * Convenience: apply a transform and style for vertical line nodes.
   */
  applyVerticalStyle() {
    this.el.style.whiteSpace = "pre"
    this.el.style.lineHeight = `${TileMetrics.h}px`
  }
}

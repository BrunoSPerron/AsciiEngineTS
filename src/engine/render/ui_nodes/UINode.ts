import { TileMetrics } from "../TileMetrics"

export type UIKind =
  | "text"
  | "hline"
  | "vline"
  | "panel"

export interface ILineLike {
  cellCoords(): Array<[number, number]>
  charIndexFor(x: number, y: number): number
  setCharAt(x: number, y: number, glyph: string): void
}

export function isLineLike(node: UINode): node is UINode & ILineLike {
  return node.kind === "hline" || node.kind === "vline" || node.kind === "panel"
}

export class UINode {
  id: number
  kind: UIKind
  el: HTMLDivElement

  x: number
  y: number
  w: number
  h: number

  chars: string[]

  constructor(
    id: number,
    kind: UIKind,
    el: HTMLDivElement,
    x: number,
    y: number,
    w: number,
    h: number,
    chars: string[] = []
  ) {
    this.id = id
    this.kind = kind
    this.el = el
    this.x = x
    this.y = y
    this.w = w
    this.h = h
    this.chars = chars
  }

  applyTransform() {
    this.el.style.transform =
      `translate(${this.x * TileMetrics.w}px, ${this.y * TileMetrics.h}px)`
  }

  refresh() {
    if (this.kind === "vline") {
      this.el.textContent = this.chars.join("\n")
      return
    }
    this.el.textContent = this.chars.join("")
  }
}

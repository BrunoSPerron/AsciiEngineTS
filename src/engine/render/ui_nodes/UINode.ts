import { TileMetrics } from "../TileMetrics"

export type UIKind =
  | "text"
  | "hline"
  | "vline"
  | "panel"

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

  refreshText() {
    if (this.kind === "vline") {
      this.el.textContent = this.chars.join("\n")
      return
    }
    this.el.textContent = this.chars.join("")
  }
}

import { type TileMetricsData } from '../tileMetrics'

export type UIKind = 'text' | 'hline' | 'vline' | 'panel'

export interface ILineLike {
  cellCoords(): Array<[number, number]>
  charIndexFor(x: number, y: number): number
  setCharAt(x: number, y: number, glyph: string): void
}

export function isLineLike(node: UINode): node is UINode & ILineLike {
  return node.kind === 'hline' || node.kind === 'vline' || node.kind === 'panel'
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

  tileMetrics: TileMetricsData

  constructor(
    id: number,
    kind: UIKind,
    el: HTMLDivElement,
    x: number,
    y: number,
    w: number,
    h: number,
    chars: string[] = [],
    tileMetrics: TileMetricsData,
  ) {
    this.id = id
    this.kind = kind
    this.el = el
    this.x = x
    this.y = y
    this.w = w
    this.h = h
    this.chars = chars
    this.tileMetrics = tileMetrics
  }

  applyTransform() {
    this.el.style.transform = `translate(${this.x * this.tileMetrics.w}px, ${this.y * this.tileMetrics.h}px)`
  }

  refresh() {
    if (this.kind === 'vline') {
      this.el.textContent = this.chars.join('\n')
      return
    }
    this.el.textContent = this.chars.join('')
  }
}

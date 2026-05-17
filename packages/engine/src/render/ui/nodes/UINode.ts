import { type TileMetricsData } from '../../tileMetrics'
import { Anchor } from '../anchor'

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

  protected _anchor: Anchor

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
    anchor: Anchor = Anchor.MiddleCenter,
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
    this._anchor = anchor
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

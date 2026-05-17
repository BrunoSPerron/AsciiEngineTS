import { type TileMetricsData } from '../../tileMetrics'
import { Anchor } from '../anchor'

export type UIKind = 'text' | 'panel'

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
    this.el.textContent = this.chars.join('')
  }
}

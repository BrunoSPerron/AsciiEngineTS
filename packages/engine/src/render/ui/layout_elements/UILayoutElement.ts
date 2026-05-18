import type { TileMetricsData } from '../../tileMetrics'

export type UILayoutElementConfig = {
  id: number
  /** Viewport-local tile coords of the element's interior (excludes its border) */
  x?: number
  y?: number
  w: number
  h: number

  minW?: number
  minH?: number

  xPercent?: number
  yPercent?: number
  maxHPercent?: number
  maxWPercent?: number

  priority?: number
}

/**
 * A region managed by UILayout.
 *
 * UILayout owns this element's border and positions the container.
 * UILayoutElement is only responsible for rendering content inside its interior.
 *
 * Coordinates are viewport-local tile grid coordinates.
 */
export class UILayoutElement {
  readonly id: number
  readonly el: HTMLDivElement

  x: number
  y: number
  w: number
  h: number

  minW: number
  maxW: number
  minH: number
  maxH: number

  xPercent: number | undefined
  yPercent: number | undefined
  maxHPercent: number | undefined
  maxWPercent: number | undefined

  priority: number

  protected tileMetrics: TileMetricsData

  constructor(config: UILayoutElementConfig, el: HTMLDivElement, tileMetrics: TileMetricsData) {
    this.id = config.id
    this.el = el

    this.priority = config.priority ?? 0

    this.x = config.x ?? 0
    this.y = config.y ?? 0
    this.w = config.w
    this.h = config.h

    this.minW = config.minW !== undefined ? config.minW : config.w
    this.minH = config.minH !== undefined ? config.minH : config.h
    this.maxW = config.w
    this.maxH = config.h

    this.xPercent = config.xPercent
    this.yPercent = config.yPercent
    this.maxWPercent = config.maxWPercent
    this.maxHPercent = config.maxHPercent

    this.tileMetrics = tileMetrics
  }

  /**
   * Called by UILayout on creation and every resize.
   * Resolves percent-based config against container dimensions, then calls layout().
   */
  reflow(containerCols: number, containerRows: number): void {
    const x =
      this.xPercent !== undefined ? Math.round((containerCols * this.xPercent) / 100) : this.x

    const y =
      this.yPercent !== undefined ? Math.round((containerRows * this.yPercent) / 100) : this.y

    if (this.maxWPercent !== undefined) {
      this.maxW = Math.floor((containerCols * this.maxWPercent) / 100)
    }

    if (this.maxHPercent !== undefined) {
      this.maxH = Math.floor((containerRows * this.maxHPercent) / 100)
    }

    const w = Math.max(this.minW, Math.min(this.w, this.maxW))
    const h = Math.max(this.minH, Math.min(this.h, this.maxH))

    this.layout(x, y, w, h)
  }

  /**
   * Called by UILayout after creation and on every resize.
   * Repositions the DOM node to match current tile metrics and grid coords.
   * Subclasses can override to re-render content after a layout change.
   */
  layout(x: number, y: number, w: number, h: number): void {
    this.x = x
    this.y = y
    this.w = w
    this.h = h
    this.el.style.transform = `translate(${(x + 1) * this.tileMetrics.w}px, ${(y + 1) * this.tileMetrics.h}px)`
    this.el.style.width = `${w * this.tileMetrics.w}px`
    this.el.style.height = `${h * this.tileMetrics.h}px`
  }

  /**
   * Called by UILayout when this element is removed.
   * Subclasses should override to clean up internal state.
   */
  destroy(): void {
    this.el.remove()
  }

  /** Cells occupied by this element's interior in viewport-local tile coords */
  interiorCoords(): Array<[number, number]> {
    const coords: Array<[number, number]> = []
    for (let row = this.y; row < this.y + this.h; row++) {
      for (let col = this.x; col < this.x + this.w; col++) {
        coords.push([col, row])
      }
    }
    return coords
  }

  /** Cells occupied by this element's border (1-tile perimeter around the interior) */
  borderCoords(): Array<[number, number]> {
    const bx = this.x - 1
    const by = this.y - 1
    const bw = this.w + 2
    const bh = this.h + 2
    const coords: Array<[number, number]> = []
    for (let col = bx; col < bx + bw; col++) {
      coords.push([col, by])
      coords.push([col, by + bh - 1])
    }
    for (let row = by + 1; row < by + bh - 1; row++) {
      coords.push([bx, row])
      coords.push([bx + bw - 1, row])
    }
    return coords
  }
}

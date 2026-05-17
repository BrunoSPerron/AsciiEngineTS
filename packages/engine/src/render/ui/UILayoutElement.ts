import type { TileMetricsData } from '../tileMetrics'

export type UILayoutElementConfig = {
  id: number
  /** Viewport-local tile coords of the element's interior (excludes its border) */
  x: number
  y: number
  w: number
  h: number
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

  protected tileMetrics: TileMetricsData

  constructor(config: UILayoutElementConfig, el: HTMLDivElement, tileMetrics: TileMetricsData) {
    this.id = config.id
    this.el = el
    this.x = config.x
    this.y = config.y
    this.w = config.w
    this.h = config.h
    this.tileMetrics = tileMetrics
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
    this.el.style.transform = `translate(${x * this.tileMetrics.w}px, ${y * this.tileMetrics.h}px)`
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

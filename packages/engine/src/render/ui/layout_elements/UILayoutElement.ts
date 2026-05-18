import type { TileMetricsData } from '../../tileMetrics'

export type UILayoutElementConfig = {
  id: number
  /** Viewport-local tile offset applied on top of percent-based position (or absolute position when no percent is set) */
  x?: number
  y?: number
  w: number
  h: number

  minW?: number
  minH?: number

  /** Position the element's center at this percentage of the container width */
  xPercent?: number
  /** Position the element's center at this percentage of the container height */
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
 *
 * Positioning:
 *   - When xPercent / yPercent are set they pin the **center** of the element
 *     to that percentage of the container. x / y are then treated as a tile
 *     offset added on top of that centered position.
 *   - When only x / y are set they are used as the top-left corner directly.
 *   - The element is always clamped to the layout bounds. If after clamping
 *     the available space is smaller than minW / minH the element is hidden.
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

  private _xPercentOffset: number = 0
  private _yPercentOffset: number = 0

  priority: number

  /** True when the element was hidden because it could not fit in the layout */
  private _hidden = false

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

    this._xPercentOffset = this.x
    this._yPercentOffset = this.y

    this.tileMetrics = tileMetrics
  }

  get hidden(): boolean {
    return this._hidden
  }

  /**
   * Called by UILayout on creation and every resize.
   * Resolves percent-based config against container dimensions, then calls layout().
   */
  reflow(containerCols: number, containerRows: number): void {
    // 1. Resolve max size
    let maxW = this.maxW
    let maxH = this.maxH

    if (this.maxWPercent !== undefined) {
      maxW = Math.min(Math.floor((containerCols * this.maxWPercent) / 100), this.maxW)
    }

    if (this.maxHPercent !== undefined) {
      maxH = Math.min(Math.floor((containerRows * this.maxHPercent) / 100), this.maxH)
    }

    // 2. Desired size (clamped between min and max)
    const w = Math.max(this.minW, Math.min(this.maxW, maxW))
    const h = Math.max(this.minH, Math.min(this.maxH, maxH))

    // ---------------------------------------------------------------------------
    // 3. Resolve position
    //    xPercent / yPercent pin the *center* of the element; x / y are offsets.
    //    Without percent, x / y are the absolute top-left tile position.
    // ---------------------------------------------------------------------------
    const offsetX = this._xPercentOffset
    const offsetY = this._yPercentOffset

    let x: number
    let y: number

    if (this.xPercent !== undefined) {
      const centerX = (containerCols * this.xPercent) / 100
      x = Math.round(centerX - w / 2) + offsetX - 1
    } else {
      x = offsetX
    }

    if (this.yPercent !== undefined) {
      const centerY = (containerRows * this.yPercent) / 100
      y = Math.round(centerY - h / 2) + offsetY - 1
    } else {
      y = offsetY
    }

    // ---------------------------------------------------------------------------
    // 4. Clamp to layout bounds (border occupies 1-tile perimeter outside x/y)
    //    The border extends 1 tile in every direction, so the element's interior
    //    must stay within [1, containerCols - 2] / [1, containerRows - 2].
    // ---------------------------------------------------------------------------
    // TODO move minX, minY to attributes, they will no longer default to zero once
    //  we implement sidepanels
    const minX = 0
    const minY = 0
    // Right / bottom edge: interior end = x + w; border end = x + w + 1 ≤ containerCols - 1
    const maxX = containerCols - w - 2
    const maxY = containerRows - h - 2

    const clampedX = Math.max(minX, Math.min(x, maxX))
    const clampedY = Math.max(minY, Math.min(y, maxY))

    // ---------------------------------------------------------------------------
    // 5. Hide if there's no room even at minimum size
    // ---------------------------------------------------------------------------
    if (maxX < minX || maxY < minY) {
      this._setHidden(true)
      return
    }

    this._setHidden(false)
    this.layout(clampedX, clampedY, w, h)
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

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private _setHidden(hide: boolean): void {
    if (this._hidden === hide) return
    this._hidden = hide
    this.el.style.display = hide ? 'none' : ''
  }
}

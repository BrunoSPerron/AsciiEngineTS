import type { AsciiEngine } from '../../../core/Engine'
import type { TileMetricsData } from '../../tileMetrics'

export type UISpatialConfig = {
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
 *
 * Positioning:
 *   - When xPercent / yPercent are set they pin the **center** of the element
 *     to that percentage of the container. x / y are then treated as a tile
 *     offset added on top of that centered position.
 *   - When only x / y are set they are used as the top-left corner directly.
 *   - The element is always clamped to the layout bounds. If after clamping
 *     the available space is smaller than minW / minH the element is hidden.
 *
 * Lifecycle hooks (override in subclasses):
 *   - loaded()    — called once after the element is mounted into the layout.
 *                   this.engine, this.w, this.h etc. are all available.
 *   - resized()  — called after every layout pass (initial + window resize).
 *                   this.x / y / w / h reflect the new values.
 *   - unloaded()  — called before the element is removed from the layout.
 *                   Clean up listeners, timers, etc. here.
 *   - layout()    — override only if you need access to the raw resolved coords
 *                   before resized fires. Always call super.layout() first.
 *   - destroy()   — called by UILayout after unloaded for final DOM teardown.
 *                   Call super.destroy() to remove this.el.
 */
export class UILayoutElement {
  private _id?: number
  readonly el: HTMLDivElement

  x: number = 0
  y: number = 0
  w: number = 0
  h: number = 0

  minW: number = 0
  maxW: number = 0
  minH: number = 0
  maxH: number = 0

  xPercent: number | undefined
  yPercent: number | undefined
  maxHPercent: number | undefined
  maxWPercent: number | undefined

  private _originalX: number = 0
  private _originalY: number = 0

  priority: number = 0

  /** True when the element was hidden because it could not fit in the layout */
  private _hidden = false

  protected tileMetrics?: TileMetricsData
  protected engine!: AsciiEngine

  constructor() {
    this.el = document.createElement('div')
    this.el.className = 'ui-layout-element'
  }

  // ---------------------------------------------------------------------------
  // Engine-internal mount — called once by UILayout.addElement()
  // ---------------------------------------------------------------------------

  _mount(
    id: number,
    spatialConfig: UISpatialConfig,
    tileMetrics: TileMetricsData,
    engine: AsciiEngine,
  ): void {
    this._id = id
    this.engine = engine

    this.priority = spatialConfig.priority ?? 0

    this.x = spatialConfig.x ?? 0
    this.y = spatialConfig.y ?? 0
    this.w = spatialConfig.w
    this.h = spatialConfig.h

    this.minW = spatialConfig.minW !== undefined ? spatialConfig.minW : spatialConfig.w
    this.minH = spatialConfig.minH !== undefined ? spatialConfig.minH : spatialConfig.h
    this.maxW = spatialConfig.w
    this.maxH = spatialConfig.h

    this.xPercent = spatialConfig.xPercent
    this.yPercent = spatialConfig.yPercent
    this.maxWPercent = spatialConfig.maxWPercent
    this.maxHPercent = spatialConfig.maxHPercent

    this._originalX = this.x
    this._originalY = this.y

    this.tileMetrics = tileMetrics
  }

  // ---------------------------------------------------------------------------
  // Lifecycle hooks — override in subclasses
  // ---------------------------------------------------------------------------

  /** Called once after the element is fully mounted. Safe to access this.engine. */
  loaded(): void {}

  /**
   * Called after every layout pass (initial placement and every window resize).
   * this.x / y / w / h are already updated when this fires.
   */
  resized(): void {}

  /** Called before the element is removed from the layout. Clean up here. */
  unloaded(): void {}

  // ---------------------------------------------------------------------------
  // Layout — called by UILayout on add and every resize
  // ---------------------------------------------------------------------------

  get hidden(): boolean {
    return this._hidden
  }

  get id(): number {
    if (!this._id) throw new Error('ID not assigned')
    return this._id
  }

  /**
   * Called by UILayout after creation and on every resize.
   * Resolves percent-based config against container dimensions, then calls layout().
   */
  reflow(containerCols: number, containerRows: number): void {
    let maxW = this.maxW
    let maxH = this.maxH

    if (this.maxWPercent !== undefined) {
      maxW = Math.min(Math.floor((containerCols * this.maxWPercent) / 100), this.maxW)
    }

    if (this.maxHPercent !== undefined) {
      maxH = Math.min(Math.floor((containerRows * this.maxHPercent) / 100), this.maxH)
    }

    const w = Math.max(this.minW, Math.min(this.maxW, maxW))
    const h = Math.max(this.minH, Math.min(this.maxH, maxH))

    let x: number
    let y: number

    if (this.xPercent !== undefined) {
      const centerX = (containerCols * this.xPercent) / 100
      x = Math.round(centerX - w / 2) + this._originalX - 1
    } else {
      x = this._originalX
    }

    if (this.yPercent !== undefined) {
      const centerY = (containerRows * this.yPercent) / 100
      y = Math.round(centerY - h / 2) + this._originalY - 1
    } else {
      y = this._originalY
    }

    const minX = 0
    const minY = 0
    const maxX = containerCols - w - 2
    const maxY = containerRows - h - 2

    const clampedX = Math.max(minX, Math.min(x, maxX))
    const clampedY = Math.max(minY, Math.min(y, maxY))

    // Hide if the element can't fit even at minimum size
    const minFitX = containerCols - this.minW - 2
    const minFitY = containerRows - this.minH - 2

    if (minFitX < minX || minFitY < minY) {
      this.setHidden(true)
      return
    }

    this.setHidden(false)
    this.layout(clampedX, clampedY, Math.min(w, containerCols - 2), Math.min(h, containerRows - 2))
  }

  /**
   * Repositions the DOM node and fires resized().
   * Subclasses can override to intercept raw coords, but must call super first.
   */
  layout(x: number, y: number, w: number, h: number): void {
    this.x = x
    this.y = y
    this.w = w
    this.h = h
    this.el.style.transform = `translate(${(x + 1) * this.tileMetrics!.w}px, ${(y + 1) * this.tileMetrics!.h}px)`
    this.el.style.width = `${w * this.tileMetrics!.w}px`
    this.el.style.height = `${h * this.tileMetrics!.h}px`
    this.resized()
  }

  /**
   * Called by UILayout when this element is removed.
   * Subclasses should call super.destroy() to remove the DOM element.
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
  // Protected helpers
  // ---------------------------------------------------------------------------

  protected setHidden(hide: boolean): void {
    if (this._hidden === hide) return
    this._hidden = hide
    this.el.style.display = hide ? 'none' : ''
  }
}

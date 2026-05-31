import type { AsciiEngine } from '../../../core/Engine'
import type { TileMetricsData } from '../../tileMetrics'
import { UILayoutElement, type UISpatialConfig } from './UILayoutElement'

export type InnerLineData = {
  x: number
  y: number
  length: number
  vertical: boolean
}

type UnMountedChildEntry = {
  element: UILayoutElement
  config: UISpatialConfig
}

/**
 * Abstract base for UILayoutElements that manage their own list of child elements.
 *
 * Children are positioned within the container's interior coordinate space.
 * Inner divider lines participate in UILayout's reconciliation system via
 * getInnerLineData(), which returns local-space coordinates that UILayout
 * translates to viewport space when building segments.
 *
 * Children can be added before the container is mounted — they are queued and
 * flushed in loaded(). Children added after mount are laid out immediately.
 *
 * Child el nodes are appended into this.el, so they animate and are destroyed
 * with the container automatically.
 */
export abstract class UIContainerBase extends UILayoutElement {
  private _unmountedChildren: UnMountedChildEntry[] = []

  protected _children: UILayoutElement[] = []

  private _mounted = false

  // ---------------------------------------------------------------------------
  // Child management
  // ---------------------------------------------------------------------------

  addChild(element: UILayoutElement, config: UISpatialConfig): void {
    if (this._mounted) {
      this._mountChild(element, config)
      this._layoutChildren()
      this._children.push(element)
    } else {
      this._unmountedChildren.push({ element, config })
    }
  }

  removeChild(id: number): void {
    const idx = this._children.findIndex((c) => c.id === id)
    if (idx === -1) return

    const element = this._children[idx]
    this._children.splice(idx, 1)

    element.unloaded()
    element.destroy()

    if (this._mounted) this._layoutChildren()
  }

  // ---------------------------------------------------------------------------
  // Abstract interface
  // ---------------------------------------------------------------------------

  /**
   * Lay out all children within the container interior.
   * Called on mount and every resize.
   */
  protected abstract _layoutChildren(): void

  /**
   * Return the local-space coordinates of every inner divider line.
   */
  abstract getInnerLineData(): InnerLineData[]

  // ---------------------------------------------------------------------------
  // UILayoutElement lifecycle
  // ---------------------------------------------------------------------------

  loaded(): void {
    this._layoutChildren()
  }

  resized(): void {}

  unloaded(): void {
    for (const element of this._children) element.unloaded()
  }

  destroy(): void {
    for (const element of this._children) element.destroy()
    super.destroy()
  }

  // ---------------------------------------------------------------------------
  // Semi Private overrides
  // ---------------------------------------------------------------------------

  _mount(
    id: number,
    spatialConfig: UISpatialConfig,
    tileMetrics: TileMetricsData,
    engine: AsciiEngine,
  ): void {
    super._mount(id, spatialConfig, tileMetrics, engine)
    this._mounted = true
    for (const { element, config } of this._unmountedChildren) {
      this._children.push(element)
      this._mountChild(element, config)
    }
    this._unmountedChildren.length = 0
  }

  layout(x: number, y: number, w: number, h: number): void {
    super.layout(x, y, w, h)
    this._layoutChildren()
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private _mountChild(element: UILayoutElement, config: UISpatialConfig): void {
    // Assign a stable id derived from the container id so children have unique ids
    // that won't collide with UILayout's own id sequence.
    // We use a simple counter embedded in the element entry index.

    // TODO replace this ugly hack
    const childId = this.id * 1000 + this._children.findIndex((c) => c === element)

    element._mount(childId, config, this.tileMetrics, this.engine)
    this.el.appendChild(element.el)
    element.loaded()
  }
}

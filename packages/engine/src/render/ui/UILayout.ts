import type { AsciiEngine } from '../../core/Engine'
import { MASK as LINE_MASK, maskToGlyph } from '../lineGlyph'
import type { TileMetricsData } from '../tileMetrics'
import type { UILayoutElement, UISpatialConfig } from './layout_elements/UILayoutElement'
import { UISelectElement } from './layout_elements/UISelectElement'

type Segment = {
  el: HTMLPreElement
  vertical: boolean
  x: number
  y: number
  length: number
  chars: string[]
  ownerId: number
}

// ---------------------------------------------------------------------------
// Cell stack
// ---------------------------------------------------------------------------

type CellEntry = {
  priority: number
  seg: Segment
}

const FRAME_ID = -1

// ---------------------------------------------------------------------------
// UILayout
// ---------------------------------------------------------------------------

export class UILayout {
  private parentRoot: HTMLDivElement
  private root: HTMLDivElement
  private _engine: AsciiEngine

  // TODO get rid of inlayEl
  //  Currently used to fill the outside of the frame.
  //  We should be able to achieve this using pure css
  private inlayEl: HTMLDivElement

  tileMetrics: TileMetricsData

  private _cols = 0
  private _rows = 0

  private _frame: {
    top: Segment
    right: Segment
    bottom: Segment
    left: Segment
  } | null = null

  private _elements = new Map<number, UILayoutElement>()
  // Per-element border segments, use element.id as key
  private _elementSegments = new Map<number, Segment[]>()

  private _nextId = 1

  /**
   * Per-cell ownership stacks.
   * Key: `this._key(x, y)`. Value: entries sorted by priority, ascending (top = last).
   */
  private _cellStacks = new Map<string, CellEntry[]>()

  constructor(
    parentRoot: HTMLDivElement,
    root: HTMLDivElement,
    tileMetrics: TileMetricsData,
    engine: AsciiEngine,
  ) {
    this.parentRoot = parentRoot
    this.root = root
    this._engine = engine
    this.tileMetrics = tileMetrics

    const inlayEl = document.createElement('div')
    inlayEl.className = 'ui-layout-inlay'
    parentRoot.prepend(inlayEl)
    this.inlayEl = inlayEl
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  drawFrame(): void {
    const rawCols = this.parentRoot.clientWidth / this.tileMetrics.w
    const rawRows = this.parentRoot.clientHeight / this.tileMetrics.h
    const cols = Math.floor(rawCols)
    const rows = Math.floor(rawRows)

    const paddingX = (rawCols - cols) * this.tileMetrics.w
    const paddingY = (rawRows - rows) * this.tileMetrics.h

    this.root.style.padding = `${paddingY / 2}px ${paddingX / 2}px`
    this.inlayEl.style.boxShadow = `inset 0 0 0 ${Math.max(paddingX, paddingY)}px var(--ui-bg)`

    if (this._frame && cols === this._cols && rows === this._rows) return

    this._cols = cols
    this._rows = rows

    this._buildFrame()
    this._rebuildAllElementSegments()
    this._reconcileAll()
  }

  onResize(): void {
    this.drawFrame()
  }

  addElement(element: UILayoutElement, spatialConfig: UISpatialConfig): number {
    element._mount(this._nextId++, spatialConfig, this.tileMetrics, this._engine)
    this.root.appendChild(element.el)

    this._elements.set(element.id, element)
    element.reflow(this._cols, this._rows)

    if (!element.hidden) {
      this._buildElementSegments(element)
      this._reconcileBorderNeighbors(element)
    }

    element.onLoad()
    return element.id
  }

  removeElement(id: number): void {
    const element = this._elements.get(id)
    if (!element) return

    element.onUnload()
    this._teardownElementSegments(id)
    this._elements.delete(id)
    element.destroy()
  }

  public addPaletteElement(spatialConfig: UISpatialConfig): void {
    const themeManager = this._engine.renderer.themeManager
    const themes = themeManager.getThemeNames()
    const currentTheme = themeManager.current
    const previousTheme = currentTheme

    const selectEl = new UISelectElement(themes)
    this._engine.renderer.ui.addElement(selectEl, spatialConfig)
    selectEl.currentIndex = themes.indexOf(currentTheme)

    selectEl.onChange((selectId: number) => {
      themeManager.set(themes[selectId])
    })

    selectEl.onSelect((selectId: number) => {
      if (selectId == -1) themeManager.set(previousTheme)
      else themeManager.set(themes[selectId])
    })
  }

  // ---------------------------------------------------------------------------
  // Frame construction
  // ---------------------------------------------------------------------------

  private _buildFrame(): void {
    // Tear down old frame
    if (this._frame) {
      for (const seg of [
        this._frame.top,
        this._frame.right,
        this._frame.bottom,
        this._frame.left,
      ]) {
        this._popSegmentFromStacks(seg)
        seg.el.remove()
      }
      this._frame = null
    }

    const cols = this._cols
    const rows = this._rows

    const top = this._makeSegment(0, 0, cols, FRAME_ID, '═')
    const bottom = this._makeSegment(0, rows - 1, cols, FRAME_ID, '═')
    const left = this._makeSegment(0, 0, rows, FRAME_ID, '║', true)
    const right = this._makeSegment(cols - 1, 0, rows, FRAME_ID, '║', true)

    this._frame = { top, bottom, left, right }
    for (const seg of [top, bottom, left, right]) {
      this._pushSegmentToStacks(seg, -Infinity)
    }
  }

  // ---------------------------------------------------------------------------
  // Element segment construction
  // ---------------------------------------------------------------------------

  private _buildElementSegments(element: UILayoutElement): void {
    const priority = element.priority

    const bx = element.x
    const by = element.y
    const bw = element.w + 2
    const bh = element.h + 2

    const top = this._makeSegment(bx, by, bw, element.id, '═')
    const bottom = this._makeSegment(bx, by + bh - 1, bw, element.id, '═')
    const left = this._makeSegment(bx, by, bh, element.id, '║', true)
    const right = this._makeSegment(bx + bw - 1, by, bh, element.id, '║', true)

    const segments = [top, bottom, left, right]
    this._elementSegments.set(element.id, segments)

    for (const seg of segments) {
      this._pushSegmentToStacks(seg, priority)
    }
  }

  private _teardownElementSegments(id: number): void {
    const segments = this._elementSegments.get(id)
    if (!segments) return

    // Collect all affected cells before mutating stacks
    const affectedCells = new Set<string>()
    for (const seg of segments) {
      for (let i = 0; i < seg.length; i++) {
        const [cx, cy] = this._segCellAt(seg, i)
        affectedCells.add(this._key(cx, cy))
      }
    }

    // Pop this element from all its cells
    for (const seg of segments) {
      this._popSegmentFromStacks(seg)
      seg.el.remove()
    }
    this._elementSegments.delete(id)

    // For each affected cell, reconcile the new top entry
    for (const key of affectedCells) {
      const [cx, cy] = key.split(',').map(Number) as [number, number]
      this._reconcileAt(cx, cy)
    }
  }

  private _rebuildAllElementSegments(): void {
    for (const [id, element] of this._elements) {
      // Pop old stacks and remove DOM elements
      const segments = this._elementSegments.get(id)
      if (segments) {
        for (const seg of segments) {
          this._popSegmentFromStacks(seg)
          seg.el.remove()
        }
        this._elementSegments.delete(id)
      }

      element.reflow(this._cols, this._rows)
      if (!element.hidden) {
        this._buildElementSegments(element)
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Segment factories
  // ---------------------------------------------------------------------------

  private _makeSegment(
    x: number,
    y: number,
    length: number,
    ownerId: number,
    glyph: string = ' ',
    vertical: boolean = false,
  ): Segment {
    const el = document.createElement('pre')
    el.className = 'ui-layout-line'
    const { w, h } = this.tileMetrics
    el.style.transform = `translate(${x * w}px, ${y * h}px)`
    const chars = new Array<string>(length).fill(glyph)
    this.root.appendChild(el)
    return { el, vertical, x, y, length, chars, ownerId }
  }

  private _flushSegment(seg: Segment): void {
    seg.el.textContent = seg.vertical ? seg.chars.join('\n') : seg.chars.join('')
  }

  // ---------------------------------------------------------------------------
  // Cell stack management
  // ---------------------------------------------------------------------------

  private _pushSegmentToStacks(seg: Segment, priority: number): void {
    for (let i = 0; i < seg.length; i++) {
      const [cx, cy] = this._segCellAt(seg, i)
      const key = this._key(cx, cy)

      let stack = this._cellStacks.get(key)
      if (!stack) {
        stack = []
        this._cellStacks.set(key, stack)
      }

      // Insert sorted by priority ascending (highest priority = last = top)
      const entry: CellEntry = { priority, seg }
      let insertAt = stack.length
      for (let j = stack.length - 1; j >= 0; j--) {
        if (stack[j].priority <= priority) break
        insertAt = j
      }
      stack.splice(insertAt, 0, entry)
    }
  }

  private _popSegmentFromStacks(seg: Segment): void {
    for (let i = 0; i < seg.length; i++) {
      const [cx, cy] = this._segCellAt(seg, i)
      const key = this._key(cx, cy)
      const stack = this._cellStacks.get(key)
      if (!stack) continue

      const idx = stack.findLastIndex((e) => e.seg === seg)

      if (idx !== -1) stack.splice(idx, 1)
      if (stack.length === 0) this._cellStacks.delete(key)
    }
  }

  /** Returns true if any entry exists for this cell (used for neighbor detection). */
  private _cellOccupied(cx: number, cy: number): boolean {
    return this._cellStacks.has(this._key(cx, cy))
  }

  /** Returns the top segment for a cell, or null. */
  private _topSegment(cx: number, cy: number): Segment | null {
    const stack = this._cellStacks.get(this._key(cx, cy))
    if (!stack || stack.length === 0) return null
    return stack[stack.length - 1].seg
  }

  // ---------------------------------------------------------------------------
  // Reconciliation
  // ---------------------------------------------------------------------------

  private _reconcileAt(cx: number, cy: number): void {
    const topSeg = this._topSegment(cx, cy)

    // Nothing owns this cell — blank every segment that might have written here
    // (handles the case where frame cells are removed on resize)
    if (!topSeg) return

    let mask = LINE_MASK.DOUBLE
    if (this._cellOccupied(cx, cy - 1)) mask |= LINE_MASK.TOP
    if (this._cellOccupied(cx + 1, cy)) mask |= LINE_MASK.RIGHT
    if (this._cellOccupied(cx, cy + 1)) mask |= LINE_MASK.BOTTOM
    if (this._cellOccupied(cx - 1, cy)) mask |= LINE_MASK.LEFT

    const glyph = maskToGlyph(mask)
    const i = topSeg.vertical ? cy - topSeg.y : cx - topSeg.x
    if (i < 0 || i >= topSeg.length) return

    topSeg.chars[i] = glyph
    this._flushSegment(topSeg)

    // Blank this cell in all lower segments so they don't bleed through
    const stack = this._cellStacks.get(this._key(cx, cy))!
    for (let s = 0; s < stack.length - 1; s++) {
      const lowerSeg = stack[s].seg
      const li = lowerSeg.vertical ? cy - lowerSeg.y : cx - lowerSeg.x
      if (li >= 0 && li < lowerSeg.length) {
        lowerSeg.chars[li] = ' '
        this._flushSegment(lowerSeg)
      }
    }
  }

  private _reconcileAll(): void {
    for (const [key] of this._cellStacks) {
      const [cx, cy] = key.split(',').map(Number) as [number, number]
      this._reconcileAt(cx, cy)
    }
  }

  private _reconcileBorderNeighbors(element: UILayoutElement): void {
    const affected = new Set<string>()

    for (const [cx, cy] of element.borderCoords()) {
      affected.add(this._key(cx, cy))
      affected.add(this._key(cx + 1, cy))
      affected.add(this._key(cx, cy + 1))
      affected.add(this._key(cx + 1, cy + 1))
    }

    for (const key of affected) {
      const [cx, cy] = key.split(',').map(Number) as [number, number]
      this._reconcileAt(cx, cy)
    }
  }

  // ---------------------------------------------------------------------------
  // Utilities
  // ---------------------------------------------------------------------------

  private _segCellAt(seg: Segment, i: number): [number, number] {
    return seg.vertical ? [seg.x, seg.y + i] : [seg.x + i, seg.y]
  }

  private _key(x: number, y: number): string {
    return `${x},${y}`
  }
}

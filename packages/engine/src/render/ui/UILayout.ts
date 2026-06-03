import type { AsciiEngine } from '../../core/Engine'
import type { Camera } from '../Camera'
import { MASK as LINE_MASK, maskToGlyph } from '../lineGlyph'
import type { TileMetricsData } from '../tileMetrics'
import type { UINode, UISpatialConfig } from './layout_elements/UINode'
import type { UIContainerBase } from './layout_elements/UIContainerBase'
import type { UISelectBase } from './layout_elements/UISelectBase'
import { UISelectElement } from './layout_elements/UISelectElement'
import type { Segment } from './segment'
import { BorderAnimator } from './BorderAnimator'
import { WorldUILayer } from './WorldUILayer'

export type { Segment }

// ---------------------------------------------------------------------------
// Cell stack
// ---------------------------------------------------------------------------

type CellEntry = {
  priority: number
  seg: Segment
}

type ContentRect = {
  /** First usable tile column inside the frame (0-based, frame-relative) */
  x: number
  /** First usable tile row inside the frame (0-based, frame-relative) */
  y: number
  /** Number of usable columns */
  cols: number
  /** Number of usable rows */
  rows: number
}

const FRAME_ID = -1

// ---------------------------------------------------------------------------
// UILayout
// ---------------------------------------------------------------------------

export class UILayout {
  private parentRoot: HTMLDivElement
  private root: HTMLDivElement
  private _engine: AsciiEngine

  tileMetrics: TileMetricsData

  /** World-space anchored elements — speech bubbles, labels, health bars, etc. */
  readonly world: WorldUILayer

  private _cols = 0
  private _rows = 0

  /**
   * The tile region available to non-dock elements after all docked panels
   * have claimed their edges. Coordinates are frame-relative (origin = top-left
   * tile inside the outer frame border). Recomputed whenever a dock panel is
   * added or removed.
   */
  private _contentRect: ContentRect = { x: 0, y: 0, cols: 0, rows: 0 }

  private _frame: {
    top: Segment
    right: Segment
    bottom: Segment
    left: Segment
  } | null = null

  private _elements = new Map<number, UINode>()
  // Per-element border segments, use element.id as key
  private _elementSegments = new Map<number, Segment[]>()

  private _nextId = 1

  /**
   * Per-cell ownership stacks.
   * Key: `this._key(x, y)`. Value: entries sorted by priority, ascending (top = last).
   */
  private _cellStacks = new Map<string, CellEntry[]>()

  private _animator: BorderAnimator

  constructor(
    parentRoot: HTMLDivElement,
    root: HTMLDivElement,
    tileMetrics: TileMetricsData,
    engine: AsciiEngine,
    camera: Camera,
    worldLayerEl: HTMLDivElement,
  ) {
    this.parentRoot = parentRoot
    this.root = root
    this.root.style.position = 'absolute'
    this._engine = engine
    this.tileMetrics = tileMetrics

    this.world = new WorldUILayer(camera, tileMetrics, engine, worldLayerEl)

    this._animator = new BorderAnimator({
      tileMetrics,
      cellOccupied: (x, y) => this._cellOccupied(x, y),
      flushSegment: (seg) => this._flushSegment(seg),
    })
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  /** Start the world-UI frame loop. Called by Renderer after camera is live. */
  _start(): void {
    this.world._start()
  }

  /** Stop the world-UI frame loop. Called by Renderer on destroy. */
  _stop(): void {
    this.world._stop()
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
    this.root.style.left = `${this.tileMetrics.w}px`
    this.root.style.top = `${this.tileMetrics.h}px`
    this.root.style.width = `${(cols - 2) * this.tileMetrics.w}px`
    this.root.style.height = `${(rows - 2) * this.tileMetrics.h}px`

    if (this._frame && cols === this._cols && rows === this._rows) return

    this._cols = cols - 2
    this._rows = rows - 2

    this._layoutDockElements()
    this._buildFrame()
    this._rebuildAllElementSegments()
    this._reconcileAll()
  }

  resized(): void {
    this.drawFrame()
  }

  addElement(element: UINode, spatialConfig: UISpatialConfig, animate = true): number {
    element._mount(this._nextId++, spatialConfig, this.tileMetrics, this._engine)
    this.root.appendChild(element.el)

    this._elements.set(element.id, element)

    if (element.dock !== undefined) {
      this._layoutDockElements()
      this._reflowNonDockElements()
    } else {
      this._reflowElement(element)
    }

    // Load the element early to improve reactivity to inputs.
    // Wait for event propagation to end before doing so.
    queueMicrotask(() => element.loaded())

    if (!element.hidden) {
      this._buildElementSegments(element)

      if (animate) {
        const segs = this._elementSegments.get(element.id)!
        const openPromise = this._animator.runOpen(element, segs).then(() => {
          if (!this._elements.has(element.id)) return // closing animation handles cleanup
          for (const seg of segs) this._pushSegmentToStacks(seg, element.priority)
          this._reconcileBorderNeighbors(element)
        })
        // Register the combined promise (animation + post-work) with the animator
        // so runClose can await it before starting the close sequence.
        this._animator.registerOpenCompletion(element.id, openPromise)
      } else {
        const segs = this._elementSegments.get(element.id)!
        for (const seg of segs) this._pushSegmentToStacks(seg, element.priority)
        this._reconcileBorderNeighbors(element)
      }
    }
    return element.id
  }

  removeElement(id: number, animate = true): void {
    const element = this._elements.get(id)
    if (!element) return

    element.unloaded()

    this._elements.delete(id)
    this._teardownElementSegments(id)

    const wasDock = element.dock !== undefined

    if (animate) {
      void this._runCloseAnimation(element, id)
    } else {
      const segs = this._elementSegments.get(id)
      if (segs) {
        for (const seg of segs) seg.el.remove()
        this._elementSegments.delete(id)
      }
      element.destroy()
    }

    if (wasDock) {
      this._layoutDockElements()
      this._reflowNonDockElements()
    }
  }

  public addPaletteElement(
    spatialConfig: UISpatialConfig,
    uiSelectClass?: new (themes: string[], ...args: unknown[]) => UISelectBase,
  ): void {
    const themeManager = this._engine.renderer.themeManager
    const themes = themeManager.getThemeNames()
    const currentTheme = themeManager.current
    const previousTheme = currentTheme

    const selectEl = uiSelectClass ? new uiSelectClass(themes) : new UISelectElement(themes)
    this._engine.renderer.ui.addElement(selectEl, spatialConfig)
    selectEl.currentIndex = themes.indexOf(currentTheme)

    selectEl.onChange((selectId: number) => {
      themeManager.set(themes[selectId])
    })

    selectEl.onSelect((selectId: number) => {
      if (selectId === -1) themeManager.set(previousTheme)
      else themeManager.set(themes[selectId])
    })
  }

  // ---------------------------------------------------------------------------
  // Content rect
  // ---------------------------------------------------------------------------

  getContentCenterOffset(): { x: number; y: number } {
    const { x, y, cols, rows } = this._contentRect
    return {
      x: x + (cols - this._cols) / 2,
      y: y + (rows - this._rows) / 2,
    }
  }

  /**
   * Lays out all docked elements in insertion order, each claiming its edge
   * from the running rect before shrinking it for the next panel.
   *
   * Side effects: calls element.layout() on each dock element, updates
   * _contentRect. Must be called after _cols / _rows change or any dock
   * add / remove.
   */
  private _layoutDockElements(): void {
    let x = 0
    let y = 0
    let cols = this._cols
    let rows = this._rows

    for (const element of this._elements.values()) {
      if (element.dock === undefined) continue

      let ex: number, ey: number, ew: number, eh: number

      switch (element.dock) {
        case 'left':
          ex = x
          ey = y
          ew = element.w
          eh = rows
          x += ew + 1
          cols -= ew + 1
          break
        case 'right':
          ew = element.w
          eh = rows
          ex = x + cols - ew
          ey = y
          cols -= ew + 1
          break
        case 'top':
          ex = x
          ey = y
          ew = cols
          eh = element.h
          y += eh + 1
          rows -= eh + 1
          break
        case 'bottom':
          ew = cols
          eh = element.h
          ex = x
          ey = y + rows - eh
          rows -= eh + 1
          break
        default:
          continue
      }

      element.hidden = ew <= 0 || eh <= 0
      if (!element.hidden) element.layout(ex, ey, ew, eh)
    }

    this._contentRect = { x, y, cols: Math.max(0, cols), rows: Math.max(0, rows) }
  }

  // ---------------------------------------------------------------------------
  // Reflow helpers
  // ---------------------------------------------------------------------------

  private _reflowElement(element: UINode): void {
    const { x, y, cols, rows } = this._contentRect
    element.reflow(cols, rows, x, y)
  }

  private _reflowNonDockElements(): void {
    for (const element of this._elements.values()) {
      if (element.dock !== undefined) continue
      this._reflowElement(element)
    }
  }

  // ---------------------------------------------------------------------------
  // Animation orchestration
  // ---------------------------------------------------------------------------

  private async _runCloseAnimation(element: UINode, id: number): Promise<void> {
    const segs = this._elementSegments.get(id)
    if (!segs || segs.length < 4) {
      element.destroy()
      return
    }

    await this._animator.runClose(element, id, segs)

    for (const seg of segs) seg.el.remove()
    this._elementSegments.delete(id)
    element.destroy()
  }

  // ---------------------------------------------------------------------------
  // Frame construction
  // ---------------------------------------------------------------------------

  private _buildFrame(): void {
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

    const top = this._makeSegment(0, -1, cols + 1, FRAME_ID, '═')
    const bottom = this._makeSegment(0, rows, cols + 1, FRAME_ID, '═')
    const left = this._makeSegment(-1, -1, rows + 2, FRAME_ID, '║', true)
    const right = this._makeSegment(cols, -1, rows + 2, FRAME_ID, '║', true)

    this._frame = { top, bottom, left, right }
    for (const seg of [top, bottom, left, right]) {
      this._pushSegmentToStacks(seg, -Infinity)
    }
  }

  // ---------------------------------------------------------------------------
  // Element segment construction
  // ---------------------------------------------------------------------------

  private _buildElementSegments(element: UINode): void {
    const bx = element.x - 1
    const by = element.y - 1
    const bw = element.w + 2
    const bh = element.h + 2

    const top = this._makeSegment(bx, by, bw, element.id, '═')
    const bottom = this._makeSegment(bx, by + bh - 1, bw, element.id, '═')
    const left = this._makeSegment(bx, by, bh, element.id, '║', true)
    const right = this._makeSegment(bx + bw - 1, by, bh, element.id, '║', true)

    this._elementSegments.set(element.id, [top, bottom, left, right])
    this._buildInnerLineSegments(element)
  }

  private _buildInnerLineSegments(element: UINode): void {
    const container = element as unknown as UIContainerBase
    if (typeof container.getInnerLineData !== 'function') return

    const lines = container.getInnerLineData()
    const segs = this._elementSegments.get(element.id)!

    for (const line of lines) {
      const vx = element.x + line.x
      const vy = element.y + line.y
      const seg = this._makeInnerLineSeg(vx, vy, line, element)
      segs.push(seg)
    }
  }

  private _teardownElementSegments(id: number): void {
    const segments = this._elementSegments.get(id)
    if (!segments) return

    const affectedCells = new Set<string>()
    for (const seg of segments) {
      for (let i = 0; i < seg.length; i++) {
        const [cx, cy] = this._segCellAt(seg, i)
        affectedCells.add(this._key(cx, cy))
      }
    }

    for (const seg of segments) {
      this._popSegmentFromStacks(seg)
    }

    for (const key of affectedCells) {
      const [cx, cy] = key.split(',').map(Number) as [number, number]
      this._reconcileAt(cx, cy)
    }
  }

  private _rebuildAllElementSegments(): void {
    for (const [id, element] of this._elements) {
      const segments = this._elementSegments.get(id)
      if (segments) {
        for (const seg of segments) {
          this._popSegmentFromStacks(seg)
          seg.el.remove()
        }
        this._elementSegments.delete(id)
      }

      if (element.dock === undefined) {
        this._reflowElement(element)
      }

      if (!element.hidden) {
        this._buildElementSegments(element)
        const segs = this._elementSegments.get(id)!
        for (const seg of segs) {
          this._pushSegmentToStacks(seg, element.priority)
        }
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
    parentEl: HTMLElement = this.root,
  ): Segment {
    const el = document.createElement('pre')
    el.className = 'ui-layout-line'
    const { w, h } = this.tileMetrics
    el.style.transform = `translate(${x * w}px, ${y * h}px)`
    const chars = new Array<string>(length).fill(glyph)
    const seg: Segment = { el, vertical, x, y, length, chars, ownerId }
    this._flushSegment(seg)
    parentEl.appendChild(el)
    return seg
  }

  private _makeInnerLineSeg(
    vx: number,
    vy: number,
    line: { x: number; y: number; length: number; vertical: boolean },
    element: UINode,
  ): Segment {
    const { w, h } = this.tileMetrics
    const el = document.createElement('pre')
    el.className = 'ui-layout-line'
    el.style.transform = `translate(${line.x * w}px, ${line.y * h}px)`

    const glyph = line.vertical ? '║' : '═'
    const chars = new Array<string>(line.length).fill(glyph)
    const seg: Segment = {
      el,
      vertical: line.vertical,
      x: vx,
      y: vy,
      length: line.length,
      chars,
      ownerId: element.id,
    }
    this._flushSegment(seg)
    element.el.appendChild(el)
    return seg
  }

  _flushSegment(seg: Segment): void {
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

  _cellOccupied(cx: number, cy: number): boolean {
    return this._cellStacks.has(this._key(cx, cy))
  }

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

    const stack = this._cellStacks.get(this._key(cx, cy))!
    for (let s = 0; s < stack.length - 1; s++) {
      const lowerSeg = stack[s].seg
      const li = lowerSeg.vertical ? cy - lowerSeg.y : cx - lowerSeg.x
      if (li >= 0 && li < lowerSeg.length) {
        lowerSeg.chars[li] = glyph
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

  private _reconcileBorderNeighbors(element: UINode): void {
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

import { MASK as LINE_MASK, maskToGlyph } from '../lineGlyph'
import type { TileMetricsData } from '../tileMetrics'
import { UILayoutElement, type UILayoutElementConfig } from './layout_elements/UILayoutElement'

// ---------------------------------------------------------------------------
// Segment — one <pre> element representing one straight line run
// ---------------------------------------------------------------------------

type SegmentOrientation = 'horizontal' | 'vertical'

type Segment = {
  el: HTMLPreElement
  orientation: SegmentOrientation
  /** Start cell in viewport-local tile coords */
  x: number
  y: number
  /** Length in tiles */
  length: number
  /** chars[i] is the glyph at offset i along the segment */
  chars: string[]
  /** Owner id — FRAME_ID for frame segments, element.id for element segments */
  ownerId: number
}

function makeSegmentEl(): HTMLPreElement {
  const el = document.createElement('pre')
  el.className = 'ui-layout-line'
  el.style.position = 'absolute'
  el.style.margin = '0'
  el.style.padding = '0'
  el.style.whiteSpace = 'pre'
  el.style.pointerEvents = 'none'
  return el
}

// ---------------------------------------------------------------------------
// Cell stack
// ---------------------------------------------------------------------------

/** One entry in a cell's ownership stack, sorted ascending by priority. */
type CellEntry = {
  priority: number
  seg: Segment
}

/** The FRAME_ID sentinel — always at priority -Infinity, never popped. */
const FRAME_ID = -1

// ---------------------------------------------------------------------------
// UILayout
// ---------------------------------------------------------------------------

/**
 * Owns the viewport frame and all line-based UI layout.
 *
 * Per-cell ownership is now a **priority-sorted stack** rather than
 * last-writer-wins. The topmost entry (highest priority) determines what
 * glyph is rendered at that cell. Adding an element pushes onto relevant
 * stacks; removing pops and lets the entry beneath show through — no
 * cascading redraws, no saved chars.
 */
export class UILayout {
  private parentRoot: HTMLDivElement
  private root: HTMLDivElement
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
  /** Per-element border segments, keyed by element id */
  private _elementSegments = new Map<number, Segment[]>()

  private _nextId = 1

  /**
   * Per-cell ownership stacks.
   * Key: "cx,cy". Value: entries sorted by priority ascending (top = last).
   */
  private _cellStacks = new Map<string, CellEntry[]>()

  constructor(parentRoot: HTMLDivElement, root: HTMLDivElement, tileMetrics: TileMetricsData) {
    this.parentRoot = parentRoot
    this.root = root
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

  createElement(config: Omit<UILayoutElementConfig, 'id'>): UILayoutElement {
    const id = this._nextId++
    const el = document.createElement('div')
    el.className = 'ui-layout-element'
    el.style.position = 'absolute'
    this.root.appendChild(el)

    const element = new UILayoutElement({ ...config, id }, el, this.tileMetrics)
    element.reflow(this._cols, this._rows)

    this._elements.set(id, element)

    if (!element.hidden) {
      this._buildElementSegments(element)
      this._reconcileBorderNeighbors(element)
    }

    return element
  }

  removeElement(id: number): void {
    const element = this._elements.get(id)
    if (!element) return

    // Pop this element's cells from the stacks, reconcile affected positions
    this._teardownElementSegments(id)
    this._elements.delete(id)
    element.destroy()
  }

  // ---------------------------------------------------------------------------
  // Frame construction
  // ---------------------------------------------------------------------------

  private _buildFrame(): void {
    // Tear down old frame — pop all FRAME_ID entries from stacks
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

    const { w, h } = this.tileMetrics
    const cols = this._cols
    const rows = this._rows

    const top = this._makeHSegment(0, 0, cols, FRAME_ID)
    const bottom = this._makeHSegment(0, rows - 1, cols, FRAME_ID)
    const left = this._makeVSegment(0, 0, rows, FRAME_ID)
    const right = this._makeVSegment(cols - 1, 0, rows, FRAME_ID)

    top.el.style.transform = `translate(0px, 0px)`
    bottom.el.style.transform = `translate(0px, ${(rows - 1) * h}px)`
    left.el.style.transform = `translate(0px, 0px)`
    right.el.style.transform = `translate(${(cols - 1) * w}px, 0px)`

    this.root.appendChild(top.el)
    this.root.appendChild(bottom.el)
    this.root.appendChild(left.el)
    this.root.appendChild(right.el)

    this._frame = { top, bottom, left, right }

    // Push frame segments onto stacks at priority -Infinity
    for (const seg of [top, bottom, left, right]) {
      this._pushSegmentToStacks(seg, -Infinity)
    }

    this._fillSegment(top, '═')
    this._fillSegment(bottom, '═')
    this._fillSegment(left, '║')
    this._fillSegment(right, '║')
  }

  // ---------------------------------------------------------------------------
  // Element segment construction
  // ---------------------------------------------------------------------------

  private _buildElementSegments(element: UILayoutElement): void {
    const { w, h } = this.tileMetrics
    const priority = element.priority

    const bx = element.x
    const by = element.y
    const bw = element.w + 2
    const bh = element.h + 2

    const top = this._makeHSegment(bx, by, bw, element.id)
    const bottom = this._makeHSegment(bx, by + bh - 1, bw, element.id)
    const left = this._makeVSegment(bx, by, bh, element.id)
    const right = this._makeVSegment(bx + bw - 1, by, bh, element.id)

    top.el.style.transform = `translate(${bx * w}px, ${by * h}px)`
    bottom.el.style.transform = `translate(${bx * w}px, ${(by + bh - 1) * h}px)`
    left.el.style.transform = `translate(${bx * w}px, ${by * h}px)`
    right.el.style.transform = `translate(${(bx + bw - 1) * w}px, ${by * h}px)`

    this.root.appendChild(top.el)
    this.root.appendChild(bottom.el)
    this.root.appendChild(left.el)
    this.root.appendChild(right.el)

    const segments = [top, bottom, left, right]
    this._elementSegments.set(element.id, segments)

    for (const seg of segments) {
      this._pushSegmentToStacks(seg, priority)
    }

    this._fillSegment(top, '═')
    this._fillSegment(bottom, '═')
    this._fillSegment(left, '║')
    this._fillSegment(right, '║')
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

  private _makeHSegment(x: number, y: number, length: number, ownerId: number): Segment {
    const el = makeSegmentEl()
    const chars = new Array<string>(length).fill(' ')
    return { el, orientation: 'horizontal', x, y, length, chars, ownerId }
  }

  private _makeVSegment(x: number, y: number, length: number, ownerId: number): Segment {
    const el = makeSegmentEl()
    el.style.lineHeight = `${this.tileMetrics.h}px`
    const chars = new Array<string>(length).fill(' ')
    return { el, orientation: 'vertical', x, y, length, chars, ownerId }
  }

  private _fillSegment(seg: Segment, glyph: string): void {
    seg.chars.fill(glyph)
    this._flushSegment(seg)
  }

  private _flushSegment(seg: Segment): void {
    seg.el.textContent = seg.orientation === 'vertical' ? seg.chars.join('\n') : seg.chars.join('')
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
    const i = topSeg.orientation === 'horizontal' ? cx - topSeg.x : cy - topSeg.y
    if (i < 0 || i >= topSeg.length) return

    topSeg.chars[i] = glyph
    this._flushSegment(topSeg)

    // Blank this cell in all lower segments so they don't bleed through
    const stack = this._cellStacks.get(this._key(cx, cy))!
    for (let s = 0; s < stack.length - 1; s++) {
      const lowerSeg = stack[s].seg
      const li = lowerSeg.orientation === 'horizontal' ? cx - lowerSeg.x : cy - lowerSeg.y
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
    return seg.orientation === 'horizontal' ? [seg.x + i, seg.y] : [seg.x, seg.y + i]
  }

  private _key(x: number, y: number): string {
    return `${x},${y}`
  }
}

import type { TileMetricsData } from '../tileMetrics'
import { UILayoutElement, type UILayoutElementConfig } from './UILayoutElement'

// ---------------------------------------------------------------------------
// Box-drawing glyph table (double-line only)
// Bit mask: TOP=0b10000 RIGHT=0b01000 BOTTOM=0b00100 LEFT=0b00010 DOUBLE=0b00001
// ---------------------------------------------------------------------------

const TOP = 0b10000
const RIGHT = 0b01000
const BOTTOM = 0b00100
const LEFT = 0b00010
const DOUBLE = 0b00001

const GLYPHS: Record<number, string> = {
  [DOUBLE | RIGHT | BOTTOM]: '╔',
  [DOUBLE | LEFT | BOTTOM]: '╗',
  [DOUBLE | TOP | RIGHT]: '╚',
  [DOUBLE | TOP | LEFT]: '╝',
  [DOUBLE | RIGHT | LEFT]: '═',
  [DOUBLE | TOP | BOTTOM]: '║',
  [DOUBLE | TOP | RIGHT | BOTTOM]: '╠',
  [DOUBLE | TOP | LEFT | BOTTOM]: '╣',
  [DOUBLE | RIGHT | LEFT | BOTTOM]: '╦',
  [DOUBLE | TOP | RIGHT | LEFT]: '╩',
  [DOUBLE | TOP | RIGHT | LEFT | BOTTOM]: '╬',
  [DOUBLE | RIGHT]: '═',
  [DOUBLE | LEFT]: '═',
  [DOUBLE | TOP]: '║',
  [DOUBLE | BOTTOM]: '║',
}

function maskToGlyph(mask: number): string {
  return GLYPHS[mask] ?? ' '
}

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
// UILayout
// ---------------------------------------------------------------------------

/**
 * Owns the viewport frame and all line-based UI layout.
 *
 * Single instance per RendererUI. RendererUI creates it inside init() after
 * tile metrics are measured.
 *
 * Responsibilities:
 *   - Four frame segments (top, right, bottom, left) drawn as <pre> elements
 *   - UILayoutElement instances with their own border segments
 *   - Line cell tracking (_lineCells) and local reconciliation
 *   - No knowledge of world coords, world entities, or legacy UINodes
 *
 * All glyph writes go through _setCell() which keeps _chars and DOM in sync.
 */
export class UILayout {
  private parentRoot: HTMLDivElement
  private root: HTMLDivElement
  private inlayEl: HTMLDivElement
  tileMetrics: TileMetricsData

  /** Viewport size in tiles, measured on each drawFrame() */
  private _cols = 0
  private _rows = 0

  /** The four frame segments — null before drawFrame() */
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
   * For every cell that carries a line glyph, tracks which segment owns it.
   * Used by reconciliation to find the element to write to.
   * A cell can be owned by at most one segment (the topmost one in draw order).
   */
  private _lineCells = new Map<string, Segment>()

  constructor(root: HTMLDivElement, tileMetrics: TileMetricsData) {
    this.parentRoot = root

    const uiLayoutRoot = document.createElement('div')
    uiLayoutRoot.className = 'ui-layout-root'
    root.appendChild(uiLayoutRoot)
    this.root = uiLayoutRoot

    const inlayEl = document.createElement('div')
    inlayEl.className = 'ui-layout-inlay'
    root.appendChild(inlayEl)
    this.inlayEl = inlayEl

    this.tileMetrics = tileMetrics
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * (Re-)draw the frame to fit the current root dimensions and tile metrics.
   * Call once in Renderer.init() after setTileHAndW(), and again on resize
   * via onResize().
   */
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

  /** Called from Renderer.handleWindowState when the window is restored */
  onResize(): void {
    this.drawFrame()
  }

  /**
   * Create and register a UILayoutElement.
   * x, y, w, h describe the interior in viewport-local tile coords.
   * The border occupies the 1-tile perimeter around the interior.
   */
  createElement(config: Omit<UILayoutElementConfig, 'id'>): UILayoutElement {
    const id = this._nextId++
    const el = document.createElement('div')
    el.className = 'ui-layout-element'
    el.style.position = 'absolute'
    this.root.appendChild(el)

    const element = new UILayoutElement({ ...config, id }, el, this.tileMetrics)
    element.layout(config.x, config.y, config.w, config.h)

    this._elements.set(id, element)
    this._buildElementSegments(element)
    this._reconcileBorderNeighbors(element)

    return element
  }

  removeElement(id: number): void {
    const element = this._elements.get(id)
    if (!element) return

    this._teardownElementSegments(id)
    this._elements.delete(id)
    element.destroy()

    this._reconcileAll()
  }

  // ---------------------------------------------------------------------------
  // Frame construction
  // ---------------------------------------------------------------------------

  private _buildFrame(): void {
    // Tear down old frame
    if (this._frame) {
      this._frame.top.el.remove()
      this._frame.right.el.remove()
      this._frame.bottom.el.remove()
      this._frame.left.el.remove()
      this._frame = null
    }

    const { w, h } = this.tileMetrics
    const cols = this._cols
    const rows = this._rows

    const top = this._makeHSegment(0, 0, cols)
    const bottom = this._makeHSegment(0, rows - 1, cols)
    const left = this._makeVSegment(0, 0, rows)
    const right = this._makeVSegment(cols - 1, 0, rows)

    top.el.style.transform = `translate(0px, 0px)`
    bottom.el.style.transform = `translate(0px, ${(rows - 1) * h}px)`
    left.el.style.transform = `translate(0px, 0px)`
    right.el.style.transform = `translate(${(cols - 1) * w}px, 0px)`

    this.root.appendChild(top.el)
    this.root.appendChild(bottom.el)
    this.root.appendChild(left.el)
    this.root.appendChild(right.el)

    this._frame = { top, bottom, left, right }

    // Register all frame cells
    this._lineCells.clear()
    for (const seg of [top, bottom, left, right]) {
      this._registerSegmentCells(seg)
    }

    // Fill with default glyphs before reconciliation
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

    // Border is 1 tile outside the interior on all sides
    const bx = element.x - 1
    const by = element.y - 1
    const bw = element.w + 2
    const bh = element.h + 2

    const top = this._makeHSegment(bx, by, bw)
    const bottom = this._makeHSegment(bx, by + bh - 1, bw)
    const left = this._makeVSegment(bx, by, bh)
    const right = this._makeVSegment(bx + bw - 1, by, bh)

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
      this._registerSegmentCells(seg)
    }

    this._fillSegment(top, '═')
    this._fillSegment(bottom, '═')
    this._fillSegment(left, '║')
    this._fillSegment(right, '║')
  }

  private _teardownElementSegments(id: number): void {
    const segments = this._elementSegments.get(id)
    if (!segments) return
    for (const seg of segments) {
      this._unregisterSegmentCells(seg)
      seg.el.remove()
    }
    this._elementSegments.delete(id)
  }

  private _rebuildAllElementSegments(): void {
    for (const [id] of this._elementSegments) {
      this._teardownElementSegments(id)
    }
    for (const element of this._elements.values()) {
      this._buildElementSegments(element)
    }
  }

  // ---------------------------------------------------------------------------
  // Segment factories
  // ---------------------------------------------------------------------------

  private _makeHSegment(x: number, y: number, length: number): Segment {
    const el = makeSegmentEl()
    const chars = new Array<string>(length).fill(' ')
    return { el, orientation: 'horizontal', x, y, length, chars }
  }

  private _makeVSegment(x: number, y: number, length: number): Segment {
    const el = makeSegmentEl()
    el.style.lineHeight = `${this.tileMetrics.h}px`
    const chars = new Array<string>(length).fill(' ')
    return { el, orientation: 'vertical', x, y, length, chars }
  }

  private _fillSegment(seg: Segment, glyph: string): void {
    seg.chars.fill(glyph)
    this._flushSegment(seg)
  }

  private _flushSegment(seg: Segment): void {
    seg.el.textContent = seg.orientation === 'vertical' ? seg.chars.join('\n') : seg.chars.join('')
  }

  // ---------------------------------------------------------------------------
  // Cell registration
  // ---------------------------------------------------------------------------

  private _registerSegmentCells(seg: Segment): void {
    for (let i = 0; i < seg.length; i++) {
      const [cx, cy] = this._segCellAt(seg, i)
      this._lineCells.set(this._key(cx, cy), seg)
    }
  }

  private _unregisterSegmentCells(seg: Segment): void {
    for (let i = 0; i < seg.length; i++) {
      const [cx, cy] = this._segCellAt(seg, i)
      const key = this._key(cx, cy)
      if (this._lineCells.get(key) === seg) {
        this._lineCells.delete(key)
      }
    }
  }

  private _segCellAt(seg: Segment, i: number): [number, number] {
    return seg.orientation === 'horizontal' ? [seg.x + i, seg.y] : [seg.x, seg.y + i]
  }

  // ---------------------------------------------------------------------------
  // Reconciliation
  // ---------------------------------------------------------------------------

  /**
   * Recompute the glyph at a single cell by reading its four neighbors.
   * Writes back to the owning segment and flushes the DOM element.
   */
  private _reconcileAt(cx: number, cy: number): void {
    const seg = this._lineCells.get(this._key(cx, cy))
    if (!seg) return

    let mask = DOUBLE
    if (this._lineCells.has(this._key(cx, cy - 1))) mask |= TOP
    if (this._lineCells.has(this._key(cx + 1, cy))) mask |= RIGHT
    if (this._lineCells.has(this._key(cx, cy + 1))) mask |= BOTTOM
    if (this._lineCells.has(this._key(cx - 1, cy))) mask |= LEFT

    const glyph = maskToGlyph(mask)
    const i = seg.orientation === 'horizontal' ? cx - seg.x : cy - seg.y
    if (i < 0 || i >= seg.length) return

    seg.chars[i] = glyph
    this._flushSegment(seg)
  }

  /**
   * Reconcile every line cell in one pass.
   * Used after frame rebuild or full element add/remove.
   */
  private _reconcileAll(): void {
    for (const [key] of this._lineCells) {
      const [cx, cy] = key.split(',').map(Number) as [number, number]
      this._reconcileAt(cx, cy)
    }
  }

  /**
   * Reconcile only the cells on and adjacent to an element's border.
   * Used for local updates when an element is added.
   */
  private _reconcileBorderNeighbors(element: UILayoutElement): void {
    const affected = new Set<string>()

    for (const [cx, cy] of element.borderCoords()) {
      affected.add(this._key(cx, cy))
      affected.add(this._key(cx - 1, cy))
      affected.add(this._key(cx + 1, cy))
      affected.add(this._key(cx, cy - 1))
      affected.add(this._key(cx, cy + 1))
    }

    for (const key of affected) {
      const [cx, cy] = key.split(',').map(Number) as [number, number]
      this._reconcileAt(cx, cy)
    }
  }

  // ---------------------------------------------------------------------------
  // Utilities
  // ---------------------------------------------------------------------------

  private _key(x: number, y: number): string {
    return `${x},${y}`
  }
}

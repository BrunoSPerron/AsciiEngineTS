import type { AsciiEngine } from '../../core/Engine'
import { MASK as LINE_MASK, maskToGlyph } from '../lineGlyph'
import type { TileMetricsData } from '../tileMetrics'
import type { UILayoutElement, UISpatialConfig } from './layout_elements/UILayoutElement'
import type { UISelectBase } from './layout_elements/UISelectBase'
import { UISelectElement } from './layout_elements/UISelectElement'

export type Segment = {
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

type BorderSegments = {
  top: Segment
  bottom: Segment
  left: Segment
  right: Segment
  bg: UILayoutElement
  /** Width of border box in tiles (w + 2) */
  bw: number
  /** Height of border box in tiles (h + 2) */
  bh: number
  /** Pivot row within the border box, 0 = top border row */
  pivotRow: number
  tileW: number
  tileH: number
  /** Base CSS transform of top segment, captured before any animation mutation */
  baseTopTransform: string
  /** Base CSS transform of bottom segment, captured before any animation mutation */
  baseBottomTransform: string
}

const FRAME_ID = -1

// ---------------------------------------------------------------------------
// Animation constants
// ---------------------------------------------------------------------------

const OPEN_CLOSE_DURATION = 700
/** Fraction of total duration spent on the horizontal expand/collapse phase. */
const PHASE1_RATIO = 0.4
/** Fraction of total duration spent on the vertical reveal/collapse phase. */
const PHASE2_RATIO = 0.6
/** Minimum animation duration in ms — prevents 0ms WAAPI animations on degenerate pivots. */
const MIN_DURATION = 1

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

  private _elements = new Map<number, UILayoutElement>()
  // Per-element border segments, use element.id as key
  private _elementSegments = new Map<number, Segment[]>()

  private _nextId = 1

  /**
   * Per-cell ownership stacks.
   * Key: `this._key(x, y)`. Value: entries sorted by priority, ascending (top = last).
   */
  private _cellStacks = new Map<string, CellEntry[]>()

  /**
   * Tracks in-flight open animations so removeElement can await them
   * before starting the close sequence.
   */
  private _openingAnimations = new Map<number, Promise<void>>()

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

    this._recomputeContentRect()
    this._buildFrame()
    this._rebuildAllElementSegments()
    this._reconcileAll()
  }

  resized(): void {
    this.drawFrame()
  }

  addElement(element: UILayoutElement, spatialConfig: UISpatialConfig, animate = true): number {
    element._mount(this._nextId++, spatialConfig, this.tileMetrics, this._engine)
    this.root.appendChild(element.el)

    this._elements.set(element.id, element)

    if (element.dock !== undefined) {
      this._recomputeContentRect()
      this._reflowNonDockElements()
    } else {
      this._reflowElement(element)
    }

    // We load the element now so the UI is more reactive to user inputs
    // Wait for event propagation to end before doing so.
    queueMicrotask(() => element.loaded())

    if (!element.hidden) {
      this._buildElementSegments(element)

      if (animate) {
        // The open animation reconciliates and pushes to stack after completion
        const openPromise = this._runOpenAnimation(element)
        this._openingAnimations.set(element.id, openPromise)
      } else {
        // Push to stacks and reconcile immediately.
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
      this._recomputeContentRect()
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

  /**
   * Single-pass replay of all docked elements in insertion order.
   *
   * Each dock panel is positioned from the running rect *before* it claims
   * its space, then the rect shrinks for the next panel. This ensures correct
   * placement regardless of how many dock panels exist or in what order.
   *
   * Dock panel interior coordinates (UILayoutElement x/y) work in the full
   * grid space where (0,0) is the first tile inside the outer frame. The
   * frame border itself sits at the -1 position, which layout() handles via
   * the +1 pixel offset. So a left dock panel with interior x=0 has its left
   * border merged with the outer frame at pixel col 0.
   *
   * Must be called after _cols / _rows change or after any dock add/remove.
   */
  private _recomputeContentRect(): void {
    // Running rect in element interior coordinates.
    // Starts as the full inner grid (frame border tiles excluded).
    // x/y: first available interior tile on each axis.
    // cols/rows: span of available interior tiles.
    let x = 0
    let y = 0
    let cols = this._cols - 2
    let rows = this._rows - 2

    for (const element of this._elements.values()) {
      if (element.dock === undefined) continue

      // Position this panel from the running rect, then shrink.
      // The panel's border on the docked side merges with either the outer
      // frame or the previous dock panel's inner border (both already occupy
      // that tile). The border on the content side becomes the new edge.
      // Consumed = interior size + 1 (the new shared border on content side).
      let ex: number, ey: number, ew: number, eh: number

      switch (element.dock) {
        case 'left':
          ex = x // interior flush against current left edge
          ey = y // span full height of current rect
          ew = element.w
          eh = rows
          x += ew + 1 // next rect starts after this panel's right border
          cols -= ew + 1
          break
        case 'right':
          ew = element.w
          eh = rows
          ex = x + cols - ew // interior flush against current right edge
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
          ey = y + rows - eh // interior flush against current bottom edge
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

  /** Reflow a single non-dock element against the current content rect. */
  private _reflowElement(element: UILayoutElement): void {
    const { x, y, cols, rows } = this._contentRect
    element.reflow(cols, rows, x, y)
  }

  /** Reflow all non-dock elements against the current content rect. */
  private _reflowNonDockElements(): void {
    for (const element of this._elements.values()) {
      if (element.dock !== undefined) continue
      this._reflowElement(element)
    }
  }

  // ---------------------------------------------------------------------------
  // Animation orchestration
  // ---------------------------------------------------------------------------

  private async _runOpenAnimation(element: UILayoutElement): Promise<void> {
    const segs = this._elementSegments.get(element.id)
    if (!segs || segs.length < 4) return

    const [top, bottom, left, right] = segs
    const bw = element.w + 2
    const bh = element.h + 2
    const pivotRow = this._pivotRow(element, bh)

    const borderSegs: BorderSegments = {
      top,
      bottom,
      left,
      right,
      bg: element,
      bw,
      bh,
      pivotRow,
      tileW: this.tileMetrics.w,
      tileH: this.tileMetrics.h,
      baseTopTransform: top.el.style.transform,
      baseBottomTransform: bottom.el.style.transform,
    }

    await this._animateOpen(borderSegs)

    if (!this._elements.has(element.id)) return // closing animation handles cleanup

    for (const seg of segs) {
      this._pushSegmentToStacks(seg, element.priority)
    }
    this._reconcileBorderNeighbors(element)
    this._openingAnimations.delete(element.id)
  }

  private async _runCloseAnimation(element: UILayoutElement, id: number): Promise<void> {
    // If an open animation is still in flight, wait for it to finish first
    const opening = this._openingAnimations.get(id)
    if (opening) await opening

    const segs = this._elementSegments.get(id)
    if (!segs || segs.length < 4) {
      element.destroy()
      return
    }

    const [top, bottom, left, right] = segs
    const bw = element.w + 2
    const bh = element.h + 2
    const pivotRow = this._pivotRow(element, bh)

    const borderSegs: BorderSegments = {
      top,
      bottom,
      left,
      right,
      bg: element,
      bw,
      bh,
      pivotRow,
      tileW: this.tileMetrics.w,
      tileH: this.tileMetrics.h,
      baseTopTransform: top.el.style.transform,
      baseBottomTransform: bottom.el.style.transform,
    }

    await this._animateClose(borderSegs)

    // Remove segment DOM elements (stack is already clean)
    for (const seg of segs) seg.el.remove()
    this._elementSegments.delete(id)

    element.destroy()
  }

  /**
   * Resolve the pivot row within the border box (0 = top border row, bh-1 = bottom).
   * Derived from the element's pivotY percentage, clamped to [0, bh-1].
   */
  private _pivotRow(element: UILayoutElement, bh: number): number {
    const pivotY = element.pivotY ?? 0
    return Math.round(Math.max(0, Math.min(1, pivotY / 100)) * (bh - 1))
  }

  // ---------------------------------------------------------------------------
  // ── Animation: open ─────────────────────────────────────────────────────────
  // ---------------------------------------------------------------------------

  /**
   * Two-phase open animation for a border box.
   *
   * Phase 1 (PHASE1_RATIO of duration):
   *   A single line at pivotRow expands horizontally from the pivot column.
   *
   * Phase 2 (PHASE2_RATIO, speed-normalised to pivot position):
   *   Top slides from pivotRow → row 0.
   *   Bottom slides from pivotRow → row (bh-1).
   *   Left / right reveal via vertical clip-path.
   *   bg.el reveals via vertical clip-path.
   */
  private async _animateOpen(segs: BorderSegments): Promise<void> {
    const { top, bottom, left, right, bg, bh, pivotRow, tileH } = segs
    const duration = OPEN_CLOSE_DURATION
    const p1 = duration * PHASE1_RATIO
    const p2 = duration * PHASE2_RATIO

    const distTop = pivotRow
    const distBottom = bh - 1 - pivotRow
    const maxDist = Math.max(distTop, distBottom, 1)

    this._animOpenSetup(segs)
    this._animOpenSetupPivotLine(segs)

    // ── Phase 1: horizontal expand ──────────────────────────────────────────
    await this._animOpenPhase1(top, pivotRow, tileH, p1)

    // ── Transition between phases ───────────────────────────────────────────
    this._animOpenPhase1Teardown(segs)

    // ── Phase 2: vertical reveal ────────────────────────────────────────────
    await this._animOpenPhase2(segs, p2, distTop, distBottom, maxDist)

    // ── Cleanup ─────────────────────────────────────────────────────────────
    UILayout._animCancelAll(top.el, bottom.el, left.el, right.el, bg.el)
    this._animOpenCleanup(segs)
  }

  /**
   * Initial hide and z-index setup before phase 1 begins.
   * Left/right/bg are clipped to the pivot band; bottom is hidden.
   * Top and bottom are raised so they draw over corners during animation.
   */
  private _animOpenSetup(segs: BorderSegments): void {
    const { top, bottom, left, right, bg, bh, pivotRow, tileH } = segs

    bottom.el.style.display = 'none'

    // There's a slight offset between long sequence of glyphs and their computed position.
    // To lessen the visual problem the left and right bar are drawn over the corner,
    // but the corners need to move so we raise top and bottom over them during animation.
    top.el.style.zIndex = '1'
    bottom.el.style.zIndex = '1'

    left.el.style.clipPath = 'inset(50% 0 50% 0)'
    right.el.style.clipPath = 'inset(50% 0 50% 0)'
    bg.el.style.clipPath = 'inset(50% 0 50% 0)'

    // Blank the corners on left/right so they don't show through during the slide
    left.chars[0] = ' '
    left.chars[left.length - 1] = ' '
    this._flushSegment(left)
  }

  /**
   * Positions the top segment at pivotRow and sets the correct end-cap glyphs
   * for the pivot collapse line, accounting for neighboring cells.
   */
  private _animOpenSetupPivotLine(segs: BorderSegments): void {
    const { top, bottom, right, pivotRow, tileH, baseTopTransform } = segs

    const pivotOffsetPx = pivotRow * tileH

    top.el.style.transform = `${baseTopTransform} translateY(${pivotOffsetPx}px)`
    top.el.style.clipPath = 'inset(0 50% 0 50%)'

    // Build left end-cap mask for pivot line
    const pivotIsBottom = bottom.y === top.y + pivotRow
    const pivotIsTop = pivotRow === 0

    let maskL = LINE_MASK.DOUBLE | LINE_MASK.RIGHT
    if (pivotIsBottom) {
      maskL |= LINE_MASK.TOP
      if (this._cellOccupied(top.x, pivotRow + 1)) maskL |= LINE_MASK.BOTTOM
    } else if (pivotIsTop) {
      maskL |= LINE_MASK.BOTTOM
      if (this._cellOccupied(top.x, pivotRow - 1)) maskL |= LINE_MASK.TOP
    } else {
      maskL |= LINE_MASK.BOTTOM | LINE_MASK.TOP
    }
    if (this._cellOccupied(top.x - 1, top.y + pivotRow)) maskL |= LINE_MASK.LEFT
    top.chars[0] = maskToGlyph(maskL)

    // Right end-cap inherits its glyph from the bottom right corner
    right.chars[right.length - 1] = top.chars[bottom.length - 1]

    // Build right end-cap mask for pivot line
    let maskR = LINE_MASK.DOUBLE | LINE_MASK.LEFT
    if (pivotIsBottom) {
      maskR |= LINE_MASK.TOP
      if (this._cellOccupied(top.x + top.length, pivotRow)) maskR |= LINE_MASK.BOTTOM
    } else if (pivotIsTop) {
      maskR |= LINE_MASK.BOTTOM
      if (this._cellOccupied(top.x + top.length - 1, pivotRow - 1)) maskR |= LINE_MASK.TOP
    } else {
      maskR |= LINE_MASK.BOTTOM | LINE_MASK.TOP
    }
    if (this._cellOccupied(top.x + top.length + 1, top.y + pivotRow)) maskR |= LINE_MASK.RIGHT
    top.chars[top.length - 1] = maskToGlyph(maskR)

    // Mirror pivot end-caps onto left/right corner slots when pivot sits at an edge
    if (pivotIsBottom) {
      segs.left.chars[segs.left.length - 1] = top.chars[0]
      right.chars[segs.left.length - 1] = top.chars[top.length - 1]
    } else if (pivotIsTop) {
      segs.left.chars[0] = top.chars[0]
      right.chars[0] = top.chars[top.length - 1]
    }

    this._flushSegment(top)
  }

  /** Runs phase 1: horizontally expands the pivot line. Returns when done. */
  private async _animOpenPhase1(
    top: Segment,
    pivotRow: number,
    tileH: number,
    p1: number,
  ): Promise<void> {
    const anim = top.el.animate(
      [{ clipPath: 'inset(0 50% 0 50%)' }, { clipPath: 'inset(0 0% 0 0%)' }],
      { duration: p1, easing: 'ease-out', fill: 'forwards' },
    )
    await UILayout._waitForAnimation(anim)
    UILayout._animCancelAll(top.el)
  }

  /**
   * Updates corner glyphs and segment chars for the transition between phases.
   * Shows bottom at pivotRow, sets left/right to full-border glyphs,
   * repositions top/bottom to their pivot offsets before phase 2 begins.
   */
  private _animOpenPhase1Teardown(segs: BorderSegments): void {
    const { top, bottom, left, right, bh, pivotRow, tileH, baseTopTransform, baseBottomTransform } =
      segs

    const pivotIsBottom = bottom.y === top.y + pivotRow
    const pivotIsTop = pivotRow === 0

    const pivotOffsetPx = pivotRow * tileH
    const bottomFromPivotPx = (pivotRow - (bh - 1)) * tileH

    if (pivotIsBottom) {
      bottom.el.style.removeProperty('z-index')
      left.chars[left.length - 1] = top.chars[0]
      right.chars[right.length - 1] = top.chars[bottom.length - 1]
    } else {
      bottom.chars[0] = maskToGlyph(LINE_MASK.RIGHT | LINE_MASK.TOP | LINE_MASK.DOUBLE)
      bottom.chars[bottom.length - 1] = maskToGlyph(
        LINE_MASK.LEFT | LINE_MASK.TOP | LINE_MASK.DOUBLE,
      )
    }

    if (pivotIsTop) {
      top.el.style.removeProperty('z-index')
      left.chars[0] = top.chars[0]
      right.chars[0] = top.chars[top.length - 1]
    } else {
      top.chars[0] = maskToGlyph(LINE_MASK.RIGHT | LINE_MASK.BOTTOM | LINE_MASK.DOUBLE)
      top.chars[top.length - 1] = maskToGlyph(LINE_MASK.LEFT | LINE_MASK.BOTTOM | LINE_MASK.DOUBLE)
    }

    this._flushSegment(top)
    this._flushSegment(bottom)
    this._flushSegment(left)
    this._flushSegment(right)

    // Reposition top to pivot, show bottom at pivot offset
    top.el.style.transform = `${baseTopTransform} translateY(${pivotOffsetPx}px)`
    top.el.style.clipPath = ''
    bottom.el.style.display = ''
    bottom.el.style.transform = `${baseBottomTransform} translateY(${bottomFromPivotPx}px)`
  }

  /**
   * Runs phase 2: top/bottom slide to final positions while left/right and bg
   * expand via clip-path. Returns when all animations complete.
   */
  private async _animOpenPhase2(
    segs: BorderSegments,
    p2: number,
    distTop: number,
    distBottom: number,
    maxDist: number,
  ): Promise<void> {
    const {
      top,
      bottom,
      left,
      right,
      bg,
      bh,
      pivotRow,
      tileH,
      baseTopTransform,
      baseBottomTransform,
    } = segs

    const pivotOffsetPx = pivotRow * tileH
    const bottomFromPivotPx = (pivotRow - (bh - 1)) * tileH
    const bClip = UILayout._borderClip(pivotRow, bh, tileH)
    const bgC = UILayout._bgClip(pivotRow, bh, tileH)

    // Restore clip-path to pivot band before animating outward
    left.el.style.clipPath = bClip
    right.el.style.clipPath = bClip
    bg.el.style.clipPath = bgC

    const topSlide = top.el.animate(
      [
        { transform: `${baseTopTransform} translateY(${pivotOffsetPx}px)` },
        { transform: `${baseTopTransform} translateY(0px)` },
      ],
      {
        duration: Math.max(MIN_DURATION, p2 * (distTop / maxDist)),
        easing: 'ease-out',
        fill: 'forwards',
      },
    )

    const bottomSlide = bottom.el.animate(
      [
        { transform: `${baseBottomTransform} translateY(${bottomFromPivotPx}px)` },
        { transform: `${baseBottomTransform} translateY(0px)` },
      ],
      {
        duration: Math.max(MIN_DURATION, p2 * (distBottom / maxDist)),
        easing: 'ease-out',
        fill: 'forwards',
      },
    )

    // Cheat by +20ms to avoid seeing partial glyphs above top and below bottom
    const sidesReveal = [left.el, right.el].map((el) =>
      el.animate([{ clipPath: bClip }, { clipPath: 'inset(0px 0 0px 0)' }], {
        duration: p2 + 20,
        easing: 'ease-out',
        fill: 'forwards',
      }),
    )

    const bgReveal = bg.el.animate([{ clipPath: bgC }, { clipPath: 'inset(0px 0 0px 0)' }], {
      duration: p2,
      easing: 'ease-out',
      fill: 'forwards',
    })

    await Promise.all([
      UILayout._waitForAnimation(topSlide),
      UILayout._waitForAnimation(bottomSlide),
      ...sidesReveal.map(UILayout._waitForAnimation),
      UILayout._waitForAnimation(bgReveal),
    ])
  }

  /** Resets all animation artifacts so normal layout takes over after open. */
  private _animOpenCleanup(segs: BorderSegments): void {
    const { top, bottom, left, right, bg, baseTopTransform, baseBottomTransform } = segs

    top.el.style.transform = baseTopTransform
    top.el.style.removeProperty('z-index')
    bottom.el.style.transform = baseBottomTransform
    bottom.el.style.removeProperty('z-index')

    for (const el of [top.el, bottom.el, left.el, right.el, bg.el]) {
      el.style.clipPath = ''
    }
  }

  // ---------------------------------------------------------------------------
  // ── Animation: close ────────────────────────────────────────────────────────
  // ---------------------------------------------------------------------------

  /**
   * Two-phase close animation — exact reverse of open.
   *
   * Phase 1 (PHASE2_RATIO of duration):
   *   Top slides from 0 → pivotRow, bottom slides from (bh-1) → pivotRow.
   *   Left/right collapse via clip-path. bg.el collapses via clip-path.
   *
   * Phase 2 (PHASE1_RATIO of duration):
   *   Single pivot line collapses horizontally to nothing.
   */
  private async _animateClose(segs: BorderSegments): Promise<void> {
    const { top, bottom, left, right, bg } = segs
    const duration = OPEN_CLOSE_DURATION

    this._animCloseSetup(segs)

    // ── Phase 1: collapse to pivot row ──────────────────────────────────────
    await this._animClosePhase1(segs, duration * PHASE2_RATIO)

    // ── Transition: swap top for the pivot collapse line ─────────────────────
    UILayout._animCancelAll(top.el, bottom.el, left.el, right.el, bg.el)
    this._animCloseSetupPivotLine(segs)

    // ── Phase 2: horizontal collapse ─────────────────────────────────────────
    await this._animClosePhase2(top, duration * PHASE1_RATIO)

    // ── Cleanup ─────────────────────────────────────────────────────────────
    UILayout._animCancelAll(top.el, bottom.el, left.el, right.el, bg.el)
    this._animCloseCleanup(segs)
  }

  /** Raises top/bottom over corners at close start. */
  private _animCloseSetup(segs: BorderSegments): void {
    segs.top.el.style.zIndex = '1'
    segs.bottom.el.style.zIndex = '1'
  }

  /**
   * Runs phase 1 of close: slides top/bottom toward pivot, collapses sides and bg.
   * Returns when all animations complete.
   */
  private async _animClosePhase1(segs: BorderSegments, p2: number): Promise<void> {
    const {
      top,
      bottom,
      left,
      right,
      bg,
      bh,
      pivotRow,
      tileH,
      baseTopTransform,
      baseBottomTransform,
    } = segs

    const pivotOffsetPx = pivotRow * tileH
    const bottomFromPivotPx = (pivotRow - (bh - 1)) * tileH

    const distTop = pivotRow
    const distBottom = bh - 1 - pivotRow
    const maxDist = Math.max(distTop, distBottom, 1)

    const bClip = UILayout._borderClip(pivotRow, bh, tileH)
    const bgC = UILayout._bgClip(pivotRow, bh, tileH)

    const topSlide = top.el.animate(
      [
        { transform: `${baseTopTransform} translateY(0px)` },
        { transform: `${baseTopTransform} translateY(${pivotOffsetPx}px)` },
      ],
      {
        duration: Math.max(MIN_DURATION, p2 * (distTop / maxDist)),
        easing: 'ease-in',
        fill: 'forwards',
      },
    )

    const bottomSlide = bottom.el.animate(
      [
        { transform: `${baseBottomTransform} translateY(0px)` },
        { transform: `${baseBottomTransform} translateY(${bottomFromPivotPx}px)` },
      ],
      {
        duration: Math.max(MIN_DURATION, p2 * (distBottom / maxDist)),
        easing: 'ease-in',
        fill: 'forwards',
      },
    )

    // Hide glyph bleeding slightly early
    const sidesCollapse = [left.el, right.el].map((el) =>
      el.animate([{ clipPath: 'inset(0px 0 0px 0)' }, { clipPath: bClip }], {
        duration: Math.max(p2 - 40, 1),
        easing: 'ease-in',
        fill: 'forwards',
      }),
    )

    const bgCollapse = bg.el.animate([{ clipPath: 'inset(0px 0 0px 0)' }, { clipPath: bgC }], {
      duration: p2,
      easing: 'ease-in',
      fill: 'forwards',
    })

    await Promise.all([
      UILayout._waitForAnimation(topSlide),
      UILayout._waitForAnimation(bottomSlide),
      ...sidesCollapse.map(UILayout._waitForAnimation),
      UILayout._waitForAnimation(bgCollapse),
    ])
  }

  /**
   * Hides everything except top, then repositions top at pivotRow
   * with the collapsed pivot line glyph string for phase 2.
   */
  private _animCloseSetupPivotLine(segs: BorderSegments): void {
    const { top, bottom, left, right, bg, bw, pivotRow, tileH, baseTopTransform } = segs

    left.el.style.display = 'none'
    right.el.style.display = 'none'
    bg.el.style.display = 'none'
    bottom.el.style.display = 'none'

    top.el.style.transform = `${baseTopTransform} translateY(${pivotRow * tileH}px)`
    top.el.textContent = '╠' + '═'.repeat(Math.max(0, bw - 2)) + '╣'
    top.el.style.clipPath = 'inset(0 0% 0 0%)'
  }

  /** Runs phase 2 of close: collapses the pivot line horizontally. Returns when done. */
  private async _animClosePhase2(top: Segment, p1: number): Promise<void> {
    const anim = top.el.animate(
      [{ clipPath: 'inset(0 0% 0 0%)' }, { clipPath: 'inset(0 50% 0 50%)' }],
      { duration: p1, easing: 'ease-in', fill: 'forwards' },
    )
    await UILayout._waitForAnimation(anim)
  }

  /** Resets all animation artifacts so DOM is clean after close. */
  private _animCloseCleanup(segs: BorderSegments): void {
    const { top, bottom, left, right, bg, baseTopTransform, baseBottomTransform } = segs

    top.el.style.transform = baseTopTransform
    bottom.el.style.transform = baseBottomTransform

    for (const el of [top.el, bottom.el, left.el, right.el, bg.el]) {
      el.style.clipPath = ''
      el.style.display = ''
      el.style.removeProperty('z-index')
    }
  }

  // ---------------------------------------------------------------------------
  // ── Animation: static helpers ───────────────────────────────────────────────
  // ---------------------------------------------------------------------------

  /**
   * Clip-path string for left/right segment elements.
   * These elements span bh rows; clip is in border-box pixel space.
   */
  private static _borderClip(pivotRow: number, bh: number, tileH: number): string {
    const topPx = pivotRow * tileH
    const bottomPx = Math.max(0, (bh - pivotRow - 1) * tileH)
    return `inset(${topPx}px 0 ${bottomPx}px 0)`
  }

  /**
   * Clip-path string for the bg element (interior content div).
   * bg spans h = bh-2 rows, starting one row below the border top.
   * pivotRow is in border coordinates; translated to bg-local coordinates.
   */
  private static _bgClip(pivotRow: number, bh: number, tileH: number): string {
    const innerRows = bh - 2
    // pivot in bg-local rows (row 0 of bg = border row 1)
    const localPivot = Math.max(0, Math.min(innerRows, pivotRow - 1))
    const topPx = localPivot * tileH
    const bottomPx = Math.max(0, (innerRows - localPivot - 1) * tileH)
    return `inset(${topPx}px 0 ${bottomPx}px 0)`
  }

  private static _waitForAnimation(anim: Animation): Promise<void> {
    return new Promise((resolve) => {
      anim.onfinish = () => resolve()
      anim.oncancel = () => resolve()
    })
  }

  private static _animCancelAll(...els: HTMLElement[]): void {
    for (const el of els) el.getAnimations().forEach((a) => a.cancel())
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

  /**
   * Builds the four border <pre> elements for an element.
   * Caller is responsible for pushing them to the cell stack.
   */
  private _buildElementSegments(element: UILayoutElement): void {
    const bx = element.x
    const by = element.y
    const bw = element.w + 2
    const bh = element.h + 2

    const top = this._makeSegment(bx, by, bw, element.id, '═')
    const bottom = this._makeSegment(bx, by + bh - 1, bw, element.id, '═')
    const left = this._makeSegment(bx, by, bh, element.id, '║', true)
    const right = this._makeSegment(bx + bw - 1, by, bh, element.id, '║', true)

    this._elementSegments.set(element.id, [top, bottom, left, right])
  }

  /**
   * Remove segment from the line cell stack and reconcile.
   * Caller is responsible for cleaning up the DOM element and _elementSegments entry.
   */
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
  ): Segment {
    const el = document.createElement('pre')
    el.className = 'ui-layout-line'
    const { w, h } = this.tileMetrics
    el.style.transform = `translate(${x * w}px, ${y * h}px)`
    const chars = new Array<string>(length).fill(glyph)
    const seg: Segment = { el, vertical, x, y, length, chars, ownerId }
    this._flushSegment(seg)
    this.root.appendChild(el)
    return seg
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

    // Apply to all cells in the stack
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

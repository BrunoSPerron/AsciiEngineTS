import { MASK as LINE_MASK, maskToGlyph } from '../lineGlyph'
import type { TileMetricsData } from '../tileMetrics'
import type { UINode } from './layout_elements/UINode'
import type { Segment } from './segment'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type BorderSegments = {
  top: Segment
  bottom: Segment
  left: Segment
  right: Segment
  bg: UINode
  bw: number
  bh: number
  pivotRow: number
  tileW: number
  tileH: number
  baseTopTransform: string
  baseBottomTransform: string
}

type Deps = {
  tileMetrics: TileMetricsData
  cellOccupied: (x: number, y: number) => boolean
  flushSegment: (seg: Segment) => void
}

// ---------------------------------------------------------------------------
// Animation constants
// ---------------------------------------------------------------------------

const OPEN_CLOSE_DURATION = 700
const PHASE1_RATIO = 0.4
const PHASE2_RATIO = 0.6
const MIN_DURATION = 1

// ---------------------------------------------------------------------------
// BorderAnimator
// ---------------------------------------------------------------------------

export class BorderAnimator {
  private _tileMetrics: TileMetricsData
  private _cellOccupied: (x: number, y: number) => boolean
  private _flushSegment: (seg: Segment) => void

  /**
   * Tracks in-flight open animations so runClose can await them
   * before starting the close sequence.
   */
  private _openingAnimations = new Map<number, Promise<void>>()

  constructor({ tileMetrics, cellOccupied, flushSegment }: Deps) {
    this._tileMetrics = tileMetrics
    this._cellOccupied = cellOccupied
    this._flushSegment = flushSegment
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Runs the open animation and returns a promise that resolves when the
   * animation completes. The caller (UILayout) is responsible for calling
   * registerOpenCompletion with the combined promise (animation + post-work)
   * so that runClose can await the full sequence before starting close.
   */
  runOpen(element: UINode, segments: Segment[]): Promise<void> {
    return this._runOpenAnimation(element, segments)
  }

  /**
   * Register the combined open promise (animation + UILayout post-work)
   * so runClose can await it before starting the close sequence.
   */
  registerOpenCompletion(id: number, promise: Promise<void>): void {
    void promise.then(() => void this._openingAnimations.delete(id))
    this._openingAnimations.set(id, promise)
  }

  async runClose(element: UINode, id: number, segments: Segment[]): Promise<void> {
    const opening = this._openingAnimations.get(id)
    if (opening) await opening
    if (segments.length < 4) return
    const borderSegs = this._makeBorderSegs(element, segments)
    await this._animateClose(borderSegs)
  }

  // ---------------------------------------------------------------------------
  // Private orchestration
  // ---------------------------------------------------------------------------

  private async _runOpenAnimation(element: UINode, segments: Segment[]): Promise<void> {
    if (segments.length < 4) return

    const borderSegs = this._makeBorderSegs(element, segments)
    await this._animateOpen(borderSegs)
  }

  private _makeBorderSegs(element: UINode, segments: Segment[]): BorderSegments {
    const [top, bottom, left, right] = segments
    const bw = element.w + 2
    const bh = element.h + 2
    const pivotRow = this._pivotRow(element, bh)

    return {
      top,
      bottom,
      left,
      right,
      bg: element,
      bw,
      bh,
      pivotRow,
      tileW: this._tileMetrics.w,
      tileH: this._tileMetrics.h,
      baseTopTransform: top.el.style.transform,
      baseBottomTransform: bottom.el.style.transform,
    }
  }

  private _pivotRow(element: UINode, bh: number): number {
    const pivotY = element.pivotY ?? 0
    return Math.round(Math.max(0, Math.min(1, pivotY / 100)) * (bh - 1))
  }

  // ---------------------------------------------------------------------------
  // Animation: open
  // ---------------------------------------------------------------------------

  private async _animateOpen(segs: BorderSegments): Promise<void> {
    const { top, bottom, left, right, bg, bh, pivotRow } = segs
    const duration = OPEN_CLOSE_DURATION
    const p1 = duration * PHASE1_RATIO
    const p2 = duration * PHASE2_RATIO

    const distTop = pivotRow
    const distBottom = bh - 1 - pivotRow
    const maxDist = Math.max(distTop, distBottom, 1)

    this._animOpenSetup(segs)
    this._animOpenSetupPivotLine(segs)

    await this._animOpenPhase1(top, p1)
    this._animOpenPhase1Teardown(segs)
    await this._animOpenPhase2(segs, p2, distTop, distBottom, maxDist)
    BorderAnimator._animCancelAll(top.el, bottom.el, left.el, right.el, bg.el)
    this._animOpenCleanup(segs)
  }

  private _animOpenSetup(segs: BorderSegments): void {
    const { top, bottom, left, right, bg } = segs

    bottom.el.style.display = 'none'
    top.el.style.zIndex = '1'
    bottom.el.style.zIndex = '1'

    left.el.style.clipPath = 'inset(50% 0 50% 0)'
    right.el.style.clipPath = 'inset(50% 0 50% 0)'
    bg.el.style.clipPath = 'inset(50% 0 50% 0)'

    left.chars[0] = ' '
    left.chars[left.length - 1] = ' '
    this._flushSegment(left)
  }

  private _animOpenSetupPivotLine(segs: BorderSegments): void {
    const { top, bottom, right, pivotRow, tileH, baseTopTransform } = segs

    const pivotOffsetPx = pivotRow * tileH
    top.el.style.transform = `${baseTopTransform} translateY(${pivotOffsetPx}px)`
    top.el.style.clipPath = 'inset(0 50% 0 50%)'

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

    right.chars[right.length - 1] = top.chars[bottom.length - 1]

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

    if (pivotIsBottom) {
      segs.left.chars[segs.left.length - 1] = top.chars[0]
      right.chars[segs.left.length - 1] = top.chars[top.length - 1]
    } else if (pivotIsTop) {
      segs.left.chars[0] = top.chars[0]
      right.chars[0] = top.chars[top.length - 1]
    }

    this._flushSegment(top)
  }

  private async _animOpenPhase1(top: Segment, p1: number): Promise<void> {
    const anim = top.el.animate(
      [{ clipPath: 'inset(0 50% 0 50%)' }, { clipPath: 'inset(0 0% 0 0%)' }],
      { duration: p1, easing: 'ease-out', fill: 'forwards' },
    )
    await BorderAnimator._waitForAnimation(anim)
    BorderAnimator._animCancelAll(top.el)
  }

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

    top.el.style.transform = `${baseTopTransform} translateY(${pivotOffsetPx}px)`
    top.el.style.clipPath = ''
    bottom.el.style.display = ''
    bottom.el.style.transform = `${baseBottomTransform} translateY(${bottomFromPivotPx}px)`
  }

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
    const bClip = BorderAnimator._borderClip(pivotRow, bh, tileH)
    const bgC = BorderAnimator._bgClip(pivotRow, bh, tileH)

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
      BorderAnimator._waitForAnimation(topSlide),
      BorderAnimator._waitForAnimation(bottomSlide),
      ...sidesReveal.map(BorderAnimator._waitForAnimation),
      BorderAnimator._waitForAnimation(bgReveal),
    ])
  }

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
  //  Animation: close
  // ---------------------------------------------------------------------------

  private async _animateClose(segs: BorderSegments): Promise<void> {
    const { top, bottom, left, right, bg } = segs
    const duration = OPEN_CLOSE_DURATION

    this._animCloseSetup(segs)
    await this._animClosePhase1(segs, duration * PHASE2_RATIO)
    BorderAnimator._animCancelAll(top.el, bottom.el, left.el, right.el, bg.el)
    this._animCloseSetupPivotLine(segs)
    await this._animClosePhase2(top, duration * PHASE1_RATIO)
    BorderAnimator._animCancelAll(top.el, bottom.el, left.el, right.el, bg.el)
    this._animCloseCleanup(segs)
  }

  private _animCloseSetup(segs: BorderSegments): void {
    segs.top.el.style.zIndex = '1'
    segs.bottom.el.style.zIndex = '1'
  }

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

    const bClip = BorderAnimator._borderClip(pivotRow, bh, tileH)
    const bgC = BorderAnimator._bgClip(pivotRow, bh, tileH)

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

    const sidesCollapseStart = `inset(${tileH}px 0 0px 0)`
    const sidesCollapse = [left.el, right.el].map((el) =>
      el.animate([{ clipPath: sidesCollapseStart }, { clipPath: bClip }], {
        duration: p2,
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
      BorderAnimator._waitForAnimation(topSlide),
      BorderAnimator._waitForAnimation(bottomSlide),
      ...sidesCollapse.map(BorderAnimator._waitForAnimation),
      BorderAnimator._waitForAnimation(bgCollapse),
    ])
  }

  private _animCloseSetupPivotLine(this: void, segs: BorderSegments): void {
    const { top, bottom, left, right, bg, bw, pivotRow, tileH, baseTopTransform } = segs

    left.el.style.display = 'none'
    right.el.style.display = 'none'
    bg.el.style.display = 'none'
    bottom.el.style.display = 'none'

    top.el.style.transform = `${baseTopTransform} translateY(${pivotRow * tileH}px)`
    top.el.textContent = '=' + '═'.repeat(Math.max(0, bw - 2)) + '=' // TODO calculate glyph
    top.el.style.clipPath = 'inset(0 0% 0 0%)'
  }

  private async _animClosePhase2(top: Segment, p1: number): Promise<void> {
    const anim = top.el.animate(
      [{ clipPath: 'inset(0 0% 0 0%)' }, { clipPath: 'inset(0 50% 0 50%)' }],
      { duration: p1, easing: 'ease-in', fill: 'forwards' },
    )
    await BorderAnimator._waitForAnimation(anim)
  }

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
  // Static helpers
  // ---------------------------------------------------------------------------

  private static _borderClip(pivotRow: number, bh: number, tileH: number): string {
    const topPx = pivotRow * tileH
    const bottomPx = Math.max(0, (bh - pivotRow - 1) * tileH)
    return `inset(${topPx}px 0 ${bottomPx}px 0)`
  }

  private static _bgClip(pivotRow: number, bh: number, tileH: number): string {
    const localPivot = Math.max(0, Math.min(bh, pivotRow - 1))
    const topPx = localPivot * tileH
    const bottomPx = Math.max(0, (bh - localPivot - 1) * tileH)
    return `inset(${topPx}px 0 ${bottomPx}px 0)`
  }

  private static _waitForAnimation(this: void, anim: Animation): Promise<void> {
    return new Promise((resolve) => {
      anim.onfinish = () => resolve()
      anim.oncancel = () => resolve()
    })
  }

  private static _animCancelAll(...els: HTMLElement[]): void {
    for (const el of els) el.getAnimations().forEach((a) => a.cancel())
  }
}

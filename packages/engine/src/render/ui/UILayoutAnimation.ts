/**
 * Two-phase open/close animation for UILayout element borders.
 *
 * The border box consists of:
 *   top.el     — horizontal <pre> at the top of the border
 *   bottom.el  — horizontal <pre> at the bottom of the border
 *   left.el    — vertical <pre> on the left (spans full bh rows)
 *   right.el   — vertical <pre> on the right (spans full bh rows)
 *   bg.el      — the UILayoutElement's content <div> (spans h = bh-2 rows, offset by 1)
 *
 * Open sequence
 * ─────────────
 * Phase 1 (PHASE1_RATIO):
 *   A single line at pivotRow expands horizontally from the pivot column.
 *
 * Phase 2 (PHASE2_RATIO, speed-normalised to pivot position):
 *   Top slides from pivotRow → row 0.
 *   Bottom slides from pivotRow → row (bh-1).
 *   Left / right reveal via vertical clip-path (border-box coordinates).
 *   bg.el reveals via vertical clip-path (interior-box coordinates).
 *
 * Close sequence is the exact reverse.
 *
 * Duration scaling (requirement 6):
 *   Phase-2 pixel-per-ms speed is constant regardless of pivot.
 *   phase2Duration = BASE_PHASE2 * max(distTop, distBottom) / (bh / 2)
 *
 * Clip-path coordinate systems
 * ─────────────────────────────
 * left.el / right.el: clip-path is relative to the segment element's own bounding
 *   box, which has height bh * tileH. Pixel values correspond directly to
 *   border-box row positions.
 *
 * bg.el: clip-path is relative to the element's own bounding box, which has
 *   height h * tileH = (bh - 2) * tileH, offset one row below the border top.
 *   pivotRow (in border coords) maps to bg.el local row (pivotRow - 1), clamped
 *   to [0, h].
 */

import { MASK as LINE_MASK, maskToGlyph } from '../lineGlyph'
import type { UILayoutElement } from './layout_elements/UILayoutElement'
import type { Segment } from './UILayout'

export type BorderSegments = {
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
}

const PHASE1_RATIO = 0.4
const PHASE2_RATIO = 0.6
/** Minimum animation duration in ms — prevents 0ms WAAPI animations on degenerate pivots. */
const MIN_DURATION = 1

function wait(anim: Animation): Promise<void> {
  return new Promise((resolve) => {
    anim.onfinish = () => resolve()
    anim.oncancel = () => resolve()
  })
}

function cancelAll(...els: HTMLElement[]): void {
  for (const el of els) el.getAnimations().forEach((a) => a.cancel())
}

/**
 * Compute phase-2 duration scaled so travel speed is constant
 * regardless of where the pivot sits within the border box.
 */
function computePhase2Duration(baseDuration: number, bh: number, pivotRow: number): number {
  const distTop = pivotRow
  const distBottom = bh - 1 - pivotRow
  const maxDist = Math.max(distTop, distBottom, 1)
  const halfH = (bh - 1) / 2 // distance from center to edge at neutral pivot
  return baseDuration * PHASE2_RATIO * (maxDist / Math.max(halfH, 1))
}

/**
 * Clip-path string for left/right segment elements.
 * These elements span bh rows; clip is in border-box pixel space.
 */
function borderClip(pivotRow: number, bh: number, tileH: number): string {
  const topPx = pivotRow * tileH
  const bottomPx = Math.max(0, (bh - pivotRow - 1) * tileH)
  return `inset(${topPx}px 0 ${bottomPx}px 0)`
}

/**
 * Clip-path string for the bg.el (interior content div).
 * bg.el spans h = bh-2 rows, starting one row below the border top.
 * pivotRow is in border coordinates; we translate to bg.el-local coordinates.
 */
function bgClip(pivotRow: number, bh: number, tileH: number): string {
  const innerRows = bh - 2 // number of interior rows
  // pivot in bg.el-local rows (row 0 of bg.el = border row 1)
  const localPivot = Math.max(0, Math.min(innerRows, pivotRow - 1))
  const topPx = localPivot * tileH
  const bottomPx = Math.max(0, (innerRows - localPivot - 1) * tileH)
  return `inset(${topPx}px 0 ${bottomPx}px 0)`
}

// ─── Open ────────────────────────────────────────────────────────────────────

export async function animateBorderOpen(
  segs: BorderSegments,
  cellOccupied: (x: number, y: number) => boolean,
  flushSegment: (seg: Segment) => void,
  duration: number,
): Promise<void> {
  const { top, bottom, left, right, bg, bh, pivotRow, tileH } = segs

  // Initial hide
  bottom.el.style.display = 'none'

  left.el.style.clipPath = 'inset(50% 0 50% 0)'
  right.el.style.clipPath = 'inset(50% 0 50% 0)'
  bg.el.style.clipPath = 'inset(50% 0 50% 0)'

  // There's a slight offset between long sequence of Glyph and their computed position
  //  To lessen the visual problem the left and right bar are drawn over the corner
  //  But the corners need to move so we show the top and bottom over during the animation
  top.el.style.zIndex = '1'
  bottom.el.style.zIndex = '1'

  left.chars[0] = ' '
  left.chars[left.length - 1] = ' '
  flushSegment(left)

  // Reconciliate the middle line extremities
  let mask = LINE_MASK.DOUBLE | LINE_MASK.RIGHT
  const pivotIsBottom = bottom.y === top.y + pivotRow
  const pivotIsTop = pivotRow === 0
  if (pivotIsBottom) {
    mask |= LINE_MASK.TOP
    if (cellOccupied(top.x, pivotRow + 1)) mask |= LINE_MASK.BOTTOM
  } else if (pivotIsTop) {
    mask |= LINE_MASK.BOTTOM
    if (cellOccupied(top.x, pivotRow - 1)) mask |= LINE_MASK.TOP
  } else {
    mask |= LINE_MASK.BOTTOM | LINE_MASK.TOP
  }
  if (cellOccupied(top.x - 1, top.y + pivotRow)) mask |= LINE_MASK.LEFT

  top.chars[0] = maskToGlyph(mask)

  right.chars[right.length - 1] = top.chars[bottom.length - 1]

  mask = LINE_MASK.DOUBLE | LINE_MASK.LEFT
  if (pivotIsBottom) {
    mask |= LINE_MASK.TOP
    if (cellOccupied(top.x + top.length, pivotRow)) mask |= LINE_MASK.BOTTOM
  } else if (pivotIsTop) {
    mask |= LINE_MASK.BOTTOM
    if (cellOccupied(top.x + top.length - 1, pivotRow - 1)) mask |= LINE_MASK.TOP
  } else {
    mask |= LINE_MASK.BOTTOM | LINE_MASK.TOP
  }
  if (cellOccupied(top.x + top.length + 1, top.y + pivotRow)) mask |= LINE_MASK.RIGHT
  top.chars[top.length - 1] = maskToGlyph(mask)

  if (pivotIsBottom) {
    left.chars[left.length - 1] = top.chars[0]
    right.chars[left.length - 1] = top.chars[top.length - 1]
  } else if (pivotIsTop) {
    left.chars[0] = top.chars[0]
    right.chars[0] = top.chars[top.length - 1]
  }

  flushSegment(top)

  // Phase 1
  const p1 = duration * PHASE1_RATIO
  const p2 = computePhase2Duration(duration, bh, pivotRow)

  const distTop = pivotRow
  const distBottom = bh - 1 - pivotRow
  const maxDist = Math.max(distTop, distBottom, 1)

  const pivotOffsetPx = pivotRow * tileH
  const bottomFromPivotPx = (pivotRow - (bh - 1)) * tileH

  const baseTopTransform = top.el.style.transform
  const baseBottomTransform = bottom.el.style.transform

  // Replace top content with the pivot collapse line, shifted to pivotRow
  top.el.style.transform = `${baseTopTransform} translateY(${pivotOffsetPx}px)`
  top.el.style.clipPath = 'inset(0 50% 0 50%)'

  // ── Phase 1: horizontal expand ──────────────────────────────────────────────
  const phase1Anim = top.el.animate(
    [{ clipPath: 'inset(0 50% 0 50%)' }, { clipPath: 'inset(0 0% 0 0%)' }],
    { duration: p1, easing: 'ease-out', fill: 'forwards' },
  )
  await wait(phase1Anim)
  cancelAll(top.el)

  // ── Set up phase 2 ──────────────────────────────────────────────────────────

  if (bottom.y === top.y + pivotRow) {
    bottom.el.style.removeProperty('z-index')
    left.chars[left.length - 1] = top.chars[0]
    right.chars[right.length - 1] = top.chars[bottom.length - 1]
  } else {
    bottom.chars[0] = maskToGlyph(LINE_MASK.RIGHT | LINE_MASK.TOP | LINE_MASK.DOUBLE)
    bottom.chars[bottom.length - 1] = maskToGlyph(LINE_MASK.LEFT | LINE_MASK.TOP | LINE_MASK.DOUBLE)
  }

  if (pivotRow === 0) {
    top.el.style.removeProperty('z-index')
    left.chars[0] = top.chars[0]
    right.chars[0] = top.chars[top.length - 1]
  } else {
    top.chars[0] = maskToGlyph(LINE_MASK.RIGHT | LINE_MASK.BOTTOM | LINE_MASK.DOUBLE)
    top.chars[top.length - 1] = maskToGlyph(LINE_MASK.LEFT | LINE_MASK.BOTTOM | LINE_MASK.DOUBLE)
  }

  flushSegment(top)
  flushSegment(bottom)
  flushSegment(left)
  flushSegment(right)

  top.el.style.transform = `${baseTopTransform} translateY(${pivotOffsetPx}px)`
  top.el.style.clipPath = ''

  // Show bottom at pivotRow
  bottom.el.style.display = ''
  bottom.el.style.transform = `${baseBottomTransform} translateY(${bottomFromPivotPx}px)`

  // Set left/right/bg to pivot-band clips before animating outward
  const bClip = borderClip(pivotRow, bh, tileH)
  const bgC = bgClip(pivotRow, bh, tileH)
  left.el.style.clipPath = bClip
  right.el.style.clipPath = bClip
  bg.el.style.clipPath = bgC

  // ── Phase 2: vertical reveal ─────────────────────────────────────────────────

  const topSlideAnim = top.el.animate(
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

  const bottomSlideAnim = bottom.el.animate(
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

  const borderReveal = [left.el, right.el].map((el) =>
    el.animate([{ clipPath: bClip }, { clipPath: 'inset(0px 0 0px 0)' }], {
      duration: p2 + 20, // cheat to avoid seeing partial glyphs above top and bottom
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
    wait(topSlideAnim),
    wait(bottomSlideAnim),
    ...borderReveal.map(wait),
    wait(bgReveal),
  ])

  // ── Cleanup: remove animation artifacts so normal layout takes over ──────────
  cancelAll(top.el, bottom.el, left.el, right.el, bg.el)
  top.el.style.transform = baseTopTransform
  top.el.style.removeProperty('z-index')
  bottom.el.style.transform = baseBottomTransform
  bottom.el.style.removeProperty('z-index')
  for (const el of [top.el, bottom.el, left.el, right.el, bg.el]) {
    el.style.clipPath = ''
  }
}

// ─── Close ───────────────────────────────────────────────────────────────────

export async function animateBorderClose(segs: BorderSegments, duration: number): Promise<void> {
  const { top, bottom, left, right, bg, bw, bh, pivotRow, tileH } = segs

  top.el.style.zIndex = '1'
  bottom.el.style.zIndex = '1'

  const p1 = duration * PHASE1_RATIO
  const p2 = computePhase2Duration(duration, bh, pivotRow)

  const distTop = pivotRow
  const distBottom = bh - 1 - pivotRow
  const maxDist = Math.max(distTop, distBottom, 1)

  const pivotOffsetPx = pivotRow * tileH
  const bottomFromPivotPx = (pivotRow - (bh - 1)) * tileH

  const baseTopTransform = top.el.style.transform
  const baseBottomTransform = bottom.el.style.transform

  const bClip = borderClip(pivotRow, bh, tileH)
  const bgC = bgClip(pivotRow, bh, tileH)

  // ── Phase 1: collapse to pivot row ──────────────────────────────────────────

  const topSlideAnim = top.el.animate(
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

  const bottomSlideAnim = bottom.el.animate(
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

  const borderCollapse = [left.el, right.el].map((el) =>
    el.animate([{ clipPath: 'inset(0px 0 0px 0)' }, { clipPath: bClip }], {
      duration: Math.max(p2 - 40, 1), // Hide glyph bleeding
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
    wait(topSlideAnim),
    wait(bottomSlideAnim),
    ...borderCollapse.map(wait),
    wait(bgCollapse),
  ])

  // ── Transition: replace top with pivot collapse line ─────────────────────────
  cancelAll(top.el, bottom.el, left.el, right.el, bg.el)
  left.el.style.display = 'none'
  right.el.style.display = 'none'
  bg.el.style.display = 'none'

  bottom.el.style.display = 'none'
  top.el.style.transform = `${baseTopTransform} translateY(${pivotOffsetPx}px)`
  top.el.textContent = '╠' + '═'.repeat(Math.max(0, bw - 2)) + '╣'
  top.el.style.clipPath = 'inset(0 0% 0 0%)'

  // ── Phase 2: horizontal collapse ─────────────────────────────────────────────
  const phase2Anim = top.el.animate(
    [{ clipPath: 'inset(0 0% 0 0%)' }, { clipPath: 'inset(0 50% 0 50%)' }],
    { duration: p1, easing: 'ease-in', fill: 'forwards' },
  )
  await wait(phase2Anim)

  // ── Cleanup ──────────────────────────────────────────────────────────────────
  cancelAll(top.el, bottom.el, left.el, right.el, bg.el)
  top.el.style.transform = baseTopTransform
  bottom.el.style.transform = baseBottomTransform
  for (const el of [top.el, bottom.el, left.el, right.el, bg.el]) {
    el.style.clipPath = ''
    el.style.display = ''
  }
}

export const DIR_TO_MASK: Record<Direction, number> = {
  up: MASK.TOP,
  right: MASK.RIGHT,
  down: MASK.BOTTOM,
  left: MASK.LEFT,
  none: 0,
}

export type LaserAnimSeqInfo = {
  line: HTMLPreElement
  x: number
  y: number
  direction: number
  length: number
}

const LASERSPEED = { x: 30 }

import {
  DIR_DELTA,
  type Direction,
  type GameState,
  type LaserResult,
  type LaserWaypoint,
} from '@laser-chess/shared'
// ─── Internals ────────────────────────────────────────────────────────────────

import type { AsciiEngine } from 'ascii-game-engine'
import { invertDirectionMask, MASK, maskToGlyph, type TileMetricsData } from 'ascii-game-engine'

type AnimPhase = 'reveal' | 'hide'

/** Map a direction mask bit to an animation name for a given phase. */
function animationName(direction: number, phase: AnimPhase): string {
  if (direction & MASK.TOP) return `laser-${phase}-top`
  if (direction & MASK.RIGHT) return `laser-${phase}-right`
  if (direction & MASK.BOTTOM) return `laser-${phase}-bottom`
  if (direction & MASK.LEFT) return `laser-${phase}-left`
  return `laser-${phase}-left`
}

/** Wait for an element's current CSS animation to finish. */
function waitForAnimation(el: HTMLElement): Promise<void> {
  return new Promise((resolve) => {
    const done = () => {
      el.removeEventListener('animationend', done)
      resolve()
    }
    el.addEventListener('animationend', done)
  })
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function animateLaser(
  engine: AsciiEngine,
  state: GameState,
  result: LaserResult,
  extraCss: string,
) {
  if (result.waypoints.length < 2) return
  const animSeqs: LaserAnimSeqInfo[] = []

  const straightGlyph = (dir: Direction): string =>
    dir === 'left' || dir === 'right'
      ? maskToGlyph(MASK.LEFT | MASK.RIGHT)
      : maskToGlyph(MASK.TOP | MASK.BOTTOM)

  const cornerGlyph = (incoming: Direction, outgoing: Direction): string =>
    maskToGlyph(invertDirectionMask(DIR_TO_MASK[incoming]) | DIR_TO_MASK[outgoing])

  const addGlyph = (seg: LaserAnimSeqInfo, glyph: string, dir: Direction): void => {
    const isVertical = dir === 'up' || dir === 'down'
    const prepend = dir === 'up' || dir === 'left'
    const sep = isVertical && seg.length > 0 ? '\n' : ''
    if (dir === 'up') seg.y -= 1
    if (dir === 'left') seg.x -= 1
    const existing = seg.line.textContent ?? ''
    seg.line.textContent = prepend ? glyph + sep + existing : existing + sep + glyph
    seg.length += 1
  }

  const newSegment = (x: number, y: number, dir: Direction): LaserAnimSeqInfo => {
    const seg: LaserAnimSeqInfo = {
      line: document.createElement('pre'),
      x,
      y,
      direction: DIR_TO_MASK[dir],
      length: 0,
    }
    animSeqs.push(seg)
    return seg
  }

  for (let wi = 0; wi < result.waypoints.length - 1; wi++) {
    const from = result.waypoints[wi]
    const to = result.waypoints[wi + 1]
    const isLastSegment = wi === result.waypoints.length - 2
    const steps = _getStepsBetween(state, from, to)
    const currentDir = from.outDir
    let cx = from.x
    let cy = from.y
    let currentSeg = newSegment(cx, cy, currentDir)
    const [ddx, ddy] = DIR_DELTA[currentDir]

    for (let step = 0; step < steps; step++) {
      cx += ddx
      cy += ddy
      const isLastStep = step === steps - 1

      if (cx < 0) {
        cx = state.sizeX
        currentSeg = newSegment(cx, cy, currentDir)
      } else if (cx > state.sizeX - 1) {
        cx = -1
        currentSeg = newSegment(cx, cy, currentDir)
      } else if (cy < 0) {
        cy = state.sizeY
        currentSeg = newSegment(cx, cy, currentDir)
      } else if (cy > state.sizeY - 1) {
        cy = -1
        currentSeg = newSegment(cx, cy, currentDir)
      }

      if (isLastStep && !isLastSegment) {
        addGlyph(currentSeg, cornerGlyph(currentDir, to.outDir), currentDir)
      } else {
        addGlyph(currentSeg, straightGlyph(currentDir), currentDir)
      }
    }
  }

  if (animSeqs.length > 0) {
    await runLaserSequence(engine.renderer.worldEl, animSeqs, engine.renderer.tileMetrics, extraCss)
  }
}

function _getStepsBetween(state: GameState, from: LaserWaypoint, to: LaserWaypoint): number {
  let willWrapHorizontal =
    (to.outDir !== 'none' && from.x < to.x && from.outDir === 'left') ||
    (from.x > to.x && from.outDir === 'right')
  let willWrapVertical =
    (to.outDir !== 'none' && from.y < to.y && from.outDir === 'up') ||
    (from.y > to.y && from.outDir === 'down')

  if (from.x === to.x && from.y === to.y) {
    if (from.outDir === 'left' || from.outDir === 'right') willWrapHorizontal = true
    else if (from.outDir === 'up' || from.outDir === 'down') willWrapVertical = true
  }

  if (willWrapHorizontal) return state.sizeX - Math.abs(to.x - from.x)
  if (willWrapVertical) return state.sizeY - Math.abs(to.y - from.y)
  return Math.abs(to.x - from.x) + Math.abs(to.y - from.y)
}

/**
 * Place every line at its grid position and hide it immediately.
 * Call this before starting the reveal sequence.
 */
export function placeLaserLines(
  container: HTMLElement,
  animSeqInfos: LaserAnimSeqInfo[],
  tile: TileMetricsData,
  extraCss: string,
): void {
  for (const info of animSeqInfos) {
    const el = info.line
    el.classList.add('laser-line')
    el.classList.add(extraCss)

    const offsetX = info.direction === MASK.RIGHT ? 1 : 0
    const offsetY = info.direction === MASK.BOTTOM ? 1 : 0

    el.style.left = `${(info.x + offsetX) * tile.w}px`
    el.style.top = `${(info.y + offsetY) * tile.h}px`

    if (info.direction === MASK.LEFT || info.direction === MASK.RIGHT) {
      el.style.width = `${info.length * tile.w}px`
      el.style.height = `${tile.h}px`
    } else {
      el.style.width = `${tile.w}px`
      el.style.height = `${info.length * tile.h}px`
    }
    el.style.opacity = '0'
    container.appendChild(el)
  }
}

/**
 * Reveal lines one-by-one in sequence, each sliding in from its direction.
 * Each step lasts `animSeqInfos.length * LASERSPEED.x` ms.
 * Resolves when all lines are fully visible.
 */
export async function revealLaserLines(animSeqInfos: LaserAnimSeqInfo[]): Promise<void> {
  for (const info of animSeqInfos) {
    const stepDuration = info.length * LASERSPEED.x

    const el = info.line
    const name = animationName(info.direction, 'reveal')
    el.style.opacity = '1'
    el.style.animation = `${name} ${stepDuration}ms linear`

    await waitForAnimation(el)
  }
}

/**
 * Hide lines one-by-one in sequence, each sliding out toward its direction.
 * Each step lasts `animSeqInfo.length * LASERSPEED.x` ms.
 * Resolves when all lines are hidden and removed from the DOM.
 */
export async function hideLaserLines(animSeqInfos: LaserAnimSeqInfo[]): Promise<void> {
  for (const info of animSeqInfos) {
    const stepDuration = info.length * LASERSPEED.x

    const el = info.line
    const name = animationName(info.direction, 'hide')

    el.style.animation = `${name} ${stepDuration}ms linear forwards`

    await waitForAnimation(el)
    el.remove()
  }
}

/**
 * Convenience orchestrator: place → reveal → hide → cleanup.
 */
export async function runLaserSequence(
  container: HTMLElement,
  animSeqInfos: LaserAnimSeqInfo[],
  tile: TileMetricsData,
  extraCss: string,
): Promise<void> {
  placeLaserLines(container, animSeqInfos, tile, extraCss)
  await revealLaserLines(animSeqInfos)
  void hideLaserLines(animSeqInfos)
}

export function dxDyToDir(dx: number, dy: number): Direction {
  if (dx > 0) return 'right'
  if (dx < 0) return 'left'
  if (dy > 0) return 'down'
  return 'up'
}

export type LaserAnimSeqInfo = {
  line: HTMLPreElement
  x: number
  y: number
  direction: number
  length: number
}

const LASERSPEED = { x: 20 }

// ─── Internals ────────────────────────────────────────────────────────────────

import { MASK, type TileMetricsData } from 'ascii-game-engine'

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

/**
 * Place every line at its grid position and hide it immediately.
 * Call this before starting the reveal sequence.
 */
export function placeLaserLines(
  container: HTMLElement,
  animSeqInfos: LaserAnimSeqInfo[],
  tile: TileMetricsData,
): void {
  for (const info of animSeqInfos) {
    const el = info.line
    el.classList.add('laser-line')

    // TODO I don't know why the right element need that offset. Find that out
    const offset = info.direction === MASK.RIGHT ? 1 : 0

    el.style.left = `${(info.x + offset) * tile.w}px`
    el.style.top = `${info.y * tile.h}px`

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
): Promise<void> {
  placeLaserLines(container, animSeqInfos, tile)
  await revealLaserLines(animSeqInfos)
  void hideLaserLines(animSeqInfos)
}

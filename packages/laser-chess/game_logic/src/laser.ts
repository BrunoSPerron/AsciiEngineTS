import { CELL } from './gameState'
import type { GameState } from './gameState'
import { cellAt, wrapCoord, idx } from './board'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Direction = 'up' | 'right' | 'down' | 'left'

export type LaserWaypoint = { x: number; y: number }

export type LaserResult = {
  /** Origin, each deflection point, and the final hit cell in order */
  waypoints: LaserWaypoint[]
  /** Board index of the pawn hit, or null */
  pawnHit: number | null
  /** Board indices of non-fixed mirrors hit, they flip on applyLaserResult */
  mirrorsFlipped: number[]
  /** Damage to deal, increases by 1 per mirror bounce */
  damage: number
}

// ---------------------------------------------------------------------------
// Direction helpers
// ---------------------------------------------------------------------------

export const DIR_DELTA: Record<Direction, [number, number]> = {
  up: [0, -1],
  right: [1, 0],
  down: [0, 1],
  left: [-1, 0],
}

// ---------------------------------------------------------------------------
// Mirror deflection (exported so the client can retrace the path)
// ---------------------------------------------------------------------------

const DEFLECT_SLASH: Record<Direction, Direction> = {
  right: 'up',
  left: 'down',
  up: 'right',
  down: 'left',
}
const DEFLECT_BACKSLASH: Record<Direction, Direction> = {
  right: 'down',
  left: 'up',
  up: 'left',
  down: 'right',
}

export function deflect(dir: Direction, ch: string): Direction {
  const map = ch === CELL.MIRROR || ch === CELL.FIXED ? DEFLECT_SLASH : DEFLECT_BACKSLASH
  return map[dir]
}

export function isMirror(ch: string): boolean {
  return (
    ch === CELL.MIRROR || ch === CELL.MIRROR_FLIP || ch === CELL.FIXED || ch === CELL.FIXED_FLIP
  )
}

// ---------------------------------------------------------------------------
// Laser computation
// ---------------------------------------------------------------------------

export function computeLaser(
  state: GameState,
  shooterPlayer: 1 | 2,
  direction: Direction,
): LaserResult {
  const result: LaserResult = {
    waypoints: [],
    pawnHit: null,
    mirrorsFlipped: [],
    damage: 1,
  }

  const shooterMarker = shooterPlayer === 1 ? CELL.PAWN_1 : CELL.PAWN_2
  const shooterIdx = state.board.indexOf(shooterMarker)
  if (shooterIdx === -1) return result

  let x = shooterIdx % state.size
  let y = Math.floor(shooterIdx / state.size)
  let dir = direction

  result.waypoints.push({ x, y })

  const maxSteps = state.size * state.size
  let steps = 0

  while (steps++ < maxSteps) {
    const [dx, dy] = DIR_DELTA[dir]
    ;[x, y] = wrapCoord(state, x + dx, y + dy)

    const ch = cellAt(state, x, y)

    if (ch === CELL.WALL) {
      result.waypoints.push({ x, y })
      break
    }

    if (ch === CELL.PAWN_1 || ch === CELL.PAWN_2) {
      result.pawnHit = idx(state, x, y)
      result.waypoints.push({ x, y })
      break
    }

    if (isMirror(ch)) {
      const isFixed = ch === CELL.FIXED || ch === CELL.FIXED_FLIP
      if (!isFixed) result.mirrorsFlipped.push(idx(state, x, y))
      result.damage++
      dir = deflect(dir, ch)
      result.waypoints.push({ x, y })
    }
  }

  return result
}

// ---------------------------------------------------------------------------
// Apply laser result to state
// ---------------------------------------------------------------------------

export function applyLaserResult(state: GameState, result: LaserResult): void {
  for (const i of result.mirrorsFlipped) {
    state.board[i] = state.board[i] === CELL.MIRROR ? CELL.MIRROR_FLIP : CELL.MIRROR
  }

  if (result.pawnHit !== null) {
    const pawn = state.pawns[result.pawnHit]
    if (pawn) pawn.hp = Math.max(0, pawn.hp - result.damage)
  }
}

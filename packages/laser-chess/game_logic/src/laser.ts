import { type GameRule } from './GameRules'
import { CELL } from './GameState'
import type { GameState } from './GameState'
import { cellAt, wrapCoord, idx } from './board'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Direction = 'up' | 'right' | 'down' | 'left'

export type LaserWaypoint = { x: number; y: number }

export type LaserResult = {
  waypoints: LaserWaypoint[]
  pawnHit: number | null
  mirrorsFlipped: number[]
  wallHit: number | null
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
  originX: number,
  originY: number,
  direction: Direction,
  rule: GameRule,
): LaserResult {
  const result: LaserResult = {
    waypoints: [],
    pawnHit: null,
    mirrorsFlipped: [],
    wallHit: null,
    damage: 1,
  }

  let dir = direction
  let x = originX
  let y = originY

  result.waypoints.push({ x, y })

  const maxSteps = state.sizeX * state.sizeY
  let steps = 0

  while (steps++ < maxSteps) {
    const [dx, dy] = DIR_DELTA[dir]
    ;[x, y] = wrapCoord(state, x + dx, y + dy)

    const ch = cellAt(state, x, y)

    if (ch === CELL.WALL) {
      result.wallHit = idx(state, x, y)
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

      result.damage += rule.bounceDamage
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

  if (result.wallHit !== null) {
    state.board[result.wallHit] = CELL.EMPTY
  }

  if (result.pawnHit !== null) {
    const pawn = state.pawns[result.pawnHit]
    if (pawn) pawn.hp = Math.max(0, pawn.hp - result.damage)
  }
}

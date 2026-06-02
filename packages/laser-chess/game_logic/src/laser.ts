import { type GameRule } from './GameRules'
import { CELL } from './GameState'
import type { GameState } from './GameState'
import { cellAt, wrapCoord, idx } from './board'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Direction = 'up' | 'right' | 'down' | 'left' | 'none'

export type LaserWaypoint = {
  x: number
  y: number
  outDir: Direction
}

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
  none: [0, 0],
}

// ---------------------------------------------------------------------------
// Mirror deflection (exported so the client can retrace the path)
// ---------------------------------------------------------------------------

const DEFLECT_SLASH: Record<Direction, Direction> = {
  right: 'up',
  left: 'down',
  up: 'right',
  down: 'left',
  none: 'none',
}
const DEFLECT_BACKSLASH: Record<Direction, Direction> = {
  right: 'down',
  left: 'up',
  up: 'left',
  down: 'right',
  none: 'none',
}

export function deflect(_rule: GameRule, dir: Direction, ch: string): Direction {
  const map = ch === CELL.MIRROR || ch === CELL.FIXED ? DEFLECT_SLASH : DEFLECT_BACKSLASH
  return map[dir]
}

export function isMirror(_rule: GameRule, ch: string): boolean {
  return (
    ch === CELL.MIRROR || ch === CELL.MIRROR_FLIP || ch === CELL.FIXED || ch === CELL.FIXED_FLIP
  )
}

// ---------------------------------------------------------------------------
// Laser computation
// ---------------------------------------------------------------------------

export function computeLaser(
  rule: GameRule,
  state: GameState,
  originX: number,
  originY: number,
  direction: Direction,
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

  result.waypoints.push({ x, y, outDir: dir })

  const maxSteps = state.sizeX * state.sizeY
  let steps = 0

  while (steps++ < maxSteps) {
    const [dx, dy] = DIR_DELTA[dir]
    x += dx
    y += dy
    const [wx, wy] = wrapCoord(state, x, y)
    x = wx
    y = wy
    const ch = cellAt(state, x, y)

    if (ch === CELL.WALL) {
      result.wallHit = idx(state, x, y)
      result.waypoints.push({ x, y, outDir: 'none' })
      break
    }

    if (ch === CELL.PAWN_1 || ch === CELL.PAWN_2) {
      result.pawnHit = idx(state, x, y)
      result.waypoints.push({ x, y, outDir: 'none' })
      break
    }

    if (isMirror(rule, ch)) {
      const isFixed = ch === CELL.FIXED || ch === CELL.FIXED_FLIP
      if (!isFixed) result.mirrorsFlipped.push(idx(state, x, y))

      result.damage += rule.bounceDamage
      dir = deflect(rule, dir, ch)
      result.waypoints.push({ x, y, outDir: dir })
    }
  }

  console.log(result.waypoints)
  return result
}

// ---------------------------------------------------------------------------
// Apply laser result to state
// ---------------------------------------------------------------------------

export function applyLaserResult(_rule: GameRule, state: GameState, result: LaserResult): void {
  for (const i of result.mirrorsFlipped) {
    state.board[i] = state.board[i] === CELL.MIRROR ? CELL.MIRROR_FLIP : CELL.MIRROR
  }

  if (result.wallHit !== null) {
    const idx = result.wallHit
    state.board[idx] = CELL.EMPTY
    const maxX = state.sizeX
    const maxY = state.sizeY
    const posX = idx % maxX
    const posY = Math.floor(idx / maxX)

    if (posX === 0) state.board[idx + maxX - 1] = CELL.EMPTY
    else if (posX >= maxX - 1) state.board[idx - maxX + 1] = CELL.EMPTY

    //state board use y * sizeX + x as the index
    if (posY === 0) state.board[idx + (maxY - 1) * maxX] = CELL.EMPTY
    else if (posY >= maxY - 1) state.board[idx - (maxY - 1) * maxX] = CELL.EMPTY

    // Edge case: cleanup the last corner
    if ((posX === 0 || posX >= maxX - 1) && (posY === 0 || posY >= maxY - 1)) {
      const oppX = maxX - 1 - posX
      const oppY = maxY - 1 - posY
      const oppIdx = oppY * maxX + oppX
      state.board[oppIdx] = CELL.EMPTY
    }
  }

  if (result.pawnHit !== null) {
    const pawn = state.pawns[result.pawnHit]
    if (pawn) pawn.hp = Math.max(0, pawn.hp - result.damage)
  }
}

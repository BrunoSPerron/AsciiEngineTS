import { GameRule } from './GameRules'
import { CELL } from './GameState'
import type { Action, GameState, MirrorAction, MoveAction, Phase, ShootAction } from './GameState'
import { cellAt, getPawnIndex, idx, isSolid, movePawn, setCell } from './board'
import { computeLaser, applyLaserResult } from './laser'
import type { Direction } from './laser'

// ---------------------------------------------------------------------------
// Movement options (king = 8-directional)
// ---------------------------------------------------------------------------

const KING_DELTAS = [
  [-1, -1],
  [0, -1],
  [1, -1],
  [-1, 0],
  [1, 0],
  [-1, 1],
  [0, 1],
  [1, 1],
] as const

export function getLegalMoves(state: GameState): MoveAction[] {
  const pawnIdx = getPawnIndex(state, state.currentPlayer)
  if (pawnIdx === null) return []

  const px = pawnIdx % state.size
  const py = Math.floor(pawnIdx / state.size)

  const moves: MoveAction[] = []
  for (const [dx, dy] of KING_DELTAS) {
    const tx = px + dx
    const ty = py + dy
    if (tx < 0 || ty < 0 || tx >= state.size || ty >= state.size) continue
    if (cellAt(state, tx, ty) === CELL.EMPTY) {
      moves.push({ type: 'move', toX: tx, toY: ty })
    }
  }
  return moves
}

// ---------------------------------------------------------------------------
// Shoot directions
// ---------------------------------------------------------------------------

export type ShootDirection = { dx: 0 | 1 | -1; dy: 0 | 1 | -1 }

export function getLegalShots(): ShootAction[] {
  return [
    { type: 'shoot', dx: 0, dy: -1 },
    { type: 'shoot', dx: 1, dy: 0 },
    { type: 'shoot', dx: 0, dy: 1 },
    { type: 'shoot', dx: -1, dy: 0 },
  ]
}

// ---------------------------------------------------------------------------
// Mirror placement
// ---------------------------------------------------------------------------

export function canPlaceMirror(state: GameState, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= state.size || y >= state.size) return false
  return cellAt(state, x, y) === CELL.EMPTY
}

// ---------------------------------------------------------------------------
// Phase sequencing
// ---------------------------------------------------------------------------

function nextPhase(phase: Phase): Phase {
  if (phase === 'move') return 'mirror'
  if (phase === 'mirror') return 'shoot'
  return 'move'
}

function nextPlayer(player: 1 | 2): 1 | 2 {
  return player === 1 ? 2 : 1
}

// ---------------------------------------------------------------------------
// applyAction — returns new state (immutable), throws on illegal action
// ---------------------------------------------------------------------------

export function applyAction(state: GameState, action: Action, rule: GameRule): GameState {
  // Deep clone to keep old state intact (useful for server replay / undo)
  const next: GameState = {
    board: [...state.board],
    pawns: Object.fromEntries(Object.entries(state.pawns).map(([k, v]) => [k, { ...v }])),
    size: state.size,
    currentPlayer: state.currentPlayer,
    phase: state.phase,
  }

  switch (action.type) {
    case 'move':
      return applyMove(next, action)
    case 'mirror':
      return applyMirror(next, action)
    case 'shoot':
      return applyShoot(next, action, rule)
  }
}

// ---------------------------------------------------------------------------
// Phase handlers
// ---------------------------------------------------------------------------

function applyMove(state: GameState, action: MoveAction): GameState {
  if (state.phase !== 'move') throw new Error('Not in move phase')

  const legal = getLegalMoves(state)
  const isLegal = legal.some((m) => m.toX === action.toX && m.toY === action.toY)
  if (!isLegal) throw new Error(`Illegal move to ${action.toX},${action.toY}`)

  movePawn(state, state.currentPlayer, action.toX, action.toY)
  state.phase = nextPhase(state.phase)
  return state
}

function applyMirror(state: GameState, action: MirrorAction): GameState {
  if (state.phase !== 'mirror') throw new Error('Not in mirror phase')
  if (!canPlaceMirror(state, action.x, action.y)) {
    throw new Error(`Cannot place mirror at ${action.x},${action.y}`)
  }

  setCell(state, action.x, action.y, action.glyph)
  state.phase = nextPhase(state.phase)
  return state
}

function applyShoot(state: GameState, action: ShootAction, rule: GameRule): GameState {
  if (state.phase !== 'shoot') throw new Error('Not in shoot phase')
  if (action.dx !== 0 && action.dy !== 0) throw new Error('Diagonal shooting not supported')

  const dir = shootDir(action.dx, action.dy)
  const result = computeLaser(state, state.currentPlayer, dir, rule)
  applyLaserResult(state, result)

  // Don't advance the turn if the game is over — let the caller handle it
  if (checkVictory(state) !== null) return state

  state.phase = nextPhase(state.phase)
  if (state.phase === 'move') {
    state.currentPlayer = nextPlayer(state.currentPlayer)
  }

  return state
}

// ---------------------------------------------------------------------------
// Victory check
// ---------------------------------------------------------------------------

export type VictoryResult = { winner: 1 | 2 } | null

export function checkVictory(state: GameState): VictoryResult {
  const p1 = state.pawns[state.board.indexOf(CELL.PAWN_1)]
  const p2 = state.pawns[state.board.indexOf(CELL.PAWN_2)]
  if (!p1 || p1.hp === 0) return { winner: 2 }
  if (!p2 || p2.hp === 0) return { winner: 1 }
  return null
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function shootDir(dx: number, dy: number): Direction {
  if (dy < 0) return 'up'
  if (dy > 0) return 'down'
  if (dx > 0) return 'right'
  return 'left'
}

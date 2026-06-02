import { type GameRule } from './GameRules'
import { CELL } from './GameState'
import type { Action, GameState, MirrorAction, MoveAction, Phase, ShootAction } from './GameState'
import { cellAt, idx, movePawn, setCell } from './board'
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

export function getLegalMoves(
  _rule: GameRule,
  state: GameState,
  x: number,
  y: number,
): MoveAction[] {
  const pawnIdx = idx(state, x, y)

  const px = pawnIdx % state.sizeX
  const py = Math.floor(pawnIdx / state.sizeX)

  const moves: MoveAction[] = []
  for (const [dx, dy] of KING_DELTAS) {
    const tx = px + dx
    const ty = py + dy
    if (tx < 0 || ty < 0 || tx >= state.sizeX || ty >= state.sizeY) continue
    if (cellAt(state, tx, ty) === CELL.EMPTY) {
      moves.push({ type: 'move', fromX: x, fromY: y, toX: tx, toY: ty })
    }
  }
  return moves
}

// ---------------------------------------------------------------------------
// Shoot directions
// ---------------------------------------------------------------------------

export type ShootDirection = { dx: 0 | 1 | -1; dy: 0 | 1 | -1 }

export function getLegalShots(
  _rule: GameRule,
  _state: GameState,
  x: number,
  y: number,
): ShootAction[] {
  return [
    { type: 'shoot', x, y, dx: 0, dy: -1, result: null },
    { type: 'shoot', x, y, dx: 1, dy: 0, result: null },
    { type: 'shoot', x, y, dx: 0, dy: 1, result: null },
    { type: 'shoot', x, y, dx: -1, dy: 0, result: null },
  ]
}

// ---------------------------------------------------------------------------
// Mirror placement
// ---------------------------------------------------------------------------

export function canPlaceMirror(_rule: GameRule, state: GameState, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= state.sizeX || y >= state.sizeY) return false
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
// applyAction, throws on illegal action
// ---------------------------------------------------------------------------

export function applyAction(rule: GameRule, state: GameState, action: Action): GameState {
  // Deep clone to keep old state intact (useful for server replay / undo)
  const next: GameState = {
    board: [...state.board],
    pawns: Object.fromEntries(Object.entries(state.pawns).map(([k, v]) => [k, { ...v }])),
    sizeX: state.sizeX,
    sizeY: state.sizeY,
    currentPlayer: state.currentPlayer,
    phase: state.phase,
  }

  switch (action.type) {
    case 'move':
      return applyMove(rule, next, action)
    case 'mirror':
      return applyMirror(rule, next, action)
    case 'shoot':
      return applyShoot(rule, next, action)
  }
}

// ---------------------------------------------------------------------------
// Phase handlers
// ---------------------------------------------------------------------------

function applyMove(rule: GameRule, state: GameState, action: MoveAction): GameState {
  if (state.phase !== 'move') throw new Error('Not in move phase')

  const legal = getLegalMoves(rule, state, action.fromX, action.fromY)
  const isLegal = legal.some((m) => m.toX === action.toX && m.toY === action.toY)
  if (!isLegal) throw new Error(`Illegal move to ${action.toX},${action.toY}`)

  movePawn(rule, state, action.fromX, action.fromY, action.toX, action.toY)
  state.phase = nextPhase(state.phase)
  return state
}

function applyMirror(rule: GameRule, state: GameState, action: MirrorAction): GameState {
  if (state.phase !== 'mirror') throw new Error('Not in mirror phase')
  if (!canPlaceMirror(rule, state, action.x, action.y)) {
    throw new Error(`Cannot place mirror at ${action.x},${action.y}`)
  }

  setCell(state, action.x, action.y, action.glyph)
  state.phase = nextPhase(state.phase)
  return state
}

export function applyShoot(rule: GameRule, state: GameState, action: ShootAction): GameState {
  const dir = shootDir(action.dx, action.dy)
  const result = action.result || computeLaser(rule, state, action.x, action.y, dir)
  applyLaserResult(rule, state, result)

  // Don't advance the turn if the game is over, let the caller handle it
  if (checkVictory(rule, state) !== null) return state

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

export function checkVictory(_rule: GameRule, state: GameState): VictoryResult {
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

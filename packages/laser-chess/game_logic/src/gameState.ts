// ---------------------------------------------------------------------------
// Cell constants
// ---------------------------------------------------------------------------

export const CELL = {
  EMPTY: ' ',
  WALL: '#',
  MIRROR: '/',
  MIRROR_FLIP: '\\',
  FIXED: 'F',
  FIXED_FLIP: 'f',
  PAWN_1: 'P',
  PAWN_2: 'p',
} as const

export type CellChar = (typeof CELL)[keyof typeof CELL]

// ---------------------------------------------------------------------------
// Pawn
// ---------------------------------------------------------------------------

export type MoveType = 'king'

export type Pawn = {
  player: 1 | 2
  hp: number
  moveType: MoveType
}

// ---------------------------------------------------------------------------
// Game state
// ---------------------------------------------------------------------------

export type Phase = 'move' | 'mirror' | 'shoot'

export type GameState = {
  /** Flat char array, length = size * size. Index via y * size + x. */
  board: string[]
  /** Rich pawn data keyed by board index (y * size + x). */
  pawns: Record<number, Pawn>
  size: number
  currentPlayer: 1 | 2
  phase: Phase
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

export type MoveAction = { type: 'move'; toX: number; toY: number }
export type MirrorAction = { type: 'mirror'; x: number; y: number; glyph: '/' | '\\' }
export type ShootAction = { type: 'shoot'; dx: number; dy: number }

export type Action = MoveAction | MirrorAction | ShootAction

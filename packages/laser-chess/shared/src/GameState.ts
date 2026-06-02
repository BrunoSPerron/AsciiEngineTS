// ---------------------------------------------------------------------------
// Cell constants
// ---------------------------------------------------------------------------

import type { LaserResult } from './laser'

export const CELL = {
  EMPTY: ' ',
  WALL: '#',
  MIRROR: '/',
  MIRROR_FLIP: '\\',
  FIXED: 'f',
  FIXED_FLIP: 'F',
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
  /** Flat char array, length = size * size. Index via y * sizeX + x. */
  board: string[]
  /** Rich pawn data keyed by board index (y * sizeX + x). */
  pawns: Record<number, Pawn>
  sizeX: number
  sizeY: number
  currentPlayer: 1 | 2
  phase: Phase
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

export type MoveAction = { type: 'move'; fromX: number; fromY: number; toX: number; toY: number }
export type MirrorAction = { type: 'mirror'; x: number; y: number; glyph: '/' | '\\' }
export type ShootAction = {
  type: 'shoot'
  x: number
  y: number
  dx: number
  dy: number
  result: LaserResult | null
}

export type Action = MoveAction | MirrorAction | ShootAction

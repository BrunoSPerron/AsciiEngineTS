import type { MoveType } from './GameState'

export type GameRule = {
  bounceDamage: number
  kingHP: number
  kingMoveType: MoveType
}

export const DEFAULT_GAME_RULE: GameRule = {
  bounceDamage: 1,
  kingHP: 3,
  kingMoveType: 'king',
}

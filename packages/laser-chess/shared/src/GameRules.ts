import type { MoveType } from './GameState'

export type GameRule = {
  bounceDamage: number
  kingHP: number
  kingMoveType: MoveType
}

export const DEFAULT_GAME_RULE: GameRule = {
  bounceDamage: 1,
  kingHP: 5,
  kingMoveType: 'king',
}

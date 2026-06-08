import type { MoveType } from './GameState'

export type GameRule = {
  bounceDamage: number
  kingHP: number
  kingMoveType: MoveType
}

export const GAME_RULE_DEATHMATCH: GameRule = {
  bounceDamage: 1,
  kingHP: 3,
  kingMoveType: 'king',
}

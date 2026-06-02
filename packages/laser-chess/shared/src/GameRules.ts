import type { MoveType } from './GameState'

export type GameRule = {
  bounceDamage: number

  kingHP: number
  kingMoveType: MoveType
}

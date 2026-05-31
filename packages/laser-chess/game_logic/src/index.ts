import { applyAction, canPlaceMirror, checkVictory, getLegalMoves, getLegalShots } from './actions'
import type { Action, GameState } from './GameState'
import type { GameRule } from './GameRules'
import { computeLaser, type Direction } from './laser'

export type { GameRule } from './GameRules'
export type { Action, MoveAction, MirrorAction, ShootAction, GameState } from './GameState'
export { CELL } from './GameState'
export { type Direction, type LaserResult, DIR_DELTA } from './laser'

export function createGame(rule: GameRule) {
  return {
    applyAction: (state: GameState, action: Action) => applyAction(rule, state, action),

    canPlaceMirror: (state: GameState, x: number, y: number) => canPlaceMirror(rule, state, x, y),

    checkVictory: (state: GameState) => checkVictory(rule, state),

    computeLaser: (state: GameState, originX: number, originY: number, direction: Direction) =>
      computeLaser(rule, state, originX, originY, direction),

    getLegalMoves: (state: GameState, posX: number, posY: number) =>
      getLegalMoves(rule, state, posX, posY),

    getLegalShots: (state: GameState, x: number, y: number) => getLegalShots(rule, state, x, y),
  }
}

export type GameLogic = ReturnType<typeof createGame>

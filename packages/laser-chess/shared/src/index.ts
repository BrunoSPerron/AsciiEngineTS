import {
  applyAction,
  canPlaceMirror,
  checkVictory,
  getLegalMoves,
  getLegalShots,
  type VictoryResult,
} from './actions'
import type { Action, GameState, MoveAction, ShootAction } from './GameState'
import type { GameRule } from './GameRules'
import { computeLaser, type Direction, type LaserResult } from './laser'

export type { VictoryResult } from './actions'
export { idx, loadBoard } from './board'
export { DEFAULT_GAME_RULE, type GameRule } from './GameRules'
export type { Action, MoveAction, MirrorAction, ShootAction, GameState } from './GameState'
export { CELL, type CellChar } from './GameState'
export { type Direction, type LaserResult, type LaserWaypoint, DIR_DELTA } from './laser'

export type {
  ClientMessage,
  RoomBroadcast,
  RoomSummary,
  PlayerSummary,
  ServerMessage,
} from './protocol'

export function createGame(rule: GameRule) {
  return {
    applyAction: (state: GameState, action: Action) => applyAction(rule, state, action),

    canPlaceMirror: (state: GameState, x: number, y: number) => canPlaceMirror(rule, state, x, y),

    checkVictory: (state: GameState): VictoryResult => checkVictory(rule, state),

    computeLaser: (
      state: GameState,
      originX: number,
      originY: number,
      direction: Direction,
    ): LaserResult => computeLaser(rule, state, originX, originY, direction),

    getLegalMoves: (state: GameState, posX: number, posY: number): MoveAction[] =>
      getLegalMoves(rule, state, posX, posY),

    getLegalShots: (state: GameState, x: number, y: number): ShootAction[] =>
      getLegalShots(rule, state, x, y),
  }
}

export type GameLogic = ReturnType<typeof createGame>

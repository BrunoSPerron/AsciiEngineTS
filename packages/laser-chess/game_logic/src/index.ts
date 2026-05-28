export { CELL } from './gameState'
export type {
  CellChar,
  Pawn,
  MoveType,
  Phase,
  GameState,
  Action,
  MoveAction,
  MirrorAction,
  ShootAction,
} from './gameState'

export {
  loadBoard,
  cellAt,
  setCell,
  idx,
  getPawn,
  getPawnIndex,
  movePawn,
  isSolid,
  isEmpty,
  wrapCoord,
} from './board'

export { computeLaser, applyLaserResult, deflect, isMirror, DIR_DELTA } from './laser'
export type { Direction, LaserResult } from './laser'

export { applyAction, getLegalMoves, getLegalShots, canPlaceMirror, checkVictory } from './actions'
export type { VictoryResult } from './actions'

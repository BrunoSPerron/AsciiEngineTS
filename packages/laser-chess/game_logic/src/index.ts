export { CELL } from './GameState'
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
} from './GameState'

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

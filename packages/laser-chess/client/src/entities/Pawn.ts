import type { GridVector } from 'ascii-game-engine'
import { Entity } from 'ascii-game-engine'

export const PAWN_TYPE = {
  KING: 0,
} as const

export const MOVE_TYPE = {
  KING: 0,
} as const

type MoveTypeValue = (typeof MOVE_TYPE)[keyof typeof MOVE_TYPE]

function isMoveType(value: number): value is MoveTypeValue {
  return (Object.values(MOVE_TYPE) as readonly number[]).includes(value)
}

export type relativePosition = {
  x: number
  y: number
  glyph: string
}

export class Pawn extends Entity {
  protected _type: number = PAWN_TYPE.KING
  protected _moveType: number = MOVE_TYPE.KING
  protected _health: number = 5
  protected _isPlayerOne: boolean

  constructor(pawnType: number, position: GridVector, isPlayerOne: boolean, moveType: number = -1) {
    let glyph = ' '
    switch (pawnType) {
      case PAWN_TYPE.KING:
        glyph = 'K'
    }
    super(glyph, position, 250)
    this._isPlayerOne = isPlayerOne
    this.extraCss.add(isPlayerOne ? 'player-one' : 'player-two')
    this._type = pawnType
    this._moveType = isMoveType(moveType) ? moveType : MOVE_TYPE.KING
  }

  get health(): number {
    return this._health
  }

  public damage(value: number) {
    this._health = Math.max(this._health - value, 0)
  }
}

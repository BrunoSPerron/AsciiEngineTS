import type { GridVector } from 'ascii-game-engine';
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

/**
TODO No arrow set have monospaced diagonal arrows
  fix idea:
    .title {
      transform: scaleX(calc(300 / 180));
    }
  Where:
    300 = desired width (px)
    180 = original width (px)
 */
export const ArrowSet: Record<string, string> = {
  number: '468279315',

  // diagonal not monospace
  basic: '←→↑↓↖↗↘↙x',

  // Not monospaced
  /*
  full: '⬅➡⬆⬇⬉⬈⬊⬋X',
  hollow: '⇦⇨⇧⇩⬁⬀⬂⬃X',
  double: '⇐⇒⇑⇓⇖⇗⇘⇙X',
  plusLine: '⭰⭲⭱⭳⭶⭷⭸⭹X',

  // add back the thicksets
  */
} as const

const defaultArrowSet = 'number'

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

  public getMovementOptions(arrowSet: string = defaultArrowSet): relativePosition[] {
    switch (this._moveType) {
      case MOVE_TYPE.KING: {
        return this.getKingMoveOptions(arrowSet)
      }
      default:
        return []
    }
  }

  public getShootAngles(arrowSet: string = defaultArrowSet): relativePosition[] {
    const _set = ArrowSet[arrowSet] ?? ArrowSet['basic']
    return [
      { x: 0, y: -1, glyph: _set[2] },
      { x: -1, y: 0, glyph: _set[0] },
      { x: 1, y: 0, glyph: _set[1] },
      { x: 0, y: 1, glyph: _set[3] },
    ]
  }

  private getKingMoveOptions(arrowSet: string): relativePosition[] {
    const _set = ArrowSet[arrowSet] ?? ArrowSet['basic']
    return [
      { x: -1, y: -1, glyph: _set[4] },
      { x: 0, y: -1, glyph: _set[2] },
      { x: 1, y: -1, glyph: _set[5] },

      { x: -1, y: 0, glyph: _set[0] },
      { x: 0, y: 0, glyph: _set[8] },
      { x: 1, y: 0, glyph: _set[1] },

      { x: -1, y: 1, glyph: _set[7] },
      { x: 0, y: 1, glyph: _set[3] },
      { x: 1, y: 1, glyph: _set[6] },
    ]
  }
}

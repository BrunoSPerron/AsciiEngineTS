import { type GameRule } from './GameRules'
import { CELL, type CellChar, type GameState, type Pawn } from './GameState'

// ---------------------------------------------------------------------------
// Index helpers
// ---------------------------------------------------------------------------

export function idx(state: GameState, x: number, y: number): number {
  return y * state.sizeX + x
}

export function cellAt(state: GameState, x: number, y: number): CellChar {
  return state.board[idx(state, x, y)] as CellChar
}

export function setCell(state: GameState, x: number, y: number, char: CellChar): void {
  state.board[idx(state, x, y)] = char
}

// ---------------------------------------------------------------------------
// Board loading
// ---------------------------------------------------------------------------

/**
 * Parse a board txt file into a GameState, replacing entity glyphs with
 * PAWN markers and populating the pawn record.
 *
 * Expected txt format: 31x31 chars per line, 'K' = player one king,
 * 'k' = player two king, '#' = wall, '/' '\' = mirror, 'F' 'f' = fixed.
 */
export function loadBoard(
  txt: string,
  rules: GameRule,
): Pick<GameState, 'board' | 'sizeX' | 'sizeY' | 'pawns'> {
  const lines = txt.split('\n')
  let sizeX: number = 0
  let sizeY: number = 0
  for (const line of lines) {
    sizeY++
    if (line.length > sizeX) sizeX = line.length
  }
  const board: string[] = new Array<string>(sizeX * sizeY).fill(CELL.EMPTY)
  const pawns: Record<number, Pawn> = {}
  for (let y = 0; y < sizeY; y++) {
    const line = (lines[y] ?? '').replace('\r', '')
    for (let x = 0; x < sizeX; x++) {
      const ch = line[x] ?? ' '
      const i = y * sizeX + x

      switch (ch) {
        case 'K':
          board[i] = CELL.PAWN_1
          pawns[i] = { player: 1, hp: rules.kingHP, moveType: rules.kingMoveType }
          break
        case 'k':
          board[i] = CELL.PAWN_2
          pawns[i] = { player: 2, hp: rules.kingHP, moveType: rules.kingMoveType }
          break
        case CELL.WALL:
        case CELL.MIRROR:
        case CELL.MIRROR_FLIP:
        case CELL.FIXED:
        case CELL.FIXED_FLIP:
          board[i] = ch
          break
        default:
          board[i] = CELL.EMPTY
      }
    }
  }

  return { board, sizeX, sizeY, pawns }
}

// ---------------------------------------------------------------------------
// Pawn helpers
// ---------------------------------------------------------------------------

export function movePawn(
  _rule: GameRule,
  state: GameState,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
): void {
  const fromIdx = idx(state, fromX, fromY)
  if (fromIdx === null) return

  const pawn = state.pawns[fromIdx]
  const toIdx = idx(state, toX, toY)

  setCell(state, fromX, fromY, CELL.EMPTY)
  setCell(state, toX, toY, pawn.player === 1 ? CELL.PAWN_1 : CELL.PAWN_2)

  delete state.pawns[fromIdx]
  state.pawns[toIdx] = pawn
}

// ---------------------------------------------------------------------------
// Board wrapping (laser chess loops at borders)
// ---------------------------------------------------------------------------

export function wrapCoord(state: GameState, x: number, y: number): [number, number] {
  if (x < 0) x = state.sizeX - 1
  else if (x >= state.sizeX) x = 0

  if (y < 0) y = state.sizeY - 1
  else if (y >= state.sizeY) y = 0

  return [x, y]
}

// ---------------------------------------------------------------------------
// Solid check (walls and fixed mirrors block movement, not lasers)
// ---------------------------------------------------------------------------

export function isSolid(state: GameState, x: number, y: number): boolean {
  const ch = cellAt(state, x, y)
  return (
    ch === CELL.WALL ||
    ch === CELL.MIRROR ||
    ch === CELL.MIRROR_FLIP ||
    ch === CELL.FIXED ||
    ch === CELL.FIXED_FLIP ||
    ch === CELL.PAWN_1 ||
    ch === CELL.PAWN_2
  )
}

export function isEmpty(state: GameState, x: number, y: number): boolean {
  return cellAt(state, x, y) === CELL.EMPTY
}

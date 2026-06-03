import type { AsciiEngine } from 'ascii-game-engine'
import { GridVector } from 'ascii-game-engine'
import { CELL, type GameState } from '@laser-chess/shared'
import { Board } from './Board'
import { Pawn, PAWN_TYPE, MOVE_TYPE } from './entities/Pawn'

/**
 * Reconstruct a Board from an authoritative GameState.
 *
 * Fills chunk (0,0) tiles from state.board (walls, mirrors, fixed mirrors)
 * and spawns Pawn entities from state.pawns — mirrors what BoardConfig +
 * Board._prepareForGame do, but driven by GameState instead of a txt file.
 *
 * The checker pattern is applied the same way BoardConfig does it.
 */
export function buildBoardFromState(state: GameState, engine: AsciiEngine): Board {
  const chunk = engine.world.getChunkXY(0, 0)

  // Apply checker pattern
  for (let x = 0; x < state.sizeX; x++) {
    for (let y = 0; y < state.sizeY; y++) {
      const tile = chunk.get(x, y)
      tile.glyph = ' '
      tile.solid = false
      tile.style = ((x % 2) + y) % 2 === 0 ? 'odd' : undefined
    }
  }

  // Fill tiles from board array
  for (let y = 0; y < state.sizeY; y++) {
    for (let x = 0; x < state.sizeX; x++) {
      const ch = state.board[y * state.sizeX + x]
      const tile = chunk.get(x, y)

      switch (ch) {
        case CELL.WALL:
          tile.glyph = '#'
          tile.solid = true
          break
        case CELL.MIRROR:
          tile.glyph = '/'
          tile.solid = true
          tile.style = 'fixed'
          break
        case CELL.MIRROR_FLIP:
          tile.glyph = '\\'
          tile.solid = true
          tile.style = 'fixed'
          break
        case CELL.FIXED:
          tile.glyph = '/'
          tile.solid = true
          tile.style = 'fixed'
          break
        case CELL.FIXED_FLIP:
          tile.glyph = '\\'
          tile.solid = true
          tile.style = 'fixed'
          break
        // Pawns are entities — tile stays empty
        case CELL.PAWN_1:
        case CELL.PAWN_2:
          tile.glyph = ' '
          tile.solid = false
          break
      }
    }
  }

  chunk.dirty = true
  engine.renderer.invalidateChunks()

  // Construct Board — pass the already-filled chunk so _prepareForGame
  // finds only spaces (pawns were not written as glyphs) and does nothing.
  // We then manually spawn the pawns below.
  const board = new Board(chunk, engine)

  // Spawn pawns from state.pawns
  for (const [idxStr, pawnRecord] of Object.entries(state.pawns)) {
    const i = Number(idxStr)
    const x = i % state.sizeX
    const y = Math.floor(i / state.sizeX)
    const isPlayerOne = pawnRecord.player === 1

    const pawn = new Pawn(PAWN_TYPE.KING, new GridVector(x, y), isPlayerOne, MOVE_TYPE.KING)
    pawn.health = pawnRecord.hp

    if (isPlayerOne) board.playerOneUnits.push(pawn)
    else board.playerTwoUnits.push(pawn)

    engine.world.spawnEntity(pawn)
  }

  return board
}

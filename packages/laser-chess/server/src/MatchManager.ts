import type { GameState } from '@laser-chess/shared'
import { createGame, loadBoard, GAME_RULE_DEATHMATCH, type GameLogic } from '@laser-chess/shared'
import type { GameRule } from '@laser-chess/shared'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type MatchState = {
  roomId: string
  playerOne: string // socket / player id
  playerTwo: string // socket / player id
  state: GameState
  rule: GameRule
  logic: GameLogic
}

// ---------------------------------------------------------------------------
// MatchManager
// ---------------------------------------------------------------------------

export class MatchManager {
  private _matches = new Map<string, MatchState>()

  /**
   * Create a new match for the given room.
   * playerOne is the room creator (acts first).
   * playerTwo is the other matched player.
   * boardTxt is the raw board file content sent by the host client.
   *
   * Returns the initial GameState so the caller can broadcast it.
   * Throws if the board cannot be parsed.
   */
  createMatch(
    roomId: string,
    playerOneId: string,
    playerTwoId: string,
    boardTxt: string,
  ): MatchState {
    const rule = GAME_RULE_DEATHMATCH
    const logic = createGame(rule)

    const { board, pawns, sizeX, sizeY } = loadBoard(boardTxt, rule)

    const state: GameState = {
      board,
      pawns,
      sizeX,
      sizeY,
      currentPlayer: 1,
      phase: 'move',
    }

    const match: MatchState = {
      roomId,
      playerOne: playerOneId,
      playerTwo: playerTwoId,
      state,
      rule,
      logic,
    }

    this._matches.set(roomId, match)
    return match
  }

  getMatch(roomId: string): MatchState | null {
    return this._matches.get(roomId) ?? null
  }

  /** Returns the match the given player is participating in, if any. */
  getMatchByPlayer(playerId: string): MatchState | null {
    for (const match of this._matches.values()) {
      if (match.playerOne === playerId || match.playerTwo === playerId) return match
    }
    return null
  }

  removeMatch(roomId: string): void {
    this._matches.delete(roomId)
  }

  /**
   * Returns 1 if playerId is player one in the match, 2 if player two.
   * Throws if the player is not part of the match.
   */
  playerNumber(match: MatchState, playerId: string): 1 | 2 {
    if (match.playerOne === playerId) return 1
    if (match.playerTwo === playerId) return 2
    throw new Error(`Player ${playerId} is not part of match in room ${match.roomId}`)
  }
}

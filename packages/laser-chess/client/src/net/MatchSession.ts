import type { PlayerSummary } from '@laser-chess/shared'
import type { ServerConnection } from '../net/ServerConnection'

/**
 * MatchSession coordinates an online match between two players.
 *
 * TODO: implement game logic delegation over the wire:
 *   - Exchange board selection
 *   - Sync moves, mirror placements, and shoot actions via the server
 *   - Handle disconnection and reconnection
 *   - Relay LaserResult from the authoritative player to the other
 */
export class MatchSession {
  readonly conn: ServerConnection
  readonly localPlayer: PlayerSummary
  readonly opponent: PlayerSummary

  constructor(conn: ServerConnection, localPlayerId: string, players: PlayerSummary[]) {
    this.conn = conn

    const local = players.find((p) => p.id === localPlayerId)
    const remote = players.find((p) => p.id !== localPlayerId)

    if (!local || !remote) {
      throw new Error('MatchSession: could not identify local and remote players')
    }

    this.localPlayer = local
    this.opponent = remote
  }

  /** True when this client controls player-one (the first-moving side). */
  get isPlayerOne(): boolean {
    return this.localPlayer.id < this.opponent.id
  }

  destroy(): void {
    // TODO: cleanly leave/abort the match
  }
}

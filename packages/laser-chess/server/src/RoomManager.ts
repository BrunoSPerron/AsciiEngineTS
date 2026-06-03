import type { PlayerSummary, RoomSummary } from '@laser-chess/shared'
import { MAX_PLAYERS_PER_ROOM } from './protocol'

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

export type Player = {
  id: string
  name: string
  roomId: string | null
  ready: boolean
}

export type Room = {
  id: string
  name: string
  playerIds: Set<string>
  createdAt: number
}

export type JoinResult =
  | { ok: true; room: Room; evicted: Room | null }
  | { ok: false; reason: string }

// ---------------------------------------------------------------------------
// RoomManager
// ---------------------------------------------------------------------------

let _playerCounter = 0
let _roomCounter = 0

function nextPlayerId(): string {
  return `p${++_playerCounter}`
}

function nextRoomId(): string {
  return `r${++_roomCounter}`
}

export class RoomManager {
  private _players = new Map<string, Player>()
  private _rooms = new Map<string, Room>()

  // ---------------------------------------------------------------------------
  // Players
  // ---------------------------------------------------------------------------

  createPlayer(): Player {
    const player: Player = {
      id: nextPlayerId(),
      name: 'Bob',
      roomId: null,
      ready: false,
    }
    this._players.set(player.id, player)
    return player
  }

  removePlayer(playerId: string): Room | null {
    const player = this._players.get(playerId)
    if (!player) return null
    this._players.delete(playerId)
    return player.roomId ? this._leaveRoom(player) : null
  }

  setName(playerId: string, name: string): Player | null {
    const player = this._players.get(playerId)
    if (!player) return null
    const trimmed = name.trim().slice(0, 32) || 'Bob'
    player.name = trimmed
    return player
  }

  /**
   * Toggle a player's ready state.
   * Resets all players' ready state when a match is triggered (caller decides).
   * Returns the updated player, or null if not found or not in a room.
   */
  setReady(playerId: string, ready: boolean): Player | null {
    const player = this._players.get(playerId)
    if (!player || !player.roomId) return null
    player.ready = ready
    return player
  }

  /**
   * Returns all players in the room who are ready.
   * Caller uses this to decide if a match should start.
   */
  getReadyPlayers(roomId: string): Player[] {
    const room = this._rooms.get(roomId)
    if (!room) return []
    return [...room.playerIds]
      .map((id) => this._players.get(id))
      .filter((p): p is Player => p !== undefined && p.ready)
  }

  /**
   * Reset all players in a room to not-ready.
   * Called after a match starts so the room can host a new game.
   */
  resetReadyState(roomId: string): void {
    const room = this._rooms.get(roomId)
    if (!room) return
    for (const id of room.playerIds) {
      const p = this._players.get(id)
      if (p) p.ready = false
    }
  }

  getPlayer(playerId: string): Player | null {
    return this._players.get(playerId) ?? null
  }

  // ---------------------------------------------------------------------------
  // Rooms
  // ---------------------------------------------------------------------------

  getRoomSummaries(): RoomSummary[] {
    return [...this._rooms.values()].map((r) => this.toRoomSummary(r))
  }

  createRoom(creatorId: string, roomName: string): { room: Room; evicted: Room | null } {
    const player = this._players.get(creatorId)!
    const evicted = player.roomId ? this._leaveRoom(player) : null

    const room: Room = {
      id: nextRoomId(),
      name: roomName.trim().slice(0, 64) || 'Room',
      playerIds: new Set([creatorId]),
      createdAt: Date.now(),
    }
    this._rooms.set(room.id, room)
    player.roomId = room.id
    player.ready = false

    return { room, evicted }
  }

  joinRoom(playerId: string, roomId: string): JoinResult {
    const player = this._players.get(playerId)
    if (!player) return { ok: false, reason: 'Unknown player.' }

    const room = this._rooms.get(roomId)
    if (!room) return { ok: false, reason: 'Room not found.' }
    if (room.playerIds.size >= MAX_PLAYERS_PER_ROOM) return { ok: false, reason: 'Room is full.' }
    if (player.roomId === roomId) return { ok: false, reason: 'Already in this room.' }

    const evicted = player.roomId ? this._leaveRoom(player) : null

    room.playerIds.add(playerId)
    player.roomId = roomId
    player.ready = false

    return { ok: true, room, evicted }
  }

  leaveRoom(playerId: string): Room | null {
    const player = this._players.get(playerId)
    if (!player || !player.roomId) return null
    return this._leaveRoom(player)
  }

  getRoom(roomId: string): Room | null {
    return this._rooms.get(roomId) ?? null
  }

  getPlayersInRoom(roomId: string): Player[] {
    const room = this._rooms.get(roomId)
    if (!room) return []
    return [...room.playerIds].flatMap((id) => {
      const p = this._players.get(id)
      return p ? [p] : []
    })
  }

  // ---------------------------------------------------------------------------
  // Summary helpers
  // ---------------------------------------------------------------------------

  toRoomSummary(room: Room): RoomSummary {
    return { id: room.id, name: room.name, playerCount: room.playerIds.size }
  }

  toPlayerSummary(player: Player): PlayerSummary {
    return { id: player.id, name: player.name, ready: player.ready }
  }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  private _leaveRoom(player: Player): Room | null {
    if (!player.roomId) return null
    const room = this._rooms.get(player.roomId)
    player.roomId = null
    player.ready = false
    if (!room) return null

    room.playerIds.delete(player.id)
    if (room.playerIds.size === 0) {
      this._rooms.delete(room.id)
    }

    return room
  }
}

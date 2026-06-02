import type { PlayerSummary, RoomSummary } from '@laser-chess/shared'
import { MAX_PLAYERS_PER_ROOM } from './protocol'

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

export type Player = {
  id: string
  name: string
  roomId: string | null
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

  getPlayer(playerId: string): Player | null {
    return this._players.get(playerId) ?? null
  }

  // ---------------------------------------------------------------------------
  // Rooms
  // ---------------------------------------------------------------------------

  getRoomSummaries(): RoomSummary[] {
    return [...this._rooms.values()].map((r) => this.toRoomSummary(r))
  }

  /**
   * Creates a room and immediately joins the creator.
   * Always succeeds (creator is in at most one room, and one person < 100).
   * Returns the new room and any room the creator was evicted from.
   */
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
    return { id: player.id, name: player.name }
  }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  /**
   * Removes player from their current room.
   * Destroys the room if it becomes empty.
   * Returns the room the player was in (before potential destruction).
   */
  private _leaveRoom(player: Player): Room | null {
    if (!player.roomId) return null
    const room = this._rooms.get(player.roomId)
    player.roomId = null
    if (!room) return null

    room.playerIds.delete(player.id)
    if (room.playerIds.size === 0) {
      this._rooms.delete(room.id)
    }

    return room
  }
}

// ---------------------------------------------------------------------------
// Shared constants
// ---------------------------------------------------------------------------

export const MAX_PLAYERS_PER_ROOM = 100

// ---------------------------------------------------------------------------
// Client → Server
// ---------------------------------------------------------------------------

export type ClientMessage =
  | { type: 'setName'; name: string }
  | { type: 'getRooms' }
  | { type: 'createRoom'; name: string }
  | { type: 'joinRoom'; roomId: string }
  | { type: 'leaveRoom' }
  | { type: 'message'; text: string }

// ---------------------------------------------------------------------------
// Server → Client
// ---------------------------------------------------------------------------

export type RoomSummary = {
  id: string
  name: string
  playerCount: number
}

export type PlayerSummary = {
  id: string
  name: string
}

/** Targeted — sent only to the recipient */
export type ServerMessage =
  | { type: 'welcome'; playerId: string; playerName: string }
  | { type: 'nameChanged'; playerName: string }
  | { type: 'rooms'; rooms: RoomSummary[] }
  | { type: 'joined'; room: RoomSummary; players: PlayerSummary[] }
  | { type: 'left' }
  | { type: 'error'; message: string }

/** Broadcast — sent to all players in a room */
export type RoomBroadcast =
  | { type: 'playerJoined'; player: PlayerSummary }
  | { type: 'playerLeft'; player: PlayerSummary }
  | { type: 'message'; player: PlayerSummary; text: string }

import type { Action, GameState } from './GameState'

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
  | { type: 'setReady'; ready: boolean }
  | { type: 'selectBoard'; boardTxt: string; boardName: string }
  | { type: 'gameAction'; action: Action }

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
  ready: boolean
}

export type RoomBroadcast =
  | { type: 'playerJoined'; player: PlayerSummary }
  | { type: 'playerLeft'; player: PlayerSummary }
  | { type: 'playerReadyChanged'; player: PlayerSummary }
  | { type: 'message'; player: PlayerSummary; text: string }
  | { type: 'matchStart'; players: PlayerSummary[] }
  | { type: 'boardSelected'; boardName: string }
  | { type: 'actionApplied'; action: Action; playerNum: number; state: GameState }
  | { type: 'gameOver'; winner: 1 | 2 }

export type ServerMessage =
  | { type: 'welcome'; playerId: string; playerName: string }
  | { type: 'nameChanged'; playerName: string }
  | { type: 'rooms'; rooms: RoomSummary[] }
  | { type: 'joined'; room: RoomSummary; players: PlayerSummary[] }
  | { type: 'left' }
  | { type: 'error'; message: string }
  | { type: 'gameStarted'; state: GameState; yourPlayer: 1 | 2 }

import type { ServerWebSocket } from 'bun'
import type { RoomBroadcast } from './protocol'
import type { Room } from './RoomManager'
import { RoomManager } from './RoomManager'
import type { ClientMessage, ServerMessage } from '@laser-chess/shared'

// ---------------------------------------------------------------------------
// WebSocketData — attached to each socket by Bun
// ---------------------------------------------------------------------------

export type WebSocketData = {
  playerId: string
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

const rooms = new RoomManager()

/**
 * Live socket map — needed so we can push to individual players and broadcast
 * to rooms. Bun's `ws.publish` only works for subscriptions; we use this map
 * to target players directly when needed.
 */
const sockets = new Map<string, ServerWebSocket<WebSocketData>>()

// ---------------------------------------------------------------------------
// Public handlers — called from index.ts
// ---------------------------------------------------------------------------

export function onOpen(ws: ServerWebSocket<WebSocketData>): void {
  const player = rooms.createPlayer()
  ws.data.playerId = player.id
  sockets.set(player.id, ws)

  send(ws, { type: 'welcome', playerId: player.id, playerName: player.name })
}

export function onClose(ws: ServerWebSocket<WebSocketData>): void {
  const { playerId } = ws.data
  sockets.delete(playerId)

  const player = rooms.getPlayer(playerId)
  const playerSummary = player ? rooms.toPlayerSummary(player) : { id: playerId, name: 'Bob' }

  const vacatedRoom = rooms.removePlayer(playerId)
  if (vacatedRoom) {
    broadcast(vacatedRoom, { type: 'playerLeft', player: playerSummary })
  }
}

export function onMessage(ws: ServerWebSocket<WebSocketData>, raw: string | Buffer): void {
  const { playerId } = ws.data

  let msg: ClientMessage
  try {
    msg = JSON.parse(raw.toString()) as ClientMessage
  } catch {
    send(ws, { type: 'error', message: 'Invalid JSON.' })
    return
  }

  switch (msg.type) {
    case 'setName':
      handleSetName(ws, playerId, msg.name)
      break
    case 'getRooms':
      handleGetRooms(ws)
      break
    case 'createRoom':
      handleCreateRoom(ws, playerId, msg.name)
      break
    case 'joinRoom':
      handleJoinRoom(ws, playerId, msg.roomId)
      break
    case 'leaveRoom':
      handleLeaveRoom(ws, playerId)
      break
    case 'message':
      handleMessage(ws, playerId, msg.text)
      break
    default:
      send(ws, { type: 'error', message: 'Unknown message type.' })
  }
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

function handleSetName(ws: ServerWebSocket<WebSocketData>, playerId: string, name: string): void {
  const player = rooms.setName(playerId, name)
  if (!player) return
  send(ws, { type: 'nameChanged', playerName: player.name })
}

function handleGetRooms(ws: ServerWebSocket<WebSocketData>): void {
  send(ws, { type: 'rooms', rooms: rooms.getRoomSummaries() })
}

function handleCreateRoom(
  ws: ServerWebSocket<WebSocketData>,
  playerId: string,
  roomName: string,
): void {
  const player = rooms.getPlayer(playerId)!
  const { room, evicted } = rooms.createRoom(playerId, roomName)

  // Notify the room the creator was evicted from
  if (evicted) {
    broadcast(evicted, { type: 'playerLeft', player: rooms.toPlayerSummary(player) })
  }

  send(ws, {
    type: 'joined',
    room: rooms.toRoomSummary(room),
    players: [rooms.toPlayerSummary(player)],
  })
}

function handleJoinRoom(
  ws: ServerWebSocket<WebSocketData>,
  playerId: string,
  roomId: string,
): void {
  const player = rooms.getPlayer(playerId)!
  const result = rooms.joinRoom(playerId, roomId)

  if (!result.ok) {
    send(ws, { type: 'error', message: result.reason })
    return
  }

  const { room, evicted } = result

  // Notify the room the player was evicted from
  if (evicted) {
    broadcast(evicted, { type: 'playerLeft', player: rooms.toPlayerSummary(player) })
  }

  // Notify existing members of the new arrival
  broadcast(room, { type: 'playerJoined', player: rooms.toPlayerSummary(player) }, playerId)

  // Confirm to the joiner with the current player list
  send(ws, {
    type: 'joined',
    room: rooms.toRoomSummary(room),
    players: rooms.getPlayersInRoom(room.id).map((p) => rooms.toPlayerSummary(p)),
  })
}

function handleLeaveRoom(ws: ServerWebSocket<WebSocketData>, playerId: string): void {
  const player = rooms.getPlayer(playerId)!
  const vacatedRoom = rooms.leaveRoom(playerId)

  if (!vacatedRoom) {
    send(ws, { type: 'error', message: 'Not in a room.' })
    return
  }

  broadcast(vacatedRoom, { type: 'playerLeft', player: rooms.toPlayerSummary(player) })
  send(ws, { type: 'left' })
}

function handleMessage(_ws: ServerWebSocket<WebSocketData>, playerId: string, text: string): void {
  const player = rooms.getPlayer(playerId)!
  if (!player.roomId) return // silently drop

  const room = rooms.getRoom(player.roomId)
  if (!room) return

  const trimmed = text.trim().slice(0, 1000)
  if (!trimmed) return

  broadcast(room, { type: 'message', player: rooms.toPlayerSummary(player), text: trimmed })
}

// ---------------------------------------------------------------------------
// I/O helpers
// ---------------------------------------------------------------------------

function send(ws: ServerWebSocket<WebSocketData>, msg: ServerMessage): void {
  ws.send(JSON.stringify(msg))
}

/**
 * Send a broadcast message to all players in the room.
 * Pass `excludeId` to skip one player (e.g. the sender).
 */
function broadcast(room: Room, msg: RoomBroadcast, excludeId?: string): void {
  const payload = JSON.stringify(msg)
  for (const pid of room.playerIds) {
    if (pid === excludeId) continue
    sockets.get(pid)?.send(payload)
  }
}

import type { ServerWebSocket } from 'bun'
import type { Room } from './RoomManager'
import { RoomManager } from './RoomManager'
import { MatchManager } from './MatchManager'
import type { Action, ClientMessage, RoomBroadcast, ServerMessage } from '@laser-chess/shared'

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
const matches = new MatchManager()
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
  const playerSummary = player
    ? rooms.toPlayerSummary(player)
    : { id: playerId, name: 'Bob', ready: false }

  // Clean up any active match this player was in
  const match = matches.getMatchByPlayer(playerId)
  if (match) {
    matches.removeMatch(match.roomId)
    broadcastRoomById(
      match.roomId,
      { type: 'gameOver', winner: match.playerOne === playerId ? 2 : 1 },
      playerId,
    )
  }

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
    case 'setReady':
      handleSetReady(ws, playerId, msg.ready)
      break
    case 'selectBoard':
      handleSelectBoard(ws, playerId, msg.boardTxt, msg.boardName)
      break
    case 'gameAction':
      handleGameAction(ws, playerId, msg.action)
      break
    default:
      send(ws, { type: 'error', message: 'Unknown message type.' })
  }
}

// ---------------------------------------------------------------------------
// Lobby handlers
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

  if (evicted) {
    broadcast(evicted, { type: 'playerLeft', player: rooms.toPlayerSummary(player) })
  }

  broadcast(room, { type: 'playerJoined', player: rooms.toPlayerSummary(player) }, playerId)

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
  if (!player.roomId) return

  const room = rooms.getRoom(player.roomId)
  if (!room) return

  const trimmed = text.trim().slice(0, 1000)
  if (!trimmed) return

  broadcast(room, { type: 'message', player: rooms.toPlayerSummary(player), text: trimmed })
}

function handleSetReady(
  ws: ServerWebSocket<WebSocketData>,
  playerId: string,
  ready: boolean,
): void {
  const player = rooms.setReady(playerId, ready)
  if (!player || !player.roomId) {
    send(ws, { type: 'error', message: 'Not in a room.' })
    return
  }

  const room = rooms.getRoom(player.roomId)
  if (!room) return

  broadcast(room, { type: 'playerReadyChanged', player: rooms.toPlayerSummary(player) })

  const readyPlayers = rooms.getReadyPlayers(room.id)
  if (readyPlayers.length >= 2) {
    const matchPlayers = readyPlayers.slice(0, 2).map((p) => rooms.toPlayerSummary(p))
    rooms.resetReadyState(room.id)

    // Store which player is one/two on the room record so selectBoard can use it
    rooms.setMatchPlayers(room.id, readyPlayers[0].id, readyPlayers[1].id)

    const payload = JSON.stringify({
      type: 'matchStart',
      players: matchPlayers,
    } satisfies RoomBroadcast)
    for (const p of matchPlayers) {
      sockets.get(p.id)?.send(payload)
    }
  }
}

// ---------------------------------------------------------------------------
// Game handlers
// ---------------------------------------------------------------------------

function handleSelectBoard(
  ws: ServerWebSocket<WebSocketData>,
  playerId: string,
  boardTxt: string,
  boardName: string,
): void {
  const player = rooms.getPlayer(playerId)
  if (!player?.roomId) {
    send(ws, { type: 'error', message: 'Not in a room.' })
    return
  }

  const matchPlayers = rooms.getMatchPlayers(player.roomId)
  if (!matchPlayers) {
    send(ws, { type: 'error', message: 'No match pending for this room.' })
    return
  }

  // Only player one (room creator / first ready player) may select the board
  if (matchPlayers.playerOneId !== playerId) {
    send(ws, { type: 'error', message: 'Only player one may select the board.' })
    return
  }

  let match
  try {
    match = matches.createMatch(
      player.roomId,
      matchPlayers.playerOneId,
      matchPlayers.playerTwoId,
      boardTxt,
    )
  } catch (err) {
    send(ws, { type: 'error', message: `Invalid board: ${String(err)}` })
    return
  }

  const room = rooms.getRoom(player.roomId)!

  // Tell everyone the board name (for display)
  broadcast(room, { type: 'boardSelected', boardName })

  // Tell each player their side and the initial state
  const p1Ws = sockets.get(match.playerOne)
  const p2Ws = sockets.get(match.playerTwo)
  if (p1Ws) send(p1Ws, { type: 'gameStarted', state: match.state, yourPlayer: 1 })
  if (p2Ws) send(p2Ws, { type: 'gameStarted', state: match.state, yourPlayer: 2 })
}

function handleGameAction(
  ws: ServerWebSocket<WebSocketData>,
  playerId: string,
  action: Action,
): void {
  const player = rooms.getPlayer(playerId)
  if (!player?.roomId) {
    send(ws, { type: 'error', message: 'Not in a room.' })
    return
  }

  const match = matches.getMatch(player.roomId)
  if (!match) {
    send(ws, { type: 'error', message: 'No active match in this room.' })
    return
  }

  // Enforce turn order
  const playerNum = match.playerOne === playerId ? 1 : 2
  if (match.state.currentPlayer !== playerNum) {
    send(ws, { type: 'error', message: 'Not your turn.' })
    return
  }

  // applyAction throws on illegal moves — catch and reject
  let nextState
  try {
    nextState = match.logic.applyAction(match.state, action)
  } catch (err) {
    send(ws, { type: 'error', message: `Illegal action: ${String(err)}` })
    return
  }

  match.state = nextState

  const room = rooms.getRoom(player.roomId)!
  broadcast(room, { type: 'actionApplied', action, state: nextState })

  const victory = match.logic.checkVictory(nextState)
  if (victory) {
    broadcast(room, { type: 'gameOver', winner: victory.winner })
    matches.removeMatch(player.roomId)
    rooms.clearMatchPlayers(player.roomId)
  }
}

// ---------------------------------------------------------------------------
// I/O helpers
// ---------------------------------------------------------------------------

function send(ws: ServerWebSocket<WebSocketData>, msg: ServerMessage): void {
  ws.send(JSON.stringify(msg))
}

function broadcast(room: Room, msg: RoomBroadcast, excludeId?: string): void {
  const payload = JSON.stringify(msg)
  for (const pid of room.playerIds) {
    if (pid === excludeId) continue
    sockets.get(pid)?.send(payload)
  }
}

function broadcastRoomById(roomId: string, msg: RoomBroadcast, excludeId?: string): void {
  const room = rooms.getRoom(roomId)
  if (room) broadcast(room, msg, excludeId)
}

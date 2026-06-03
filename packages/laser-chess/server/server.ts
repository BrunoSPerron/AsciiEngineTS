import { onClose, onMessage, onOpen, type WebSocketData } from './src/handlers'

const port = Number(process.env.PORT || 8080)

const server = Bun.serve<WebSocketData>({
  port,
  hostname: '0.0.0.0',

  fetch(req, server) {
    const success = server.upgrade(req, { data: { playerId: '' } })
    return success
      ? new Response('Used for websockets only')
      : new Response('WebSocket upgrade error', { status: 400 })
  },

  websocket: {
    open: onOpen,
    message: onMessage,
    close: onClose,
  },
})

console.log(`Listening on ${server.hostname}:${server.port}`)

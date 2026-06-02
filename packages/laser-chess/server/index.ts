import { onClose, onMessage, onOpen, type WebSocketData } from './src/handlers'

const server = Bun.serve<WebSocketData>({
  fetch(req, server) {
    const success = server.upgrade(req, { data: { playerId: '' } })
    return success ? undefined : new Response('WebSocket upgrade error', { status: 400 })
  },
  websocket: {
    open: onOpen,
    message: onMessage,
    close: onClose,
  },
})

console.log(`Listening on ${server.hostname}:${server.port}`)

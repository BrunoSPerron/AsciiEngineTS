import type { ClientMessage, RoomBroadcast, ServerMessage } from '@laser-chess/shared'

export type IncomingMessage = ServerMessage | RoomBroadcast

type MessageHandler = (msg: IncomingMessage) => void

export type ConnectionState = 'connecting' | 'open' | 'closed' | 'error'

/**
 * Typed WebSocket wrapper for the laser-chess server.
 *
 * Usage:
 *   const conn = new ServerConnection('ws://localhost:3000')
 *   conn.onMessage((msg) => { ... })
 *   conn.send({ type: 'getRooms' })
 *   conn.close()
 */
export class ServerConnection {
  private _ws: WebSocket
  private _handlers = new Set<MessageHandler>()
  private _stateHandlers = new Set<(state: ConnectionState) => void>()

  state: ConnectionState = 'connecting'

  constructor(url: string) {
    this._ws = new WebSocket(url)

    this._ws.onopen = () => {
      this.state = 'open'
      for (const fn of this._stateHandlers) fn(this.state)
    }

    this._ws.onclose = () => {
      this.state = 'closed'
      for (const fn of this._stateHandlers) fn(this.state)
    }

    this._ws.onerror = () => {
      this.state = 'error'
      for (const fn of this._stateHandlers) fn(this.state)
    }

    this._ws.onmessage = (event: MessageEvent) => {
      let msg: IncomingMessage
      try {
        msg = JSON.parse(event.data as string) as IncomingMessage
      } catch {
        console.error('[ServerConnection] Failed to parse message:', event.data)
        return
      }
      for (const fn of this._handlers) fn(msg)
    }
  }

  send(msg: ClientMessage): void {
    if (this._ws.readyState !== WebSocket.OPEN) return
    this._ws.send(JSON.stringify(msg))
  }

  /** Subscribe to all incoming messages. Returns an unsubscribe function. */
  onMessage(fn: MessageHandler): () => void {
    this._handlers.add(fn)
    return () => this._handlers.delete(fn)
  }

  /** Subscribe to connection state changes. Returns an unsubscribe function. */
  onStateChange(fn: (state: ConnectionState) => void): () => void {
    this._stateHandlers.add(fn)
    return () => this._stateHandlers.delete(fn)
  }

  close(): void {
    this._ws.close()
    this._handlers.clear()
    this._stateHandlers.clear()
  }
}

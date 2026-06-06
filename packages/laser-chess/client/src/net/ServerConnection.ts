import type { ClientMessage, RoomBroadcast, ServerMessage } from '@laser-chess/shared'
import { EngineObject } from 'ascii-game-engine'

export type IncomingMessage = ServerMessage | RoomBroadcast

export type ConnectionState = 'connecting' | 'open' | 'closed' | 'error'

export type ConnectionEvents = {
  message: [msg: IncomingMessage]
  statechange: [stateIn: ConnectionState]
}

/**
 * Typed WebSocket wrapper for the laser-chess server.
 *
 * Usage:
 *   const conn = new ServerConnection('ws://localhost:3000')
 *   conn.onMessage((msg) => { ... })
 *   conn.send({ type: 'getRooms' })
 *   conn.close()
 */
export class ServerConnection extends EngineObject<ConnectionEvents> {
  private _ws: WebSocket

  state: ConnectionState = 'connecting'

  constructor(url: string) {
    super()
    this._ws = new WebSocket(url)

    this._ws.onopen = () => {
      this.state = 'open'
      this.emit('statechange', this.state)
    }

    this._ws.onclose = () => {
      this.state = 'closed'
      this.emit('statechange', this.state)
    }

    this._ws.onerror = () => {
      this.state = 'error'
      this.emit('statechange', this.state)
    }

    this._ws.onmessage = (event: MessageEvent) => {
      let msg: IncomingMessage
      try {
        msg = JSON.parse(event.data as string) as IncomingMessage
      } catch {
        console.error('[ServerConnection] Failed to parse message:', event.data)
        return
      }
      this.emit('message', msg)
    }
  }

  send(msg: ClientMessage): void {
    if (this._ws.readyState !== WebSocket.OPEN) return
    this._ws.send(JSON.stringify(msg))
  }

  close(): void {
    this._ws.close()
  }
}

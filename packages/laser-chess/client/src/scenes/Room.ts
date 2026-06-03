import { UISelectElement, UITextBox, UITextInputElement } from 'ascii-game-engine'
import type { PlayerSummary, RoomSummary } from '@laser-chess/shared'
import type { SceneManager } from '../SceneManager'
import { Scene } from '../SceneManager'
import { BaseGameScene } from './BaseGameScene'
import type { ServerConnection } from '../net/ServerConnection'

const MAX_CHAT_LINES = 20

export class Room extends BaseGameScene {
  private _conn: ServerConnection
  private _room: RoomSummary
  private _players: PlayerSummary[]
  private _localPlayerId: string

  private _isReady = false

  // Chat history as display strings
  private _chatLines: string[] = []

  // UI elements
  private _roomTitleEl: UITextBox | null = null
  private _playerListEl: UISelectElement | null = null
  private _chatEl: UITextBox | null = null
  private _actionsEl: UISelectElement | null = null

  private _unlisten: () => void = () => {}

  constructor(
    sceneManager: SceneManager,
    conn: ServerConnection,
    room: RoomSummary,
    players: PlayerSummary[],
    localPlayerId: string,
  ) {
    super(sceneManager)
    this._conn = conn
    this._room = room
    this._players = [...players]
    this._localPlayerId = localPlayerId

    this._unlisten = this._conn.onMessage((msg) => {
      switch (msg.type) {
        case 'playerJoined':
          this._players.push(msg.player)
          this._rebuildPlayerList()
          this._appendChat(`  ${msg.player.name} joined`)
          break
        case 'playerLeft':
          this._players = this._players.filter((p) => p.id !== msg.player.id)
          this._rebuildPlayerList()
          this._appendChat(`  ${msg.player.name} left`)
          break
        case 'playerReadyChanged': {
          const idx = this._players.findIndex((p) => p.id === msg.player.id)
          if (idx !== -1) this._players[idx] = msg.player
          this._rebuildPlayerList()
          const label = msg.player.ready ? 'ready' : 'not ready'
          this._appendChat(`  ${msg.player.name} is ${label}`)
          break
        }
        case 'matchStart':
          this._onMatchStart(msg.players)
          break
        case 'message':
          this._appendChat(` ${msg.player.name}: ${msg.text}`)
          break
        case 'left':
          this.sceneManager.NavigateTo(Scene.Lobby, { conn: this._conn })
          break
        case 'error':
          this._appendChat(`  [error] ${msg.message}`)
          break
      }
    })

    this._build()
  }

  unload(): void {
    this._unlisten()
    const ui = this.sceneManager.engine.renderer.ui
    if (this._roomTitleEl) ui.removeElement(this._roomTitleEl.id, false)
    if (this._playerListEl) ui.removeElement(this._playerListEl.id, false)
    if (this._chatEl) ui.removeElement(this._chatEl.id, false)
    if (this._actionsEl) ui.removeElement(this._actionsEl.id, false)
  }

  // ---------------------------------------------------------------------------
  // Build
  // ---------------------------------------------------------------------------

  private _build(): void {
    const ui = this.sceneManager.engine.renderer.ui

    // Room title
    this._roomTitleEl = new UITextBox([` ${this._room.name}`], 'centered')
    ui.addElement(this._roomTitleEl, {
      w: 30,
      h: 1,
      anchorX: 50,
      anchorY: 0,
      pivotX: 50,
      pivotY: 0,
      y: 1,
    })

    // Player list — left side
    this._playerListEl = new UISelectElement(this._playerLabels(), { closeOnSelect: false })
    ui.addElement(this._playerListEl, {
      w: 24,
      h: 10,
      anchorX: 0,
      anchorY: 50,
      pivotX: 0,
      pivotY: 50,
      x: 1,
      minH: 1,
      minW: 8,
    })

    // Chat — center
    this._chatEl = new UITextBox(this._visibleChatLines())
    ui.addElement(this._chatEl, {
      w: 36,
      h: 14,
      anchorX: 50,
      anchorY: 50,
      pivotX: 50,
      pivotY: 50,
      minH: 3,
      minW: 16,
    })

    // Actions — right side (includes ready toggle)
    this._buildActionsEl()
  }

  private _buildActionsEl(): void {
    const ui = this.sceneManager.engine.renderer.ui

    if (this._actionsEl) {
      ui.removeElement(this._actionsEl.id, false)
      this._actionsEl = null
    }

    const readyLabel = this._isReady ? ' ✓ Unready' : ' ○ Ready'
    const actions = [readyLabel, 'Send Message', 'Leave Room']

    this._actionsEl = new UISelectElement(actions, { closeOnSelect: false })
    ui.addElement(this._actionsEl, {
      w: 16,
      h: actions.length,
      anchorX: 100,
      anchorY: 50,
      pivotX: 100,
      pivotY: 50,
      x: -1,
      minH: 1,
      minW: 8,
    })

    this._actionsEl.onSelect((i) => {
      switch (actions[i]) {
        case readyLabel:
          this._toggleReady()
          break
        case 'Send Message':
          this._openChat()
          break
        case 'Leave Room':
          this._conn.send({ type: 'leaveRoom' })
          break
      }
    })
  }

  // ---------------------------------------------------------------------------
  // Ready toggle
  // ---------------------------------------------------------------------------

  private _toggleReady(): void {
    this._isReady = !this._isReady
    this._conn.send({ type: 'setReady', ready: this._isReady })

    // Optimistically update local player entry so the list reflects immediately
    const localIdx = this._players.findIndex((p) => p.id === this._localPlayerId)
    if (localIdx !== -1) {
      this._players[localIdx] = { ...this._players[localIdx], ready: this._isReady }
      this._rebuildPlayerList()
    }

    // Rebuild actions to flip the button label
    this._buildActionsEl()
  }

  // ---------------------------------------------------------------------------
  // Match start
  // ---------------------------------------------------------------------------

  private _onMatchStart(players: PlayerSummary[]): void {
    this.sceneManager.NavigateTo(Scene.OnlineMatch, {
      conn: this._conn,
      players,
      localPlayerId: this._localPlayerId,
    })
  }

  // ---------------------------------------------------------------------------
  // Chat
  // ---------------------------------------------------------------------------

  private _openChat(): void {
    const ui = this.sceneManager.engine.renderer.ui
    const input = new UITextInputElement('Message', [])
    ui.addElement(input, {
      w: 40,
      h: 2,
      anchorX: 50,
      anchorY: 100,
      pivotX: 50,
      pivotY: 100,
      y: -1,
      minW: 16,
    })
    void input.result.then((text) => {
      if (text === null || text.trim() === '') return
      this._conn.send({ type: 'message', text: text.trim() })
    })
  }

  // ---------------------------------------------------------------------------
  // Reactive updates
  // ---------------------------------------------------------------------------

  private _appendChat(line: string): void {
    this._chatLines.push(line)
    if (this._chatLines.length > MAX_CHAT_LINES) {
      this._chatLines.shift()
    }
    if (this._chatEl) {
      this._chatEl.content = this._visibleChatLines()
    }
  }

  private _rebuildPlayerList(): void {
    if (!this._playerListEl) return
    const ui = this.sceneManager.engine.renderer.ui
    ui.removeElement(this._playerListEl.id, false)

    this._playerListEl = new UISelectElement(this._playerLabels(), { closeOnSelect: false })
    ui.addElement(this._playerListEl, {
      w: 24,
      h: 10,
      anchorX: 0,
      anchorY: 50,
      pivotX: 0,
      pivotY: 50,
      x: 1,
      minH: 1,
      minW: 8,
    })
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private _playerLabels(): string[] {
    if (this._players.length === 0) return [' (empty)']
    return this._players.map((p) => {
      const readyMark = p.ready ? ' ✓' : '  '
      const youMark = p.id === this._localPlayerId ? ' (you)' : ''
      return `${readyMark} ${p.name}${youMark}`
    })
  }

  private _visibleChatLines(): string[] {
    if (this._chatLines.length === 0) return [' No messages yet']
    return this._chatLines
  }
}

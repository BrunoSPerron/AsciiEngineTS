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
  ) {
    super(sceneManager)
    this._conn = conn
    this._room = room
    this._players = [...players]

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
        case 'message':
          this._appendChat(` ${msg.player.name}: ${msg.text}`)
          break
        case 'left':
          // Server confirmed our leave — navigate back
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
      w: 20,
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

    // Actions — right side
    const actions = ['Send Message', 'Leave Room']
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
  // Actions
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
      w: 20,
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
    return this._players.map((p) => ` ${p.name}`)
  }

  private _visibleChatLines(): string[] {
    if (this._chatLines.length === 0) return [' No messages yet']
    return this._chatLines
  }
}

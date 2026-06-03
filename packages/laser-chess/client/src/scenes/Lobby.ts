import { UISelectElement, UITextBox, UITextInputElement } from 'ascii-game-engine'
import type { RoomSummary } from '@laser-chess/shared'
import type { SceneManager } from '../SceneManager'
import { Scene } from '../SceneManager'
import { BaseGameScene } from './BaseGameScene'
import type { ServerConnection } from '../net/ServerConnection'

export class Lobby extends BaseGameScene {
  private _conn: ServerConnection

  // Local state
  private _playerId = ''
  private _playerName = 'Bob'
  private _rooms: RoomSummary[] = []

  // UI elements for cleanup
  private _statusEl: UITextBox | null = null
  private _roomListEl: UISelectElement | null = null
  private _actionsEl: UISelectElement | null = null

  private _unlisten: () => void = () => {}

  constructor(sceneManager: SceneManager, conn: ServerConnection) {
    super(sceneManager)
    this._conn = conn

    this._unlisten = this._conn.onMessage((msg) => {
      switch (msg.type) {
        case 'welcome':
          this._playerId = msg.playerId
          this._playerName = msg.playerName
          this._updateStatus()
          this._conn.send({ type: 'getRooms' })
          break
        case 'nameChanged':
          this._playerName = msg.playerName
          this._updateStatus()
          break
        case 'rooms':
          this._rooms = msg.rooms
          this._rebuildRoomList()
          break
        case 'joined':
          this.sceneManager.NavigateTo(Scene.Room, {
            conn: this._conn,
            room: msg.room,
            players: msg.players,
          })
          break
        case 'error':
          this._showError(msg.message)
          break
      }
    })

    this._build()

    // If already connected (e.g. navigated back from Room), request rooms immediately
    if (conn.state === 'open') {
      this._conn.send({ type: 'getRooms' })
    }
  }

  unload(): void {
    this._unlisten()
    const ui = this.sceneManager.engine.renderer.ui
    if (this._statusEl) ui.removeElement(this._statusEl.id, false)
    if (this._roomListEl) ui.removeElement(this._roomListEl.id, false)
    if (this._actionsEl) ui.removeElement(this._actionsEl.id, false)
  }

  // ---------------------------------------------------------------------------
  // Build
  // ---------------------------------------------------------------------------

  private _build(): void {
    const ui = this.sceneManager.engine.renderer.ui

    const title = new UITextBox([' Lobby'], 'centered')
    ui.addElement(title, {
      w: 20,
      h: 1,
      anchorX: 50,
      anchorY: 0,
      pivotX: 50,
      pivotY: 0,
      y: 1,
    })

    // Status bar — player name + id
    this._statusEl = new UITextBox([this._statusLine()])
    ui.addElement(this._statusEl, {
      w: 30,
      h: 1,
      anchorX: 0,
      anchorY: 0,
      x: 1,
      y: 1,
    })

    // Room list — left side
    this._roomListEl = new UISelectElement(this._roomLabels(), { closeOnSelect: false })
    ui.addElement(this._roomListEl, {
      w: 30,
      h: 12,
      anchorX: 0,
      anchorY: 50,
      pivotX: 0,
      pivotY: 50,
      x: 1,
      minH: 1,
      minW: 10,
    })

    // Actions — right side
    const actions = ['Join', 'Create Room', 'Set Name', 'Refresh']
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
        case 'Join':
          this._joinSelected()
          break
        case 'Create Room':
          this._openCreateRoom()
          break
        case 'Set Name':
          this._openSetName()
          break
        case 'Refresh':
          this._conn.send({ type: 'getRooms' })
          break
      }
    })
  }

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

  private _joinSelected(): void {
    if (!this._roomListEl) return
    const room = this._rooms[this._roomListEl.currentIndex]
    if (!room) return
    this._conn.send({ type: 'joinRoom', roomId: room.id })
  }

  private _openCreateRoom(): void {
    const ui = this.sceneManager.engine.renderer.ui
    const input = new UITextInputElement('Room name', ['Enter a name for your room:'])
    ui.addElement(input, {
      w: 32,
      h: 3,
      anchorX: 50,
      anchorY: 50,
      pivotX: 50,
      pivotY: 50,
    })
    void input.result.then((name) => {
      if (name === null || name.trim() === '') return
      this._conn.send({ type: 'createRoom', name: name.trim() })
    })
  }

  private _openSetName(): void {
    const ui = this.sceneManager.engine.renderer.ui
    const input = new UITextInputElement('Name', [`Current: ${this._playerName}`])
    ui.addElement(input, {
      w: 30,
      h: 3,
      anchorX: 50,
      anchorY: 50,
      pivotX: 50,
      pivotY: 50,
    })
    void input.result.then((name) => {
      if (name === null || name.trim() === '') return
      this._conn.send({ type: 'setName', name: name.trim() })
    })
  }

  private _showError(message: string): void {
    const ui = this.sceneManager.engine.renderer.ui
    const box = new UITextBox([`Error: ${message}`], 'centered')
    ui.addElement(box, {
      w: 32,
      h: 3,
      anchorX: 50,
      anchorY: 50,
      pivotX: 50,
      pivotY: 50,
    })
    setTimeout(() => {
      if (this.sceneManager.currentScreen === this) ui.removeElement(box.id)
    }, 3000)
  }

  // ---------------------------------------------------------------------------
  // Reactive updates
  // ---------------------------------------------------------------------------

  private _rebuildRoomList(): void {
    if (!this._roomListEl) return
    const ui = this.sceneManager.engine.renderer.ui
    const prevIndex = this._roomListEl.currentIndex
    ui.removeElement(this._roomListEl.id, false)

    this._roomListEl = new UISelectElement(this._roomLabels(), { closeOnSelect: false })
    ui.addElement(this._roomListEl, {
      w: 30,
      h: 12,
      anchorX: 0,
      anchorY: 50,
      pivotX: 0,
      pivotY: 50,
      x: 1,
      minH: 1,
      minW: 10,
    })
    this._roomListEl.currentIndex = Math.min(prevIndex, Math.max(0, this._rooms.length - 1))
  }

  private _updateStatus(): void {
    if (!this._statusEl) return
    this._statusEl.content = this._statusLine()
  }

  private _statusLine(): string {
    const id = this._playerId || '...'
    return ` ${this._playerName} (${id})`
  }

  private _roomLabels(): string[] {
    if (this._rooms.length === 0) return [' No rooms yet']
    return this._rooms.map((r) => ` ${r.name}  [${r.playerCount}]`)
  }
}

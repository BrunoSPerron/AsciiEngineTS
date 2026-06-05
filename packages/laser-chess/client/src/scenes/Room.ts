import { UISelectElement, UITextBox, UITextInputNode } from 'ascii-game-engine'
import type { GameState, PlayerSummary, RoomSummary } from '@laser-chess/shared'
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

  private _chatLines: string[] = []

  private _roomTitleEl: UITextBox | null = null
  private _playerListEl: UISelectElement | null = null
  private _chatEl: UITextBox | null = null
  private _actionsEl: UISelectElement | null = null

  private _unlisten: () => void = () => {}

  private _boardMap: Map<string, string> = new Map()

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

    this._loadBoards()

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
        case 'boardSelected':
          this._appendChat(`  Board: ${msg.boardName}`)
          break
        case 'gameStarted':
          this._onGameStarted(msg.state, msg.yourPlayer)
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
  // Board loading (same glob as BoardConfig)
  // ---------------------------------------------------------------------------

  private _loadBoards(): void {
    const files = import.meta.glob('../assets/boards/**/*.txt', {
      query: '?raw',
      import: 'default',
      eager: true,
    })
    for (const [path, content] of Object.entries(files)) {
      const filename = path.split('/').pop()?.replace('.txt', '')
      if (filename && typeof content === 'string') {
        this._boardMap.set(filename, content)
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Build
  // ---------------------------------------------------------------------------

  private _build(): void {
    const ui = this.sceneManager.engine.renderer.ui

    this._roomTitleEl = new UITextBox([`Room: ${this._room.name}`], 'centered')
    ui.addElement(this._roomTitleEl, {
      w: 30,
      h: 1,
      anchorX: 50,
      anchorY: 0,
      pivotX: 50,
      pivotY: 0,
    })

    this._playerListEl = new UISelectElement(this._playerLabels(), { closeOnSelect: false })
    ui.addElement(this._playerListEl, {
      w: 24,
      h: 10,
      anchorX: 0,
      anchorY: 50,
      pivotX: 0,
      pivotY: 50,
      minH: 1,
      minW: 8,
    })

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
  // Ready
  // ---------------------------------------------------------------------------

  private _toggleReady(): void {
    this._isReady = !this._isReady
    this._conn.send({ type: 'setReady', ready: this._isReady })

    const localIdx = this._players.findIndex((p) => p.id === this._localPlayerId)
    if (localIdx !== -1) {
      this._players[localIdx] = { ...this._players[localIdx], ready: this._isReady }
      this._rebuildPlayerList()
    }

    this._buildActionsEl()
  }

  // ---------------------------------------------------------------------------
  // Match flow
  // ---------------------------------------------------------------------------

  private _onMatchStart(players: PlayerSummary[]): void {
    // Determine if this client is player one (first in the matched pair)
    const isPlayerOne = players[0].id === this._localPlayerId

    if (isPlayerOne) {
      this._openBoardSelect()
    } else {
      this._appendChat('  Waiting for host to select a board...')
    }
  }

  private _openBoardSelect(): void {
    const ui = this.sceneManager.engine.renderer.ui
    const names = [...this._boardMap.keys()]

    const select = new UISelectElement(names, { closeOnSelect: true })
    ui.addElement(select, {
      w: 24,
      h: Math.min(names.length, 12),
      anchorX: 50,
      anchorY: 50,
      pivotX: 50,
      pivotY: 50,
    })

    const title = new UITextBox([' Select a board'], 'centered')
    ui.addElement(title, {
      w: 20,
      h: 1,
      anchorX: 50,
      anchorY: 50,
      pivotX: 50,
      pivotY: 50,
      y: -8,
    })

    select.onSelect((idx) => {
      ui.removeElement(title.id, false)
      if (idx === -1) return

      const boardName = names[idx]
      const boardTxt = this._boardMap.get(boardName)
      if (!boardTxt) return

      this._conn.send({ type: 'selectBoard', boardTxt, boardName })
    })
  }

  private _onGameStarted(state: GameState, yourPlayer: 1 | 2): void {
    this.sceneManager.NavigateTo(Scene.OnlineMatch, {
      conn: this._conn,
      initialState: state,
      myPlayer: yourPlayer,
    })
  }

  // ---------------------------------------------------------------------------
  // Chat
  // ---------------------------------------------------------------------------

  private _openChat(): void {
    const ui = this.sceneManager.engine.renderer.ui
    const input = new UITextInputNode('Message')
    ui.addElement(input, {
      w: 40,
      h: 2,
      anchorX: 50,
      anchorY: 100,
      pivotX: 50,
      pivotY: 100,
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
    if (this._chatLines.length > MAX_CHAT_LINES) this._chatLines.shift()
    if (this._chatEl) this._chatEl.content = this._visibleChatLines()
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

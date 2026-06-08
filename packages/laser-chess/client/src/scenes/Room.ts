import { UISelectNode, UITextBox } from 'ascii-game-engine'
import type { GameState, PlayerSummary, RoomSummary } from '@laser-chess/shared'
import type { SceneManager } from '../SceneManager'
import { Scene } from '../SceneManager'
import { BaseGameScene } from './BaseGameScene'
import type { ServerConnection } from '../net/ServerConnection'
import { UIChatNode } from '../ui/UIChatBoxNode'

export class Room extends BaseGameScene {
  private _conn: ServerConnection
  private _room: RoomSummary
  private _players: PlayerSummary[]
  private _localPlayerId: string

  private _isReady = false

  private _roomTitleEl: UITextBox | null = null
  private _playerListEl: UISelectNode | null = null
  private _chatEl: UIChatNode | null = null
  private _actionsEl: UISelectNode | null = null

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

    this._unlisten = this._conn.on('message', (msg) => {
      switch (msg.type) {
        case 'playerJoined':
          this._players.push(msg.player)
          this._rebuildPlayerList()
          break
        case 'playerLeft':
          this._players = this._players.filter((p) => p.id !== msg.player.id)
          this._rebuildPlayerList()
          break
        case 'playerReadyChanged': {
          const idx = this._players.findIndex((p) => p.id === msg.player.id)
          if (idx !== -1) this._players[idx] = msg.player
          this._rebuildPlayerList()
          break
        }
        case 'matchStart':
          this._onMatchStart(msg.players)
          break
        case 'gameStarted':
          this._onGameStarted(msg.state, msg.yourPlayer)
          break
        case 'left':
          this.sceneManager.NavigateTo(Scene.Lobby, { conn: this._conn })
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

    this._chatEl = new UIChatNode(this._conn)
    ui.addElement(this._chatEl, {
      w: 30,
      dock: 'right',
    })

    this._roomTitleEl = new UITextBox([`Room: ${this._room.name}`], 'centered')
    ui.addElement(this._roomTitleEl, {
      w: 30,
      h: 1,
      anchorX: 50,
      anchorY: 0,
      pivotX: 50,
      pivotY: 0,
    })

    this._playerListEl = new UISelectNode(this._playerLabels(), { closeOnSelect: false })
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

    this._buildActionsEl()
  }

  private _buildActionsEl(): void {
    const ui = this.sceneManager.engine.renderer.ui

    if (this._actionsEl) {
      ui.removeElement(this._actionsEl.id, false)
      this._actionsEl = null
    }

    const readyLabel = this._isReady ? ' ✓ Unready' : ' ○ Ready'
    const actions = [readyLabel, 'Leave Room']

    this._actionsEl = new UISelectNode(actions, { closeOnSelect: false })
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

    this._actionsEl.on('select', (i) => {
      switch (actions[Number(i)]) {
        case readyLabel:
          this._toggleReady()
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
    const isPlayerOne = players[0].id === this._localPlayerId

    if (isPlayerOne) {
      this._openBoardSelect()
    } else {
      this._chatEl?.appendChat('Waiting for host to select a board...')
    }
  }

  private _openBoardSelect(): void {
    const ui = this.sceneManager.engine.renderer.ui
    const names = [...this._boardMap.keys()]

    const select = new UISelectNode(names, { closeOnSelect: true })
    ui.addElement(select, {
      w: 24,
      h: Math.min(names.length, 12),
      anchorX: 50,
      anchorY: 50,
      pivotX: 50,
      pivotY: 50,
    })

    const title = new UITextBox(['Select a board'], 'centered')
    ui.addElement(title, {
      w: 20,
      h: 1,
      anchorX: 50,
      anchorY: 50,
      pivotX: 50,
      pivotY: 50,
      y: -8,
    })

    select.on('select', (idx) => {
      ui.removeElement(title.id, false)
      if (idx === -1) return

      const boardName = names[Number(idx)]
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
  // Reactive updates
  // ---------------------------------------------------------------------------

  private _rebuildPlayerList(): void {
    if (!this._playerListEl) return
    const ui = this.sceneManager.engine.renderer.ui
    ui.removeElement(this._playerListEl.id, false)

    this._playerListEl = new UISelectNode(this._playerLabels(), { closeOnSelect: false })
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
}

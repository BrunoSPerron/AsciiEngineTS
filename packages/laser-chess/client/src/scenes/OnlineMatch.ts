import { Entity, GridVector, UITextBox, UISelectNode } from 'ascii-game-engine'
import type { GameLogic, GameState, LaserResult, PlayerSummary, Action } from '@laser-chess/shared'
import { createGame, CELL, GAME_RULE_DEATHMATCH } from '@laser-chess/shared'
import { BaseGameScene } from './BaseGameScene'
import type { Board } from '../Board'
import { Scene, type SceneManager } from '../SceneManager'
import { animateLaser, dxDyToDir } from '../animations/laser'
import { MirrorCursor } from '../entities/MirrorCursor'
import type { Pawn } from '../entities/Pawn'
import type { ServerConnection } from '../net/ServerConnection'
import { arrowGlyph } from '../arrowSets'

// ---------------------------------------------------------------------------
// OnlineMatch
// ---------------------------------------------------------------------------

export class OnlineMatch extends BaseGameScene {
  private _conn: ServerConnection
  private _board: Board
  private _state: GameState
  private _logic: GameLogic
  private _myPlayer: 1 | 2

  private _socketMsgUnlisten = () => {}
  private _phaseCleanup: Array<() => void> = []
  private _animating = false

  constructor(
    sceneManager: SceneManager,
    conn: ServerConnection,
    board: Board,
    initialState: GameState,
    myPlayer: 1 | 2,
    _players: PlayerSummary[],
  ) {
    super(sceneManager)
    this._conn = conn
    this._board = board
    this._state = initialState
    this._myPlayer = myPlayer
    this._logic = createGame(GAME_RULE_DEATHMATCH)

    this._syncStateToChunk()
    const cam = this._engine.renderer.camera
    cam.target.pos.setXY((initialState.sizeX - 1) / 2, (initialState.sizeY - 1) / 2)
    cam.target.previousPos.setXY((initialState.sizeX - 1) / 2, (initialState.sizeY - 1) / 2)
    cam.jumpToTarget()

    this._listenToServer()
    this._startPhase()
  }

  unload(): void {
    this._clearPhase()
    this._socketMsgUnlisten()
  }

  // ---------------------------------------------------------------------------
  // Server events
  // ---------------------------------------------------------------------------

  private _listenToServer(): void {
    this._socketMsgUnlisten = this._conn.on('message', (msg) => {
      switch (msg.type) {
        case 'actionApplied':
          // Only apply if it was the opponent's action
          if (msg.playerNum !== this._myPlayer) {
            void this._applyRemoteAction(msg.action, msg.state)
          }
          break
        case 'gameOver':
          this._clearPhase()
          this._showVictory(msg.winner)
          break
        case 'playerLeft':
          this._clearPhase()
          this._showDisconnected()
          break
      }
    })
  }

  // ---------------------------------------------------------------------------
  // Phase dispatcher
  // ---------------------------------------------------------------------------

  private _startPhase(): void {
    this._clearPhase()

    const isMyTurn = this._state.currentPlayer === this._myPlayer
    this._showTurnIndicator(isMyTurn)

    if (!isMyTurn) return // wait for server actionApplied

    switch (this._state.phase) {
      case 'move':
        this._movePhase()
        break
      case 'mirror':
        this._mirrorPhase()
        break
      case 'shoot':
        this._shootPhase()
        break
    }
  }

  private _clearPhase(): void {
    for (const fn of this._phaseCleanup) fn()
    this._phaseCleanup = []
  }

  // ---------------------------------------------------------------------------
  // Turn indicator
  // ---------------------------------------------------------------------------

  private _showTurnIndicator(isMyTurn: boolean): void {
    const label = isMyTurn ? ' Your turn' : " Opponent's turn"
    const box = new UITextBox([label], 'centered')
    this._engine.renderer.ui.addElement(box, {
      w: 18,
      h: 1,
      anchorX: 50,
      anchorY: 100,
      pivotX: 50,
      pivotY: 0,
      y: 1,
    })
    this._phaseCleanup.push(() => this._engine.renderer.ui.removeElement(box.id, false))
  }

  // ---------------------------------------------------------------------------
  // Move phase
  // ---------------------------------------------------------------------------

  private _movePhase(): void {
    const king = this._getMyKing()
    const legalMoves = this._logic.getLegalMoves(this._state, king.pos.x, king.pos.y)
    const moveEntities: Entity[] = []

    for (const move of legalMoves) {
      const dirX = move.toX - move.fromX
      const dirY = move.toY - move.fromY
      const glyph = arrowGlyph(dirX, dirY)
      const entity = new Entity(glyph, new GridVector(move.toX, move.toY), 500_000)
      entity.addCss('arrow')
      entity.addCss(this._state.currentPlayer === 1 ? 'player-one' : 'player-two')
      this._engine.world.spawnEntity(entity)
      moveEntities.push(entity)
    }

    const cleanupEntities = () => {
      for (const e of moveEntities) this._engine.world.extractEntity(e.uid)
    }

    this._phaseCleanup.push(
      cleanupEntities,

      this._engine.pointerManager.onWorldHover((x, y) => {
        const hit = moveEntities.find((e) => e.pos.x === x && e.pos.y === y)
        if (hit) hit.addCss('reversed')
      }),

      this._engine.pointerManager.onWorldHoverEnd((x, y) => {
        const hit = moveEntities.find((e) => e.pos.x === x && e.pos.y === y)
        if (hit) hit.removeCss('reversed')
      }),

      this._engine.pointerManager.onWorldPointerDown((x, y) => {
        if (this._animating) return
        const hit = moveEntities.find((e) => e.pos.x === x && e.pos.y === y)
        if (!hit) return

        const action: Action = {
          type: 'move',
          fromX: king.pos.x,
          fromY: king.pos.y,
          toX: x,
          toY: y,
        }

        this._submitAction(action)
        king.pos.setXY(x, y)
        this._engine.renderer.renderActor(king)
      }),
    )
  }

  // ---------------------------------------------------------------------------
  // Mirror phase
  // ---------------------------------------------------------------------------

  private _mirrorPhase(): void {
    const cursor = new MirrorCursor()
    this._engine.world.spawnEntity(cursor)

    const hovered = this._engine.pointerManager.getHoveredWorldCell()
    if (hovered) cursor.setTarget(hovered.x, hovered.y)

    this._phaseCleanup.push(
      () => this._engine.world.extractEntity(cursor.uid),

      this._engine.pointerManager.onWorldHover((x, y) => cursor.setTarget(x, y)),

      this._engine.actionManager.onActionKeyDown((action) => {
        if (action === 'flip_mirror') {
          cursor.glyph = cursor.glyph === '/' ? '\\' : '/'
          if (cursor.el?.firstChild) cursor.el.firstChild.textContent = cursor.glyph
        }
      }),

      this._engine.pointerManager.onWorldPointerDown((x, y, button) => {
        if (this._animating) return

        if (button === 2) {
          cursor.glyph = cursor.glyph === '/' ? '\\' : '/'
          if (cursor.el?.firstChild) cursor.el.firstChild.textContent = cursor.glyph
          return
        }

        if (button !== 0) return
        if (!this._logic.canPlaceMirror(this._state, x, y)) return

        const glyph = cursor.glyph as '/' | '\\'
        const action: Action = { type: 'mirror', x, y, glyph }
        this._submitAction(action)
      }),
    )
  }

  // ---------------------------------------------------------------------------
  // Shoot phase
  // ---------------------------------------------------------------------------

  private _shootPhase(): void {
    const king = this._getMyKing()
    const legalShots = this._logic.getLegalShots(this._state, king.pos.x, king.pos.y)
    const shotEntities: Entity[] = []

    for (const shot of legalShots) {
      const glyph = arrowGlyph(shot.dx, shot.dy)
      const entity = new Entity(
        glyph,
        new GridVector(king.pos.x + shot.dx, king.pos.y + shot.dy),
        500_000,
      )
      entity.addCss('arrow')
      entity.addCss(this._state.currentPlayer === 1 ? 'player-one' : 'player-two')
      this._engine.world.spawnEntity(entity)
      shotEntities.push(entity)
    }

    const cleanupEntities = () => {
      for (const e of shotEntities) this._engine.world.extractEntity(e.uid)
    }

    this._phaseCleanup.push(
      cleanupEntities,

      this._engine.pointerManager.onWorldHover((x, y) => {
        const hit = shotEntities.find((e) => e.pos.x === x && e.pos.y === y)
        if (hit) hit.addCss('reversed')
      }),

      this._engine.pointerManager.onWorldHoverEnd((x, y) => {
        const hit = shotEntities.find((e) => e.pos.x === x && e.pos.y === y)
        if (hit) hit.removeCss('reversed')
      }),

      this._engine.pointerManager.onWorldPointerDown((x, y) => {
        if (this._animating) return
        const hit = shotEntities.find((e) => e.pos.x === x && e.pos.y === y)
        if (!hit) return

        const dx = x - king.pos.x
        const dy = y - king.pos.y
        const result = this._logic.computeLaser(
          this._state,
          king.pos.x,
          king.pos.y,
          dxDyToDir(dx, dy),
        )
        const action: Action = { type: 'shoot', x: king.pos.x, y: king.pos.y, dx, dy, result }

        void this._processShoot(action, result)
      }),
    )
  }

  private async _processShoot(action: Action, result: LaserResult): Promise<void> {
    this._animating = true
    this._clearPhase()

    const extraCss = this._state.currentPlayer === 1 ? 'p-one-laser' : 'p-two-laser'
    await animateLaser(this._engine, this._state, result, extraCss)

    this._submitAction(action)
    this._animating = false
  }

  // ---------------------------------------------------------------------------
  // Submit action to server and update local state optimistically
  // ---------------------------------------------------------------------------

  private _submitAction(action: Action): void {
    // Optimistic local apply so the board updates immediately
    try {
      this._state = this._logic.applyAction(this._state, action)
    } catch {
      return
    }
    this._syncStateToChunk()
    this._conn.send({ type: 'gameAction', action })
    queueMicrotask(() => this._startPhase())
  }

  // ---------------------------------------------------------------------------
  // Apply an action that came from the server (opponent's turn)
  // ---------------------------------------------------------------------------

  private async _applyRemoteAction(action: Action, serverState: GameState): Promise<void> {
    this._animating = true

    if (action.type === 'shoot' && action.result) {
      const extraCss = this._state.currentPlayer === 1 ? 'p-one-laser' : 'p-two-laser'
      await animateLaser(this._engine, this._state, action.result, extraCss)
    }

    // Use the authoritative server state rather than applying locally
    this._state = serverState
    this._syncStateToChunk()
    this._syncPawnPositions()
    this._animating = false
    this._startPhase()
  }

  // ---------------------------------------------------------------------------
  // Sync helpers
  // ---------------------------------------------------------------------------

  private _syncStateToChunk(): void {
    const { sizeX, sizeY } = this._state
    for (let y = 0; y < sizeY; y++) {
      for (let x = 0; x < sizeX; x++) {
        const ch = this._state.board[y * sizeX + x]
        const tile = this._board.tile(x, y)
        switch (ch) {
          case CELL.WALL:
            tile.glyph = '#'
            tile.solid = true
            break
          case CELL.MIRROR:
            tile.glyph = '/'
            tile.solid = true
            break
          case CELL.MIRROR_FLIP:
            tile.glyph = '\\'
            tile.solid = true
            break
          case CELL.FIXED:
            tile.glyph = '/'
            tile.solid = true
            tile.style = 'fixed'
            break
          case CELL.FIXED_FLIP:
            tile.glyph = '\\'
            tile.solid = true
            tile.style = 'fixed'
            break
          default:
            tile.glyph = ' '
            tile.solid = false
        }
      }
    }
    this._board.refresh()
  }

  private _syncPawnPositions(): void {
    const { sizeX } = this._state
    const allPawns = [...this._board.playerOneUnits, ...this._board.playerTwoUnits]

    for (const pawnEntity of allPawns) {
      const pawnPlayer = pawnEntity === this._board.playerOneUnits[0] ? 1 : 2
      const marker = pawnPlayer === 1 ? CELL.PAWN_1 : CELL.PAWN_2
      const boardIdx = this._state.board.indexOf(marker)
      if (boardIdx === -1) continue

      const newX = boardIdx % sizeX
      const newY = Math.floor(boardIdx / sizeX)
      pawnEntity.pos.setXY(newX, newY)
      this._engine.renderer.renderActor(pawnEntity)

      const pawnRecord = this._state.pawns[boardIdx]
      if (pawnRecord) pawnEntity.health = pawnRecord.hp
    }
  }

  // ---------------------------------------------------------------------------
  // Victory / disconnection
  // ---------------------------------------------------------------------------

  private _showVictory(winner: 1 | 2): void {
    const isWin = winner === this._myPlayer
    const message = new UITextBox([isWin ? ' You win!' : ' You lose!'], 'centered')
    this._engine.renderer.ui.addElement(message, {
      w: 19,
      h: 2,
      anchorX: 50,
      anchorY: 50,
      pivotX: 50,
      pivotY: 50,
      y: -5,
    })

    const confirm = new UISelectNode(['Main Menu'])
    this._engine.renderer.ui.addElement(confirm, {
      anchorX: 50,
      anchorY: 50,
      pivotX: 50,
      pivotY: 50,
      w: 19,
      h: 1,
      y: 4,
    })
    confirm.on('select', () => {
      this._engine.renderer.ui.removeElement(message.id)
      this._board.clear()
      this.sceneManager.NavigateTo(Scene.MainMenu)
    })
  }

  private _showDisconnected(): void {
    const message = new UITextBox([' Opponent disconnected'], 'centered')
    this._engine.renderer.ui.addElement(message, {
      w: 24,
      h: 2,
      anchorX: 50,
      anchorY: 50,
      pivotX: 50,
      pivotY: 50,
      y: -5,
    })

    const confirm = new UISelectNode(['Main Menu'])
    this._engine.renderer.ui.addElement(confirm, {
      anchorX: 50,
      anchorY: 50,
      pivotX: 50,
      pivotY: 50,
      w: 19,
      h: 1,
      y: 4,
    })
    confirm.on('select', () => {
      this._engine.renderer.ui.removeElement(message.id)
      this._board.clear()
      this.sceneManager.NavigateTo(Scene.MainMenu)
    })
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private _getMyKing(): Pawn {
    const units = this._myPlayer === 1 ? this._board.playerOneUnits : this._board.playerTwoUnits
    return units[0]
  }
}

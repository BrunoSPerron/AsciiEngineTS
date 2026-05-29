import {
  AsciiEngine,
  Entity,
  GridVector,
  MASK,
  maskToGlyph,
  invertDirectionMask,
  UITextBox,
  UISelectElement,
} from 'ascii-game-engine'
import {
  applyAction,
  getLegalMoves,
  getLegalShots,
  canPlaceMirror,
  checkVictory,
  computeLaser,
  CELL,
  type GameState,
  type Direction,
  type LaserResult,
  type GameRule,
} from 'laser-chess-game-logic'
import { Board } from '../Board'
import type { SceneManager } from '../SceneManager'
import type { BaseGameScene } from './BaseGameScene'
import { MirrorCursor } from '../entities/MirrorCursor'
import { Pawn } from '../entities/Pawn'
import { runLaserSequence, type LaserAnimSeqInfo } from '../animations/laser'

// ---------------------------------------------------------------------------
// Helpers — keep game_logic Direction in sync with MASK bits for animations
// ---------------------------------------------------------------------------

const DIR_TO_MASK: Record<Direction, number> = {
  up: MASK.TOP,
  right: MASK.RIGHT,
  down: MASK.BOTTOM,
  left: MASK.LEFT,
}

/**
 * Build the initial GameState from the Board.
 *
 * Board._prepareForGame() has already run: pawn glyphs ('K'/'k') are cleared
 * from tiles and Pawn entities exist in board.playerOneUnits /
 * board.playerTwoUnits. We reconstruct the flat board array from the remaining
 * tile glyphs and then inject pawn markers at the entity positions.
 */
function buildGameState(board: Board): GameState {
  const size = board.size.x // 31×31

  // Build the flat board array from tiles (walls, mirrors, spaces)
  const boardArr: string[] = new Array(size * size).fill(CELL.EMPTY)
  const pawns: GameState['pawns'] = {}

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const tile = board.tile(x, y)
      const i = y * size + x
      switch (tile.glyph) {
        case '#':
          boardArr[i] = CELL.WALL
          break
        case '/':
          boardArr[i] = tile.style === 'fixed' ? CELL.FIXED : CELL.MIRROR
          break
        case '\\':
          boardArr[i] = tile.style === 'fixed' ? CELL.FIXED_FLIP : CELL.MIRROR_FLIP
          break
        default:
          boardArr[i] = CELL.EMPTY
      }
    }
  }

  // Inject player one pawns
  for (const pawn of board.playerOneUnits) {
    const i = pawn.pos.y * size + pawn.pos.x
    boardArr[i] = CELL.PAWN_1
    pawns[i] = { player: 1, hp: 5, moveType: 'king' }
  }

  // Inject player two pawns
  for (const pawn of board.playerTwoUnits) {
    const i = pawn.pos.y * size + pawn.pos.x
    boardArr[i] = CELL.PAWN_2
    pawns[i] = { player: 2, hp: 5, moveType: 'king' }
  }

  return {
    board: boardArr,
    pawns,
    size,
    currentPlayer: 1,
    phase: 'move',
  }
}

/** Sync a GameState back into the Board's chunk tiles so the renderer stays accurate. */
function syncStateToChunk(state: GameState, board: Board): void {
  const size = state.size
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const ch = state.board[y * size + x]
      const tile = board.tile(x, y)

      switch (ch) {
        case CELL.WALL:
          tile.glyph = '#'
          tile.solid = true
          tile.style = undefined
          break
        case CELL.MIRROR:
          tile.glyph = '/'
          tile.solid = true
          tile.style = undefined
          break
        case CELL.MIRROR_FLIP:
          tile.glyph = '\\'
          tile.solid = true
          tile.style = undefined
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
        case CELL.PAWN_1:
        case CELL.PAWN_2:
          // Pawns are rendered as entities; keep background empty
          tile.glyph = ' '
          tile.solid = false
          tile.style = undefined
          break
        default:
          tile.glyph = ' '
          tile.solid = false
          tile.style = undefined
      }
    }
  }
  board.refresh()
}

// ---------------------------------------------------------------------------
// GameScreen
// ---------------------------------------------------------------------------

const GAME_RULE: GameRule = { bounceDamage: 1, kingHP: 5, kingMoveType: 'king' as const }

export class GameScreen implements BaseGameScene {
  sceneManager: SceneManager
  board: Board

  private _engine: AsciiEngine
  private _state: GameState

  constructor(sceneManager: SceneManager, board: Board) {
    this.sceneManager = sceneManager
    this._engine = sceneManager.engine
    this.board = board

    this._state = buildGameState(board)
    // Sync chunk so tiles match logic state from the start
    syncStateToChunk(this._state, this.board)

    this._startPhase()
  }

  unload(): void {}

  // ---------------------------------------------------------------------------
  // Phase dispatcher
  // ---------------------------------------------------------------------------

  private _startPhase(): void {
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

  // ---------------------------------------------------------------------------
  // Move Phase
  // ---------------------------------------------------------------------------

  private _movePhase(): void {
    const legalMoves = getLegalMoves(this._state)
    const moveEntities: Entity[] = []

    const king = this._getActiveKing()
    const kingPos = king.pos

    for (const move of legalMoves) {
      const rel = king
        .getMovementOptions()
        .find((r) => kingPos.x + r.x === move.toX && kingPos.y + r.y === move.toY)
      const glyph = rel?.glyph ?? '·'
      const entity = new Entity(glyph, new GridVector(move.toX, move.toY), 500_000)
      entity.addCss('arrow')
      this._engine.world.spawnEntity(entity)
      moveEntities.push(entity)
    }

    const unlisteners: Array<() => void> = []

    unlisteners.push(
      this._engine.pointerManager.onWorldHover((x, y) => {
        const hit = moveEntities.find((e) => e.pos.x === x && e.pos.y === y)
        if (hit) hit.addCss('reversed')
      }),

      this._engine.pointerManager.onWorldHoverEnd((x, y) => {
        const hit = moveEntities.find((e) => e.pos.x === x && e.pos.y === y)
        if (hit) hit.removeCss('reversed')
      }),

      this._engine.pointerManager.onWorldPointerDown((x, y) => {
        const hit = moveEntities.find((e) => e.pos.x === x && e.pos.y === y)
        if (!hit) return

        this._state = applyAction(this._state, { type: 'move', toX: x, toY: y }, GAME_RULE)

        // Move the entity pawn visually
        king.pos.setXY(x, y)
        this._engine.renderer.renderActor(king)

        for (const e of moveEntities) this._engine.world.extractEntity(e.uid)
        for (const fn of unlisteners) fn()

        this._startPhase()
      }),
    )
  }

  // ---------------------------------------------------------------------------
  // Mirror Phase
  // ---------------------------------------------------------------------------

  private _mirrorPhase(): void {
    const cursor = new MirrorCursor()
    this._engine.world.spawnEntity(cursor)

    const hovered = this._engine.pointerManager.getHoveredWorldCell()
    if (hovered) cursor.setTarget(hovered.x, hovered.y)

    const unlisteners: Array<() => void> = []

    unlisteners.push(
      this._engine.pointerManager.onWorldHover((x, y) => cursor.setTarget(x, y)),

      this._engine.actionManager.onActionKeyDown((action) => {
        if (action === 'flip_mirror') {
          cursor.glyph = cursor.glyph === '/' ? '\\' : '/'
          if (cursor.el?.firstChild) cursor.el.firstChild.textContent = cursor.glyph
        }
      }),

      this._engine.pointerManager.onWorldPointerDown((x, y, button) => {
        if (button === 2) {
          cursor.glyph = cursor.glyph === '/' ? '\\' : '/'
          if (cursor.el?.firstChild) cursor.el.firstChild.textContent = cursor.glyph
          return
        }

        if (button !== 0) return
        if (!canPlaceMirror(this._state, x, y)) return

        const glyph = cursor.glyph as '/' | '\\'
        this._state = applyAction(this._state, { type: 'mirror', x, y, glyph }, GAME_RULE)

        // Update chunk tile immediately
        const tile = this.board.tile(x, y)
        tile.glyph = glyph
        tile.solid = true
        this.board.refresh()

        this._engine.world.extractEntity(cursor.uid)
        for (const fn of unlisteners) fn()

        queueMicrotask(() => this._startPhase())
      }),
    )
  }

  // ---------------------------------------------------------------------------
  // Shoot Phase
  // ---------------------------------------------------------------------------

  private _shootPhase(): void {
    const king = this._getActiveKing()
    const legalShots = getLegalShots()
    const shotEntities: Entity[] = []

    for (const shot of legalShots) {
      const rel = king.getShootAngles().find((r) => r.x === shot.dx && r.y === shot.dy)
      const glyph = rel?.glyph ?? '·'
      const entity = new Entity(
        glyph,
        new GridVector(king.pos.x + shot.dx, king.pos.y + shot.dy),
        500_000,
      )
      entity.addCss('arrow')
      this._engine.world.spawnEntity(entity)
      shotEntities.push(entity)
    }

    const unlisteners: Array<() => void> = []

    unlisteners.push(
      this._engine.pointerManager.onWorldHover((x, y) => {
        const hit = shotEntities.find((e) => e.pos.x === x && e.pos.y === y)
        if (hit) hit.addCss('reversed')
      }),

      this._engine.pointerManager.onWorldHoverEnd((x, y) => {
        const hit = shotEntities.find((e) => e.pos.x === x && e.pos.y === y)
        if (hit) hit.removeCss('reversed')
      }),

      this._engine.pointerManager.onWorldPointerDown((x, y) => {
        const hit = shotEntities.find((e) => e.pos.x === x && e.pos.y === y)
        if (!hit) return

        const dx = x - king.pos.x
        const dy = y - king.pos.y
        for (const fn of unlisteners) fn()
        void this._processShooting(king, dx, dy, shotEntities)
      }),
    )
  }

  private async _processShooting(
    shooter: Pawn,
    dx: number,
    dy: number,
    shotEntities: Entity[],
  ): Promise<void> {
    // Compute laser path before mutating state so we can animate it
    const dir = this._dxDyToDir(dx, dy)
    const laserResult = computeLaser(this._state, this._state.currentPlayer, dir, GAME_RULE)

    // Apply the shoot action to the logic state
    this._state = applyAction(this._state, { type: 'shoot', dx, dy }, GAME_RULE)

    // Animate the laser using the waypoints from the logic
    await this._animateLaser(laserResult, dir)

    // Sync visual chunk state (mirrors may have flipped, walls may have been hit)
    syncStateToChunk(this._state, this.board)

    // Sync pawn health visually (entities are already at correct positions)
    this._syncPawnHealth()

    // Clean up shot arrows
    for (const e of shotEntities) this._engine.world.extractEntity(e.uid)

    if (!this._checkAndShowVictory()) {
      this._startPhase()
    }
  }

  // ---------------------------------------------------------------------------
  // Laser animation — convert game_logic LaserResult into animation segments
  // ---------------------------------------------------------------------------

  private async _animateLaser(result: LaserResult, startDir: Direction): Promise<void> {
    const animSeqs: LaserAnimSeqInfo[] = []

    let currentDir = startDir

    for (let i = 0; i < result.waypoints.length - 1; i++) {
      const from = result.waypoints[i]
      const to = result.waypoints[i + 1]

      // Detect direction change at a deflection point (i > 0)
      const newDir = this._waypointDir(from, to)

      // Build the glyph run for this segment
      const isHorizontal = newDir === 'left' || newDir === 'right'
      const segLength = isHorizontal ? Math.abs(to.x - from.x) : Math.abs(to.y - from.y)

      if (segLength === 0) continue

      // Build the line element content
      const line = document.createElement('pre')

      if (i === 0) {
        // First segment — no join glyph needed at origin
        const segGlyph = isHorizontal
          ? maskToGlyph(MASK.LEFT | MASK.RIGHT)
          : maskToGlyph(MASK.TOP | MASK.BOTTOM)
        line.textContent = isHorizontal
          ? segGlyph.repeat(segLength)
          : (segGlyph + '\n').repeat(segLength).trimEnd()
      } else {
        // Deflection — first char is the corner junction glyph
        const incomingMask = DIR_TO_MASK[currentDir]
        const outgoingMask = DIR_TO_MASK[newDir]
        const cornerGlyph = maskToGlyph(invertDirectionMask(incomingMask) | outgoingMask)

        const segGlyph = isHorizontal
          ? maskToGlyph(MASK.LEFT | MASK.RIGHT)
          : maskToGlyph(MASK.TOP | MASK.BOTTOM)
        const bodyLength = segLength - 1
        const body = isHorizontal
          ? segGlyph.repeat(bodyLength)
          : bodyLength > 0
            ? '\n' + (segGlyph + '\n').repeat(bodyLength).trimEnd()
            : ''

        line.textContent = isHorizontal ? cornerGlyph + body : cornerGlyph + body
      }

      // Segment start position for the animator
      const startX = newDir === 'right' ? from.x + 1 : newDir === 'left' ? to.x : from.x
      const startY = newDir === 'down' ? from.y + 1 : newDir === 'up' ? to.y : from.y

      animSeqs.push({
        line,
        x: startX,
        y: startY,
        direction: DIR_TO_MASK[newDir],
        length: segLength,
      })

      currentDir = newDir
    }

    if (animSeqs.length > 0) {
      await runLaserSequence(
        this._engine.renderer.worldEl,
        animSeqs,
        this._engine.renderer.tileMetrics,
      )
    }
  }

  /** Infer travel direction from two adjacent waypoints. */
  private _waypointDir(from: { x: number; y: number }, to: { x: number; y: number }): Direction {
    const dx = to.x - from.x
    const dy = to.y - from.y
    // Wrapping board: pick shortest delta
    const size = this._state.size
    const wx = ((dx % size) + size) % size
    const wy = ((dy % size) + size) % size
    const ndx = wx > size / 2 ? wx - size : wx
    const ndy = wy > size / 2 ? wy - size : wy
    if (ndx > 0) return 'right'
    if (ndx < 0) return 'left'
    if (ndy > 0) return 'down'
    return 'up'
  }

  private _dxDyToDir(dx: number, dy: number): Direction {
    if (dx > 0) return 'right'
    if (dx < 0) return 'left'
    if (dy > 0) return 'down'
    return 'up'
  }

  // ---------------------------------------------------------------------------
  // Pawn health sync
  // ---------------------------------------------------------------------------

  private _syncPawnHealth(): void {
    // The legacy approach just checked health for victory — pawn entities remain
    // in the world. The hp values live in this._state.pawns which applyAction
    // already updated. Nothing extra needed here unless we display HP bars.
  }

  // ---------------------------------------------------------------------------
  // Victory
  // ---------------------------------------------------------------------------

  private _checkAndShowVictory(): boolean {
    const result = checkVictory(this._state)
    if (!result) return false

    const message = new UITextBox([`Player ${result.winner} wins!`], 'centered')
    this._engine.renderer.ui.addElement(message, {
      w: 19,
      h: 2,
      anchorX: 50,
      anchorY: 50,
      pivotX: 50,
      pivotY: 50,
      y: -5,
    })

    const confirm = new UISelectElement(['Main Menu'])
    this._engine.renderer.ui.addElement(confirm, {
      anchorX: 50,
      anchorY: 50,
      pivotX: 50,
      pivotY: 50,
      w: 19,
      h: 1,
      y: 4,
    })
    confirm.onSelect(() => {
      this._engine.renderer.ui.removeElement(message.id)
      this.board.clear()
      this.sceneManager.NavigateTo('MainMenu')
    })

    return true
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private _getActiveKing(): Pawn {
    const units =
      this._state.currentPlayer === 1 ? this.board.playerOneUnits : this.board.playerTwoUnits
    return units[0]
  }
}

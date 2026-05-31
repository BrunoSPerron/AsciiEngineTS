import type { AsciiEngine } from 'ascii-game-engine'
import {
  Entity,
  GridVector,
  MASK,
  maskToGlyph,
  invertDirectionMask,
  UITextBox,
  UISelectElement,
} from 'ascii-game-engine'
import {
  createGame,
  type GameRule,
  DIR_DELTA,
  type Direction,
  type GameState,
  CELL,
  type GameLogic,
  type LaserResult,
} from 'laser-chess-game-logic'
import type { Board } from '../Board'
import type { SceneManager } from '../SceneManager'
import type { BaseGameScene } from './BaseGameScene'
import { MirrorCursor } from '../entities/MirrorCursor'
import type { Pawn } from '../entities/Pawn'
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
  const sizeX = board.size.x
  const sizeY = board.size.y

  // Build the flat board array from tiles (walls, mirrors, spaces)
  const boardArr: string[] = new Array<string>(sizeX * sizeY).fill(CELL.EMPTY)
  const pawns: GameState['pawns'] = {}

  for (let y = 0; y < sizeY; y++) {
    for (let x = 0; x < sizeX; x++) {
      const tile = board.tile(x, y)
      const i = y * sizeX + x
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
    const i = pawn.pos.y * sizeX + pawn.pos.x
    boardArr[i] = CELL.PAWN_1
    pawns[i] = { player: 1, hp: 5, moveType: 'king' }
  }

  // Inject player two pawns
  for (const pawn of board.playerTwoUnits) {
    const i = pawn.pos.y * sizeX + pawn.pos.x
    boardArr[i] = CELL.PAWN_2
    pawns[i] = { player: 2, hp: 5, moveType: 'king' }
  }

  return {
    board: boardArr,
    pawns,
    sizeX,
    sizeY,
    currentPlayer: 1,
    phase: 'move',
  }
}

/** Sync a GameState back into the Board's chunk tiles so the renderer stays accurate. */
function syncStateToChunk(state: GameState, board: Board): void {
  const sizeX = state.sizeX
  const sizeY = state.sizeY
  for (let y = 0; y < sizeY; y++) {
    for (let x = 0; x < sizeX; x++) {
      const ch = state.board[y * sizeX + x]
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
          // Pawns are rendered as entities;
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

const GAME_RULE: GameRule = { bounceDamage: 1, kingHP: 5, kingMoveType: 'king' }

export class GameScreen implements BaseGameScene {
  sceneManager: SceneManager
  board: Board

  private _engine: AsciiEngine
  private _state: GameState
  private _logic: GameLogic

  constructor(sceneManager: SceneManager, board: Board) {
    this.sceneManager = sceneManager
    this.board = board

    this._logic = createGame(GAME_RULE)
    this._engine = sceneManager.engine

    this._state = buildGameState(board)
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
    const king = this._getActiveKing()

    const legalMoves = this._logic.getLegalMoves(this._state, king.pos.x, king.pos.y)
    const moveEntities: Entity[] = []

    for (const move of legalMoves) {
      const rel = king
        .getMovementOptions()
        .find((r) => king.pos.x + r.x === move.toX && king.pos.y + r.y === move.toY)
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

        this._state = this._logic.applyAction(this._state, {
          type: 'move',
          fromX: king.pos.x,
          fromY: king.pos.y,
          toX: x,
          toY: y,
        })

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
        if (!this._logic.canPlaceMirror(this._state, x, y)) return

        const glyph = cursor.glyph as '/' | '\\'
        this._state = this._logic.applyAction(this._state, { type: 'mirror', x, y, glyph })

        const tile = this.board.tile(x, y)
        tile.glyph = glyph
        tile.solid = true
        this.board.refresh()

        this._engine.world.extractEntity(cursor.uid)
        for (const fn of unlisteners) fn()

        queueMicrotask(() => this._startPhase()) // avoid current click propagation
      }),
    )
  }

  // ---------------------------------------------------------------------------
  // Shoot Phase
  // ---------------------------------------------------------------------------

  private _shootPhase(): void {
    const king = this._getActiveKing()
    const legalShots = this._logic.getLegalShots(this._state, king.pos.x, king.pos.y)
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
    const x = shooter.pos.x
    const y = shooter.pos.y
    const laserResult = this._logic.computeLaser(this._state, x, y, dir)
    this._state = this._logic.applyAction(this._state, { type: 'shoot', x, y, dx, dy })
    for (const e of shotEntities) this._engine.world.extractEntity(e.uid)
    await this._animateLaser(laserResult, dir)
    syncStateToChunk(this._state, this.board)
    this._syncPawnHealth()
    if (!this._checkAndShowVictory()) {
      this._startPhase()
    }
  }

  // ---------------------------------------------------------------------------------
  // Laser animation - convert LaserResult from the game_logic into animation segments
  // ---------------------------------------------------------------------------------

  private async _animateLaser(result: LaserResult, startDir: Direction): Promise<void> {
    const animSeqs: LaserAnimSeqInfo[] = []
    const sizeX = this._state.sizeX
    const sizeY = this._state.sizeY

    const straightGlyph = (dir: Direction): string =>
      dir === 'left' || dir === 'right'
        ? maskToGlyph(MASK.LEFT | MASK.RIGHT)
        : maskToGlyph(MASK.TOP | MASK.BOTTOM)

    const cornerGlyph = (incoming: Direction, outgoing: Direction): string =>
      maskToGlyph(invertDirectionMask(DIR_TO_MASK[incoming]) | DIR_TO_MASK[outgoing])

    const addGlyph = (seg: LaserAnimSeqInfo, glyph: string, dir: Direction): void => {
      const isVertical = dir === 'up' || dir === 'down'
      const prepend = dir === 'up' || dir === 'left'
      const sep = isVertical && seg.length > 0 ? '\n' : ''

      if (dir === 'up') seg.y -= 1
      if (dir === 'left') seg.x -= 1

      const existing = seg.line.textContent ?? ''
      seg.line.textContent = prepend ? glyph + sep + existing : existing + sep + glyph

      seg.length += 1
    }

    // Creates a new segment anchored at (x, y) in the given direction.
    // Note: x,y is the shooter or mirror position, the anchor, not the first glyph cell.
    // _addGlyph shift the origin as glyphs are added for UP/LEFT.
    const newSegment = (x: number, y: number, dir: Direction): LaserAnimSeqInfo => {
      const seg: LaserAnimSeqInfo = {
        line: document.createElement('pre'),
        x,
        y,
        direction: DIR_TO_MASK[dir],
        length: 0,
      }
      animSeqs.push(seg)
      return seg
    }

    let currentDir = startDir
    // First segment anchored at shooter position, matching legacy behavior
    let currentSeg = newSegment(result.waypoints[0].x, result.waypoints[0].y, currentDir)

    for (let wi = 0; wi < result.waypoints.length - 1; wi++) {
      const from = result.waypoints[wi]
      const to = result.waypoints[wi + 1]
      const isLastSegment = wi === result.waypoints.length - 2

      if (to.kind === 'wrap') {
        currentSeg = newSegment(to.x, to.y, currentDir)
        continue
      }

      const steps = Math.abs(to.x - from.x) + Math.abs(to.y - from.y)

      const [ddx, ddy] = DIR_DELTA[currentDir]
      let cx = from.x
      let cy = from.y

      for (let step = 0; step < steps; step++) {
        cx += ddx
        cy += ddy

        const isLastStep = step === steps - 1

        // Detect wrap crossing mid-segment
        const crossedX = ddx !== 0 && ((ddx > 0 && cx === 0) || (ddx < 0 && cx === sizeX - 1))
        const crossedY = ddy !== 0 && ((ddy > 0 && cy === 0) || (ddy < 0 && cy === sizeY - 1))
        if (crossedX || crossedY) currentSeg = newSegment(cx, cy, currentDir)

        if (isLastStep && !isLastSegment) {
          // This is the mirror cell:
          // 1. Add the corner glyph to the INCOMING segment
          const nextDir = this._waypointDir(to, result.waypoints[wi + 2])
          addGlyph(currentSeg, cornerGlyph(currentDir, nextDir), currentDir)

          // 2. Start new outgoing segment anchored at the mirror cell
          currentDir = nextDir
          currentSeg = newSegment(cx, cy, currentDir)
        } else {
          addGlyph(currentSeg, straightGlyph(currentDir), currentDir)
        }
      }
    }

    if (animSeqs.length > 0) {
      await runLaserSequence(
        this._engine.renderer.worldEl,
        animSeqs,
        this._engine.renderer.tileMetrics,
      )
    }
  }

  private _waypointDir(from: { x: number; y: number }, to: { x: number; y: number }): Direction {
    const sizeX = this._state.sizeX
    const sizeY = this._state.sizeY
    const rawDx = to.x - from.x
    const rawDy = to.y - from.y
    const wx = ((rawDx % sizeX) + sizeX) % sizeX
    const wy = ((rawDy % sizeY) + sizeY) % sizeY
    const ndx = wx > sizeX / 2 ? wx - sizeX : wx
    const ndy = wy > sizeY / 2 ? wy - sizeY : wy
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
    const result = this._logic.checkVictory(this._state)
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

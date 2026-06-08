import {
  Entity,
  GridVector,
  MASK,
  maskToGlyph,
  invertDirectionMask,
  UITextBox,
  UISelectNode,
} from 'ascii-game-engine'

import type {
  Direction,
  GameState,
  GameLogic,
  LaserResult,
  LaserWaypoint,
} from '@laser-chess/shared'
import { createGame, DIR_DELTA, GAME_RULE_DEATHMATCH, CELL, idx } from '@laser-chess/shared'

import { BaseGameScene } from './BaseGameScene'
import { ARROW_SET } from '../arrowSets'
import type { Board } from '../Board'
import { Scene, type SceneManager } from '../SceneManager'
import { runLaserSequence, type LaserAnimSeqInfo } from '../animations/laser'
import { MirrorCursor } from '../entities/MirrorCursor'
import type { Pawn } from '../entities/Pawn'
import { buildBoardFromState } from '../buildBoardFromState'

// ---------------------------------------------------------------------------
// Helpers — keep shared Direction in sync with MASK bits for animations
// ---------------------------------------------------------------------------

const DIR_TO_MASK: Record<Direction, number> = {
  up: MASK.TOP,
  right: MASK.RIGHT,
  down: MASK.BOTTOM,
  left: MASK.LEFT,
  none: 0,
}

/** Sync a GameState back into the Board's chunk tiles so the renderer stays accurate. */
function syncStateToChunk(state: GameState, board: Board): void {
  const { sizeX, sizeY } = state
  for (let y = 0; y < sizeY; y++) {
    for (let x = 0; x < sizeX; x++) {
      const ch = state.board[y * sizeX + x]
      const tile = board.tile(x, y)
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
  board.refresh()
}

// ---------------------------------------------------------------------------
// GameScreen
// ---------------------------------------------------------------------------

export class GameScreen extends BaseGameScene {
  sceneManager: SceneManager
  board: Board

  private _state: GameState
  private _logic: GameLogic

  constructor(sceneManager: SceneManager, initialState: GameState) {
    super(sceneManager)
    this.sceneManager = sceneManager

    this._logic = createGame(GAME_RULE_DEATHMATCH)

    this._state = initialState

    this._startPhase()
    this.board = buildBoardFromState(initialState, this._engine)
    syncStateToChunk(this._state, this.board)
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
      const dirX = move.toX - move.fromX
      const dirY = move.toY - move.fromY
      const glyph = this._getArrowGlyph(dirX, dirY, ARROW_SET.NUMBER)

      const entity = new Entity(glyph, new GridVector(move.toX, move.toY), 500_000)
      entity.addCss('arrow')
      entity.addCss(this._state.currentPlayer === 1 ? 'player-one' : 'player-two')
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
      const glyph = this._getArrowGlyph(shot.dx, shot.dy, ARROW_SET.NUMBER)

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
    const extraCss = this._state.currentPlayer === 1 ? 'p-one-laser' : 'p-two-laser'
    const dir = this._dxDyToDir(dx, dy)
    const x = shooter.pos.x
    const y = shooter.pos.y
    const result = this._logic.computeLaser(this._state, x, y, dir)
    this._state = this._logic.applyAction(this._state, { type: 'shoot', x, y, dx, dy, result })
    for (const e of shotEntities) this._engine.world.extractEntity(e.uid)
    await this._animateLaser(result, extraCss)
    syncStateToChunk(this._state, this.board)
    this._syncPawnHealth()
    if (!this._checkAndShowVictory()) {
      this._startPhase()
    }
  }

  // ---------------------------------------------------------------------------------
  // Laser animation - convert LaserResult from the shared into animation segments
  // ---------------------------------------------------------------------------------

  private _getStepsBetween(from: LaserWaypoint, to: LaserWaypoint) {
    let willWrapHorizontal =
      (to.outDir !== 'none' && from.x < to.x && from.outDir === 'left') ||
      (from.x > to.x && from.outDir === 'right')
    let willWrapVertical =
      (to.outDir !== 'none' && from.y < to.y && from.outDir === 'up') ||
      (from.y > to.y && from.outDir === 'down')

    // Edge case: full loop (position shot itself)
    if (from.x === to.x && from.y === to.y) {
      if (from.outDir === 'left' || from.outDir === 'right') willWrapHorizontal = true
      else if (from.outDir === 'up' || from.outDir === 'down') willWrapVertical = true
    }

    let steps
    if (willWrapHorizontal) {
      steps = this._state.sizeX - Math.abs(to.x - from.x)
    } else if (willWrapVertical) {
      steps = this._state.sizeY - Math.abs(to.y - from.y)
    } else {
      steps = Math.abs(to.x - from.x) + Math.abs(to.y - from.y)
    }
    return steps
  }

  private async _animateLaser(result: LaserResult, extraCss: string): Promise<void> {
    if (result.waypoints.length < 2) throw Error('Tried to animate laser with no waypoints')
    const animSeqs: LaserAnimSeqInfo[] = []

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

    for (let wi = 0; wi < result.waypoints.length - 1; wi++) {
      const from = result.waypoints[wi]
      const to = result.waypoints[wi + 1]
      const isLastSegment = wi === result.waypoints.length - 2

      const steps = this._getStepsBetween(from, to)

      const currentDir = from.outDir
      let cx = from.x
      let cy = from.y
      let currentSeg = newSegment(cx, cy, currentDir)

      const [ddx, ddy] = DIR_DELTA[currentDir]

      for (let step = 0; step < steps; step++) {
        cx += ddx
        cy += ddy

        const isLastStep = step === steps - 1

        // mid-segment wrap
        if (cx < 0) {
          cx = this._state.sizeX
          currentSeg = newSegment(cx, cy, currentDir)
        } else if (cx > this._state.sizeX - 1) {
          cx = -1
          currentSeg = newSegment(cx, cy, currentDir)
        } else if (cy < 0) {
          cy = this._state.sizeY
          currentSeg = newSegment(cx, cy, currentDir)
        } else if (cy > this._state.sizeY - 1) {
          cy = -1
          currentSeg = newSegment(cx, cy, currentDir)
        }

        if (isLastStep && !isLastSegment) {
          // This is the mirror cell:
          addGlyph(currentSeg, cornerGlyph(currentDir, to.outDir), currentDir)
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
        extraCss,
      )
    }
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
    for (const pawnEntity of [...this.board.playerOneUnits, ...this.board.playerTwoUnits]) {
      const Pawnidx = idx(this._state, pawnEntity.pos.x, pawnEntity.pos.y)
      const pawnRecord = this._state.pawns[Pawnidx]
      pawnEntity.health = pawnRecord.hp
    }
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
      this.board.clear()
      this.sceneManager.NavigateTo(Scene.MainMenu)
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

  private _getArrowGlyph(dirX: number, dirY: number, arrowSet: string) {
    let glyph = ' '
    if (dirY === -1) {
      if (dirX === -1) glyph = arrowSet[4]
      else if (dirX === 0) glyph = arrowSet[2]
      else if (dirX === 1) glyph = arrowSet[5]
    } else if (dirY === 0) {
      if (dirX === -1) glyph = arrowSet[0]
      else if (dirX === 0) glyph = arrowSet[8]
      else if (dirX === 1) glyph = arrowSet[1]
    } else if (dirY === 1) {
      if (dirX === -1) glyph = arrowSet[7]
      else if (dirX === 0) glyph = arrowSet[3]
      else if (dirX === 1) glyph = arrowSet[6]
    }
    return glyph
  }
}

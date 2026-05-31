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
  DIR_DELTA,
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
    const size = this._state.size

    const straightGlyph = (dir: Direction): string =>
      dir === 'left' || dir === 'right'
        ? maskToGlyph(MASK.LEFT | MASK.RIGHT)
        : maskToGlyph(MASK.TOP | MASK.BOTTOM)

    const cornerGlyph = (incoming: Direction, outgoing: Direction): string =>
      maskToGlyph(invertDirectionMask(DIR_TO_MASK[incoming]) | DIR_TO_MASK[outgoing])

    // Mirrors the legacy _addGlyph: appends or prepends to segment,
    // shifts origin for UP/LEFT directions.
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
    // Note: x,y is the shooter or mirror position — the anchor, not the first glyph cell.
    // _addGlyph will shift the origin as glyphs are added for UP/LEFT.
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

      // Detect wrap: raw delta larger than half the board
      const rawDx = to.x - from.x
      const rawDy = to.y - from.y
      const wraps = Math.abs(rawDx) > size / 2 || Math.abs(rawDy) > size / 2

      // Step count from `from` to `to`, accounting for wrap
      let steps: number
      if (!wraps) {
        steps = Math.abs(rawDx) + Math.abs(rawDy)
      } else {
        if (currentDir === 'right') steps = size - 1 - from.x + to.x + 1
        else if (currentDir === 'left') steps = from.x + (size - 1 - to.x)
        else if (currentDir === 'down') steps = size - 1 - from.y + to.y + 1
        else steps = from.y + (size - 1 - to.y) // up
      }

      const [ddx, ddy] = DIR_DELTA[currentDir]
      let cx = from.x
      let cy = from.y

      for (let step = 0; step < steps; step++) {
        cx = (((cx + ddx) % size) + size) % size
        cy = (((cy + ddy) % size) + size) % size

        const isLastStep = step === steps - 1

        // Detect wrap crossing mid-segment: start a new segment at the wrapped cell
        const crossedX = ddx !== 0 && ((ddx > 0 && cx === 0) || (ddx < 0 && cx === size - 1))
        const crossedY = ddy !== 0 && ((ddy > 0 && cy === 0) || (ddy < 0 && cy === size - 1))

        if (crossedX || crossedY) {
          // Start fresh segment at the wrapped position, same direction
          currentSeg = newSegment(cx, cy, currentDir)
        }

        if (isLastStep && !isLastSegment) {
          // This is the mirror cell:
          // 1. Add the corner glyph to the INCOMING segment
          const nextDir = this._waypointDir(to, result.waypoints[wi + 2])
          addGlyph(currentSeg, cornerGlyph(currentDir, nextDir), currentDir)

          // 2. Start new outgoing segment anchored at the mirror cell
          currentDir = nextDir
          currentSeg = newSegment(cx, cy, currentDir)
        } else {
          // Normal empty cell — straight glyph
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
    const size = this._state.size
    const rawDx = to.x - from.x
    const rawDy = to.y - from.y
    const wx = ((rawDx % size) + size) % size
    const wy = ((rawDy % size) + size) % size
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

import {
  AsciiEngine,
  Entity,
  GridVector,
  MASK,
  maskToGlyph,
  invertDirectionMask,
  type Tile,
  UITextBox,
  UISelectElement,
} from 'ascii-game-engine'
import { Board } from '../Board'
import type { SceneManager } from '../SceneManager'
import type { BaseGameScene } from './BaseGameScene'
import { MirrorCursor } from '../entities/MirrorCursor'
import { Pawn } from '../entities/Pawn'
import { runLaserSequence, type LaserAnimSeqInfo } from '../animations/laser'

export class GameScreen implements BaseGameScene {
  sceneManager: SceneManager
  board: Board

  private _engine: AsciiEngine

  /**
   * 0 - Move
   * 1 - Place Mirror
   * 2 - Shoot
   */
  phase: number = -1
  isPlayerOneTurn = true

  constructor(sceneManager: SceneManager, board: Board) {
    this.sceneManager = sceneManager
    this._engine = this.sceneManager.engine
    this.board = board
    this.nextStep()
  }

  unload(): void {}

  nextStep() {
    if (this.phase++ > 1) {
      this.phase = 0
      this.isPlayerOneTurn = !this.isPlayerOneTurn
    }
    switch (this.phase) {
      case 0:
        this._movePhase()
        break
      case 1:
        this._mirrorPhase()
        break
      case 2:
        this._shootPhase()
        break
    }
  }

  // --------------------------------------------------------------
  // Move Phase
  // --------------------------------------------------------------

  private _movePhase() {
    const king = this._getActiveKing()
    const relativePositions = king.getMovementOptions()
    const positionEntities: Entity[] = []
    for (let i = 0; i < relativePositions.length; i++) {
      const pos = relativePositions[i]
      if (!this.board.tile(king.pos.x + pos.x, king.pos.y + pos.y).solid) {
        const entity = new Entity(
          pos.glyph,
          new GridVector(king.pos.x + pos.x, king.pos.y + pos.y),
          500000,
        )
        entity.addCss('arrow')
        this._engine.world.spawnEntity(entity)
        positionEntities.push(entity)
      }
    }

    const unlisteners: (() => void)[] = []
    unlisteners.push(
      this._engine.pointerManager.onWorldHover((x: number, y: number) => {
        const hovered = positionEntities.find((e) => {
          return e.pos.x == x && e.pos.y == y
        })
        if (hovered) {
          hovered.addCss('reversed')
        }
      }),

      this._engine.pointerManager.onWorldHoverEnd((x: number, y: number) => {
        const hovered = positionEntities.find((e) => {
          return e.pos.x == x && e.pos.y == y
        })
        if (hovered) {
          hovered.removeCss('reversed')
        }
      }),
      this._engine.pointerManager.onWorldPointerDown((x: number, y: number) => {
        const hovered = positionEntities.find((e) => {
          return e.pos.x == x && e.pos.y == y
        })
        if (hovered) {
          king.pos.setXY(x, y)
          this._engine.renderer.renderActor(king)
          for (const entity of positionEntities) {
            this._engine.world.extractEntity(entity.uid)
          }
          for (const unlisten of unlisteners) unlisten()
          this.nextStep()
        }
      }),
    )
  }

  // --------------------------------------------------------------
  // Mirror Phase
  // --------------------------------------------------------------

  private _mirrorPhase() {
    const cursor = new MirrorCursor()
    this._engine.world.spawnEntity(cursor)
    const hoverCoord = this._engine.pointerManager.getHoveredWorldCell()
    if (hoverCoord) cursor.setTarget(hoverCoord.x, hoverCoord.y)

    const unlisteners: (() => void)[] = []
    unlisteners.push(
      this._engine.pointerManager.onWorldHover((x: number, y: number) => {
        cursor.setTarget(x, y)
      }),
      this._engine.actionManager.onActionKeyDown((action) => {
        if (action === 'flip_mirror') {
          cursor.glyph = cursor.glyph === '/' ? '\\' : '/'
          cursor.el!.firstChild!.textContent = cursor.glyph
        }
      }),
      this._engine.pointerManager.onWorldPointerDown((x: number, y: number, button: number) => {
        if (button == 2) {
          cursor.glyph = cursor.glyph === '/' ? '\\' : '/'
          cursor.el!.firstChild!.textContent = cursor.glyph
        } else if (button == 0 && this._canPlaceAt(x, y)) {
          const tile = this.board.tile(x, y)
          tile.glyph = cursor.glyph
          tile.solid = true
          this.board.refresh()
          this._engine.world.extractEntity(cursor.uid)
          for (const unlisten of unlisteners) unlisten()
          queueMicrotask(() => {
            this.nextStep()
          })
        }
      }),
    )
  }

  private _canPlaceAt(x: number, y: number): boolean {
    if (x > -1 && x < 32 && y > -1 && y < 32) {
      return this.board.getOccupied(x, y) === null
    }
    return false
  }

  // --------------------------------------------------------------
  // Shoot Phase
  // --------------------------------------------------------------

  private _shootPhase() {
    const king = this._getActiveKing()
    const relativePositions = king.getShootAngles()
    const positionEntities: Entity[] = []

    for (let i = 0; i < relativePositions.length; i++) {
      const pos = relativePositions[i]
      const entity = new Entity(
        pos.glyph,
        new GridVector(king.pos.x + pos.x, king.pos.y + pos.y),
        500000,
      )
      entity.addCss('arrow')
      this._engine.world.spawnEntity(entity)
      positionEntities.push(entity)
    }

    const unlisteners: (() => void)[] = []
    unlisteners.push(
      this._engine.pointerManager.onWorldHover((x: number, y: number) => {
        const hovered = positionEntities.find((e) => {
          return e.pos.x == x && e.pos.y == y
        })
        if (hovered) {
          hovered.addCss('reversed')
        }
      }),

      this._engine.pointerManager.onWorldHoverEnd((x: number, y: number) => {
        const hovered = positionEntities.find((e) => {
          return e.pos.x == x && e.pos.y == y
        })
        if (hovered) {
          hovered.removeCss('reversed')
        }
      }),

      this._engine.pointerManager.onWorldPointerDown((x: number, y: number) => {
        const hovered = positionEntities.find((e) => {
          return e.pos.x == x && e.pos.y == y
        })
        if (hovered) {
          for (const unlisten of unlisteners) unlisten()
          this._processShooting(king, hovered.pos, positionEntities)
        }
      }),
    )
  }

  private async _processShooting(
    shooter: Pawn,
    worldPosition: GridVector,
    positionEntities: Entity[],
  ) {
    await this._shoot(worldPosition, shooter)
    for (const entity of positionEntities) {
      this._engine.world.extractEntity(entity.uid)
    }
    if (!this.checkForVictory()) this.nextStep()
  }

  // --------------------------------------------------------------
  // Private Helpers
  // --------------------------------------------------------------

  // TODO replace this method with something to handle all active units
  private _getActiveKing() {
    return this.isPlayerOneTurn ? this.board.playerOneUnits[0] : this.board.playerTwoUnits[0]
  }

  private async _shoot(directionPosition: GridVector, shooter: Pawn) {
    const directionX = directionPosition.x - shooter.pos.x
    const directionY = directionPosition.y - shooter.pos.y

    if (directionX !== 0 && directionY !== 0) {
      throw Error('ERROR: Diagonal shooting is not implemented')
    }

    let currentDirection: number = 0
    if (directionX > 0) currentDirection = MASK.RIGHT
    else if (directionX < 0) currentDirection = MASK.LEFT
    else if (directionY > 0) currentDirection = MASK.BOTTOM
    else if (directionY < 0) currentDirection = MASK.TOP

    let hitSomething: Boolean = false
    const currentPos = new GridVector(shooter.pos)
    const mirrorsHit: Set<Tile> = new Set()
    let damage = 1

    const animationSequence: LaserAnimSeqInfo[] = []
    let animSeq: LaserAnimSeqInfo = {
      line: document.createElement('pre'),
      x: shooter.pos.x,
      y: shooter.pos.y,
      direction: currentDirection,
      length: 0,
    }
    animationSequence.push(animSeq)

    let counter = 0
    let maxIteration = this.board.size.x * this.board.size.y
    while (!hitSomething && counter < maxIteration) {
      counter++
      let glyph = ''
      let newAnimationSegment = false
      switch (currentDirection) {
        case MASK.TOP:
          currentPos.y -= 1
          if (currentPos.y < 0) {
            currentPos.y = this.board.size.y
            newAnimationSegment = true
          }
          glyph = maskToGlyph(MASK.TOP | MASK.BOTTOM)
          break
        case MASK.RIGHT:
          currentPos.x += 1
          if (currentPos.x > this.board.size.x) {
            currentPos.x = -1
            newAnimationSegment = true
          }
          glyph = maskToGlyph(MASK.LEFT | MASK.RIGHT)
          break
        case MASK.BOTTOM:
          currentPos.y += 1
          if (currentPos.y > this.board.size.y) {
            currentPos.y = -1
            newAnimationSegment = true
          }
          glyph = maskToGlyph(MASK.TOP | MASK.BOTTOM)
          break
        case MASK.LEFT:
          currentPos.x -= 1
          if (currentPos.x < 0) {
            currentPos.x = this.board.size.x
            newAnimationSegment = true
          }
          glyph = maskToGlyph(MASK.LEFT | MASK.RIGHT)
          break
      }
      if (newAnimationSegment) {
        animSeq = {
          line: document.createElement('pre'),
          x: currentPos.x,
          y: currentPos.y,
          direction: currentDirection,
          length: 0,
        }
        animationSequence.push(animSeq)
      }

      const resident = this.board.getOccupied(currentPos)
      if (resident === null) {
        this._addGlyph(glyph, currentDirection, animSeq)
      } else if (resident instanceof Pawn) {
        resident.damage(damage)
        hitSomething = true
      } else if (resident.glyph === '\\' || resident.glyph === '/') {
        damage += 1
        if (resident.style !== 'fixed') mirrorsHit.add(resident)
        const oldDirection = currentDirection
        currentDirection = this._conputeNewLaserDir(currentDirection, resident.glyph)
        glyph = maskToGlyph(invertDirectionMask(oldDirection) | currentDirection)
        this._addGlyph(glyph, oldDirection, animSeq)
        animSeq = {
          line: document.createElement('pre'),
          x: currentPos.x,
          y: currentPos.y,
          direction: currentDirection,
          length: 0,
        }
        animationSequence.push(animSeq)
      } else if (resident.glyph === '#') {
        resident.glyph = ' '
        resident.solid = false
        // border wall mirroring is handled by the board
        hitSomething = true
      }
    }
    await runLaserSequence(
      this._engine.renderer.worldEl,
      animationSequence,
      this._engine.renderer.tileMetrics,
    )
    for (const mirror of mirrorsHit) {
      mirror.glyph = mirror.glyph === '/' ? '\\' : '/'
    }
    this.board.refresh()
  }

  private _conputeNewLaserDir(directionIdx: number, glyph: string): number {
    const isReversed = glyph === '\\'
    switch (directionIdx) {
      case MASK.TOP:
        return isReversed ? MASK.LEFT : MASK.RIGHT
      case MASK.RIGHT:
        return isReversed ? MASK.BOTTOM : MASK.TOP
      case MASK.BOTTOM:
        return isReversed ? MASK.RIGHT : MASK.LEFT
      case MASK.LEFT:
        return isReversed ? MASK.TOP : MASK.BOTTOM
    }
    return MASK.TOP
  }

  private _addGlyph(glyph: string, direction: number, animSeq: LaserAnimSeqInfo) {
    let atFirstPos: boolean = true
    let isVertical: boolean = false

    switch (direction) {
      case MASK.TOP:
        animSeq.y -= 1
        isVertical = true
        break
      case MASK.RIGHT:
        atFirstPos = false
        break
      case MASK.BOTTOM:
        atFirstPos = false
        isVertical = true
        break
      case MASK.LEFT:
        animSeq.x -= 1
        break
    }

    const line = animSeq.line
    if (atFirstPos) {
      line.textContent = `${glyph}${isVertical ? '\n' : ''}${line.textContent}`
    } else {
      line.textContent = `${line.textContent}${isVertical ? '\n' : ''}${glyph}`
    }
    animSeq.length += 1
  }

  private checkForVictory(): boolean {
    const isAliveP1 = this.board.playerOneUnits[0].health !== 0
    const isAliveP2 = this.board.playerTwoUnits[0].health !== 0
    if (!isAliveP1 || !isAliveP2) {
      const message = new UITextBox([`${isAliveP1 ? 'Player one' : 'Player two'} win!`], 'centered')
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
    return false
  }
}

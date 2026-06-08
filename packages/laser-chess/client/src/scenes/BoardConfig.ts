import type { UILayout } from 'ascii-game-engine'
import { UISelectNode, type Chunk } from 'ascii-game-engine'
import { Scene, type SceneManager } from '../SceneManager'
import { BaseGameScene } from './BaseGameScene'
import { GAME_RULE_DEATHMATCH, loadBoard, type GameRule, type GameState } from '@laser-chess/shared'

export class BoardConfig extends BaseGameScene {
  ui: UILayout
  chunk: Chunk
  boardMap: Map<string, string> = new Map<string, string>()

  private _gameRule: GameRule = GAME_RULE_DEATHMATCH

  //current CheckerPattern Dimensions
  private _sizeX: number = 0
  private _sizeY: number = 0

  constructor(sceneManager: SceneManager) {
    super(sceneManager)
    this.ui = sceneManager.engine.renderer.ui

    this.chunk = sceneManager.engine.world.getChunkXY(0, 0)
    this._loadBoards()
    const boardKeys = [...this.boardMap.keys()]
    if (boardKeys.length) {
      this._previewBoard(boardKeys[0])
    }
    this.openBoardConfigMenu()
  }

  private _loadBoards() {
    const files = import.meta.glob('../assets/boards/**/*.txt', {
      query: '?raw',
      import: 'default',
      eager: true,
    })

    for (const [path, content] of Object.entries(files)) {
      const filename = path.split('/').pop()?.replace('.txt', '')

      if (filename && typeof content === 'string') {
        this.boardMap.set(filename, content)
      }
    }
  }

  private _createCheckerPattern(sizeX: number, sizeY: number) {
    for (let y = 0; y < Math.max(this._sizeY, sizeY); y++) {
      for (let x = 0; x < Math.max(this._sizeX, sizeX); x++) {
        const tile = this.chunk.get(x, y)
        tile.glyph = ' '
        if (((x % 2) + y) % 2 === 0) {
          tile.style = x < sizeX && y < sizeY ? 'odd' : undefined
        }
      }
    }

    this._sizeX = sizeX
    this._sizeY = sizeY
    this.chunk.dirty = true
    this.sceneManager.engine.renderer.invalidateChunks()

    const camera = this.sceneManager.engine.renderer.camera
    camera.target.pos.setXY((this._sizeX - 1) / 2, (this._sizeY - 1) / 2)
    camera.target.previousPos.setXY((this._sizeX - 1) / 2, (this._sizeY - 1) / 2)
    camera.jumpToTarget()
  }

  unload() {}

  openBoardConfigMenu() {
    const boardSelectElement = new UISelectNode([...this.boardMap.keys()], {
      captureInput: true,
    })

    this.ui.addElement(boardSelectElement, {
      x: 0,
      y: 0,
      w: 20,
      h: 20,
      anchorX: 100,
      anchorY: 0,
      pivotX: 100,
      pivotY: 50,
      minH: 1,
      minW: 1,
      dock: 'right',
    })

    boardSelectElement.on('change', (selectId) => {
      if (selectId === -1) return
      this._previewBoard([...this.boardMap.keys()][Number(selectId)])
    })

    boardSelectElement.on('select', () => {
      const name = [...this.boardMap.keys()][boardSelectElement.currentIndex]
      const txt = this.boardMap.get(name)
      if (!txt) return

      const { board, sizeX, sizeY, pawns } = loadBoard(txt, this._gameRule)
      const initialState: GameState = {
        board,
        pawns,
        sizeX: sizeX,
        sizeY: sizeY,
        currentPlayer: 1,
        phase: 'move',
      }

      this.sceneManager.NavigateTo(Scene.Game, { initialState })
    })
  }

  private _previewBoard(name: string) {
    const boardData = this.boardMap.get(name)

    if (!boardData) {
      //TODO print in DOM `Board "${name}" not found`
      return
    }

    const lines = boardData.split('\n')

    let sizeX: number = 0
    let sizeY: number = 0
    for (let line of lines) {
      line = line?.replace('\r', '') ?? ''
      sizeY++
      if (line.length > sizeX) sizeX = line.length
    }

    this._createCheckerPattern(sizeX, sizeY)

    for (let y = 0; y < sizeY; y++) {
      for (let x = 0; x < sizeX; x++) {
        const tile = this.chunk.get(x, y)
        tile.glyph = lines[y][x] ?? ' '
      }
    }

    this.chunk.dirty = true
    this.sceneManager.engine.renderer.invalidateChunks()
  }
}

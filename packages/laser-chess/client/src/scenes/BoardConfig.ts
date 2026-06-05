import type { UILayout } from 'ascii-game-engine'
import { UISelectElement, type Chunk } from 'ascii-game-engine'
import { Scene, type SceneManager } from '../SceneManager'
import { BaseGameScene } from './BaseGameScene'
import { DEFAULT_GAME_RULE, loadBoard, type GameRule, type GameState } from '@laser-chess/shared'

export class BoardConfig extends BaseGameScene {
  ui: UILayout
  chunk: Chunk
  boardMap: Map<string, string> = new Map<string, string>()

  private _gameRule: GameRule = DEFAULT_GAME_RULE

  constructor(sceneManager: SceneManager) {
    super(sceneManager)
    this.ui = sceneManager.engine.renderer.ui

    this.chunk = sceneManager.engine.world.getChunkXY(0, 0)
    this._createCheckerPattern()
    this._loadBoards()
    this._setupBoard('Arena')

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

  private _createCheckerPattern() {
    for (let i = 0; i < 31; i++) {
      for (let j = 0; j < 31; j++) {
        const tile = this.chunk.get(i, j)
        tile.glyph = ' '
        if (((i % 2) + j) % 2 === 0) {
          tile.style = 'odd'
        }
      }
    }
    this.chunk.dirty = true
    this.sceneManager.engine.renderer.invalidateChunks()
  }

  unload() {}

  openBoardConfigMenu() {
    const boardSelectElement = new UISelectElement([...this.boardMap.keys()], {
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

    boardSelectElement.onChange((selectId: number) => {
      if (selectId === -1) return
      this._setupBoard([...this.boardMap.keys()][selectId])
    })

    boardSelectElement.onSelect(() => {
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

  private _setupBoard(name: string) {
    const boardData = this.boardMap.get(name)

    if (!boardData) {
      //TODO print in DOM `Board "${name}" not found`
      return
    }

    const lines = boardData.split('\n')

    for (let y = 0; y < 31; y++) {
      const line = lines[y]?.replace('\r', '') ?? ''
      for (let x = 0; x < 31; x++) {
        const tile = this.chunk.get(x, y)
        tile.glyph = line[x] ?? ' '
      }
    }

    this.chunk.dirty = true
    this.sceneManager.engine.renderer.invalidateChunks()
  }
}

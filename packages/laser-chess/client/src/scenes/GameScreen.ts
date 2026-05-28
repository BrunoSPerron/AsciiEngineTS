import { Board } from '../Board'
import type { SceneManager } from '../SceneManager'
import type { BaseGameScene } from './BaseGameScene'

export class GameScreen implements BaseGameScene {
  sceneManager: SceneManager
  board: Board
  constructor(sceneManager: SceneManager, board: Board) {
    this.sceneManager = sceneManager
    this.board = board
  }
  unload(): void {
    throw new Error('Method not implemented.')
  }
}

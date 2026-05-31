import { type AsciiEngine } from 'ascii-game-engine'
import type { BaseGameScene } from './scenes/BaseGameScene'
import { MainMenu } from './scenes/MainMenu'
import { BoardConfig } from './scenes/BoardConfig'
import { Board } from './Board'
import { GameScreen } from './scenes/GameScreen'

export type NavigationData = {
  board?: Board
}

export class SceneManager {
  engine: AsciiEngine
  currentScreen: BaseGameScene

  constructor(engine: AsciiEngine) {
    this.engine = engine
    this.currentScreen = new MainMenu(this)
  }

  NavigateTo(screen: string, data: NavigationData | null = null) {
    if (data === null) data = {}
    this.currentScreen.unload()
    switch (screen) {
      case 'BoardConfig':
        this.currentScreen = new BoardConfig(this)
        break
      case 'Game': {
        const board = data.board ?? new Board(this.engine.world.getChunkXY(0, 0), this.engine)
        this.currentScreen = new GameScreen(this, board)
        break
      }
      case 'MainMenu':
      default:
        this.currentScreen = new MainMenu(this)
        break
    }
  }
}

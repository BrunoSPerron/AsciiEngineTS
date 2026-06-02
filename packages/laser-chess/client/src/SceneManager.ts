import { type AsciiEngine } from 'ascii-game-engine'
import type { BaseGameScene } from './scenes/BaseGameScene'
import { MainMenu } from './scenes/MainMenu'
import { BoardConfig } from './scenes/BoardConfig'
import { Board } from './Board'
import { GameScreen } from './scenes/GameScreen'

export type NavigationData = {
  board?: Board
}

export enum Scene {
  Game = 1,
  BoardConfig,
  MainMenu,
}

export class SceneManager {
  engine: AsciiEngine
  currentScreen: BaseGameScene

  constructor(engine: AsciiEngine) {
    this.engine = engine
    this.currentScreen = new MainMenu(this)
  }

  NavigateTo(screen: Scene, data: NavigationData | null = null) {
    if (data === null) data = {}
    this.currentScreen.unload()
    switch (screen) {
      case Scene.BoardConfig:
        this.currentScreen = new BoardConfig(this)
        break
      case Scene.Game: {
        const board = data.board ?? new Board(this.engine.world.getChunkXY(0, 0), this.engine)
        this.currentScreen = new GameScreen(this, board)
        break
      }
      case Scene.MainMenu:
      default:
        this.currentScreen = new MainMenu(this)
        break
    }
  }
}

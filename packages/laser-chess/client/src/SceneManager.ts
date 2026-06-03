import { type AsciiEngine } from 'ascii-game-engine'
import type { BaseGameScene } from './scenes/BaseGameScene'
import { MainMenu } from './scenes/MainMenu'
import { BoardConfig } from './scenes/BoardConfig'
import { Board } from './Board'
import { GameScreen } from './scenes/GameScreen'
import { Lobby } from './scenes/Lobby'
import { Room } from './scenes/Room'
import type { ServerConnection } from './net/ServerConnection'
import type { PlayerSummary, RoomSummary } from '@laser-chess/shared'

export type NavigationData = {
  board?: Board
  conn?: ServerConnection
  room?: RoomSummary
  players?: PlayerSummary[]
}

export enum Scene {
  Game = 1,
  BoardConfig,
  MainMenu,
  Lobby,
  Room,
}

export class SceneManager {
  engine: AsciiEngine
  currentScreen: BaseGameScene

  constructor(engine: AsciiEngine) {
    this.engine = engine
    this.currentScreen = new MainMenu(this)
  }

  NavigateTo(screen: Scene, data: NavigationData | null = null) {
    const d = data ?? {}
    this.currentScreen.unload()

    switch (screen) {
      case Scene.BoardConfig:
        this.currentScreen = new BoardConfig(this)
        break
      case Scene.Game: {
        const board = d.board ?? new Board(this.engine.world.getChunkXY(0, 0), this.engine)
        this.currentScreen = new GameScreen(this, board)
        break
      }
      case Scene.Lobby: {
        if (!d.conn) throw new Error('Scene.Lobby requires conn in NavigationData')
        this.currentScreen = new Lobby(this, d.conn)
        break
      }
      case Scene.Room: {
        if (!d.conn || !d.room || !d.players) {
          throw new Error('Scene.Room requires conn, room, and players in NavigationData')
        }
        this.currentScreen = new Room(this, d.conn, d.room, d.players)
        break
      }
      case Scene.MainMenu:
      default:
        this.currentScreen = new MainMenu(this)
        break
    }
  }
}

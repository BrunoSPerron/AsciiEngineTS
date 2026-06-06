import { type AsciiEngine } from 'ascii-game-engine'
import type { BaseGameScene } from './scenes/BaseGameScene'
import { MainMenu } from './scenes/MainMenu'
import { BoardConfig } from './scenes/BoardConfig'
import { GameScreen } from './scenes/GameScreen'
import { Lobby } from './scenes/Lobby'
import { Room } from './scenes/Room'
import { OnlineMatch } from './scenes/OnlineMatch'
import { buildBoardFromState } from './buildBoardFromState'
import type { ServerConnection } from './net/ServerConnection'
import type { PlayerSummary, RoomSummary, GameState } from '@laser-chess/shared'

export type NavigationData = {
  initialState?: GameState
  // Multiplayer — lobby / room
  conn?: ServerConnection
  room?: RoomSummary
  players?: PlayerSummary[]
  localPlayerId?: string
  // Online match
  myPlayer?: 1 | 2
}

export enum Scene {
  Game = 1,
  BoardConfig,
  MainMenu,
  Lobby,
  Room,
  OnlineMatch,
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
        if (!d.initialState) throw new Error('Scene.Game requires initialState in NavigationData')
        this.currentScreen = new GameScreen(this, d.initialState)
        break
      }

      case Scene.Lobby: {
        if (!d.conn) throw new Error('Scene.Lobby requires conn in NavigationData')
        this.currentScreen = new Lobby(this, d.conn)
        break
      }

      case Scene.MainMenu:
        this.currentScreen = new MainMenu(this)
        break

      case Scene.Room: {
        if (!d.conn || !d.room || !d.players || !d.localPlayerId) {
          throw new Error(
            'Scene.Room requires conn, room, players and localPlayerId in NavigationData',
          )
        }
        this.currentScreen = new Room(this, d.conn, d.room, d.players, d.localPlayerId)
        break
      }

      case Scene.OnlineMatch: {
        if (!d.conn || !d.initialState || !d.myPlayer) {
          throw new Error(
            'Scene.OnlineMatch requires conn, initialState and myPlayer in NavigationData',
          )
        }
        const board = buildBoardFromState(d.initialState, this.engine)
        this.currentScreen = new OnlineMatch(
          this,
          d.conn,
          board,
          d.initialState,
          d.myPlayer,
          d.players ?? [],
        )
        break
      }

      default:
        this.currentScreen = new MainMenu(this)
        break
    }
  }
}

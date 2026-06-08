import { EngineObject } from 'ascii-game-engine'
import type { SceneManager } from '../SceneManager'

export abstract class BaseGameScene extends EngineObject {
  sceneManager: SceneManager
  constructor(sceneManager: SceneManager) {
    super()
    this.sceneManager = sceneManager
    this._init(sceneManager.engine)
  }
  abstract unload(): void
}

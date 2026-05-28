import type { SceneManager } from '../SceneManager'

export abstract class BaseGameScene {
  sceneManager: SceneManager
  constructor(sceneManager: SceneManager) {
    this.sceneManager = sceneManager
  }
  abstract unload(): void
}

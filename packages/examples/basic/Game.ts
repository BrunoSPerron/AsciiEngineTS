import { type AsciiEngine, SelectMenu, Vector2 } from 'ascii-engine'
import { PlayerEntity } from './world/entities/PlayerEntity'

export class Game {
  private engine: AsciiEngine

  constructor(engine: AsciiEngine) {
    this.engine = engine
  }

  initialize() {
    this.setupMenu()
    this.spawnPlayer()
  }

  private setupMenu() {
    const escapeMenu = new SelectMenu(this.engine)

    escapeMenu.register('Option 1', () => {
      // TODO
    })

    escapeMenu.registerPaletteSelect()

    escapeMenu.register('Option 2', () => {
      // TODO
    })

    this.engine.inputManager.onKeyDown((e) => {
      if (e.key === 'Escape') {
        void escapeMenu.open()
      }
    })
  }

  private spawnPlayer() {
    const unit = this.engine.world.spawnEntity(new PlayerEntity('☺', new Vector2(20, 20), 80))
    this.engine.renderer.camera.target = unit
  }
}

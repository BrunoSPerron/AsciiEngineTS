import { type AsciiEngine, Menu } from 'ascii-engine'
import { PlayerUnit } from './world/entities/PlayerUnit'

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
    const menu = new Menu(this.engine.renderer)

    menu.register('Option 1', () => {
      // TODO
    })

    menu.registerPaletteSelect()

    menu.register('Option 2', () => {
      // TODO
    })

    this.engine.inputManager.onKeyDown((e) => {
      if (e.key === 'Escape') {
        void menu.open()
      }
    })
  }

  private spawnPlayer() {
    const unit = this.engine.world.spawnEntity(new PlayerUnit('☺', 20, 20, 80))

    this.engine.renderer.camera.target = unit
  }
}

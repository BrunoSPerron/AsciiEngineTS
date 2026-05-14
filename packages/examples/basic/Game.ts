import { type AsciiEngine, Menu, Vector2 } from 'ascii-engine'
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
        void this.openPauseMenu(menu)
      }
    })
  }

  private async openPauseMenu(menu: Menu) {
    this.engine.pause()
    await menu.open()
    this.engine.unpause()
  }

  private spawnPlayer() {
    const unit = this.engine.world.spawnEntity(new PlayerEntity('☺', new Vector2(20, 20), 80))
    this.engine.renderer.camera.target = unit
  }
}

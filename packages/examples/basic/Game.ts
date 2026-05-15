import { type AsciiEngine, SelectMenu, GridVector } from 'ascii-engine'
import { PlayerEntity } from './world/entities/PlayerEntity'

export class Game {
  private engine: AsciiEngine

  private _escapeMenu: SelectMenu

  constructor(engine: AsciiEngine) {
    this.engine = engine
    this._escapeMenu = new SelectMenu(this.engine)
  }

  initialize() {
    this.setupMenu()
    this.spawnPlayer()
  }

  private setupMenu() {
    this._escapeMenu.register('Option 1', () => {
      // TODO
    })

    this._escapeMenu.registerPaletteSelect()

    this._escapeMenu.register('Option 2', () => {
      // TODO
    })

    this.engine.inputManager.onKeyDown((e) => {
      if (e.key === 'Escape') {
        void this._escapeMenu.open()
      }
    })
  }

  private spawnPlayer() {
    const unit = this.engine.world.spawnEntity(new PlayerEntity('☺', new GridVector(20, 20), 80))
    this.engine.renderer.camera.target = unit
  }
}

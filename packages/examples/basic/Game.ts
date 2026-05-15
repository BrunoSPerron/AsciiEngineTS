import { type AsciiEngine, SelectMenu, GridVector } from 'ascii-engine'
import { ActionHero } from './world/entities/ActionHero'

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

    this.engine.actionManager.onActionKeyDown((action) => {
      if (action === 'pause') {
        void this._escapeMenu.open()
      }
    })
  }

  private spawnPlayer() {
    const unit = this.engine.world.spawnEntity(new ActionHero('☺', new GridVector(20, 20), 80))
    this.engine.renderer.camera.target = unit
  }
}

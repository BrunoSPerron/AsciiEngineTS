import { type AsciiEngine, GridVector, CHUNK_SIZE, UILayoutElement } from 'ascii-engine'
import { ActionHero } from './world/entities/ActionHero'

export class Game {
  private engine: AsciiEngine

  constructor(engine: AsciiEngine) {
    this.engine = engine
  }

  init() {
    this.setupWorld()
    this.spawnPlayer()
    this.bindGameControl()
  }

  private bindGameControl() {
    this.engine.actionManager.onActionKeyDown((action) => {
      switch (action) {
        case 'menu_test':
          {
            const uiEl = new UILayoutElement()
            this.engine.renderer.ui.addElement(uiEl, {
              w: 45,
              h: 10,
              xPercent: 50,
              yPercent: 100,
              minH: 5,
            })
          }
          break
        default:
          break
      }
    })
  }

  /*
  Waiting for refactor
  private setupEscapeMenu() {
    this._escapeMenu.register('Option 1', () => {
      // TODO
    })

    this._escapeMenu.registerPaletteSelect()

    this._escapeMenu.register('Option 2', () => {
      // TODO
    })
  }

  private setupUi() {
    this.setupEscapeMenu()
  }
  */

  private setupWorld() {
    this.engine.world.setChunkGenerator((_cx, _cy, chunk) => {
      for (let y = 0; y < CHUNK_SIZE; y++) {
        for (let x = 0; x < CHUNK_SIZE; x++) {
          const edge = x < 2 || y < 2 || x >= CHUNK_SIZE - 2 || y >= CHUNK_SIZE - 2
          if (
            edge &&
            !(
              (y > CHUNK_SIZE / 2 - 3 && y < CHUNK_SIZE / 2 + 2) ||
              (x > CHUNK_SIZE / 2 - 3 && x < CHUNK_SIZE / 2 + 2)
            )
          ) {
            const tile = chunk.get(x, y)
            tile.glyph = '#'
            tile.solid = true
          }
        }
      }
    })
  }

  private spawnPlayer() {
    const unit = this.engine.world.spawnEntity(new ActionHero('☺', new GridVector(20, 20), 80))
    this.engine.renderer.camera.target = unit
  }
}

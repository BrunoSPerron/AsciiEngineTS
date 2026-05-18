import { type AsciiEngine, SelectMenu, GridVector, CHUNK_SIZE } from 'ascii-engine'
import { ActionHero } from './world/entities/ActionHero'

export class Game {
  private engine: AsciiEngine

  private _escapeMenu: SelectMenu

  constructor(engine: AsciiEngine) {
    this.engine = engine
    this._escapeMenu = new SelectMenu(this.engine)
  }

  init() {
    this.setupUi()
    this.setupWorld()
    this.spawnPlayer()
    this.bindGameControl()
  }

  private bindGameControl() {
    this.engine.actionManager.onActionKeyDown((action) => {
      switch (action) {
        case 'pause':
          void this._escapeMenu.open()
          break
        case 'menu_test':
          //UILayout test
          const uiLayout = this.engine.renderer.uiLayer!.uiLayout
          uiLayout.createElement({
            y: 0,
            w: 45,
            h: 10,
            xPercent: 50,
            yPercent: 100,
            minH: 5,
            minW: 5,
          })
          break
        default:
          break
      }
    })
  }

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

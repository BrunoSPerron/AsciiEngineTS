import { type AsciiEngine, GridVector, CHUNK_SIZE, UISelectElement } from 'ascii-engine'
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
    this.engine.actionManager.onActionKeyDown((action) => this.processActionDown(action))
  }

  private processActionDown(action: string) {
    switch (action) {
      case 'pause':
        this.openEscapeMenu()
        break
      default:
        break
    }
  }

  private openEscapeMenu() {
    const options = [
      'Palette',
      'Option b',
      'Option c',
      'Option d',
      'Option e',
      'Option f',
      'Option g',
    ]
    const selectEl = new UISelectElement(options)
    this.engine.renderer.ui.addElement(selectEl, {
      w: 60,
      h: 9,
      anchorX: 50,
      anchorY: 100,
      pivotX: 50,
      pivotY: 100,
      maxHPercent: 25,
      minH: 1,
      minW: 1,
    })
    selectEl.onSelect((selectId: number) => {
      if (options[selectId] === 'Palette') {
        this.engine.renderer.ui.addPaletteElement({
          w: 30,
          h: 5,
          anchorX: 20,
          anchorY: 20,
          maxHPercent: 25,
          minH: 1,
          minW: 12,
        })
      }
    })
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

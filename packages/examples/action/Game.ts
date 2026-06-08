import type { AsciiEngine, Chunk } from 'ascii-game-engine'
import { GridVector, CHUNK_SIZE, UISelectNode, UITextBox } from 'ascii-game-engine'
import { ActionHero } from './world/entities/ActionHero'

export class Game {
  private engine: AsciiEngine

  private _player!: ActionHero

  constructor(engine: AsciiEngine) {
    this.engine = engine
  }

  init() {
    this.setupWorld()
    this.spawnPlayer()
    this.bindGameControl()
    //this._testZones()
  }

  private bindGameControl() {
    this.engine.actionManager.onActionKeyDown((action) => this.processActionDown(action))
  }

  private processActionDown(action: string) {
    switch (action) {
      case 'speak':
        this._speak()
        break
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
    const selectEl = new UISelectNode(options)
    this.engine.renderer.ui.addElement(selectEl, {
      x: 0,
      y: 0,
      w: 20,
      h: options.length,
      maxWPercent: 25,
      anchorX: 100,
      anchorY: 100,
      pivotX: 100,
      pivotY: 50,
      minH: 1,
      minW: 1,
      dock: 'right',
    })
    selectEl.on('select', (selectId) => {
      if (options[Number(selectId)] === 'Palette') {
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
    this.engine.world.setChunkGenerator(this.generateChunk.bind(this))
  }

  private generateChunk(_cx: number, _cy: number, chunk: Chunk) {
    for (let y = 0; y < CHUNK_SIZE; y++) {
      for (let x = 0; x < CHUNK_SIZE; x++) {
        const edge = x < 4 || y < 4 || x >= CHUNK_SIZE - 3 || y >= CHUNK_SIZE - 3
        if (edge && !(y === 16 || x === 16)) {
          const tile = chunk.get(x, y)
          tile.glyph = '#'
          tile.solid = true
        }
      }
    }
  }

  private spawnPlayer() {
    this._player = this.engine.world.spawnEntity(new ActionHero('☺', new GridVector(20, 20), 80))
    this.engine.renderer.camera.target = this._player
  }

  private _speak() {
    const bubble = new UITextBox(['Time to kick ass and chew bubblegum'])
    const remove = this.engine.renderer.ui.world.addToEntity(
      bubble,
      { w: 38, h: 1 },
      this._player,
      0,
      -1,
    )

    setTimeout(() => remove(), 5000)
  }
}

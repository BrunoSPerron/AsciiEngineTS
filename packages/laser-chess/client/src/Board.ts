import type { AsciiEngine} from 'ascii-game-engine';
import { CHUNK_SIZE, GridVector, type Chunk, type Tile } from 'ascii-game-engine'
import { MOVE_TYPE, Pawn, PAWN_TYPE } from './entities/Pawn'

export class Board {
  private _chunk: Chunk
  private _size = new GridVector(31, 31)

  playerOneUnits: Pawn[]
  playerTwoUnits: Pawn[]

  engine: AsciiEngine

  constructor(chunk: Chunk, engine: AsciiEngine) {
    this.engine = engine
    this._chunk = chunk

    this.playerOneUnits = []
    this.playerTwoUnits = []
    this._prepareForGame()
    this._setBorderLoopShare()
  }

  get size(): GridVector {
    return this._size
  }

  /**
   * Remove entity code from the background and create them.
   * Entity codes (uses lowercase for player 2):
   *  'K' = King
   *  '\', '/' = Fixed mirror
   */
  private _prepareForGame() {
    for (let x = 0; x < 31; x++) {
      for (let y = 0; y < 31; y++) {
        const tile = this._chunk.get(x, y)
        switch (tile.glyph) {
          case 'K':
            this._createEntityFromTile(tile, x, y, true)
            break
          case 'k':
            this._createEntityFromTile(tile, x, y, false)
            break
          case '#':
            tile.solid = true
            break
          case '/':
          case '\\':
            tile.solid = true
            tile.style = 'fixed'
            break
          default:
            break
        }
      }
    }
    this.refresh()
  }

  tile(x: number, y: number): Tile {
    return this._chunk.get(x, y) ?? { glyph: ' ', solid: false }
  }

  private _createEntityFromTile(tile: Tile, x: number, y: number, _isPlayerOne: boolean) {
    const entity = new Pawn(PAWN_TYPE.KING, new GridVector(x, y), _isPlayerOne, MOVE_TYPE.KING)
    if (_isPlayerOne) this.playerOneUnits.push(entity)
    else this.playerTwoUnits.push(entity)
    this.engine.world.spawnEntity(entity)
    tile.glyph = ' '
  }

  getOccupied(x: number | GridVector, y: number = 0): Tile | Pawn | null {
    if (x instanceof GridVector) {
      y = x.y
      x = x.x
    }
    if (this.tile(x, y).solid) return this.tile(x, y)
    const pawn = [...this.playerOneUnits, ...this.playerTwoUnits].find((pawn) => {
      return pawn.pos.x === x && pawn.pos.y === y
    })
    return pawn ?? null
  }

  refresh() {
    this._chunk.dirty = true
    this.engine.renderer.invalidateChunks()
  }

  private _setBorderLoopShare() {
    for (let x = 0; x < this.size.x; x++) {
      this._chunk.tiles[(this.size.y - 1) * CHUNK_SIZE + x] = this._chunk.get(x, 0)
    }
    for (let y = 0; y < this.size.y; y++) {
      this._chunk.tiles[y * CHUNK_SIZE + this.size.x - 1] = this._chunk.get(0, y)
    }
  }

  private _uncoupleBorderLoop() {
    for (let x = 0; x < this.size.x; x++) {
      this._chunk.tiles[(this.size.y - 1) * CHUNK_SIZE + x] = { glyph: ' ', solid: false }
    }
    for (let y = 0; y < this.size.y; y++) {
      this._chunk.tiles[y * CHUNK_SIZE + this.size.x - 1] = { glyph: ' ', solid: false }
    }
  }

  clear() {
    for (const e of this.playerOneUnits) this.engine.world.extractEntity(e.uid)
    for (const e of this.playerTwoUnits) this.engine.world.extractEntity(e.uid)
    this.playerOneUnits.length = 0
    this.playerTwoUnits.length = 0

    for (let x = 0; x < this._size.x; x++) {
      for (let y = 0; y < this._size.y; y++) {
        const tile = this._chunk.get(x, y)
        tile.glyph = ' '
        tile.solid = false
        tile.style = void 0
      }
    }
    this._uncoupleBorderLoop()
    this.refresh()
  }
}

import type { AsciiEngine } from 'ascii-game-engine'
import { GridVector, type Chunk, type Tile } from 'ascii-game-engine'
import type { Pawn } from './entities/Pawn'

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
  }

  get size(): GridVector {
    return this._size
  }

  tile(x: number, y: number): Tile {
    return this._chunk.get(x, y) ?? { glyph: ' ', solid: false }
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
    this.refresh()
  }
}

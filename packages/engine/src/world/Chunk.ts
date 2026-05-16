import type { Tile } from './Tile'

export const CHUNK_SIZE = 32

export class Chunk {
  cx: number
  cy: number
  tiles: Tile[]
  entities: Set<number> = new Set()
  dirty = true

  constructor(cx: number, cy: number) {
    this.cx = cx
    this.cy = cy
    this.tiles = new Array<Tile>(CHUNK_SIZE * CHUNK_SIZE)

    for (let i = 0; i < CHUNK_SIZE * CHUNK_SIZE; i++) {
      this.tiles[i] = { glyph: ' ', solid: false }
    }
  }

  get(localX: number, localY: number) {
    return this.tiles[localY * CHUNK_SIZE + localX]
  }
}

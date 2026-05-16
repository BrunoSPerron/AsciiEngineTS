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

    for (let y = 0; y < CHUNK_SIZE; y++) {
      for (let x = 0; x < CHUNK_SIZE; x++) {
        const i = y * CHUNK_SIZE + x
        const edge = x < 2 || y < 2 || x > CHUNK_SIZE - 3 || y > CHUNK_SIZE - 3
        this.tiles[i] = {
          glyph: edge ? '#' : ' ',
          solid: edge,
          style: edge ? 'wall' : undefined,
        }
      }
    }
  }

  get(localX: number, localY: number) {
    return this.tiles[localY * CHUNK_SIZE + localX]
  }
}

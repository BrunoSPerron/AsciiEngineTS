import { STEP } from "../core/Engine"
import { Chunk, CHUNK_SIZE } from "./Chunk"
import { Entity } from "./Entities/Entity"

export class LocalWorld {
  chunks = new Map<string, Chunk>()
  entities = new Map<number, Entity>()

  private nextId = 1

  extractEntity(id: number) {
    const entity = this.entities[id]
    delete this.entities[id]
    return entity
  }

  getChunk(cx: number, cy: number) {
    const key = `${cx},${cy}`

    let chunk = this.chunks.get(key)

    if (!chunk) {
      chunk = new Chunk(cx, cy)
      this.chunks.set(key, chunk)
    }

    return chunk
  }

  getTile(wx: number, wy: number) {
    const cx = Math.floor(wx / CHUNK_SIZE)
    const cy = Math.floor(wy / CHUNK_SIZE)

    const lx = wx % CHUNK_SIZE
    const ly = wy % CHUNK_SIZE

    return this.getChunk(cx, cy).get(lx, ly)
  }

  spawnBaseEntity(glyph: string, x: number, y: number) {
    const entity = new Entity(this.nextId++, glyph, x, y)
    this.entities.set(entity.id, entity)
    return entity
  }

  spawnEntity(entity: Entity) {
    if (entity.id === -1)
      entity.id = this.nextId++
    this.entities.set(entity.id, entity)
  }

  update() {
    for (const e of this.entities.values()) {
      e.nextAction -= STEP
      while (e.nextAction < 0) {
        e.nextAction += e.act(this)
      }
    }
  }
}
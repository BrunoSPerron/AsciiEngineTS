import { ChunkRecord } from "./ChunkRecord"
import { Entity } from "./Entities/Entity"
import type { Region } from "./Region"

export class GlobalWorld {
  regions = new Map<string, Region>()
  chunksRecords = new Map<string, ChunkRecord>
  entities = new Map<number, Entity>()

  private nextId = 1

  getChunkRecord(cx: number, cy: number) {
    const key = `${cx},${cy}`

    let chunk = this.chunksRecords.get(key)

    if (!chunk) {
      chunk = new ChunkRecord(cx, cy)
      this.chunksRecords.set(key, chunk)
    }

    return chunk
  }


  spawnBaseEntity(glyph: string, x: number, y: number) {
    const entity = new Entity(glyph, x, y)
    entity.uid = this.nextId++
    this.entities.set(entity.uid, entity)
    return entity
  }

  spawnEntity(entity: Entity) {
    if (entity.uid === -1)
      entity.uid = this.nextId++
    this.entities.set(entity.uid, entity)
  }

  update() {

  }
}
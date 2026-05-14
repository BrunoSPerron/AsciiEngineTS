import { Chunk, CHUNK_SIZE } from './Chunk'
import { ChunkRecord } from './ChunkRecord'
import type { Entity } from './entities/Entity'
import type { Region } from './Region'
import type { AsciiEngine } from '../core/Engine'

// ---------------------------------------------------------------------------
// Namespaced state containers — plain data, no behavior
// ---------------------------------------------------------------------------

export type LocalState = {
  chunks: Map<string, Chunk>
  entities: Map<number, Entity>
}

export type GlobalState = {
  chunkRecords: Map<string, ChunkRecord>
  entities: Map<number, Entity>

  // TODO: Named regions grouping chunks into logical areas. Populated during world generation.
  regions: Map<string, Region>
}

// ---------------------------------------------------------------------------
// World
// ---------------------------------------------------------------------------

type EntityHandler = (entity: Entity) => void

export class World {
  readonly local: LocalState = {
    chunks: new Map(),
    entities: new Map(),
  }

  readonly global: GlobalState = {
    chunkRecords: new Map(),
    entities: new Map(),
    regions: new Map(),
  }

  private nextId = 1
  private engine: AsciiEngine

  private _spawnListeners = new Set<EntityHandler>()
  private _despawnListeners = new Set<EntityHandler>()

  constructor(engine: AsciiEngine) {
    this.engine = engine
  }

  // --------------------------------------------------------------------------
  // Spawn / despawn listeners
  // --------------------------------------------------------------------------

  onSpawn = (fn: EntityHandler): (() => void) => {
    this._spawnListeners.add(fn)
    return () => this._spawnListeners.delete(fn)
  }

  onDespawn = (fn: EntityHandler): (() => void) => {
    this._despawnListeners.add(fn)
    return () => this._despawnListeners.delete(fn)
  }

  // --------------------------------------------------------------------------
  // Entity lifecycle
  // --------------------------------------------------------------------------

  spawnEntity<T extends Entity>(entity: T): T {
    if (entity.uid === -1) entity.uid = this.nextId++
    this.local.entities.set(entity.uid, entity)

    // Register entity into its starting chunk
    const startChunk = this.getChunk(
      Math.floor(entity.x / CHUNK_SIZE),
      Math.floor(entity.y / CHUNK_SIZE),
    )
    startChunk.entities.add(entity.uid)

    // Keep chunk sets in sync as entity moves
    entity.onMove((e) => this._onEntityMove(e))

    entity.OnLoad()
    for (const fn of this._spawnListeners) fn(entity)
    entity.scheduleFirst(this.engine)
    return entity
  }

  extractEntity(id: number): Entity | undefined {
    const entity = this.local.entities.get(id)
    if (!entity) return undefined

    entity.unschedule()
    this.local.entities.delete(id)

    const chunk = this._chunkForEntity(entity)
    chunk?.entities.delete(id)

    for (const fn of this._despawnListeners) fn(entity)
    return entity
  }

  // --------------------------------------------------------------------------
  // Chunk access
  // --------------------------------------------------------------------------

  getChunk(cx: number, cy: number): Chunk {
    const key = `${cx},${cy}`
    let chunk = this.local.chunks.get(key)
    if (!chunk) {
      chunk = new Chunk(cx, cy)
      this.local.chunks.set(key, chunk)
    }
    return chunk
  }

  getChunkRecord(cx: number, cy: number): ChunkRecord {
    const key = `${cx},${cy}`
    let record = this.global.chunkRecords.get(key)
    if (!record) {
      record = new ChunkRecord(cx, cy)
      this.global.chunkRecords.set(key, record)
    }
    return record
  }

  getTile(wx: number, wy: number) {
    const cx = Math.floor(wx / CHUNK_SIZE)
    const cy = Math.floor(wy / CHUNK_SIZE)
    const lx = ((wx % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE
    const ly = ((wy % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE
    return this.getChunk(cx, cy).get(lx, ly)
  }

  // --------------------------------------------------------------------------
  // Spatial queries
  // --------------------------------------------------------------------------

  getEntitiesNearChunk(cx: number, cy: number, radius: number): Entity[] {
    const result: Entity[] = []
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const chunk = this.local.chunks.get(`${cx + dx},${cy + dy}`)
        if (!chunk) continue
        for (const id of chunk.entities) {
          const entity = this.local.entities.get(id)
          if (entity) result.push(entity)
        }
      }
    }
    return result
  }

  getEntitiesNearPosition(wx: number, wy: number, radius: number): Entity[] {
    const chunkRadius = Math.ceil(radius / CHUNK_SIZE)
    const cx = Math.floor(wx / CHUNK_SIZE)
    const cy = Math.floor(wy / CHUNK_SIZE)
    return this.getEntitiesNearChunk(cx, cy, chunkRadius).filter(
      (e) => Math.abs(e.x - wx) <= radius && Math.abs(e.y - wy) <= radius,
    )
  }

  // --------------------------------------------------------------------------
  // Active chunk coordination (TODO: wire to camera)
  // --------------------------------------------------------------------------

  updateActiveChunks(_cx: number, _cy: number, _viewDistance: number): void {
    // TODO: load/unload chunks based on camera position
  }

  // --------------------------------------------------------------------------
  // Private helpers
  // --------------------------------------------------------------------------

  private _onEntityMove(entity: Entity) {
    const oldCx = Math.floor(entity.prevX / CHUNK_SIZE)
    const oldCy = Math.floor(entity.prevY / CHUNK_SIZE)
    const newCx = Math.floor(entity.x / CHUNK_SIZE)
    const newCy = Math.floor(entity.y / CHUNK_SIZE)
    if (oldCx === newCx && oldCy === newCy) return
    this.local.chunks.get(`${oldCx},${oldCy}`)?.entities.delete(entity.uid)
    this.local.chunks.get(`${newCx},${newCy}`)?.entities.add(entity.uid)
  }

  private _chunkForEntity(entity: Entity): Chunk | undefined {
    const cx = Math.floor(entity.x / CHUNK_SIZE)
    const cy = Math.floor(entity.y / CHUNK_SIZE)
    return this.local.chunks.get(`${cx},${cy}`)
  }
}

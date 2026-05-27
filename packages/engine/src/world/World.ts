import { Chunk, CHUNK_SIZE } from './Chunk'
import { ChunkRecord } from './ChunkRecord'
import type { Entity } from './entities/Entity'
import type { Region } from './Region'
import type { AsciiEngine } from '../core/Engine'
import type { GridVector } from '../math/GridVector'

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

export type ChunkGenerator = (cx: number, cy: number, chunk: Chunk) => void

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

  private _chunkGenerator: ChunkGenerator | null = null

  private _spawnListeners = new Set<EntityHandler>()
  private _despawnListeners = new Set<EntityHandler>()
  private _moveUnlisteners = new Map<number, () => void>()
  private _chunkChangeListeners = new Set<(cx: number, cy: number) => void>()

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
    const startChunk = this.getChunkXY(
      Math.floor(entity.pos.x / CHUNK_SIZE),
      Math.floor(entity.pos.y / CHUNK_SIZE),
    )
    startChunk.entities.add(entity.uid)

    // Keep chunk sets in sync as entity moves
    const unlistenMove = entity.onMove((e) => this._entityMoved(e))
    this._moveUnlisteners.set(entity.uid, unlistenMove)

    entity.engine = this.engine
    entity.scheduleFirst()
    queueMicrotask(() => {
      entity.loaded()
    })
    for (const fn of this._spawnListeners) fn(entity)
    return entity
  }

  extractEntity(id: number): Entity | undefined {
    const entity = this.local.entities.get(id)
    if (!entity) return undefined

    entity.unschedule()

    this._moveUnlisteners.get(id)?.()
    this._moveUnlisteners.delete(id)

    this.local.entities.delete(id)

    const chunk = this._chunkForEntity(entity)
    chunk?.entities.delete(id)

    for (const fn of this._despawnListeners) fn(entity)
    return entity
  }

  // --------------------------------------------------------------------------
  // Chunk access
  // --------------------------------------------------------------------------

  getChunkXY(cx: number, cy: number): Chunk {
    const key = `${cx},${cy}`
    let chunk = this.local.chunks.get(key)
    if (!chunk) {
      chunk = new Chunk(cx, cy)
      this._chunkGenerator?.(cx, cy, chunk)
      this.local.chunks.set(key, chunk)
    }
    return chunk
  }

  getChunkXYRecord(cx: number, cy: number): ChunkRecord {
    const key = `${cx},${cy}`
    let record = this.global.chunkRecords.get(key)
    if (!record) {
      record = new ChunkRecord(cx, cy)
      this.global.chunkRecords.set(key, record)
    }
    return record
  }

  getTile(pos: GridVector) {
    return this.getTileXY(pos.x, pos.y)
  }

  getTileXY(wx: number, wy: number) {
    const cx = Math.floor(wx / CHUNK_SIZE)
    const cy = Math.floor(wy / CHUNK_SIZE)
    const lx = ((wx % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE
    const ly = ((wy % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE
    return this.getChunkXY(cx, cy).get(lx, ly)
  }

  setTilesStyle(style: string, positions: Array<[number, number]>): void {
    const dirtyChunks = new Set<Chunk>()

    for (const [wx, wy] of positions) {
      const cx = Math.floor(wx / CHUNK_SIZE)
      const cy = Math.floor(wy / CHUNK_SIZE)
      const lx = ((wx % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE
      const ly = ((wy % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE
      const chunk = this.getChunkXY(cx, cy)
      chunk.get(lx, ly).style = style
      dirtyChunks.add(chunk)
    }

    for (const chunk of dirtyChunks) chunk.dirty = true
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
      // TODO improve GridVector class to simplify this
      (e) => Math.abs(e.pos.x - wx) <= radius && Math.abs(e.pos.y - wy) <= radius,
    )
  }

  // --------------------------------------------------------------------------
  // chunk coordination
  // --------------------------------------------------------------------------

  setChunkGenerator(fn: ChunkGenerator): void {
    this._chunkGenerator = fn
  }

  onChunkChange = (fn: (cx: number, cy: number) => void): (() => void) => {
    this._chunkChangeListeners.add(fn)
    return () => this._chunkChangeListeners.delete(fn)
  }

  updateActiveChunks(cx: number, cy: number, viewDistance: number): void {
    const desired = new Set<string>()
    for (let dy = -viewDistance; dy <= viewDistance; dy++) {
      for (let dx = -viewDistance; dx <= viewDistance; dx++) {
        desired.add(`${cx + dx},${cy + dy}`)
      }
    }

    for (const key of desired) {
      if (!this.local.chunks.has(key)) {
        const [cxStr, cyStr] = key.split(',')
        this.getChunkXY(Number(cxStr), Number(cyStr))
      }
    }

    for (const [key, chunk] of this.local.chunks) {
      if (desired.has(key)) continue
      for (const uid of [...chunk.entities]) {
        this.extractEntity(uid)
      }
      this.local.chunks.delete(key)
    }
  }

  // --------------------------------------------------------------------------
  // Private helpers
  // --------------------------------------------------------------------------

  private _entityMoved(entity: Entity) {
    const oldCx = Math.floor(entity.previousPos.x / CHUNK_SIZE)
    const oldCy = Math.floor(entity.previousPos.y / CHUNK_SIZE)
    const newCx = Math.floor(entity.pos.x / CHUNK_SIZE)
    const newCy = Math.floor(entity.pos.y / CHUNK_SIZE)
    if (oldCx === newCx && oldCy === newCy) return
    this.local.chunks.get(`${oldCx},${oldCy}`)?.entities.delete(entity.uid)
    this.local.chunks.get(`${newCx},${newCy}`)?.entities.add(entity.uid)
    for (const fn of this._chunkChangeListeners) fn(newCx, newCy)
  }

  private _chunkForEntity(entity: Entity): Chunk | undefined {
    const cx = Math.floor(entity.pos.x / CHUNK_SIZE)
    const cy = Math.floor(entity.pos.y / CHUNK_SIZE)
    return this.local.chunks.get(`${cx},${cy}`)
  }
}

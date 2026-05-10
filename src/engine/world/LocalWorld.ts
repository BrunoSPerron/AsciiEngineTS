import type { AsciiEngine } from '../core/Engine'
import { Chunk, CHUNK_SIZE } from './Chunk'
import { Entity } from './entities/Entity'

type EntityHandler = (entity: Entity) => void

export class LocalWorld {
  chunks = new Map<string, Chunk>()
  entities = new Map<number, Entity>()

  private nextId = 1
  private engine: AsciiEngine | null = null

  private _spawnListeners: Set<EntityHandler> = new Set()
  private _despawnListeners: Set<EntityHandler> = new Set()

  onSpawn(handler: EntityHandler): () => void {
    this._spawnListeners.add(handler)
    return () => this._spawnListeners.delete(handler)
  }

  onDespawn(handler: EntityHandler): () => void {
    this._despawnListeners.add(handler)
    return () => this._despawnListeners.delete(handler)
  }

  /**
   * Called once by the engine after construction so entities can
   * self-schedule without a circular constructor dependency.
   */
  bind(engine: AsciiEngine) {
    this.engine = engine
  }

  extractEntity(id: number): Entity | undefined {
    const entity = this.entities.get(id)
    if (!entity) return undefined
    entity.unschedule()
    this.entities.delete(id)
    for (const fn of this._despawnListeners) fn(entity)
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

  spawnBaseEntity(glyph: string, x: number, y: number): Entity {
    const entity = new Entity(glyph, x, y)
    return this.spawnEntity(entity)
  }

  spawnEntity<T extends Entity>(entity: T): T {
    if (entity.uid === -1) entity.uid = this.nextId++
    this.entities.set(entity.uid, entity)
    entity.OnLoad()
    for (const fn of this._spawnListeners) fn(entity)
    if (this.engine) entity.scheduleFirst(this.engine)
    return entity
  }
}

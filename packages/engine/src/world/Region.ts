import type { ChunkRecord } from './ChunkRecord'

/**
 * A Region is a fuzzy grouping of chunks — think "the forest", "the dungeon", "the town".
 * Regions are not grid-aligned; their boundaries are defined by which ChunkRecords they contain.
 *
 * Responsibilities (planned):
 * - Own a set of ChunkRecords (loaded or unloaded)
 * - Know neighboring Regions
 * - Serve as the unit for bulk load/unload decisions beyond chunk_view_distance
 * - Eventually carry per-region metadata: name, ambient rules, generation seed overrides
 *
 * TODO: wire into World.updateActiveChunks — when a player approaches a region boundary,
 * the neighboring region can begin pre-loading its ChunkRecords.
 */
export class Region {
  name: string
  chunks: Set<ChunkRecord> = new Set()
  neighbors: Set<Region> = new Set()

  constructor(name: string) {
    this.name = name
  }

  addChunk(record: ChunkRecord) {
    this.chunks.add(record)
  }

  addNeighbor(region: Region) {
    this.neighbors.add(region)
    region.neighbors.add(this) // bidirectional
  }
}

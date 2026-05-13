import type { Region } from './Region'

/**
 * Persistent record for a chunk that exists in GlobalState.
 * Lives whether or not the chunk is currently loaded into LocalState.
 *
 * TODO: dormant entity storage — entities extracted from LocalState on
 * chunk unload are serialized here and rehydrated on load.
 */
export class ChunkRecord {
  cx: number
  cy: number

  /** The region this chunk belongs to. Assigned during world generation. */
  region: Region | null = null

  constructor(cx: number, cy: number) {
    this.cx = cx
    this.cy = cy
  }
}

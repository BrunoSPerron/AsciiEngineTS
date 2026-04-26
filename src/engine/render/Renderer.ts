import { CHUNK_SIZE } from "../world/Chunk"
import { LocalWorld } from "../world/LocalWorld"
import { Camera } from "./Camera"
import { Stylizer } from "./Stylizer"

export const TILE_W = 10
export const TILE_H = 18

const PALETTE = "copper_caves"

export class Renderer {
  root: HTMLElement

  camera: Camera
  stylizer: Stylizer = new Stylizer()

  bg: HTMLDivElement
  actors: HTMLDivElement
  ui: HTMLDivElement

  actorEls = new Map<number, HTMLDivElement>()
  chunkEls = new Map<string, HTMLPreElement>()

  constructor(root: HTMLElement, camera: Camera) {
    this.root = root
    this.stylizer.setStyleOn(root, PALETTE)
    this.camera = camera

    this.bg = this.makeLayer()
    this.actors = this.makeLayer()
    this.ui = this.makeLayer()
  }

  private makeLayer() {
    const el = document.createElement("div")
    el.className = "layer"
    this.root.appendChild(el)
    return el
  }

  render(world: LocalWorld, deltaTime: number): Array<number> {
    this.camera.update(deltaTime)

    const visibleChunks = this.renderChunks(world, this.camera)
    return this.renderActors(world, this.camera, visibleChunks)
  }

  /**
   * Renders visible chunks and removes stale chunk elements.
   * Returns visible chunk keys for actor culling.
   */
  private renderChunks(world: LocalWorld, camera: Camera): Set<string> {
    const left = Math.floor(camera.x / CHUNK_SIZE) - 1
    const top = Math.floor(camera.y / CHUNK_SIZE) - 1
    const right = left + 6
    const bottom = top + 4

    const visible = new Set<string>()

    for (let cy = top; cy <= bottom; cy++) {
      for (let cx = left; cx <= right; cx++) {
        const key = `${cx},${cy}`
        visible.add(key)

        const chunk = world.getChunk(cx, cy)

        let el = this.chunkEls.get(key)

        if (!el) {
          el = document.createElement("pre")
          el.className = "chunk"
          this.bg.appendChild(el)
          this.chunkEls.set(key, el)
          chunk.dirty = true
        }

        if (chunk.dirty) {
          let text = ""

          for (let y = 0; y < CHUNK_SIZE; y++) {
            for (let x = 0; x < CHUNK_SIZE; x++) {
              text += chunk.get(x, y).glyph
            }

            text += "\n"
          }

          el.textContent = text
          chunk.dirty = false
        }

        el.style.transform = `translate(
          ${cx * CHUNK_SIZE * TILE_W - camera.x * TILE_W}px,
          ${cy * CHUNK_SIZE * TILE_H - camera.y * TILE_H}px
        )`
      }
    }

    // Remove unmanaged chunk nodes
    for (const [key, el] of this.chunkEls) {
      if (!visible.has(key)) {
        el.remove()
        this.chunkEls.delete(key)
      }
    }

    return visible
  }

  /**
   * Renders actors inside visible chunks only.
   * Removes stale / offscreen actor nodes.
   *
   * @returns removed entity ids
   */
  private renderActors(
    world: LocalWorld,
    camera: Camera,
    visibleChunks: Set<string>
  ): Array<number> {
    const removed: number[] = []
    const seen = new Set<number>()

    for (const entity of world.entities.values()) {
      const pos = entity.visualPosition

      const cx = Math.floor(pos[0] / CHUNK_SIZE)
      const cy = Math.floor(pos[1] / CHUNK_SIZE)
      const key = `${cx},${cy}`

      if (!visibleChunks.has(key)) {
        const existing = this.actorEls.get(entity.id)

        if (existing) {
          existing.remove()
          this.actorEls.delete(entity.id)
          removed.push(entity.id)
        }

        continue
      }

      seen.add(entity.id)

      let el = this.actorEls.get(entity.id)

      if (!el) {
        el = document.createElement("div")
        el.className = "actor"
        el.textContent = entity.glyph

        this.actors.appendChild(el)
        this.actorEls.set(entity.id, el)

        this.stylizer.setStyleOn(el, PALETTE)
      }

      el.style.transform = `translate(
        ${pos[0] * TILE_W - camera.x * TILE_W}px,
        ${pos[1] * TILE_H - camera.y * TILE_H}px
      )`
    }

    // Remove orphaned actor nodes (entity deleted from world)
    for (const [id, el] of this.actorEls) {
      if (!seen.has(id)) {
        el.remove()
        this.actorEls.delete(id)
        removed.push(id)
      }
    }

    return removed
  }
}
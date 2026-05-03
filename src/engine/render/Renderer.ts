import type { InputManager } from "../core/InputManager"
import { CHUNK_SIZE } from "../world/Chunk"
import { LocalWorld } from "../world/LocalWorld"
import { Camera } from "./Camera"
import { RendererUI } from "./RendererUI"
import { ThemeManager } from "./ThemeManager"
import { TileMetrics } from "./TileMetrics.ts"

import baseCssUrl from "./css/base.css?url"

export class Renderer {
  root: HTMLElement

  camera: Camera
  themeManager: ThemeManager
  inputManager: InputManager

  bg: HTMLDivElement
  actors: HTMLDivElement
  uiLayer: RendererUI

  actorEls = new Map<number, HTMLDivElement>()
  chunkEls = new Map<string, HTMLPreElement>()

  constructor(root: HTMLElement, camera: Camera, inputManager: InputManager) {
    this.root = root
    this.root.classList.add("default")
    const link = document.createElement("link")
    link.rel = "stylesheet"
    link.href = baseCssUrl
    document.head.appendChild(link)

    this.themeManager = new ThemeManager()
    this.inputManager = inputManager

    this.camera = camera

    this.bg = this.makeLayer("layer-background")
    this.actors = this.makeLayer("layer-actor")
    this.uiLayer = new RendererUI(this.makeLayer("layer-ui"), this.inputManager)
  }

  setTileHAndW() {
    const span = document.createElement("span")
    span.style.visibility = "hidden"
    span.style.whiteSpace = "pre"
    span.style.position = "absolute"
    span.style.left = "0"
    span.style.top = "0"
    span.style.padding = "0"
    span.style.border = "0"
    span.style.margin = "0"
    span.style.transform = "none"
    span.style.scale = "1"
    span.textContent = "M"

    this.root.appendChild(span)

    TileMetrics.w = span.getBoundingClientRect().width
    TileMetrics.h = span.getBoundingClientRect().height

    span.remove()
  }

  private makeLayer(css: string) {
    const el = document.createElement("div")
    el.className = "layer"
    el.classList.add(css)
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
          ${cx * CHUNK_SIZE * TileMetrics.w - camera.x * TileMetrics.w}px,
          ${cy * CHUNK_SIZE * TileMetrics.h - camera.y * TileMetrics.h}px
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
        const existing = this.actorEls.get(entity.uid)

        if (existing) {
          existing.remove()
          this.actorEls.delete(entity.uid)
          removed.push(entity.uid)
        }

        continue
      }

      seen.add(entity.uid)

      let el = this.actorEls.get(entity.uid)

      if (!el) {
        el = document.createElement("div")
        el.className = "actor"
        el.textContent = entity.glyph

        this.actors.appendChild(el)
        this.actorEls.set(entity.uid, el)
      }

      el.style.transform = `translate(
        ${pos[0] * TileMetrics.w - camera.x * TileMetrics.w}px,
        ${pos[1] * TileMetrics.h - camera.y * TileMetrics.h}px
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

import type { InputManager } from "../core/InputManager"
import type { Entity } from "../world/entities/Entity"
import { CHUNK_SIZE } from "../world/Chunk"
import { LocalWorld } from "../world/LocalWorld"
import { Camera } from "./Camera"
import { RendererUI } from "./RendererUI"
import { ThemeManager } from "./ThemeManager"
import { TileMetrics } from "./tileMetrics.ts"

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

  private chunksNeedRefresh = true
  private _unlistenFns = new Map<number, () => void>()

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

  /** Called by Camera when its target moves, triggering a chunk visibility refresh. */
  invalidateChunks() {
    this.chunksNeedRefresh = true
  }

  /** Called by Engine to wire spawn/despawn events from a LocalWorld. */
  bindWorld(world: LocalWorld) {
    world.onSpawn(entity => this._registerActor(entity))
    world.onDespawn(entity => this._unregisterActor(entity))
    // Register entities that were spawned before the renderer was ready
    for (const entity of world.entities.values()) {
      this._registerActor(entity)
    }
  }

  private _registerActor(entity: Entity) {
    const el = document.createElement("div")
    el.className = "actor"
    el.textContent = entity.glyph
    this.actors.appendChild(el)
    this.actorEls.set(entity.uid, el)

    const unlisten = entity.onMove(e => this.renderActor(e))
    this._unlistenFns.set(entity.uid, unlisten)
  }

  private _unregisterActor(entity: Entity) {
    this.actorEls.get(entity.uid)?.remove()
    this.actorEls.delete(entity.uid)
    this._unlistenFns.get(entity.uid)?.()
    this._unlistenFns.delete(entity.uid)
  }

  renderActor(entity: Entity) {
    const el = this.actorEls.get(entity.uid)
    if (!el) return

    const now = performance.now()
    const pos = entity.visualPosition(now)
    const camera = this.camera

    el.style.transform = `translate(
      ${pos[0] * TileMetrics.w - camera.x * TileMetrics.w}px,
      ${pos[1] * TileMetrics.h - camera.y * TileMetrics.h}px
    )`
  }

  private makeLayer(css: string) {
    const el = document.createElement("div")
    el.className = "layer"
    el.classList.add(css)
    this.root.appendChild(el)
    return el
  }

  render(world: LocalWorld, now: number) {
    this.camera.update(now)

    if (this.chunksNeedRefresh) {
      this.renderChunks(world)
      this.chunksNeedRefresh = false
    }
  }

  private renderChunks(world: LocalWorld) {
    const camera = this.camera
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

    for (const [key, el] of this.chunkEls) {
      if (!visible.has(key)) {
        el.remove()
        this.chunkEls.delete(key)
      }
    }
  }
}

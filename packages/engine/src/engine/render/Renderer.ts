import type { InputManager } from '../core/InputManager'
import type { Entity } from '../world/entities/Entity'
import { CHUNK_SIZE } from '../world/Chunk'
import type { LocalWorld } from '../world/LocalWorld'
import { type Camera } from './Camera'
import { RendererUI } from './RendererUI'
import { ThemeManager } from './ThemeManager'
import { type TileMetricsData } from './tileMetrics'

import baseCssUrl from './css/base.css?url'

export class Renderer {
  root: HTMLElement
  tileMetrics: TileMetricsData
  viewDistance = 3

  camera: Camera
  themeManager: ThemeManager
  inputManager: InputManager

  worldEl: HTMLDivElement
  bg: HTMLDivElement
  actors: HTMLDivElement
  uiLayer: RendererUI

  actorEls = new Map<number, HTMLDivElement>()
  chunkEls = new Map<string, HTMLPreElement>()

  private chunksNeedRefresh = true
  private _unlistenFns = new Map<number, () => void>()
  private _world: LocalWorld | null = null

  constructor(
    root: HTMLElement,
    camera: Camera,
    inputManager: InputManager,
    tileMetrics: TileMetricsData,
  ) {
    this.root = root

    this.tileMetrics = tileMetrics

    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = baseCssUrl
    document.head.appendChild(link)

    this.themeManager = new ThemeManager()
    this.inputManager = inputManager
    this.camera = camera

    this.worldEl = this._makeLayer('layer-world')
    this.bg = this._makeLayerInto(this.worldEl, 'layer-background')
    this.actors = this._makeLayerInto(this.worldEl, 'layer-actor')

    this.uiLayer = new RendererUI(this._makeLayer('layer-ui'), this.inputManager, this.tileMetrics)

    camera.onFrame = (now) => this._onCameraFrame(now)
  }

  setTileHAndW() {
    const span = document.createElement('span')
    span.style.visibility = 'hidden'
    span.style.whiteSpace = 'pre'
    span.style.position = 'absolute'
    span.style.left = '0'
    span.style.top = '0'
    span.style.padding = '0'
    span.style.border = '0'
    span.style.margin = '0'
    span.style.transform = 'none'
    span.style.scale = '1'
    span.textContent = 'M'

    this.root.appendChild(span)
    const bcr = span.getBoundingClientRect()
    this.tileMetrics.w = bcr.width
    this.tileMetrics.h = bcr.height
    span.remove()
  }

  /** Called by Camera's onMove listener to trigger a chunk visibility refresh. */
  invalidateChunks() {
    this.chunksNeedRefresh = true
  }

  /** Called by Engine to wire spawn/despawn events from a LocalWorld. */
  bindWorld(world: LocalWorld) {
    this._world = world
    world.onSpawn((entity) => this._registerActor(entity))
    world.onDespawn((entity) => this._unregisterActor(entity))
    // Register existing entities
    for (const entity of world.entities.values()) {
      this._registerActor(entity)
    }
  }

  private _registerActor(entity: Entity) {
    const el = document.createElement('div')
    el.className = 'actor'
    el.textContent = entity.glyph
    // Place at initial position with no tileMetrics
    el.style.transform = `translate(${entity.x * this.tileMetrics.w}px, ${entity.y * this.tileMetrics.h}px)`
    this.actors.appendChild(el)
    this.actorEls.set(entity.uid, el)

    const unlisten = entity.onMove((e) => this.renderActor(e))
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

    if (entity.x === entity.prevX && entity.y === entity.prevY) return

    el.style.transition = `transform ${entity.moveSpeed}ms linear`
    el.style.transform = `translate(${entity.x * this.tileMetrics.w}px, ${entity.y * this.tileMetrics.h}px)`
  }

  private _onCameraFrame(_now: number) {
    this.worldEl.style.transform = `translate(
      ${-this.camera.x * this.tileMetrics.w}px,
      ${-this.camera.y * this.tileMetrics.h}px
    )`

    if (this.chunksNeedRefresh) {
      this._renderChunks()
      this.chunksNeedRefresh = false
    }
  }

  private _makeLayer(css: string): HTMLDivElement {
    const el = document.createElement('div')
    el.className = `layer ${css}`
    this.root.appendChild(el)
    return el
  }

  private _makeLayerInto(parent: HTMLDivElement, css: string): HTMLDivElement {
    const el = document.createElement('div')
    el.className = `layer ${css}`
    parent.appendChild(el)
    return el
  }

  private _renderChunks() {
    if (!this._world) return

    const target = this.camera.target
    const cx = Math.floor(target.x / CHUNK_SIZE)
    const cy = Math.floor(target.y / CHUNK_SIZE)
    const d = this.viewDistance

    const left = cx - d
    const top = cy - d
    const right = cx + d
    const bottom = cy + d

    const visible = new Set<string>()

    for (let cy = top; cy <= bottom; cy++) {
      for (let cx = left; cx <= right; cx++) {
        const key = `${cx},${cy}`
        visible.add(key)

        const chunk = this._world.getChunk(cx, cy)

        let el = this.chunkEls.get(key)

        if (!el) {
          el = document.createElement('pre')
          el.className = 'chunk'
          this.bg.appendChild(el)
          this.chunkEls.set(key, el)
          chunk.dirty = true
        }

        if (chunk.dirty) {
          let text = ''
          for (let y = 0; y < CHUNK_SIZE; y++) {
            for (let x = 0; x < CHUNK_SIZE; x++) {
              text += chunk.get(x, y).glyph
            }
            text += '\n'
          }
          el.textContent = text
          chunk.dirty = false
        }

        // Chunk position is pure world space — camera offset lives on worldEl
        el.style.transform = `translate(
          ${cx * CHUNK_SIZE * this.tileMetrics.w}px,
          ${cy * CHUNK_SIZE * this.tileMetrics.h}px
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

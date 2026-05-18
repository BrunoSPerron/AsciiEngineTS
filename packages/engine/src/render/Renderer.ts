import type { Entity } from '../world/entities/Entity'
import { CHUNK_SIZE } from '../world/Chunk'
import type { World } from '../world/World'
import { type Camera } from './Camera'
import { RendererUI } from './ui/RendererUI'
import { ThemeManager } from './ThemeManager'
import { type TileMetricsData } from './tileMetrics'
import baseCssUrl from './css/base.css?url'
import type { EngineConfig } from '../core/Config'
import type { GameAssets } from '../core/GameAssets'
import type { ActionManager } from '../core/ActionManager'
import type { ContextManager } from '../core/ContextManager'
import type { MouseManager } from '../core/MouseManager'

const HTML_ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;' }
const esc = (ch: string): string => HTML_ESC[ch] ?? ch

function buildChunkHTML(chunk: {
  get(x: number, y: number): { glyph: string; style?: string }
}): string {
  let html = ''

  for (let y = 0; y < CHUNK_SIZE; y++) {
    if (y > 0) html += '\n'

    let currentStyle: string | undefined = undefined
    let run = ''

    for (let x = 0; x < CHUNK_SIZE; x++) {
      const tile = chunk.get(x, y)
      const tileStyle = tile.style

      if (tileStyle !== currentStyle) {
        if (run.length > 0) {
          html +=
            currentStyle !== undefined ? `<span class="tile-${currentStyle}">${run}</span>` : run
          run = ''
        }
        currentStyle = tileStyle
      }

      run += esc(tile.glyph)
    }

    if (run.length > 0) {
      html += currentStyle !== undefined ? `<span class="tile-${currentStyle}">${run}</span>` : run
    }
  }

  return html
}

export class Renderer {
  root: HTMLElement
  tileMetrics: TileMetricsData
  viewDistance = 3

  camera: Camera
  themeManager: ThemeManager

  worldEl: HTMLDivElement
  bg: HTMLDivElement
  actors: HTMLDivElement
  uiLayer?: RendererUI

  actorEls = new Map<number, HTMLDivElement>()
  chunkEls = new Map<string, HTMLPreElement>()

  private chunksNeedRefresh = true
  private _unlistenFns = new Map<number, () => void>()
  private _world: World | null = null

  constructor(root: HTMLElement, camera: Camera, tileMetrics: TileMetricsData) {
    this.root = root
    this.tileMetrics = tileMetrics

    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = baseCssUrl
    document.head.appendChild(link)

    this.themeManager = new ThemeManager()
    this.camera = camera

    this.worldEl = this._makeLayer('layer-world')
    this.bg = this._makeLayerInto(this.worldEl, 'layer-background')
    this.actors = this._makeLayerInto(this.worldEl, 'layer-actor')
  }

  init(
    world: World,
    actionManager: ActionManager,
    mouseManager: MouseManager,
    contextManager: ContextManager,
    config: EngineConfig,
    assets: GameAssets,
  ) {
    this.themeManager.init(config.game.engine_themes)

    this.camera.halfLife = config.camera.half_life
    this.camera.setInitialPosition(...config.camera.initial_position)
    this.viewDistance = config.world.chunk_view_distance

    const uiLayerEl = this._makeLayer('layer-ui')
    const uiLayoutRoot = document.createElement('div')
    uiLayoutRoot.className = 'ui-layout-root'
    uiLayerEl.appendChild(uiLayoutRoot)
    mouseManager.registerUIRoot(uiLayoutRoot)

    this.uiLayer = new RendererUI(
      uiLayerEl,
      uiLayoutRoot,
      actionManager,
      contextManager,
      mouseManager,
      this.tileMetrics,
    )

    if (assets.baseCssUrl) {
      const link = document.createElement('link')
      link.rel = 'stylesheet'
      link.href = assets.baseCssUrl
      document.head.appendChild(link)
    }

    for (const { name, url } of assets.themes) {
      this.themeManager.register(name, url)
    }
    this.themeManager.set(config.game.initial_theme)

    this.setTileHAndW()
    this.bindWorld(world)
    this.camera.onFrame((now) => this._onCameraFrame(now))

    this.uiLayer.drawFrame()
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

  invalidateChunks = () => {
    this.chunksNeedRefresh = true
  }

  bindWorld(world: World) {
    this._world = world
    world.onSpawn((entity) => this._registerActor(entity))
    world.onDespawn((entity) => this._unregisterActor(entity))
    for (const entity of world.local.entities.values()) {
      this._registerActor(entity)
    }
    this._world.onChunkChange((cx, cy) => {
      this._world?.updateActiveChunks(cx, cy, this.viewDistance)
      this.invalidateChunks()
    })
  }

  private _registerActor(entity: Entity) {
    const el = document.createElement('div')
    el.className = 'actor'
    el.textContent = entity.glyph
    el.style.transform = `translate(${entity.pos.x * this.tileMetrics.w}px, ${entity.pos.y * this.tileMetrics.h}px)`
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
    if (entity.pos.equal(entity.previousPos)) return
    el.style.transition = `transform ${entity.currentActMs}ms linear`
    el.style.transform = `translate(${entity.pos.x * this.tileMetrics.w}px, ${entity.pos.y * this.tileMetrics.h}px)`
  }

  private _onCameraFrame(_now: number) {
    this.worldEl.style.transform = `translate(
      ${-this.camera.pos.x * this.tileMetrics.w}px,
      ${-this.camera.pos.y * this.tileMetrics.h}px
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

    const visible = new Set<string>()

    for (const [key, chunk] of this._world.local.chunks) {
      visible.add(key)

      let el = this.chunkEls.get(key)
      if (!el) {
        el = document.createElement('pre')
        el.className = 'chunk'
        this.bg.appendChild(el)
        this.chunkEls.set(key, el)
        chunk.dirty = true
      }

      if (chunk.dirty) {
        el.innerHTML = buildChunkHTML(chunk)
        chunk.dirty = false
      }

      const [cxStr, cyStr] = key.split(',')
      el.style.transform = `translate(
      ${Number(cxStr) * CHUNK_SIZE * this.tileMetrics.w}px,
      ${Number(cyStr) * CHUNK_SIZE * this.tileMetrics.h}px
    )`
    }

    for (const [key, el] of this.chunkEls) {
      if (!visible.has(key)) {
        el.remove()
        this.chunkEls.delete(key)
      }
    }
  }
}

import { EngineObject } from '../core/EngineObject'
import type { Entity } from '../world/entities/Entity'
import { CHUNK_SIZE } from '../world/Chunk'
import { ThemeManager } from './ThemeManager'
import { type TileMetricsData } from './tileMetrics'
import { UILayout } from './ui/UILayout'

import baseCss from './css/base.css?inline'
import { makeLayer } from './utils'
import type { AsciiEngine } from '../core/Engine'
import { Camera } from './Camera'

const HTML_ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;' }
const esc = (ch: string): string => HTML_ESC[ch] ?? ch

function buildChunkHTML(chunk: {
  get(x: number, y: number): { glyph: string; style?: string }
}): string {
  let html = ''

  for (let y = 0; y < CHUNK_SIZE; y++) {
    if (y > 0) html += '\n'

    let currentStyle: string | null = null
    let run = ''

    for (let x = 0; x < CHUNK_SIZE; x++) {
      const tile = chunk.get(x, y)
      const tileStyle = tile.style ?? null

      if (tileStyle !== currentStyle) {
        if (run.length > 0) {
          html += currentStyle ? `<span class="tile-${currentStyle}">${run}</span>` : run
          run = ''
        }
        currentStyle = tileStyle
      }

      run += esc(tile.glyph)
    }

    if (run.length > 0) {
      html += currentStyle ? `<span class="tile-${currentStyle}">${run}</span>` : run
    }
  }

  return html
}

export type RendererEvents = {
  none: []
}

export class Renderer extends EngineObject<RendererEvents> {
  tileMetrics: TileMetricsData = { w: 19.90625, h: 18 }
  uiTileMetrics: TileMetricsData = { w: 19.90625, h: 18 }

  camera: Camera
  themeManager: ThemeManager

  worldEl!: HTMLDivElement
  bg!: HTMLDivElement
  actors!: HTMLDivElement
  ui: UILayout

  actorEls = new Map<number, HTMLDivElement>()
  chunkEls = new Map<string, HTMLPreElement>()

  private chunksNeedRefresh = true
  private _unlistenFns = new Map<number, () => void>()

  constructor() {
    super()

    const style = document.createElement('style')
    style.textContent = baseCss
    document.head.appendChild(style)

    this.camera = new Camera()
    this.themeManager = new ThemeManager()
    this.ui = new UILayout()
  }

  _init(engine: AsciiEngine) {
    super._init(engine)

    if (engine.assets.baseCssUrl) {
      const link = document.createElement('link')
      link.rel = 'stylesheet'
      link.href = engine.assets.baseCssUrl
      document.head.appendChild(link)
    }

    for (const entity of this.engine.world.local.entities.values()) {
      this._registerActor(entity)
    }

    this.worldEl = makeLayer('layer-world', this.engine.gameContainer)
    this.bg = makeLayer('layer-background', this.worldEl)
    this.actors = makeLayer('layer-actor', this.worldEl)

    this.ui._init(engine)
    this.themeManager._init(engine)
    this.camera._init(engine)

    this.listen(this.camera.on('frame', (now) => this._onCameraFrame(now)))
    this.listen(
      this.camera.on('chunkinvalidated', () => {
        const entity = this.camera.target
        const cx = Math.floor(entity.pos.x / CHUNK_SIZE)
        const cy = Math.floor(entity.pos.y / CHUNK_SIZE)
        this.engine.world.updateActiveChunks(cx, cy)
        this.invalidateChunks()
      }),
    )

    // TODO Replace SetTimeout with something clean.
    //  Dirty hack Let the style load before calculating h and w.
    //  Do not always work
    //  SetTileHAndW also need to be called on theme change
    setTimeout(() => {
      this.setTileHAndW()
      this.ui.drawFrame()
      this.ui._start()
    }, 500)
  }

  destroy(): void {
    this.ui._stop()
  }

  setTileHAndW() {
    const makeSpan = () => {
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
      return span
    }

    // World tile metrics
    const worldSpan = makeSpan()
    this.engine.gameContainer.appendChild(worldSpan)
    this.tileMetrics.w = worldSpan.getBoundingClientRect().width
    this.tileMetrics.h = parseFloat(getComputedStyle(worldSpan).lineHeight)
    worldSpan.remove()

    // UI tile metrics
    const uiSpan = makeSpan()
    this.ui.layoutElement.appendChild(uiSpan)
    this.uiTileMetrics.w = uiSpan.getBoundingClientRect().width
    this.uiTileMetrics.h = parseFloat(getComputedStyle(uiSpan).lineHeight)
    uiSpan.remove()
  }

  invalidateChunks = () => {
    this.chunksNeedRefresh = true
  }

  _registerActor(entity: Entity) {
    const el = document.createElement('div')
    el.className = `actor ${[...entity.extraCss].join(' ')}`
    el.textContent = entity.glyph
    el.style.transform = `translate(${entity.pos.x * this.tileMetrics.w}px, ${entity.pos.y * this.tileMetrics.h}px)`
    this.actors.appendChild(el)
    this.actorEls.set(entity.uid, el)

    const unlisten = this.listen(entity.on('move', (e) => this.renderActor(e)))
    this._unlistenFns.set(entity.uid, unlisten)
  }

  _unregisterActor(entity: Entity) {
    this.actorEls.get(entity.uid)?.remove()
    this.actorEls.delete(entity.uid)
    this._unlistenFns.get(entity.uid)?.()
    this._unlistenFns.delete(entity.uid)
  }

  renderActor(entity: Entity) {
    const el = this.actorEls.get(entity.uid)
    if (!el) return
    if (!entity.pos.equal(entity.previousPos)) {
      el.style.transition = `transform ${entity.currentActMs}ms linear`
      el.style.transform = `translate(${entity.pos.x * this.tileMetrics.w}px, ${entity.pos.y * this.tileMetrics.h}px)`
    }
  }

  addCssToActor(entity: Entity, cssClass: string) {
    const el = this.actorEls.get(entity.uid)
    el?.classList.add(cssClass)
  }

  removeCssFromActor(entity: Entity, cssClass: string) {
    const el = this.actorEls.get(entity.uid)
    el?.classList.remove(cssClass)
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

  private _renderChunks() {
    const visible = new Set<string>()
    for (const [key, chunk] of this.engine.world.local.chunks) {
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

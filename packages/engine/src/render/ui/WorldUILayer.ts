import type { AsciiEngine } from '../../core/Engine'
import type { Entity } from '../../world/entities/Entity'
import type { UINode } from './node/UINode'
import { type UISpatialConfig } from './node/UINode'
import { makeLayer } from '../utils'
import { EngineObject } from '../../core/EngineObject'

export type PositionProvider = (now: number) => [number, number]

type WorldUIEntry = {
  element: UINode
  provider: PositionProvider
}

export type WorldUILayerEvents = {
  none: []
}

/**
 * Manages UINodes anchored to world-space positions or moving entities.
 */
export class WorldUILayer extends EngineObject<WorldUILayerEvents> {
  private _el!: HTMLDivElement

  private _entries = new Map<number, WorldUIEntry>()
  private _unlisten: (() => void) | null = null
  private _nextId = 1

  constructor() {
    super()
  }

  _init(engine: AsciiEngine) {
    super._init(engine)
    this._el = makeLayer('layer-world-ui', engine.renderer.ui.layerElement)
  }

  get el(): HTMLDivElement {
    return this._el
  }

  // ---------------------------------------------------------------------------
  // Lifecycle — called by UILayout
  // ---------------------------------------------------------------------------

  _start(): void {
    if (this._unlisten) return
    this._unlisten = this.engine.renderer.camera.on('frame', (now) => this._tick(now))
  }

  _stop(): void {
    this._unlisten?.()
    this._unlisten = null
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  add(element: UINode, spatialConfig: UISpatialConfig, provider: PositionProvider): () => void {
    const id = this._nextId++
    element._mount(id, spatialConfig, this.engine)
    this.el.appendChild(element.el)

    const w = spatialConfig.w ?? 0
    const h = spatialConfig.h ?? 0
    element.layout(0, 0, w, h)

    this._entries.set(id, { element, provider })

    this._positionEl(element, provider, performance.now())

    queueMicrotask(() => element.loaded())

    return () => this.remove(id)
  }

  addToEntity(
    element: UINode,
    spatialConfig: UISpatialConfig,
    entity: Entity,
    offsetX: number = 0,
    offsetY: number = 0,
  ): () => void {
    const provider: PositionProvider = (now) => {
      const [vx, vy] = entity.visualPosition(now)
      return [vx + offsetX, vy + offsetY]
    }
    return this.add(element, spatialConfig, provider)
  }

  remove(id: number): void {
    const entry = this._entries.get(id)
    if (!entry) return
    this._entries.delete(id)
    entry.element.unloaded()
    entry.element.destroy()
  }

  // ---------------------------------------------------------------------------
  // Per-frame update
  // ---------------------------------------------------------------------------

  private _tick(now: number): void {
    for (const { element, provider } of this._entries.values()) {
      this._positionEl(element, provider, now)
    }
  }

  private _positionEl(element: UINode, provider: PositionProvider, now: number): void {
    const [wx, wy] = provider(now)
    const { w, h } = this.engine.renderer.tileMetrics
    const cam = this.engine.renderer.camera.pos
    const px = (wx - cam.x) * w
    const py = (wy - cam.y) * h
    element.el.style.transform = `translate(${px}px, ${py}px)`
  }
}

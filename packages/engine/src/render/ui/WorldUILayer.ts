import type { AsciiEngine } from '../../core/Engine'
import type { Camera } from '../Camera'
import type { Entity } from '../../world/entities/Entity'
import type { TileMetricsData } from '../tileMetrics'
import type { UINode } from './node/UINode'
import { type UISpatialConfig } from './node/UINode'

export type PositionProvider = (now: number) => [number, number]

type WorldUIEntry = {
  element: UINode
  provider: PositionProvider
}

/**
 * Manages UINodes anchored to world-space positions or moving entities.
 */
export class WorldUILayer {
  readonly el: HTMLDivElement

  private _entries = new Map<number, WorldUIEntry>()
  private _camera: Camera
  private _worldTileMetrics: TileMetricsData
  private _uiTileMetrics: TileMetricsData
  private _engine: AsciiEngine
  private _unlisten: (() => void) | null = null
  private _nextId = 1

  constructor(
    camera: Camera,
    worldTileMetrics: TileMetricsData,
    uiTileMetrics: TileMetricsData,
    engine: AsciiEngine,
    layerEl: HTMLDivElement,
  ) {
    this.el = layerEl
    this._camera = camera
    this._worldTileMetrics = worldTileMetrics
    this._uiTileMetrics = uiTileMetrics
    this._engine = engine
  }

  // ---------------------------------------------------------------------------
  // Lifecycle — called by UILayout
  // ---------------------------------------------------------------------------

  _start(): void {
    if (this._unlisten) return
    this._unlisten = this._camera.on('frame', (now) => this._tick(now))
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
    element._mount(id, spatialConfig, this._uiTileMetrics, this._engine)
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
    const { w, h } = this._worldTileMetrics
    const cam = this._camera.pos
    const px = (wx - cam.x) * w
    const py = (wy - cam.y) * h
    element.el.style.transform = `translate(${px}px, ${py}px)`
  }
}

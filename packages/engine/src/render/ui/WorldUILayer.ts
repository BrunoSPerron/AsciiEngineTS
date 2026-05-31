import type { AsciiEngine } from '../../core/Engine'
import type { Camera } from '../Camera'
import type { Entity } from '../../world/entities/Entity'
import type { TileMetricsData } from '../tileMetrics'
import type { UILayoutElement} from './layout_elements/UILayoutElement';
import { type UISpatialConfig } from './layout_elements/UILayoutElement'

export type PositionProvider = (now: number) => [number, number]

type WorldUIEntry = {
  element: UILayoutElement
  provider: PositionProvider
}

/**
 * Manages UILayoutElements anchored to world-space positions or moving entities.
 *
 * Elements are positioned every camera frame using a PositionProvider — a
 * function that returns the current [worldX, worldY]. For entity anchors the
 * provider calls entity.visualPosition(now) so elements track the interpolated
 * glyph position sub-tile-precisely, matching actor rendering.
 *
 * No border drawing or open/close animations — elements are plain content
 * containers positioned in world space.
 *
 * Owned by UILayout and accessible via engine.renderer.ui.world.
 *
 * Usage:
 *
 *   // Static world position
 *   const remove = engine.renderer.ui.world.add(myElement, { w: 10, h: 3 }, () => [12, 8])
 *
 *   // Entity anchor (speech bubble, health bar, …)
 *   const remove = engine.renderer.ui.world.addToEntity(myElement, { w: 10, h: 3 }, entity, 0, -1)
 *
 *   // Remove when done
 *   remove()
 */
export class WorldUILayer {
  readonly el: HTMLDivElement

  private _entries = new Map<number, WorldUIEntry>()
  private _camera: Camera
  private _tileMetrics: TileMetricsData
  private _engine: AsciiEngine
  private _unlisten: (() => void) | null = null
  private _nextId = 1

  constructor(
    camera: Camera,
    tileMetrics: TileMetricsData,
    engine: AsciiEngine,
    layerEl: HTMLDivElement,
  ) {
    this.el = layerEl
    this._camera = camera
    this._tileMetrics = tileMetrics
    this._engine = engine
  }

  // ---------------------------------------------------------------------------
  // Lifecycle — called by UILayout
  // ---------------------------------------------------------------------------

  _start(): void {
    if (this._unlisten) return
    this._unlisten = this._camera.onFrame((now) => this._tick(now))
  }

  _stop(): void {
    this._unlisten?.()
    this._unlisten = null
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Add a UILayoutElement anchored to a world-space position provider.
   * Returns a dispose function that removes the element.
   */
  add(
    element: UILayoutElement,
    spatialConfig: UISpatialConfig,
    provider: PositionProvider,
  ): () => void {
    const id = this._nextId++
    element._mount(id, spatialConfig, this._tileMetrics, this._engine)
    this.el.appendChild(element.el)

    const w = spatialConfig.w ?? 0
    const h = spatialConfig.h ?? 0
    element.layout(0, 0, w, h)

    this._entries.set(id, { element, provider })

    // Position immediately so there's no one-frame flash at origin
    this._positionEl(element, provider, performance.now())

    queueMicrotask(() => element.loaded())

    return () => this.remove(id)
  }

  /**
   * Add a UILayoutElement anchored to an entity's interpolated visual position.
   *
   * offsetX / offsetY are tile offsets applied on top of the entity position.
   * Example: offsetY -1 places a speech bubble one tile above the entity head.
   */
  addToEntity(
    element: UILayoutElement,
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

  /** Remove a world element by id. Calls unloaded() and destroy(). */
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

  private _positionEl(element: UILayoutElement, provider: PositionProvider, now: number): void {
    const [wx, wy] = provider(now)
    const { w, h } = this._tileMetrics
    const cam = this._camera.pos
    const px = (wx - cam.x) * w
    const py = (wy - cam.y) * h
    element.el.style.transform = `translate(${px}px, ${py}px)`
  }
}

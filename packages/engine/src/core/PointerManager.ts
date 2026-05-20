import type { ContextManager, ContextListener } from './ContextManager'
import type { Camera } from '../render/Camera'
import type { TileMetricsData } from '../render/tileMetrics'

type WorldPointerHandler = (wx: number, wy: number, button: number) => void
type WorldHoverHandler = (wx: number, wy: number) => void
type WorldHoverEndHandler = (wx: number, wy: number) => void

type UIHandlers = {
  hover?: () => void
  hoverEnd?: () => void
  pointerDown?: (button: number) => void
  pointerUp?: (button: number) => void
}

type PointerContext = {
  name: string
  worldHoverListeners: Map<string, WorldHoverHandler>
  worldHoverEndListeners: Map<string, WorldHoverEndHandler>
  worldPointerDownListeners: Map<string, WorldPointerHandler>
  worldPointerUpListeners: Map<string, WorldPointerHandler>
}

export class PointerManager implements ContextListener {
  private _container: HTMLElement
  private _contextManager: ContextManager
  private _tileMetrics: TileMetricsData
  private _camera: Camera

  private _pointerContexts = new Map<string, PointerContext>()
  private _idCounter = 0

  private _hoveredWorldCell: { x: number; y: number } | null = null

  /**
   * Prevent world hover while hovering UI.
   * Uses a depth counter to safely support nested DOM.
   */
  private _uiHoverDepth = 0

  constructor(
    container: HTMLElement,
    tileMetrics: TileMetricsData,
    camera: Camera,
    contextManager: ContextManager,
  ) {
    this._container = container
    this._tileMetrics = tileMetrics
    this._camera = camera
    this._contextManager = contextManager

    this._ensurePointerContext('root')
    contextManager.registerListener(this)

    container.addEventListener('pointermove', this._onPointerMove)
    container.addEventListener('pointerdown', this._onPointerDown)
    container.addEventListener('pointerup', this._onPointerUp)
    container.addEventListener('pointerleave', this._onPointerLeave)
  }

  // --------------------------------------------------------------------------
  // ContextListener
  // --------------------------------------------------------------------------

  onPush(_outgoing: string, incoming: string): void {
    this._emitHoverEnd()
    this._ensurePointerContext(incoming)
  }

  onPop(outgoing: string, _incoming: string): void {
    this._pointerContexts.delete(outgoing)
    this._emitHoverStart()
  }

  // --------------------------------------------------------------------------
  // UI Registration
  // --------------------------------------------------------------------------

  registerUIElement(el: HTMLElement, handlers: UIHandlers): () => void {
    const onEnter = (): void => {
      this._uiHoverDepth++

      // entering UI cancels world hover
      if (this._hoveredWorldCell) {
        this._emitWorldHoverEnd(this._hoveredWorldCell.x, this._hoveredWorldCell.y)
        this._hoveredWorldCell = null
      }

      handlers.hover?.()
    }

    const onLeave = (): void => {
      this._uiHoverDepth = Math.max(0, this._uiHoverDepth - 1)
      handlers.hoverEnd?.()
    }

    const onDown = (e: PointerEvent): void => {
      handlers.pointerDown?.(e.button)
    }

    const onUp = (e: PointerEvent): void => {
      handlers.pointerUp?.(e.button)
    }

    el.addEventListener('pointerenter', onEnter)
    el.addEventListener('pointerleave', onLeave)
    el.addEventListener('pointerdown', onDown)
    el.addEventListener('pointerup', onUp)

    return () => {
      el.removeEventListener('pointerenter', onEnter)
      el.removeEventListener('pointerleave', onLeave)
      el.removeEventListener('pointerdown', onDown)
      el.removeEventListener('pointerup', onUp)
    }
  }

  /*
  // TODO fix and plug
  registerUIRoot(el: HTMLElement): () => void {
    const onEnter = (): void => {
      this._uiHoverDepth++

      if (this._hoveredWorldCell) {
        this._emitWorldHoverEnd(this._hoveredWorldCell.x, this._hoveredWorldCell.y)
        this._hoveredWorldCell = null
      }
    }

    const onLeave = (): void => {
      this._uiHoverDepth = Math.max(0, this._uiHoverDepth - 1)
    }

    el.addEventListener('pointerenter', onEnter)
    el.addEventListener('pointerleave', onLeave)

    return () => {
      el.removeEventListener('pointerenter', onEnter)
      el.removeEventListener('pointerleave', onLeave)
    }
  }
    */

  // --------------------------------------------------------------------------
  // World Event Listeners
  // --------------------------------------------------------------------------

  onWorldHover(fn: WorldHoverHandler): () => void {
    const key = this._nextId()
    this._activePointerCtx().worldHoverListeners.set(key, fn)
    return () => {
      for (const ctx of this._pointerContexts.values()) {
        ctx.worldHoverListeners.delete(key)
      }
    }
  }

  onWorldHoverEnd(fn: WorldHoverEndHandler): () => void {
    const key = this._nextId()
    this._activePointerCtx().worldHoverEndListeners.set(key, fn)
    return () => {
      for (const ctx of this._pointerContexts.values()) {
        ctx.worldHoverEndListeners.delete(key)
      }
    }
  }

  onWorldPointerDown(fn: WorldPointerHandler): () => void {
    const key = this._nextId()
    this._activePointerCtx().worldPointerDownListeners.set(key, fn)
    return () => {
      for (const ctx of this._pointerContexts.values()) {
        ctx.worldPointerDownListeners.delete(key)
      }
    }
  }

  onWorldPointerUp(fn: WorldPointerHandler): () => void {
    const key = this._nextId()
    this._activePointerCtx().worldPointerUpListeners.set(key, fn)
    return () => {
      for (const ctx of this._pointerContexts.values()) {
        ctx.worldPointerUpListeners.delete(key)
      }
    }
  }

  // --------------------------------------------------------------------------
  // Cleanup
  // --------------------------------------------------------------------------

  destroy(): void {
    this._container.removeEventListener('pointermove', this._onPointerMove)
    this._container.removeEventListener('pointerdown', this._onPointerDown)
    this._container.removeEventListener('pointerup', this._onPointerUp)
    this._container.removeEventListener('pointerleave', this._onPointerLeave)

    this._pointerContexts.clear()
  }

  // --------------------------------------------------------------------------
  // Pointer Events
  // --------------------------------------------------------------------------

  private _onPointerMove = (e: PointerEvent): void => {
    // UI owns pointer while hovered
    if (this._uiHoverDepth > 0) return

    const { cellX, cellY } = this._pixelToUICell(e)
    const { wx, wy } = this._uiCellToWorldCell(cellX, cellY)

    const prev = this._hoveredWorldCell

    const sameWorld = prev !== null && prev.x === wx && prev.y === wy

    if (sameWorld) return

    if (prev !== null) {
      this._emitWorldHoverEnd(prev.x, prev.y)
    }

    this._hoveredWorldCell = {
      x: wx,
      y: wy,
    }

    this._emitWorldHover(wx, wy)
  }

  private _onPointerDown = (e: PointerEvent): void => {
    if (this._uiHoverDepth > 0) return

    const { cellX, cellY } = this._pixelToUICell(e)
    const { wx, wy } = this._uiCellToWorldCell(cellX, cellY)

    this._emitWorldPointerDown(wx, wy, e.button)
  }

  private _onPointerUp = (e: PointerEvent): void => {
    if (this._uiHoverDepth > 0) return

    const { cellX, cellY } = this._pixelToUICell(e)
    const { wx, wy } = this._uiCellToWorldCell(cellX, cellY)

    this._emitWorldPointerUp(wx, wy, e.button)
  }

  private _onPointerLeave = (): void => {
    this._emitHoverEnd()
    this._hoveredWorldCell = null
  }

  // --------------------------------------------------------------------------
  // Coordinate Conversion
  // --------------------------------------------------------------------------

  private _pixelToUICell(e: PointerEvent): { cellX: number; cellY: number } {
    const rect = this._container.getBoundingClientRect()

    const px = e.clientX - rect.left + this._camera.pos.x * this._tileMetrics.w
    const py = e.clientY - rect.top + this._camera.pos.y * this._tileMetrics.h

    return {
      cellX: Math.floor(px / this._tileMetrics.w),
      cellY: Math.floor(py / this._tileMetrics.h),
    }
  }

  private _uiCellToWorldCell(cellX: number, cellY: number): { wx: number; wy: number } {
    return {
      wx: Math.floor(cellX + this._camera.pos.x),
      wy: Math.floor(cellY + this._camera.pos.y),
    }
  }

  // --------------------------------------------------------------------------
  // Emit Helpers
  // --------------------------------------------------------------------------

  private _emitHoverEnd(): void {
    if (this._hoveredWorldCell !== null) {
      this._emitWorldHoverEnd(this._hoveredWorldCell.x, this._hoveredWorldCell.y)
    }
  }

  private _emitHoverStart(): void {
    if (this._hoveredWorldCell !== null) {
      this._emitWorldHover(this._hoveredWorldCell.x, this._hoveredWorldCell.y)
    }
  }

  private _emitWorldHover(wx: number, wy: number): void {
    for (const fn of this._activePointerCtx().worldHoverListeners.values()) {
      fn(wx, wy)
    }
  }

  private _emitWorldHoverEnd(wx: number, wy: number): void {
    for (const fn of this._activePointerCtx().worldHoverEndListeners.values()) {
      fn(wx, wy)
    }
  }

  private _emitWorldPointerDown(wx: number, wy: number, button: number): void {
    for (const fn of this._activePointerCtx().worldPointerDownListeners.values()) {
      fn(wx, wy, button)
    }
  }

  private _emitWorldPointerUp(wx: number, wy: number, button: number): void {
    for (const fn of this._activePointerCtx().worldPointerUpListeners.values()) {
      fn(wx, wy, button)
    }
  }

  // --------------------------------------------------------------------------
  // Context Helpers
  // --------------------------------------------------------------------------

  private _ensurePointerContext(name: string): PointerContext {
    let ctx = this._pointerContexts.get(name)

    if (!ctx) {
      ctx = {
        name,
        worldHoverListeners: new Map(),
        worldHoverEndListeners: new Map(),
        worldPointerDownListeners: new Map(),
        worldPointerUpListeners: new Map(),
      }

      this._pointerContexts.set(name, ctx)
    }

    return ctx
  }

  private _activePointerCtx(): PointerContext {
    return this._ensurePointerContext(this._contextManager.active)
  }

  private _nextId(): string {
    return `mk_${++this._idCounter}`
  }
}

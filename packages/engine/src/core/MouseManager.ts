import type { ContextManager, ContextListener } from './ContextManager'
import type { Camera } from '../render/Camera'
import type { TileMetricsData } from '../render/tileMetrics'

type WorldMouseHandler = (wx: number, wy: number, button: number) => void
type WorldHoverHandler = (wx: number, wy: number) => void
type WorldHoverEndHandler = (wx: number, wy: number) => void

type UIHandlers = {
  hover?: () => void
  hoverEnd?: () => void
  mouseDown?: (button: number) => void
  mouseUp?: (button: number) => void
}

type MouseContext = {
  name: string
  worldHoverListeners: Map<string, WorldHoverHandler>
  worldHoverEndListeners: Map<string, WorldHoverEndHandler>
  worldMouseDownListeners: Map<string, WorldMouseHandler>
  worldMouseUpListeners: Map<string, WorldMouseHandler>
}

export class MouseManager implements ContextListener {
  private _container: HTMLElement
  private _contextManager: ContextManager
  private _tileMetrics: TileMetricsData
  private _camera: Camera

  private _mouseContexts = new Map<string, MouseContext>()
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

    this._ensureMouseContext('root')
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
    this._ensureMouseContext(incoming)
  }

  onPop(outgoing: string, _incoming: string): void {
    this._mouseContexts.delete(outgoing)
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
      handlers.mouseDown?.(e.button)
    }

    const onUp = (e: PointerEvent): void => {
      handlers.mouseUp?.(e.button)
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

  // --------------------------------------------------------------------------
  // World Event Listeners
  // --------------------------------------------------------------------------

  onWorldHover(fn: WorldHoverHandler): () => void {
    const key = this._nextId()
    this._activeMouseCtx().worldHoverListeners.set(key, fn)
    return () => {
      for (const ctx of this._mouseContexts.values()) {
        ctx.worldHoverListeners.delete(key)
      }
    }
  }

  onWorldHoverEnd(fn: WorldHoverEndHandler): () => void {
    const key = this._nextId()
    this._activeMouseCtx().worldHoverEndListeners.set(key, fn)
    return () => {
      for (const ctx of this._mouseContexts.values()) {
        ctx.worldHoverEndListeners.delete(key)
      }
    }
  }

  onWorldMouseDown(fn: WorldMouseHandler): () => void {
    const key = this._nextId()
    this._activeMouseCtx().worldMouseDownListeners.set(key, fn)
    return () => {
      for (const ctx of this._mouseContexts.values()) {
        ctx.worldMouseDownListeners.delete(key)
      }
    }
  }

  onWorldMouseUp(fn: WorldMouseHandler): () => void {
    const key = this._nextId()
    this._activeMouseCtx().worldMouseUpListeners.set(key, fn)
    return () => {
      for (const ctx of this._mouseContexts.values()) {
        ctx.worldMouseUpListeners.delete(key)
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

    this._mouseContexts.clear()
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

    this._emitWorldMouseDown(wx, wy, e.button)
  }

  private _onPointerUp = (e: PointerEvent): void => {
    if (this._uiHoverDepth > 0) return

    const { cellX, cellY } = this._pixelToUICell(e)
    const { wx, wy } = this._uiCellToWorldCell(cellX, cellY)

    this._emitWorldMouseUp(wx, wy, e.button)
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
    //console.log(`x: ${wx}, y: ${wy}`)
    for (const fn of this._activeMouseCtx().worldHoverListeners.values()) {
      fn(wx, wy)
    }
  }

  private _emitWorldHoverEnd(wx: number, wy: number): void {
    for (const fn of this._activeMouseCtx().worldHoverEndListeners.values()) {
      fn(wx, wy)
    }
  }

  private _emitWorldMouseDown(wx: number, wy: number, button: number): void {
    for (const fn of this._activeMouseCtx().worldMouseDownListeners.values()) {
      fn(wx, wy, button)
    }
  }

  private _emitWorldMouseUp(wx: number, wy: number, button: number): void {
    for (const fn of this._activeMouseCtx().worldMouseUpListeners.values()) {
      fn(wx, wy, button)
    }
  }

  // --------------------------------------------------------------------------
  // Context Helpers
  // --------------------------------------------------------------------------

  private _ensureMouseContext(name: string): MouseContext {
    let ctx = this._mouseContexts.get(name)

    if (!ctx) {
      ctx = {
        name,
        worldHoverListeners: new Map(),
        worldHoverEndListeners: new Map(),
        worldMouseDownListeners: new Map(),
        worldMouseUpListeners: new Map(),
      }

      this._mouseContexts.set(name, ctx)
    }

    return ctx
  }

  private _activeMouseCtx(): MouseContext {
    return this._ensureMouseContext(this._contextManager.active)
  }

  private _nextId(): string {
    return `mk_${++this._idCounter}`
  }
}

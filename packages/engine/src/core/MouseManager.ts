import type { ContextManager, ContextListener } from './ContextManager'
import type { RendererUI } from '../render/RendererUI'
import type { Camera } from '../render/Camera'
import type { TileMetricsData } from '../render/tileMetrics'

type UIMouseHandler = (nodeId: number | null, x: number, y: number, button: number) => void
type UIHoverHandler = (nodeId: number | null, x: number, y: number) => void
type UIHoverEndHandler = (nodeId: number | null, x: number, y: number) => void

type WorldMouseHandler = (wx: number, wy: number, button: number) => void
type WorldHoverHandler = (wx: number, wy: number) => void
type WorldHoverEndHandler = (wx: number, wy: number) => void

type MouseContext = {
  name: string
  uiHoverListeners: Map<string, UIHoverHandler>
  uiHoverEndListeners: Map<string, UIHoverEndHandler>
  uiMouseDownListeners: Map<string, UIMouseHandler>
  uiMouseUpListeners: Map<string, UIMouseHandler>
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
  private _uiLayer: RendererUI | null = null

  private _mouseContexts = new Map<string, MouseContext>()
  private _idCounter = 0

  private _hoveredUICell: { x: number; y: number; nodeId: number | null } | null = null
  private _hoveredWorldCell: { x: number; y: number } | null = null

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

    container.addEventListener('mousemove', this._onMouseMove)
    container.addEventListener('mousedown', this._onMouseDown)
    container.addEventListener('mouseup', this._onMouseUp)
    container.addEventListener('mouseleave', this._onMouseLeave)
  }

  // --------------------------------------------------------------------------
  // Called by Engine after renderer is initialized
  // --------------------------------------------------------------------------

  setUILayer(uiLayer: RendererUI): void {
    this._uiLayer = uiLayer
  }

  // --------------------------------------------------------------------------
  // ContextListener implementation
  // --------------------------------------------------------------------------

  onPush(_outgoing: string, _incoming: string): void {
    // Fire end events on the outgoing context for current hover state,
    // preserve the state so we can re-fire on pop
    this._emitHoverEnd()
    this._ensureMouseContext(_incoming)
  }

  onPop(_outgoing: string, _incoming: string): void {
    this._mouseContexts.delete(_outgoing)
    // Re-fire hover start events into the restored context
    this._emitHoverStart()
  }

  // --------------------------------------------------------------------------
  // UI event listeners
  // --------------------------------------------------------------------------

  onUIHover(fn: UIHoverHandler): () => void {
    const key = this._nextId()
    this._activeMouseCtx().uiHoverListeners.set(key, fn)
    return () => {
      for (const ctx of this._mouseContexts.values()) ctx.uiHoverListeners.delete(key)
    }
  }

  onUIHoverEnd(fn: UIHoverEndHandler): () => void {
    const key = this._nextId()
    this._activeMouseCtx().uiHoverEndListeners.set(key, fn)
    return () => {
      for (const ctx of this._mouseContexts.values()) ctx.uiHoverEndListeners.delete(key)
    }
  }

  onUIMouseDown(fn: UIMouseHandler): () => void {
    const key = this._nextId()
    this._activeMouseCtx().uiMouseDownListeners.set(key, fn)
    return () => {
      for (const ctx of this._mouseContexts.values()) ctx.uiMouseDownListeners.delete(key)
    }
  }

  onUIMouseUp(fn: UIMouseHandler): () => void {
    const key = this._nextId()
    this._activeMouseCtx().uiMouseUpListeners.set(key, fn)
    return () => {
      for (const ctx of this._mouseContexts.values()) ctx.uiMouseUpListeners.delete(key)
    }
  }

  // --------------------------------------------------------------------------
  // World event listeners
  // --------------------------------------------------------------------------

  onWorldHover(fn: WorldHoverHandler): () => void {
    const key = this._nextId()
    this._activeMouseCtx().worldHoverListeners.set(key, fn)
    return () => {
      for (const ctx of this._mouseContexts.values()) ctx.worldHoverListeners.delete(key)
    }
  }

  onWorldHoverEnd(fn: WorldHoverEndHandler): () => void {
    const key = this._nextId()
    this._activeMouseCtx().worldHoverEndListeners.set(key, fn)
    return () => {
      for (const ctx of this._mouseContexts.values()) ctx.worldHoverEndListeners.delete(key)
    }
  }

  onWorldMouseDown(fn: WorldMouseHandler): () => void {
    const key = this._nextId()
    this._activeMouseCtx().worldMouseDownListeners.set(key, fn)
    return () => {
      for (const ctx of this._mouseContexts.values()) ctx.worldMouseDownListeners.delete(key)
    }
  }

  onWorldMouseUp(fn: WorldMouseHandler): () => void {
    const key = this._nextId()
    this._activeMouseCtx().worldMouseUpListeners.set(key, fn)
    return () => {
      for (const ctx of this._mouseContexts.values()) ctx.worldMouseUpListeners.delete(key)
    }
  }

  // --------------------------------------------------------------------------
  // Cleanup
  // --------------------------------------------------------------------------

  destroy(): void {
    this._container.removeEventListener('mousemove', this._onMouseMove)
    this._container.removeEventListener('mousedown', this._onMouseDown)
    this._container.removeEventListener('mouseup', this._onMouseUp)
    this._container.removeEventListener('mouseleave', this._onMouseLeave)
    this._mouseContexts.clear()
  }

  // --------------------------------------------------------------------------
  // Private — event handlers
  // --------------------------------------------------------------------------

  private _onMouseMove = (e: MouseEvent): void => {
    const { cellX, cellY } = this._pixelToUICell(e)

    // --- UI layer first ---
    const nodeId = this._resolveUINode(cellX, cellY)
    const uiKey = `${cellX},${cellY}`
    const prevUI = this._hoveredUICell

    if (nodeId !== null || this._uiLayer?.cellStack.has(uiKey)) {
      // Cursor is over a UI cell
      const sameCell =
        prevUI !== null && prevUI.x === cellX && prevUI.y === cellY && prevUI.nodeId === nodeId

      if (!sameCell) {
        if (prevUI !== null) {
          this._emitUIHoverEnd(prevUI.nodeId, prevUI.x, prevUI.y)
        }
        // Also clear world hover if we're moving onto UI
        if (this._hoveredWorldCell !== null) {
          this._emitWorldHoverEnd(this._hoveredWorldCell.x, this._hoveredWorldCell.y)
          this._hoveredWorldCell = null
        }
        this._hoveredUICell = { x: cellX, y: cellY, nodeId }
        this._emitUIHover(nodeId, cellX, cellY)
      }
      return
    }

    // No UI — clear UI hover if needed
    if (prevUI !== null) {
      this._emitUIHoverEnd(prevUI.nodeId, prevUI.x, prevUI.y)
      this._hoveredUICell = null
    }

    // --- World layer ---
    const { wx, wy } = this._uiCellToWorldCell(cellX, cellY)
    const prevWorld = this._hoveredWorldCell

    const sameWorld = prevWorld !== null && prevWorld.x === wx && prevWorld.y === wy
    if (!sameWorld) {
      if (prevWorld !== null) {
        this._emitWorldHoverEnd(prevWorld.x, prevWorld.y)
      }
      this._hoveredWorldCell = { x: wx, y: wy }
      this._emitWorldHover(wx, wy)
    }
  }

  private _onMouseDown = (e: MouseEvent): void => {
    const { cellX, cellY } = this._pixelToUICell(e)
    const uiKey = `${cellX},${cellY}`

    if (this._uiLayer?.cellStack.has(uiKey)) {
      const nodeId = this._resolveUINode(cellX, cellY)
      this._emitUIMouseDown(nodeId, cellX, cellY, e.button)
      return
    }

    const { wx, wy } = this._uiCellToWorldCell(cellX, cellY)
    this._emitWorldMouseDown(wx, wy, e.button)
  }

  private _onMouseUp = (e: MouseEvent): void => {
    const { cellX, cellY } = this._pixelToUICell(e)
    const uiKey = `${cellX},${cellY}`

    if (this._uiLayer?.cellStack.has(uiKey)) {
      const nodeId = this._resolveUINode(cellX, cellY)
      this._emitUIMouseUp(nodeId, cellX, cellY, e.button)
      return
    }

    const { wx, wy } = this._uiCellToWorldCell(cellX, cellY)
    this._emitWorldMouseUp(wx, wy, e.button)
  }

  private _onMouseLeave = (): void => {
    this._emitHoverEnd()
    this._hoveredUICell = null
    this._hoveredWorldCell = null
  }

  // --------------------------------------------------------------------------
  // Private — coordinate conversion
  // --------------------------------------------------------------------------

  private _pixelToUICell(e: MouseEvent): { cellX: number; cellY: number } {
    const rect = this._container.getBoundingClientRect()
    const px = e.clientX - rect.left
    const py = e.clientY - rect.top
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

  // Returns the topmost node ID at a UI cell, or null if no node there
  private _resolveUINode(cellX: number, cellY: number): number | null {
    if (!this._uiLayer) return null
    const stack = this._uiLayer.cellStack.get(`${cellX},${cellY}`)
    if (!stack || stack.length === 0) return null
    return stack[stack.length - 1]
  }

  // --------------------------------------------------------------------------
  // Private — context-aware emit helpers
  // --------------------------------------------------------------------------

  private _emitHoverEnd(): void {
    if (this._hoveredUICell !== null) {
      this._emitUIHoverEnd(this._hoveredUICell.nodeId, this._hoveredUICell.x, this._hoveredUICell.y)
    }
    if (this._hoveredWorldCell !== null) {
      this._emitWorldHoverEnd(this._hoveredWorldCell.x, this._hoveredWorldCell.y)
    }
  }

  private _emitHoverStart(): void {
    if (this._hoveredUICell !== null) {
      this._emitUIHover(this._hoveredUICell.nodeId, this._hoveredUICell.x, this._hoveredUICell.y)
    }
    if (this._hoveredWorldCell !== null) {
      this._emitWorldHover(this._hoveredWorldCell.x, this._hoveredWorldCell.y)
    }
  }

  private _emitUIHover(nodeId: number | null, x: number, y: number): void {
    for (const fn of this._activeMouseCtx().uiHoverListeners.values()) fn(nodeId, x, y)
  }

  private _emitUIHoverEnd(nodeId: number | null, x: number, y: number): void {
    for (const fn of this._activeMouseCtx().uiHoverEndListeners.values()) fn(nodeId, x, y)
  }

  private _emitUIMouseDown(nodeId: number | null, x: number, y: number, button: number): void {
    for (const fn of this._activeMouseCtx().uiMouseDownListeners.values()) fn(nodeId, x, y, button)
  }

  private _emitUIMouseUp(nodeId: number | null, x: number, y: number, button: number): void {
    for (const fn of this._activeMouseCtx().uiMouseUpListeners.values()) fn(nodeId, x, y, button)
  }

  private _emitWorldHover(wx: number, wy: number): void {
    for (const fn of this._activeMouseCtx().worldHoverListeners.values()) fn(wx, wy)
  }

  private _emitWorldHoverEnd(wx: number, wy: number): void {
    for (const fn of this._activeMouseCtx().worldHoverEndListeners.values()) fn(wx, wy)
  }

  private _emitWorldMouseDown(wx: number, wy: number, button: number): void {
    for (const fn of this._activeMouseCtx().worldMouseDownListeners.values()) fn(wx, wy, button)
  }

  private _emitWorldMouseUp(wx: number, wy: number, button: number): void {
    for (const fn of this._activeMouseCtx().worldMouseUpListeners.values()) fn(wx, wy, button)
  }

  // --------------------------------------------------------------------------
  // Private — context helpers
  // --------------------------------------------------------------------------

  private _ensureMouseContext(name: string): MouseContext {
    let ctx = this._mouseContexts.get(name)
    if (!ctx) {
      ctx = {
        name,
        uiHoverListeners: new Map(),
        uiHoverEndListeners: new Map(),
        uiMouseDownListeners: new Map(),
        uiMouseUpListeners: new Map(),
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

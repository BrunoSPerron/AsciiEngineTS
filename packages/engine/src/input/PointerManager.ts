import type { ContextListener } from './ContextManager'
import { EngineObject } from '../core/EngineObject'
import type { AsciiEngine } from '../core/Engine'

type WorldPointerHandler = (wx: number, wy: number, button: number) => void
type WorldHoverHandler = (wx: number, wy: number) => void
type WorldHoverEndHandler = (wx: number, wy: number) => void

type UIHandlers = {
  hover?: () => void
  hoverEnd?: () => void
  pointerDown?: (button: number) => void
  pointerUp?: (button: number) => void
}

type ListenerEntry<T> = {
  fn: T
  context: string
}

export type PointerManagerEvents = {
  none: []
}

// ---------------------------------------------------------------------------
// PointerManager
// ---------------------------------------------------------------------------

export class PointerManager extends EngineObject<PointerManagerEvents> implements ContextListener {
  private _idCounter = 0

  private _worldHoverListeners = new Map<string, ListenerEntry<WorldHoverHandler>>()
  private _worldHoverEndListeners = new Map<string, ListenerEntry<WorldHoverEndHandler>>()
  private _worldPointerDownListeners = new Map<string, ListenerEntry<WorldPointerHandler>>()
  private _worldPointerUpListeners = new Map<string, ListenerEntry<WorldPointerHandler>>()

  private _hoveredWorldCell: { x: number; y: number } | null = null

  /**
   * Tracks the set of UI elements the pointer is currently inside.
   * Using a Set instead of a depth counter makes this immune to:
   *   - Missed pointerleave events during DOM removal
   *   - Unbalanced enter/leave pairs from programmatic dispose
   * World events are suppressed whenever this set is non-empty.
   */
  private _hoveredUIElements = new Set<HTMLElement>()

  constructor() {
    super()
  }

  _init(engine: AsciiEngine) {
    super._init(engine)

    this.engine.contextManager.registerListener(this)

    const container = this.engine.gameContainer
    container.addEventListener('pointermove', this._onPointerMove)
    container.addEventListener('pointerdown', this._onPointerDown)
    container.addEventListener('pointerup', this._onPointerUp)
    container.addEventListener('pointerleave', this._onPointerLeave)
  }

  getHoveredWorldCell(): { x: number; y: number } | null {
    return this._hoveredWorldCell
  }

  // ---------------------------------------------------------------------------
  // ContextListener
  // ---------------------------------------------------------------------------

  onActivate(_outgoing: string, _incoming: string): void {
    this._emitHoverEnd()
    this._emitHoverStart()
  }

  onDeactivate(_outgoing: string, _incoming: string, _suppressActions?: Set<string>): void {
    this._emitHoverEnd()
    this._emitHoverStart()
  }

  // ---------------------------------------------------------------------------
  // UI Registration
  // ---------------------------------------------------------------------------

  registerUIElement(el: HTMLElement, handlers: UIHandlers): () => void {
    const onEnter = (): void => {
      const wasOverUI = this._hoveredUIElements.size > 0
      this._hoveredUIElements.add(el)

      if (!wasOverUI && this._hoveredWorldCell) {
        this._emitWorldHoverEnd(this._hoveredWorldCell.x, this._hoveredWorldCell.y)
        this._hoveredWorldCell = null
      }

      handlers.hover?.()
    }

    const onLeave = (): void => {
      this._hoveredUIElements.delete(el)
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
      // Explicitly remove the element from the hover set on dispose so that
      // world events resume correctly even if pointerleave never fired
      // (e.g. element removed from DOM while cursor was inside it).
      this._hoveredUIElements.delete(el)

      el.removeEventListener('pointerenter', onEnter)
      el.removeEventListener('pointerleave', onLeave)
      el.removeEventListener('pointerdown', onDown)
      el.removeEventListener('pointerup', onUp)
    }
  }

  // ---------------------------------------------------------------------------
  // World Event Listeners
  // ---------------------------------------------------------------------------

  onWorldHover(fn: WorldHoverHandler): () => void {
    const key = this._nextId()
    this._worldHoverListeners.set(key, { fn, context: this.engine.contextManager.active })
    return () => this._worldHoverListeners.delete(key)
  }

  onWorldHoverEnd(fn: WorldHoverEndHandler): () => void {
    const key = this._nextId()
    this._worldHoverEndListeners.set(key, { fn, context: this.engine.contextManager.active })
    return () => this._worldHoverEndListeners.delete(key)
  }

  onWorldPointerDown(fn: WorldPointerHandler): () => void {
    const key = this._nextId()
    this._worldPointerDownListeners.set(key, { fn, context: this.engine.contextManager.active })
    return () => this._worldPointerDownListeners.delete(key)
  }

  onWorldPointerUp(fn: WorldPointerHandler): () => void {
    const key = this._nextId()
    this._worldPointerUpListeners.set(key, { fn, context: this.engine.contextManager.active })
    return () => this._worldPointerUpListeners.delete(key)
  }

  // ---------------------------------------------------------------------------
  // Cleanup
  // ---------------------------------------------------------------------------

  destroy(): void {
    const container = this.engine.gameContainer
    container.removeEventListener('pointermove', this._onPointerMove)
    container.removeEventListener('pointerdown', this._onPointerDown)
    container.removeEventListener('pointerup', this._onPointerUp)
    container.removeEventListener('pointerleave', this._onPointerLeave)

    this._worldHoverListeners.clear()
    this._worldHoverEndListeners.clear()
    this._worldPointerDownListeners.clear()
    this._worldPointerUpListeners.clear()
    this._hoveredUIElements.clear()
  }

  // ---------------------------------------------------------------------------
  // Pointer Events
  // ---------------------------------------------------------------------------

  private _onPointerMove = (e: PointerEvent): void => {
    if (this._hoveredUIElements.size > 0) return

    const { wx, wy } = this._pixelToWorldCell(e)
    const prev = this._hoveredWorldCell
    if (prev !== null && prev.x === wx && prev.y === wy) return
    if (prev !== null) this._emitWorldHoverEnd(prev.x, prev.y)
    this._hoveredWorldCell = { x: wx, y: wy }
    this._emitWorldHover(wx, wy)
  }

  private _onPointerDown = (e: PointerEvent): void => {
    if (this._hoveredUIElements.size > 0) return
    const { wx, wy } = this._pixelToWorldCell(e)
    this._emitWorldPointerDown(wx, wy, e.button)
  }

  private _onPointerUp = (e: PointerEvent): void => {
    if (this._hoveredUIElements.size > 0) return
    const { wx, wy } = this._pixelToWorldCell(e)
    this._emitWorldPointerUp(wx, wy, e.button)
  }

  private _onPointerLeave = (): void => {
    this._emitHoverEnd()
    this._hoveredWorldCell = null
  }

  // ---------------------------------------------------------------------------
  // Coordinate Conversion
  // ---------------------------------------------------------------------------

  private _pixelToWorldCell(e: PointerEvent): { wx: number; wy: number } {
    const cameraPos = this.engine.renderer.camera.pos
    const tm = this.engine.renderer.tileMetrics
    const rect = this.engine.gameContainer.getBoundingClientRect()
    const px = e.clientX - rect.left
    const py = e.clientY - rect.top
    return {
      wx: Math.floor(px / tm.w + cameraPos.x),
      wy: Math.floor(py / tm.h + cameraPos.y),
    }
  }

  // ---------------------------------------------------------------------------
  // Emit Helpers
  // ---------------------------------------------------------------------------

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
    const active = this.engine.contextManager.active
    for (const { fn, context } of this._worldHoverListeners.values()) {
      if (context === active) fn(wx, wy)
    }
  }

  private _emitWorldHoverEnd(wx: number, wy: number): void {
    const active = this.engine.contextManager.active
    for (const { fn, context } of this._worldHoverEndListeners.values()) {
      if (context === active) fn(wx, wy)
    }
  }

  private _emitWorldPointerDown(wx: number, wy: number, button: number): void {
    const active = this.engine.contextManager.active
    for (const { fn, context } of this._worldPointerDownListeners.values()) {
      if (context === active) fn(wx, wy, button)
    }
  }

  private _emitWorldPointerUp(wx: number, wy: number, button: number): void {
    const active = this.engine.contextManager.active
    for (const { fn, context } of this._worldPointerUpListeners.values()) {
      if (context === active) fn(wx, wy, button)
    }
  }

  private _nextId(): string {
    return `mk_${++this._idCounter}`
  }
}

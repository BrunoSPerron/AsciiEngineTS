import type { ContextManager, ContextListener } from './ContextManager'

type ActionHandler = (action: string) => void

type HeldKey = { key: string; code: string }

type InputContext = {
  name: string
  actionDownListeners: Map<string, ActionHandler>
  actionUpListeners: Map<string, ActionHandler>
}

export class ActionManager implements ContextListener {
  private codeToActions = new Map<string, string[]>()
  private actionToKeys = new Map<string, string[]>()

  private _contextManager: ContextManager
  private _inputContexts = new Map<string, InputContext>()

  private keyDownState = new Map<string, HeldKey>()
  private actionPressCount = new Map<string, number>()
  private idCounter = 0

  private boundKeyDown = (e: KeyboardEvent) => {
    if (this.keyDownState.has(e.code)) return
    this.keyDownState.set(e.code, { key: e.key, code: e.code })
    for (const action of this.codeToActions.get(e.code) ?? []) this._pressAction(action)
  }

  private boundKeyUp = (e: KeyboardEvent) => {
    if (!this.keyDownState.has(e.code)) return
    this.keyDownState.delete(e.code)
    for (const action of this.codeToActions.get(e.code) ?? []) this._releaseAction(action)
  }

  private boundBlur = () => this._resetKeys()

  private boundVisibility = () => {
    if (document.visibilityState === 'hidden') this._resetKeys()
  }

  constructor(bindings: Record<string, string[]>, contextManager: ContextManager) {
    this._contextManager = contextManager
    this._loadBindings(bindings)

    // Create the root input context that ContextManager already has
    this._ensureInputContext('root')
    contextManager.registerListener(this)

    window.addEventListener('keydown', this.boundKeyDown)
    window.addEventListener('keyup', this.boundKeyUp)
    window.addEventListener('blur', this.boundBlur)
    document.addEventListener('visibilitychange', this.boundVisibility)
  }

  // --------------------------------------------------------------------------
  // ContextListener implementation
  // --------------------------------------------------------------------------

  onPush(outgoing: string, incoming: string): void {
    const outCtx = this._ensureInputContext(outgoing)
    // Release all held actions in the outgoing context
    for (const [action, count] of this.actionPressCount.entries()) {
      if (count > 0) this._emitAction(outCtx.actionUpListeners, action)
    }
    const inCtx = this._ensureInputContext(incoming)
    // Re-press all held actions in the incoming context
    for (const [action, count] of this.actionPressCount.entries()) {
      if (count > 0) this._emitAction(inCtx.actionDownListeners, action)
    }
  }

  onPop(outgoing: string, incoming: string): void {
    const outCtx = this._inputContexts.get(outgoing)
    if (outCtx) {
      for (const [action, count] of this.actionPressCount.entries()) {
        if (count > 0) this._emitAction(outCtx.actionUpListeners, action)
      }
      this._inputContexts.delete(outgoing)
    }
    const inCtx = this._ensureInputContext(incoming)
    for (const [action, count] of this.actionPressCount.entries()) {
      if (count > 0) this._emitAction(inCtx.actionDownListeners, action)
    }
  }

  // --------------------------------------------------------------------------
  // Action listeners — registered on the currently active context
  // --------------------------------------------------------------------------

  onActionKeyDown(fn: ActionHandler): () => void {
    const key = this._nextId()
    this._activeInputCtx().actionDownListeners.set(key, fn)
    return () => {
      for (const ctx of this._inputContexts.values()) ctx.actionDownListeners.delete(key)
    }
  }

  onActionKeyUp(fn: ActionHandler): () => void {
    const key = this._nextId()
    this._activeInputCtx().actionUpListeners.set(key, fn)
    return () => {
      for (const ctx of this._inputContexts.values()) ctx.actionUpListeners.delete(key)
    }
  }

  // --------------------------------------------------------------------------
  // Queries
  // --------------------------------------------------------------------------

  isActionDown(action: string, context: string): boolean {
    if (this._contextManager.active !== context) return false
    return (this.actionPressCount.get(action) ?? 0) > 0
  }

  // --------------------------------------------------------------------------
  // Cleanup
  // --------------------------------------------------------------------------

  destroy() {
    window.removeEventListener('keydown', this.boundKeyDown)
    window.removeEventListener('keyup', this.boundKeyUp)
    window.removeEventListener('blur', this.boundBlur)
    document.removeEventListener('visibilitychange', this.boundVisibility)
    this._inputContexts.clear()
    this.keyDownState.clear()
    this.actionPressCount.clear()
  }

  // --------------------------------------------------------------------------
  // Private
  // --------------------------------------------------------------------------

  private _pressAction(action: string) {
    const count = this.actionPressCount.get(action) ?? 0
    if (count === 0) {
      this._emitAction(this._activeInputCtx().actionDownListeners, action)
    }
    this.actionPressCount.set(action, count + 1)
  }

  private _releaseAction(action: string) {
    const count = this.actionPressCount.get(action) ?? 0
    if (count <= 1) {
      this.actionPressCount.delete(action)
      this._emitAction(this._activeInputCtx().actionUpListeners, action)
      return
    }
    this.actionPressCount.set(action, count - 1)
  }

  private _loadBindings(bindings: Record<string, string[]>) {
    this.codeToActions.clear()
    this.actionToKeys.clear()
    for (const [action, keys] of Object.entries(bindings)) {
      this.actionToKeys.set(action, keys)
      for (const key of keys) {
        const existing = this.codeToActions.get(key) ?? []
        existing.push(action)
        this.codeToActions.set(key, existing)
      }
    }
  }

  private _ensureInputContext(name: string): InputContext {
    let ctx = this._inputContexts.get(name)
    if (!ctx) {
      ctx = { name, actionDownListeners: new Map(), actionUpListeners: new Map() }
      this._inputContexts.set(name, ctx)
    }
    return ctx
  }

  private _activeInputCtx(): InputContext {
    return this._ensureInputContext(this._contextManager.active)
  }

  private _nextId(): string {
    return `lk_${++this.idCounter}`
  }

  private _emitAction(listeners: Map<string, ActionHandler>, action: string) {
    for (const fn of listeners.values()) fn(action)
  }

  private _resetKeys() {
    const ctx = this._activeInputCtx()
    for (const [action, count] of this.actionPressCount.entries()) {
      if (count > 0) {
        this._emitAction(ctx.actionUpListeners, action)
      }
    }
    this.keyDownState.clear()
    this.actionPressCount.clear()
  }
}

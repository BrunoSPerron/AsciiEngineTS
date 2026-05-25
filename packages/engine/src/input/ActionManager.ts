import type { ContextManager, ContextListener } from './ContextManager'

type ActionHandler = (action: string) => void

type ListenerEntry = {
  fn: ActionHandler
  context: string // 'global' | any context name
}

// ---------------------------------------------------------------------------
// ActionManager
// ---------------------------------------------------------------------------

export class ActionManager implements ContextListener {
  private _codeToActions = new Map<string, string[]>()

  private _contextManager: ContextManager
  private _idCounter = 0

  private _downListeners = new Map<string, ListenerEntry>()
  private _upListeners = new Map<string, ListenerEntry>()

  private _keyDownState = new Map<string, string>() // code → key
  private _actionPressCount = new Map<string, number>()

  private _boundKeyDown = (e: KeyboardEvent) => {
    if (this._keyDownState.has(e.code)) return
    this._keyDownState.set(e.code, e.key)
    for (const action of this._codeToActions.get(e.code) ?? []) {
      this._pressAction(action)
    }
  }

  private _boundKeyUp = (e: KeyboardEvent) => {
    if (!this._keyDownState.has(e.code)) return
    this._keyDownState.delete(e.code)
    for (const action of this._codeToActions.get(e.code) ?? []) {
      this._releaseAction(action)
    }
  }

  private _boundBlur = () => this._resetKeys()

  private _boundVisibility = () => {
    if (document.visibilityState === 'hidden') this._resetKeys()
  }

  constructor(bindings: Record<string, string[]>, contextManager: ContextManager) {
    this._contextManager = contextManager
    this._loadBindings(bindings)
    contextManager.registerListener(this)

    window.addEventListener('keydown', this._boundKeyDown)
    window.addEventListener('keyup', this._boundKeyUp)
    window.addEventListener('blur', this._boundBlur)
    document.addEventListener('visibilitychange', this._boundVisibility)
  }

  // ---------------------------------------------------------------------------
  // ContextListener
  // ---------------------------------------------------------------------------

  onActivate(outgoing: string, incoming: string): void {
    // Emit synthetic keyUp for held actions in the outgoing context
    for (const [action, count] of this._actionPressCount) {
      if (count > 0) this._emitUp(outgoing, action)
    }
    // Emit synthetic keyDown for held actions in the incoming context
    for (const [action, count] of this._actionPressCount) {
      if (count > 0) this._emitDown(incoming, action)
    }
  }

  onDeactivate(outgoing: string, incoming: string, suppressActions?: Set<string>): void {
    for (const [action, count] of this._actionPressCount) {
      if (count > 0) this._emitUp(outgoing, action)
    }
    for (const [action, count] of this._actionPressCount) {
      if (count > 0 && !suppressActions?.has(action)) {
        this._emitDown(incoming, action)
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Register a keydown listener.
   * @param layer - omit for current active context, pass 'global' to always fire
   */
  onActionKeyDown(fn: ActionHandler, layer?: 'global'): () => void {
    const key = this._nextId()
    const context = layer === 'global' ? 'global' : this._contextManager.active
    this._downListeners.set(key, { fn, context })
    return () => this._downListeners.delete(key)
  }

  /**
   * Register a keyup listener.
   * @param layer - omit for current active context, pass 'global' to always fire
   */
  onActionKeyUp(fn: ActionHandler, layer?: 'global'): () => void {
    const key = this._nextId()
    const context = layer === 'global' ? 'global' : this._contextManager.active
    this._upListeners.set(key, { fn, context })
    return () => this._upListeners.delete(key)
  }

  /**
   * Returns true if the action is currently held and the given context is active.
   */
  isActionKeyDown(action: string, context: string): boolean {
    if (this._contextManager.active !== context) return false
    return (this._actionPressCount.get(action) ?? 0) > 0
  }

  clearAllKeyDown(): void {
    const active = this._contextManager.active
    for (const [action, count] of this._actionPressCount) {
      if (count > 0) this._emitUp(active, action)
    }
    this._keyDownState.clear()
    this._actionPressCount.clear()
  }

  destroy(): void {
    window.removeEventListener('keydown', this._boundKeyDown)
    window.removeEventListener('keyup', this._boundKeyUp)
    window.removeEventListener('blur', this._boundBlur)
    document.removeEventListener('visibilitychange', this._boundVisibility)
    this._downListeners.clear()
    this._upListeners.clear()
    this._keyDownState.clear()
    this._actionPressCount.clear()
  }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  private _pressAction(action: string): void {
    const count = this._actionPressCount.get(action) ?? 0
    if (count === 0) {
      this._emitDown(this._contextManager.active, action)
      this._emitDown('global', action)
    }
    this._actionPressCount.set(action, count + 1)
  }

  private _releaseAction(action: string): void {
    const count = this._actionPressCount.get(action) ?? 0
    if (count <= 1) {
      this._actionPressCount.delete(action)
      this._emitUp(this._contextManager.active, action)
      this._emitUp('global', action)
      return
    }
    this._actionPressCount.set(action, count - 1)
  }

  private _emitDown(context: string, action: string): void {
    for (const { fn, context: c } of this._downListeners.values()) {
      if (c === context) fn(action)
    }
  }

  private _emitUp(context: string, action: string): void {
    for (const { fn, context: c } of this._upListeners.values()) {
      if (c === context) fn(action)
    }
  }

  private _resetKeys(): void {
    const active = this._contextManager.active
    for (const [action, count] of this._actionPressCount) {
      if (count > 0) {
        this._emitUp(active, action)
        this._emitUp('global', action)
      }
    }
    this._keyDownState.clear()
    this._actionPressCount.clear()
  }

  private _loadBindings(bindings: Record<string, string[]>): void {
    this._codeToActions.clear()
    for (const [action, keys] of Object.entries(bindings)) {
      for (const key of keys) {
        const existing = this._codeToActions.get(key) ?? []
        existing.push(action)
        this._codeToActions.set(key, existing)
      }
    }
  }

  private _nextId(): string {
    return `lk_${++this._idCounter}`
  }
}

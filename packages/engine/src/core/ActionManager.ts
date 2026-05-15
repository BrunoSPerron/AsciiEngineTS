type ActionHandler = (action: string) => void

type HeldKey = { key: string; code: string }

type InputContext = {
  name: string
  actionDownListeners: Map<string, ActionHandler>
  actionUpListeners: Map<string, ActionHandler>
}

export class ActionManager {
  private keyToActions = new Map<string, string[]>()
  private actionToKeys = new Map<string, string[]>()

  private contextStack: InputContext[] = []
  private keyDownState = new Map<string, HeldKey>()
  private idCounter = 0

  private _actionsForEvent(e: KeyboardEvent): string[] {
    const byCode = this.keyToActions.get(e.code) ?? []
    const byKey = this.keyToActions.get(e.key) ?? []
    // Deduplicate in case code and key resolve to overlapping action sets
    return [...new Set([...byCode, ...byKey])]
  }

  private boundKeyDown = (e: KeyboardEvent) => {
    this.keyDownState.set(this._stateKey(e), { key: e.key, code: e.code })
    for (const action of this._actionsForEvent(e)) {
      this._emitAction(this._activeCtx().actionDownListeners, action)
    }
  }

  private boundKeyUp = (e: KeyboardEvent) => {
    this.keyDownState.delete(this._stateKey(e))
    for (const action of this._actionsForEvent(e)) {
      this._emitAction(this._activeCtx().actionUpListeners, action)
    }
  }

  private boundBlur = () => this._resetKeys()

  private boundVisibility = () => {
    if (document.visibilityState === 'hidden') this._resetKeys()
  }

  constructor(bindings: Record<string, string[]>) {
    this._loadBindings(bindings)
    this._pushContext('root')

    window.addEventListener('keydown', this.boundKeyDown)
    window.addEventListener('keyup', this.boundKeyUp)
    window.addEventListener('blur', this.boundBlur)
    document.addEventListener('visibilitychange', this.boundVisibility)
  }

  // --------------------------------------------------------------------------
  // Context
  // --------------------------------------------------------------------------

  pushContext(name: string): void {
    for (const held of this.keyDownState.values()) {
      const synth = new KeyboardEvent('keyup', { key: held.key, code: held.code })
      const ctx = this._activeCtx()
      for (const action of this._actionsForEvent(synth)) {
        this._emitAction(ctx.actionUpListeners, action)
      }
    }
    this._pushContext(name)
  }

  popContext(name: string): void {
    const i = this.contextStack.findLastIndex((c) => c.name === name)
    if (i === -1) return

    const ctx = this.contextStack[i]

    for (const held of this.keyDownState.values()) {
      const synth = new KeyboardEvent('keyup', { key: held.key, code: held.code })
      for (const action of this._actionsForEvent(synth)) {
        this._emitAction(ctx.actionUpListeners, action)
      }
    }

    this.contextStack.splice(i, 1)

    if (this.contextStack.length > 0) {
      const next = this._activeCtx()
      for (const held of this.keyDownState.values()) {
        const synth = new KeyboardEvent('keydown', { key: held.key, code: held.code })
        for (const action of this._actionsForEvent(synth)) {
          this._emitAction(next.actionDownListeners, action)
        }
      }
    }
  }

  // --------------------------------------------------------------------------
  // Action listeners — registered on the current context
  // --------------------------------------------------------------------------

  onActionKeyDown(fn: ActionHandler): () => void {
    const key = this._nextId()
    this._activeCtx().actionDownListeners.set(key, fn)
    return () => {
      for (const ctx of this.contextStack) ctx.actionDownListeners.delete(key)
    }
  }

  onActionKeyUp(fn: ActionHandler): () => void {
    const key = this._nextId()
    this._activeCtx().actionUpListeners.set(key, fn)
    return () => {
      for (const ctx of this.contextStack) ctx.actionUpListeners.delete(key)
    }
  }

  // --------------------------------------------------------------------------
  // Queries
  // --------------------------------------------------------------------------

  isActionDown(action: string, context: string): boolean {
    if (this._activeCtx().name !== context) return false
    const keys = this.actionToKeys.get(action)
    if (!keys) return false
    return keys.some((k) => {
      for (const held of this.keyDownState.values()) {
        if (held.key === k || held.code === k) return true
      }
      return false
    })
  }

  // --------------------------------------------------------------------------
  // Cleanup
  // --------------------------------------------------------------------------

  destroy() {
    window.removeEventListener('keydown', this.boundKeyDown)
    window.removeEventListener('keyup', this.boundKeyUp)
    window.removeEventListener('blur', this.boundBlur)
    document.removeEventListener('visibilitychange', this.boundVisibility)
    this.contextStack = []
    this.keyDownState.clear()
  }

  // --------------------------------------------------------------------------
  // Private
  // --------------------------------------------------------------------------

  private _loadBindings(bindings: Record<string, string[]>) {
    this.keyToActions.clear()
    this.actionToKeys.clear()
    for (const [action, keys] of Object.entries(bindings)) {
      this.actionToKeys.set(action, keys)
      for (const key of keys) {
        const existing = this.keyToActions.get(key) ?? []
        existing.push(action)
        this.keyToActions.set(key, existing)
      }
    }
  }

  private _pushContext(name: string): void {
    this.contextStack.push({
      name,
      actionDownListeners: new Map(),
      actionUpListeners: new Map(),
    })
  }

  private _activeCtx(): InputContext {
    if (this.contextStack.length === 0) throw new Error('No active input context')
    return this.contextStack[this.contextStack.length - 1]
  }

  private _nextId(): string {
    return `lk_${++this.idCounter}`
  }

  private _stateKey(e: KeyboardEvent): string {
    return e.code || e.key
  }

  private _emitAction(listeners: Map<string, ActionHandler>, action: string) {
    for (const fn of listeners.values()) fn(action)
  }

  private _resetKeys() {
    const ctx = this._activeCtx()
    for (const held of this.keyDownState.values()) {
      const synth = new KeyboardEvent('keyup', { key: held.key, code: held.code })
      for (const action of this._actionsForEvent(synth)) {
        this._emitAction(ctx.actionUpListeners, action)
      }
    }
    this.keyDownState.clear()
  }
}

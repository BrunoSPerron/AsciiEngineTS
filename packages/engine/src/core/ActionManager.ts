type ActionHandler = (action: string) => void

type HeldKey = { key: string; code: string }

type InputContext = {
  name: string
  actionDownListeners: Map<string, ActionHandler>
  actionUpListeners: Map<string, ActionHandler>
}

export class ActionManager {
  private codeToActions = new Map<string, string[]>()
  private actionToKeys = new Map<string, string[]>()

  private contextStack: InputContext[] = []
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
    const ctx = this._activeCtx()
    for (const [action, count] of this.actionPressCount.entries()) {
      if (count > 0) this._emitAction(ctx.actionUpListeners, action)
    }
    this._pushContext(name)
    const next = this._activeCtx()
    for (const [action, count] of this.actionPressCount.entries()) {
      if (count > 0) this._emitAction(next.actionDownListeners, action)
    }
  }

  popContext(name: string): void {
    const i = this.contextStack.findLastIndex((c) => c.name === name)
    if (i === -1) return

    const ctx = this.contextStack[i]

    for (const [action, count] of this.actionPressCount.entries()) {
      if (count > 0) this._emitAction(ctx.actionUpListeners, action)
    }

    this.contextStack.splice(i, 1)

    if (this.contextStack.length > 0) {
      const next = this._activeCtx()
      for (const [action, count] of this.actionPressCount.entries()) {
        if (count > 0) this._emitAction(next.actionDownListeners, action)
      }
    }
  }

  // --------------------------------------------------------------------------
  // Action listeners
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
    this.contextStack = []
    this.keyDownState.clear()
    this.actionPressCount.clear()
  }

  // --------------------------------------------------------------------------
  // Private
  // --------------------------------------------------------------------------

  private _pressAction(action: string) {
    const count = this.actionPressCount.get(action) ?? 0
    if (count === 0) {
      this._emitAction(this._activeCtx().actionDownListeners, action)
    }
    this.actionPressCount.set(action, count + 1)
  }

  private _releaseAction(action: string) {
    const count = this.actionPressCount.get(action) ?? 0
    if (count <= 1) {
      this.actionPressCount.delete(action)
      this._emitAction(this._activeCtx().actionUpListeners, action)
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

  private _emitAction(listeners: Map<string, ActionHandler>, action: string) {
    for (const fn of listeners.values()) fn(action)
  }

  private _resetKeys() {
    const ctx = this._activeCtx()
    for (const [action, count] of this.actionPressCount.entries()) {
      if (count > 0) {
        this._emitAction(ctx.actionUpListeners, action)
      }
    }
    this.keyDownState.clear()
    this.actionPressCount.clear()
  }
}

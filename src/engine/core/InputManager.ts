type KeyHandler = (event: KeyboardEvent) => void
type ListenerMap = Map<string, KeyHandler>
type InputContext = {
  keyDownListeners: ListenerMap
  keyUpListeners: ListenerMap
}

export class InputManager {
  private target: Window
  private contextStack: Array<{ name: string; ctx: InputContext }> = []
  private idCounter = 0
  private keyDownState: Set<string> = new Set()

  private boundKeyDown = (e: KeyboardEvent) => {
    this.keyDownState.add(e.key)
    this.emit(this.activeCtx().keyDownListeners, e)
  }

  private boundKeyUp = (e: KeyboardEvent) => {
    this.keyDownState.delete(e.key)
    this.emit(this.activeCtx().keyUpListeners, e)
  }

  constructor(target: Window = window) {
    this.pushContext('root_context')
    target.addEventListener('keydown', this.boundKeyDown)
    target.addEventListener('keyup', this.boundKeyUp)
    this.target = target

    window.addEventListener('blur', this.resetKeys)
    document.addEventListener('visibilitychange', this.handleVisibility)
  }

  // ---------- Public API ----------

  pushContext(name: string): void {
    this.contextStack.push({
      name,
      ctx: { keyDownListeners: new Map(), keyUpListeners: new Map() },
    })
  }

  popContext(name: string): void {
    const i = this.contextStack.findLastIndex((c) => c.name === name)
    if (i === -1) return
    this.contextStack[i].ctx.keyDownListeners.clear()
    this.contextStack[i].ctx.keyUpListeners.clear()
    this.contextStack.splice(i, 1)
  }

  onKeyDown(fn: KeyHandler): string {
    return this.add(this.activeCtx().keyDownListeners, fn)
  }

  onKeyUp(fn: KeyHandler): string {
    return this.add(this.activeCtx().keyUpListeners, fn)
  }

  isKeyDown(key: string): boolean {
    return this.keyDownState.has(key)
  }

  unlisten(key: string): void {
    for (const stackElement of this.contextStack) {
      stackElement.ctx.keyDownListeners.delete(key)
      stackElement.ctx.keyUpListeners.delete(key)
    }
  }

  // ---------- Internals ----------

  private activeCtx(): InputContext {
    if (this.contextStack.length === 0) throw new Error('No active input context')
    return this.contextStack[this.contextStack.length - 1].ctx
  }

  private add(set: ListenerMap, fn: KeyHandler): string {
    const key = `lk_${++this.idCounter}`
    set.set(key, fn)
    return key
  }

  private emit(set: ListenerMap, event: KeyboardEvent) {
    for (const fn of set.values()) fn(event)
  }

  private handleVisibility = () => {
    if (document.visibilityState === 'hidden') {
      this.resetKeys()
    }
  }

  private resetKeys = () => {
    for (const key of this.keyDownState) {
      this.emit(this.activeCtx().keyUpListeners, new KeyboardEvent('keyup', { key }))
    }
    this.keyDownState.clear()
  }

  // ---------- Cleanup ----------

  destroy() {
    this.target.removeEventListener('keydown', this.boundKeyDown)
    this.target.removeEventListener('keyup', this.boundKeyUp)
    for (const stackElement of this.contextStack) {
      stackElement.ctx.keyDownListeners.clear()
      stackElement.ctx.keyUpListeners.clear()
    }
    this.keyDownState.clear()
  }
}

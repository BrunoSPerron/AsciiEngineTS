type KeyHandler = (event: KeyboardEvent) => void

type ListenerMap = Map<string, KeyHandler>

export class InputManager {
  private keyDownListeners: ListenerMap = new Map()
  private keyUpListeners: ListenerMap = new Map()

  private keyDownState: Set<string> = new Set()

  private idCounter = 0

  private boundKeyDown = (e: KeyboardEvent) => {
    this.keyDownState.add(e.key)
    this.emit(this.keyDownListeners, e)
  }

  private boundKeyUp = (e: KeyboardEvent) => {
    this.keyDownState.delete(e.key)
    this.emit(this.keyUpListeners, e)
  }

  constructor(target: Window | Document = window) {
    target.addEventListener("keydown", this.boundKeyDown)
    target.addEventListener("keyup", this.boundKeyUp)

    window.addEventListener("blur", this.resetKeys)
    document.addEventListener("visibilitychange", this.handleVisibility)
  }

  // ---------- Public API ----------

  onKeyDown(fn: KeyHandler): string {
    return this.add(this.keyDownListeners, fn)
  }

  onKeyUp(fn: KeyHandler): string {
    return this.add(this.keyUpListeners, fn)
  }

  isKeyDown(key: string): boolean {
    return this.keyDownState.has(key)
  }

  unlisten(key: string): void {
    this.keyDownListeners.delete(key)
    this.keyUpListeners.delete(key)
  }

  // ---------- Internals ----------

  private add(set: ListenerMap, fn: KeyHandler): string {
    const key = `lk_${++this.idCounter}`
    set.set(key, fn)
    return key
  }

  private emit(set: ListenerMap, event: KeyboardEvent) {
    for (const fn of set.values()) {
      fn(event)
    }
  }

  private handleVisibility = () => {
    if (document.visibilityState === "hidden") {
      this.resetKeys()
    }
  }

  private resetKeys = () => {
    for (const key of this.keyDownState) {
      this.emit(this.keyUpListeners, new KeyboardEvent("keyup", { key }))
    }
    this.keyDownState.clear()
  }

  // ---------- Cleanup ----------

  destroy(target: Window | Document = window) {
    target.removeEventListener("keydown", this.boundKeyDown)
    target.removeEventListener("keyup", this.boundKeyUp)

    this.keyDownListeners.clear()
    this.keyUpListeners.clear()
    this.keyDownState.clear()
  }
}

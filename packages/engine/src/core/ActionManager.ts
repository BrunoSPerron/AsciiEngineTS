import { InputManager } from './InputManager'

type ActionHandler = (action: string) => void

export class ActionManager {
  private inputManager: InputManager

  private keyToAction = new Map<string, string>()
  private actionToKeys = new Map<string, string[]>()

  private downListenerKey: string
  private upListenerKey: string

  private _downListeners = new Set<ActionHandler>()
  private _upListeners = new Set<ActionHandler>()

  constructor(bindings: Record<string, string[]>) {
    this.inputManager = new InputManager()
    this.load(bindings)

    this.downListenerKey = this.inputManager.onKeyDown((e) => {
      const action = this.keyToAction.get(e.code) ?? this.keyToAction.get(e.key)
      if (action) {
        for (const fn of this._downListeners) fn(action)
      }
    })

    this.upListenerKey = this.inputManager.onKeyUp((e) => {
      const action = this.keyToAction.get(e.code) ?? this.keyToAction.get(e.key)
      if (action) {
        for (const fn of this._upListeners) fn(action)
      }
    })
  }

  // ---------- Public API ----------

  pushContext(name: string) {
    this.inputManager.pushContext(name)
  }

  popContext(name: string) {
    this.inputManager.popContext(name)
  }

  onActionKeyDown(fn: ActionHandler): () => void {
    this._downListeners.add(fn)
    return () => this._downListeners.delete(fn)
  }

  onActionKeyUp(fn: ActionHandler): () => void {
    this._upListeners.add(fn)
    return () => this._upListeners.delete(fn)
  }

  isActionDown(action: string): boolean {
    const keys = this.actionToKeys.get(action)
    if (!keys) return false
    return keys.some((k) => this.inputManager.isKeyDown(k))
  }

  // ---------- Internals ----------

  private load(bindings: Record<string, string[]>) {
    this.keyToAction.clear()
    this.actionToKeys.clear()

    for (const [action, keys] of Object.entries(bindings)) {
      this.actionToKeys.set(action, keys)
      for (const key of keys) {
        this.keyToAction.set(key, action)
      }
    }
  }

  // ---------- Cleanup ----------

  destroy() {
    this.inputManager.unlisten(this.downListenerKey)
    this.inputManager.unlisten(this.upListenerKey)
    this._downListeners.clear()
    this._upListeners.clear()
  }
}

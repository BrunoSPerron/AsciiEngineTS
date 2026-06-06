import type { AsciiEngine } from './Engine'

type EventMap = Record<string, unknown[]>
type Handler<A extends unknown[]> = (...args: A) => void

export class EngineObject<E extends EventMap = Record<never, never>> {
  private _engine: AsciiEngine | null = null
  private _events = new Map<keyof E, Set<Handler<unknown[]>>>()
  private _subscriptions = new Set<() => void>()
  private _destroyed = false

  // ---------------------------------------------------------------------------
  // Engine ref
  // ---------------------------------------------------------------------------

  get engine(): AsciiEngine {
    if (!this._engine) throw new Error(`${this.constructor.name}: engine not initialized`)
    return this._engine
  }

  _initEngine(engine: AsciiEngine): void {
    if (this._engine) throw new Error(`${this.constructor.name}: engine already initialized`)
    this._engine = engine
  }

  // ---------------------------------------------------------------------------
  // Outbound — others subscribe to this object
  // ---------------------------------------------------------------------------

  on<K extends keyof E>(event: K, fn: Handler<E[K]>): () => void {
    if (!this._events.has(event)) this._events.set(event, new Set())
    const handlers = this._events.get(event)!
    handlers.add(fn as Handler<unknown[]>)

    let removed = false
    return () => {
      if (removed) return
      removed = true
      handlers.delete(fn as Handler<unknown[]>)
    }
  }

  once<K extends keyof E>(event: K, fn: Handler<E[K]>): () => void {
    const unsub = this.on(event, (...args: E[K]) => {
      unsub()
      fn(...args)
    })
    return unsub
  }

  protected emit<K extends keyof E>(event: K, ...args: E[K]): void {
    if (this._destroyed) return
    const handlers = this._events.get(event)
    if (!handlers) return
    for (const fn of [...handlers]) fn(...args)
  }

  // ---------------------------------------------------------------------------
  // Inbound — subscriptions this object holds on others
  // ---------------------------------------------------------------------------

  protected listen(unsub: () => void): () => void {
    this._subscriptions.add(unsub)
    return () => {
      unsub()
      this._subscriptions.delete(unsub)
    }
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  get destroyed(): boolean {
    return this._destroyed
  }

  _destroy(): void {
    if (this._destroyed) return
    this._destroyed = true
    this._events.clear()
    for (const unsub of this._subscriptions) unsub()
    this._subscriptions.clear()
    this._engine = null
  }
}

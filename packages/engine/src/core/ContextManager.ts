export type ContextListener = {
  onPush(outgoingContext: string, incomingContext: string): void
  onPop(outgoingContext: string, incomingContext: string): void
}

export class ContextManager {
  private _stack: string[] = ['root']
  private _listeners = new Set<ContextListener>()

  get active(): string {
    return this._stack[this._stack.length - 1]
  }

  get stack(): readonly string[] {
    return this._stack
  }

  registerListener(listener: ContextListener): () => void {
    this._listeners.add(listener)
    return () => this._listeners.delete(listener)
  }

  pushContext(name: string): void {
    const outgoing = this.active
    this._stack.push(name)
    for (const l of this._listeners) l.onPush(outgoing, name)
  }

  popContext(name: string): void {
    const i = this._stack.findLastIndex((c) => c === name)
    if (i === -1) return
    const outgoing = this._stack[i]
    this._stack.splice(i, 1)
    const incoming = this.active
    for (const l of this._listeners) l.onPop(outgoing, incoming)
  }
}

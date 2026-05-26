// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ContextListener = {
  onActivate(outgoing: string, incoming: string): void
  onDeactivate(outgoing: string, incoming: string, suppressActions?: Set<string>): void
}

export type ZoneOptions = {
  /** Zones sharing the same group cycle together when Tab is pressed. */
  group?: string
  /**
   * The zone that owns this group — i.e. the zone that receives focus when
   * this group's cycle exhausts up the tree.
   */
  parent?: string
}

type Zone = {
  name: string
  group: string | null
  parent: string | null
}

// ---------------------------------------------------------------------------
// ContextManager
// ---------------------------------------------------------------------------

export class ContextManager {
  private _modalStack: string[] = []
  private _zones = new Map<string, Zone>()
  private _focusedZone: string | null = null
  private _listeners = new Set<ContextListener>()

  /**
   * Per-group focus history: ordered list of zone names, most-recently-focused last.
   */
  private _groupHistory = new Map<string, string[]>()

  // ---------------------------------------------------------------------------
  // Public
  // ---------------------------------------------------------------------------

  /**
   * The context that currently receives input.
   * - Modal on stack → top modal name
   * - No modal, zone focused → focused zone name
   * - No modal, no zones → 'root'
   */
  get active(): string {
    if (this._modalStack.length > 0) {
      return this._modalStack[this._modalStack.length - 1]
    }
    return this._focusedZone ?? 'root'
  }

  /** Full modal stack, bottom to top. */
  get stack(): readonly string[] {
    return this._modalStack
  }

  /** Currently focused zone name, or null. */
  get focusedZone(): string | null {
    return this._focusedZone
  }

  // ---------------------------------------------------------------------------
  // Listener registration
  // ---------------------------------------------------------------------------

  registerListener(listener: ContextListener): () => void {
    this._listeners.add(listener)
    return () => this._listeners.delete(listener)
  }

  // ---------------------------------------------------------------------------
  // Modal API
  // ---------------------------------------------------------------------------

  pushContext(name: string): void {
    const outgoing = this.active
    this._modalStack.push(name)
    const incoming = this.active
    for (const l of this._listeners) l.onActivate(outgoing, incoming)
  }

  popContext(name: string, suppressActions?: Set<string>): void {
    const i = this._modalStack.findLastIndex((c) => c === name)
    if (i === -1) return
    const outgoing = this._modalStack[i]
    this._modalStack.splice(i, 1)
    const incoming = this.active
    for (const l of this._listeners) l.onDeactivate(outgoing, incoming, suppressActions)
  }

  // ---------------------------------------------------------------------------
  // Zone API
  // ---------------------------------------------------------------------------

  /**
   * Register a zone. Immediately steals focus.
   * Returns an unregister function that restores focus to the previous zone.
   */
  registerZone(name: string, options: ZoneOptions = {}): () => void {
    const zone: Zone = {
      name,
      group: options.group ?? null,
      parent: options.parent ?? null,
    }

    this._zones.set(name, zone)

    if (zone.group !== null) {
      let history = this._groupHistory.get(zone.group)
      if (!history) {
        history = []
        this._groupHistory.set(zone.group, history)
      }
      const idx = history.indexOf(name)
      if (idx !== -1) history.splice(idx, 1)
      history.push(name)
    }

    this._setFocusedZone(name)

    return () => this._unregisterZone(name)
  }

  /**
   * Programmatically focus a zone by name.
   * No-op if the zone is not registered.
   */
  focusZone(name: string): void {
    if (!this._zones.has(name)) return
    this._setFocusedZone(name)
  }

  /**
   * Cycle focus among siblings in the focused zone's group.
   * direction: +1 = forward (Tab), -1 = backward (Shift+Tab)
   *
   * - No-op if focused zone has no group
   * - No-op if modals are active
   * - Wraps within the group; climbs to parent only when group has one member
   */
  cycleFocus(direction: 1 | -1 = 1): void {
    if (this._modalStack.length > 0) return
    if (this._focusedZone === null) return

    const zone = this._zones.get(this._focusedZone)
    if (!zone || zone.group === null) return

    const siblings = this._siblingsInGroup(zone.group)
    if (siblings.length <= 1) {
      this._climbToParent(zone)
      return
    }

    const currentIdx = siblings.indexOf(this._focusedZone)
    const nextIdx = (currentIdx + direction + siblings.length) % siblings.length
    this._setFocusedZone(siblings[nextIdx])
  }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  private _unregisterZone(name: string): void {
    const zone = this._zones.get(name)
    if (!zone) return

    this._zones.delete(name)

    if (zone.group !== null) {
      const history = this._groupHistory.get(zone.group)
      if (history) {
        const idx = history.indexOf(name)
        if (idx !== -1) history.splice(idx, 1)
        if (history.length === 0) this._groupHistory.delete(zone.group)
      }
    }

    if (this._focusedZone !== name) return

    // Was focused — restore to best available zone
    this._focusedZone = null
    const next = this._resolveFocusAfterRemoval(zone)
    if (next !== null) {
      this._setFocusedZone(next)
    } else {
      // No zones left — notify listeners of transition to 'root' or top modal
      for (const l of this._listeners) l.onDeactivate(name, this.active)
    }
  }

  private _resolveFocusAfterRemoval(removed: Zone): string | null {
    // Previous zone in same group
    if (removed.group !== null) {
      const history = this._groupHistory.get(removed.group)
      if (history && history.length > 0) return history[history.length - 1]
    }

    // Parent zone
    if (removed.parent !== null && this._zones.has(removed.parent)) {
      return removed.parent
    }

    // Most recently focused zone in any group
    for (const history of this._groupHistory.values()) {
      if (history.length > 0) return history[history.length - 1]
    }

    // Any groupless zone
    for (const zone of this._zones.values()) {
      if (zone.group === null) return zone.name
    }

    return null
  }

  private _climbToParent(zone: Zone): void {
    if (zone.parent === null || !this._zones.has(zone.parent)) return
    this._setFocusedZone(zone.parent)
  }

  private _siblingsInGroup(group: string): string[] {
    const result: string[] = []
    for (const zone of this._zones.values()) {
      if (zone.group === group) result.push(zone.name)
    }
    return result
  }

  private _setFocusedZone(name: string): void {
    const outgoing = this.active
    this._focusedZone = name

    // Move to end of group history
    const zone = this._zones.get(name)
    if (zone?.group !== null && zone?.group !== undefined) {
      const history = this._groupHistory.get(zone.group)
      if (history) {
        const idx = history.indexOf(name)
        if (idx !== -1) history.splice(idx, 1)
        history.push(name)
      }
    }

    const incoming = this.active
    if (outgoing === incoming) return
    for (const l of this._listeners) l.onActivate(outgoing, incoming)
  }
}

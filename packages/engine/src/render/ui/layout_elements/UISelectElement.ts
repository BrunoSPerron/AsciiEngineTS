import { UILayoutElement } from './UILayoutElement'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Mode = 'list' | 'roller' | 'single'

type ChangeHandler = (index: number) => void

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Opacity for a roller item at `distance` steps from center. */
function slotOpacity(distance: number): number {
  return distance === 0 ? 1 : Math.max(0.12, 1 - distance * 0.28)
}

/**
 * Crop `text` to fit within `maxChars`.
 * - maxChars === 1 : first character only, no ellipsis
 * - maxChars >= 2  : crop, trim trailing whitespace, replace last char with '…'
 * - maxChars <= 0  : empty string
 */
function cropLabel(text: string, maxChars: number): string {
  if (maxChars <= 0) return ''
  if (text.length <= maxChars) return text
  if (maxChars === 1) return text[0]
  return text.slice(0, maxChars - 1).trimEnd() + '…'
}

// ---------------------------------------------------------------------------
// UISelectElement
// ---------------------------------------------------------------------------

/**
 * A managed select element for UILayout.
 *
 * Modes (resolved in onResize from item count and updated h):
 *   list   — all items visible, bar slides to selected row
 *   roller — vertically centered scroller; bar fixed at center, text scrolls under it
 *   single — h === 1, left/right arrow navigation
 *
 * Selection bar technique: two identical text layers scroll in sync.
 * The normal layer and inverted layer have different css and is clipped via clip-path
 * to the bar rectangle only. With default css t he result is perfect a↔b color
 * swapthat works with smooth scrolling and partial row transitions.
 *
 * Usage:
 *   const sel = new UISelectElement(['Option A', 'Option B', 'Option C'])
 *   engine.renderer.ui.addElement(sel, { w: 24, h: 5, xPercent: 50, yPercent: 50 })
 *   sel.onChange(index => console.log('changed', index))
 *   const chosen = await sel.result  // -1 if cancelled
 *
 * The element does NOT remove itself on confirm/cancel.
 * Call engine.renderer.ui.removeElement(sel.id) yourself.
 * result resolves once on the first confirm/cancel.
 */
export class UISelectElement extends UILayoutElement {
  private _items: string[]
  private _currentIndex: number = 0
  private _mode: Mode = 'list'

  // Shared
  private _unlistenKey: (() => void) | null = null
  private _pointerDisposers: Array<() => void> = []
  private _contextName = ''

  // List mode
  private _listScrollEl: HTMLDivElement | null = null
  private _listScrollInvEl: HTMLDivElement | null = null
  private _listBarEl: HTMLDivElement | null = null
  private _listHitEls: HTMLDivElement[] = []

  // Roller mode
  private _rollerScrollEl: HTMLDivElement | null = null
  private _rollerScrollInvEl: HTMLDivElement | null = null
  private _rollerHitEls: HTMLDivElement[] = []

  // Single-line mode
  private _singleLabelEl: HTMLDivElement | null = null

  // Result promise
  private _resolve!: (index: number) => void
  private _settled = false
  readonly result: Promise<number>

  // onChange listeners
  private _changeListeners = new Set<ChangeHandler>()

  // Arrow glyphs
  private static readonly ARROW_L = '◁'
  private static readonly ARROW_L_HOV = '◀'
  private static readonly ARROW_R = '▷'
  private static readonly ARROW_R_HOV = '▶'

  constructor(items: string[]) {
    super()
    this._items = items
    this.result = new Promise<number>((resolve) => {
      this._resolve = resolve
    })
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  onChange(fn: ChangeHandler): () => void {
    this._changeListeners.add(fn)
    return () => this._changeListeners.delete(fn)
  }

  confirm(): void {
    this._settle(this._currentIndex)
  }
  cancel(): void {
    this._settle(-1)
  }

  get currentIndex(): number {
    return this._currentIndex
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  onLoad(): void {
    this._contextName = `select_element_${this.id}`
    this.engine.contextManager.pushContext(this._contextName)
    this._registerKeys()
  }

  onResize(): void {
    this._rebuild()
  }

  onUnload(): void {
    this._unlistenKey?.()
    this._unlistenKey = null
    this._cleanupPointer()
    this.engine.contextManager.popContext(this._contextName)
  }

  // ---------------------------------------------------------------------------
  // Build / rebuild
  // ---------------------------------------------------------------------------

  private _resolveMode(): Mode {
    if (this.h <= 1) return 'single'
    if (this._items.length > this.h) return 'roller'
    return 'list'
  }

  private _build(): void {
    this._mode = this._resolveMode()
    this.el.className = 'ui-layout-element ui-select'

    if (this._mode === 'list') this._buildList()
    else if (this._mode === 'roller') this._buildRoller()
    else this._buildSingle()
  }

  private _rebuild(): void {
    this._cleanupPointer()
    this.el.innerHTML = ''
    this._listScrollEl = null
    this._listScrollInvEl = null
    this._listBarEl = null
    this._listHitEls = []
    this._rollerScrollEl = null
    this._rollerScrollInvEl = null
    this._rollerHitEls = []
    this._singleLabelEl = null
    this._build()
  }

  // ---------------------------------------------------------------------------
  // Shared DOM helpers
  // ---------------------------------------------------------------------------

  /**
   * Scroll pair: [normal, inverted].
   * clip-path on the inverted layer is set by caller (it's dynamic).
   */
  private _makeScrollPair(extraCls: string = ''): [HTMLDivElement, HTMLDivElement] {
    const normal = document.createElement('div')
    normal.className = `ui-select-scroll ui-select-scroll--normal ${extraCls}`

    const inverted = document.createElement('div')
    inverted.className = `ui-select-scroll ui-select-scroll--inverted ${extraCls}`

    return [normal, inverted]
  }

  /**
   * Appends one text row to both normal and inverted scroll containers.
   * Dynamic: top, height, opacity (roller only).
   */
  private _makeTextRow(
    index: number,
    topPx: number,
    heightPx: number,
    normal: HTMLDivElement,
    inverted: HTMLDivElement,
    extraClass = '',
  ): void {
    const text = this._renderLabel(index)

    let row = document.createElement('div')
    row.className = `ui-select-row ${extraClass ? extraClass : ''}`
    row.style.top = `${topPx}px`
    row.style.height = `${heightPx}px`
    row.style.lineHeight = `${heightPx}px`
    row.textContent = text
    normal.appendChild(row)

    row = document.createElement('div')
    row.className = `ui-select-row inverted ${extraClass ? extraClass : ''}`
    row.style.top = `${topPx}px`
    row.style.height = `${heightPx}px`
    row.style.lineHeight = `${heightPx}px`
    row.textContent = text
    inverted.appendChild(row)
  }

  /** Hit zone div — dynamic top/height set by caller. */
  private _makeHitEl(): HTMLDivElement {
    const el = document.createElement('div')
    el.className = 'ui-select-hit'
    return el
  }

  /** Sync both scroll containers to the same translateY. */
  private _syncScroll(
    normal: HTMLDivElement | null,
    inverted: HTMLDivElement | null,
    offsetY: number,
  ): void {
    const t = `translateY(${offsetY}px)`
    if (normal) normal.style.transform = t
    if (inverted) inverted.style.transform = t
  }

  /** Build the clip-path inset string for the inverted layer. */
  private _clipPath(barTopPx: number, barHeightPx: number, totalHeightPx: number): string {
    const bottomPx = totalHeightPx - barTopPx - barHeightPx
    return `inset(${barTopPx}px 0px ${Math.max(0, bottomPx)}px 0px)`
  }

  // ---------------------------------------------------------------------------
  // List mode
  // ---------------------------------------------------------------------------

  private _buildList(): void {
    const tm = this.tileMetrics!
    const count = Math.min(this._items.length, this.h)
    const totalH = count * tm.h
    const barTopPx = this._currentIndex * tm.h

    // Scroll pair — no movement in list mode, but clip must match bar
    const [normal, inverted] = this._makeScrollPair()
    inverted.style.clipPath = this._clipPath(barTopPx, tm.h, totalH)
    this.el.appendChild(normal)
    this.el.appendChild(inverted)
    this._listScrollEl = normal
    this._listScrollInvEl = inverted

    // Rows + hit zones
    for (let i = 0; i < count; i++) {
      this._makeTextRow(i, i * tm.h, tm.h, normal, inverted)

      const hit = this._makeHitEl()
      hit.style.top = `${i * tm.h}px`
      hit.style.height = `${tm.h}px`
      this.el.appendChild(hit)
      this._listHitEls.push(hit)

      const idx = i
      const dispose = this.engine.pointerManager.registerUIElement(hit, {
        hover: () => this._setSelected(idx),
        pointerDown: (btn) => {
          if (btn === 0) this._settle(idx)
        },
      })
      this._pointerDisposers.push(dispose)
    }
  }

  private _listRefresh(): void {
    const tm = this.tileMetrics!
    const count = Math.min(this._items.length, this.h)
    const totalH = count * tm.h
    const barTopPx = this._currentIndex * tm.h

    if (this._listBarEl) {
      this._listBarEl.style.top = `${barTopPx}px`
    }

    if (this._listScrollInvEl) {
      this._listScrollInvEl.style.clipPath = this._clipPath(barTopPx, tm.h, totalH)
    }

    const nChildren = this._listScrollEl?.children
    const iChildren = this._listScrollInvEl?.children
    for (let i = 0; i < count; i++) {
      const text = this._renderLabel(i)
      if (nChildren?.[i]) (nChildren[i] as HTMLElement).textContent = text
      if (iChildren?.[i]) (iChildren[i] as HTMLElement).textContent = text
    }
  }

  // ---------------------------------------------------------------------------
  // Roller mode
  // ---------------------------------------------------------------------------

  private _buildRoller(): void {
    const h = this.h
    const tm = this.tileMetrics!
    const count = this._items.length
    const centerSlot = Math.floor(h / 2)
    const evenOffset = h % 2 === 0 ? tm.h / 2 : 0
    const totalH = h * tm.h
    const barTopPx = centerSlot * tm.h

    // Scroll pair
    const [normal, inverted] = this._makeScrollPair('ui-select-scroll--roller')
    inverted.style.clipPath = this._clipPath(barTopPx, tm.h, totalH)
    this.el.appendChild(normal)
    this.el.appendChild(inverted)
    this._rollerScrollEl = normal
    this._rollerScrollInvEl = inverted

    // One row per item
    for (let i = 0; i < count; i++) {
      this._makeTextRow(i, i * tm.h, tm.h, normal, inverted, 'ui-select-row--roller')
    }

    // Hit zones — one per visible slot
    for (let slot = 0; slot < h; slot++) {
      const hit = this._makeHitEl()
      hit.style.top = `${slot * tm.h + evenOffset}px`
      hit.style.height = `${tm.h}px`
      this.el.appendChild(hit)
      this._rollerHitEls.push(hit)

      const s = slot
      const dispose = this.engine.pointerManager.registerUIElement(hit, {
        pointerDown: (btn) => {
          if (btn !== 0) return
          if (s === centerSlot) {
            this._settle(this._currentIndex)
          } else {
            const delta = s < centerSlot ? -1 : 1
            this._setSelected(this._clamp(this._currentIndex + delta))
          }
        },
      })
      this._pointerDisposers.push(dispose)
    }

    this._rollerRefresh(false)
  }

  private _rollerRefresh(animate = true): void {
    const { h } = this
    const tm = this.tileMetrics!
    const count = this._items.length
    const centerSlot = Math.floor(h / 2)
    const evenOffset = h % 2 === 0 ? tm.h / 2 : 0

    if (!animate) {
      this._rollerScrollEl?.style.setProperty('transition', 'none')
      this._rollerScrollInvEl?.style.setProperty('transition', 'none')
    }

    const offsetY = centerSlot * tm.h + evenOffset - this._currentIndex * tm.h
    this._syncScroll(this._rollerScrollEl, this._rollerScrollInvEl, offsetY)

    if (!animate) {
      requestAnimationFrame(() => {
        this._rollerScrollEl?.style.removeProperty('transition')
        this._rollerScrollInvEl?.style.removeProperty('transition')
      })
    }

    // Distance-based opacity on both layers' rows
    for (const container of [this._rollerScrollEl, this._rollerScrollInvEl]) {
      if (!container) continue
      for (let i = 0; i < count; i++) {
        const row = container.children[i] as HTMLElement | undefined
        if (!row) continue
        row.style.opacity = String(slotOpacity(Math.abs(i - this._currentIndex)))
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Single-line mode
  // ---------------------------------------------------------------------------

  private _buildSingle(): void {
    const tm = this.tileMetrics!

    const wrap = document.createElement('div')
    wrap.className = 'ui-select-single'
    wrap.style.lineHeight = `${tm.h}px`
    this.el.appendChild(wrap)

    const left = document.createElement('div')
    left.className = 'ui-select-arrow'
    left.textContent = UISelectElement.ARROW_L
    wrap.appendChild(left)

    const label = document.createElement('div')
    label.className = 'ui-select-label'
    wrap.appendChild(label)
    this._singleLabelEl = label

    const right = document.createElement('div')
    right.className = 'ui-select-arrow'
    right.textContent = UISelectElement.ARROW_R
    wrap.appendChild(right)

    const disposeLeft = this.engine.pointerManager.registerUIElement(left, {
      hover: () => {
        left.textContent = UISelectElement.ARROW_L_HOV
      },
      hoverEnd: () => {
        left.textContent = UISelectElement.ARROW_L
      },
      pointerDown: (btn) => {
        if (btn === 0) this._setSelected(this._clamp(this._currentIndex - 1))
      },
    })
    const disposeRight = this.engine.pointerManager.registerUIElement(right, {
      hover: () => {
        right.textContent = UISelectElement.ARROW_R_HOV
      },
      hoverEnd: () => {
        right.textContent = UISelectElement.ARROW_R
      },
      pointerDown: (btn) => {
        if (btn === 0) this._setSelected(this._clamp(this._currentIndex + 1))
      },
    })
    this._pointerDisposers.push(disposeLeft, disposeRight)

    this._singleRefresh()
  }

  private _singleRefresh(): void {
    if (!this._singleLabelEl) return
    const labelW = Math.max(0, this.w - 2)
    this._singleLabelEl.textContent = cropLabel(this._items[this._currentIndex] ?? '', labelW)
  }

  // ---------------------------------------------------------------------------
  // Selection
  // ---------------------------------------------------------------------------

  private _setSelected(index: number): void {
    if (index === this._currentIndex) return
    this._currentIndex = index
    this._emitChange()
    this._refresh()
  }

  private _refresh(): void {
    if (this._mode === 'list') this._listRefresh()
    else if (this._mode === 'roller') this._rollerRefresh()
    else this._singleRefresh()
  }

  private _clamp(index: number): number {
    const count = this._items.length
    return ((index % count) + count) % count
  }

  // ---------------------------------------------------------------------------
  // Label rendering
  // ---------------------------------------------------------------------------

  private _renderLabel(index: number): string {
    return cropLabel(this._items[index] ?? '', this.w)
  }

  // ---------------------------------------------------------------------------
  // Settle
  // ---------------------------------------------------------------------------

  private _settle(index: number): void {
    if (this._settled) return
    this._settled = true
    this._resolve(index)
  }

  // ---------------------------------------------------------------------------
  // Input
  // ---------------------------------------------------------------------------

  private _registerKeys(): void {
    this._unlistenKey = this.engine.actionManager.onActionKeyDown((action) => {
      switch (action) {
        case 'up':
          if (this._mode !== 'single') this._setSelected(this._clamp(this._currentIndex - 1))
          break
        case 'down':
          if (this._mode !== 'single') this._setSelected(this._clamp(this._currentIndex + 1))
          break
        case 'left':
          if (this._mode === 'single') this._setSelected(this._clamp(this._currentIndex - 1))
          break
        case 'right':
          if (this._mode === 'single') this._setSelected(this._clamp(this._currentIndex + 1))
          break
        case 'confirm':
          this._settle(this._currentIndex)
          break
        case 'pause':
          this._settle(-1)
          break
      }
    })
  }

  // ---------------------------------------------------------------------------
  // Emit / cleanup
  // ---------------------------------------------------------------------------

  private _emitChange(): void {
    for (const fn of this._changeListeners) fn(this._currentIndex)
  }

  private _cleanupPointer(): void {
    for (const dispose of this._pointerDisposers) dispose()
    this._pointerDisposers.length = 0
  }
}

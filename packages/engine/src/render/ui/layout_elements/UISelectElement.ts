import { UISelectBase } from './UISelectBase'

const ROOT_ROLLER_CLS = 'ui-roller-fade'

type Mode = 'list' | 'roller' | 'single'

function cropLabel(text: string, maxChars: number): string {
  if (maxChars <= 0) return ''
  if (text.length <= maxChars) return text
  if (maxChars === 1) return text[0]
  return text.slice(0, maxChars - 1).trimEnd() + '…'
}

/**
 * A managed select element for UILayout.
 *
 * Modes (resolved in resized from item count and updated h):
 *   list   — all items visible, bar slides to selected row
 *   roller — vertically centered scroller; bar fixed at center, text scrolls under it
 *   single — h === 1, left/right arrow navigation
 *
 * Selection bar technique: two identical text layers scroll in sync.
 * The normal layer and inverted layer have different css and is clipped via clip-path
 * to the bar rectangle only. Using the default css this result in perfect a↔b color
 * swapthat works with smooth scrolling and partial row transitions.
 */
export class UISelectElement extends UISelectBase {
  private _items: string[]
  private _currentIndex: number = 0
  private _mode: Mode = 'list'

  suppressOnClose = new Set(['confirm', 'cancel', 'pause'])

  // Shared
  private _unlistenKey: (() => void) | null = null
  private _pointerDisposers: Array<() => void> = []
  private _contextName = ''
  public closeOnSelect: boolean

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

  // Arrow glyphs
  private static readonly ARROW_L = '◁'
  private static readonly ARROW_L_HOV = '◀'
  private static readonly ARROW_R = '▷'
  private static readonly ARROW_R_HOV = '▶'

  constructor(items: string[], closeOnSelect: boolean = true) {
    super()
    this._items = new Array<string>(items.length)
    for (let i = 0; i < items.length; i++) this._items[i] = ` ${items[i]} `
    this.closeOnSelect = closeOnSelect
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  confirm(): void {
    this._confirm(this._currentIndex)
  }

  cancel(): void {
    this._confirm(-1)
  }

  get currentIndex(): number {
    return this._currentIndex
  }

  set currentIndex(value: number) {
    this._setSelected(value)
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  loaded(): void {
    this._contextName = `select_element_${this.id}`
    this.engine.contextManager.pushContext(this._contextName)
    this._registerKeys()
  }

  resized(): void {
    this._rebuild()
  }

  unloaded(): void {
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
  // Layout override
  // ---------------------------------------------------------------------------
  override layout(x: number, y: number, w: number, h: number): void {
    if (h === 1 && w < 5) {
      this.setHidden(true)
      return
    }
    return super.layout(x, y, w, h)
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
    element: HTMLDivElement,
    extraClass = '',
  ): void {
    const text = this._renderLabel(index)
    const heightPx = this.tileMetrics!.h

    const row = document.createElement('div')
    row.className = `ui-select-row ${extraClass ? extraClass : ''}`
    row.style.top = `${topPx}px`
    row.style.height = `${heightPx}px`
    row.style.lineHeight = `${heightPx}px`
    row.textContent = text
    element.appendChild(row)
  }

  /** Hit zone div — dynamic top/height set by caller. */
  private _makeHitEl(): HTMLDivElement {
    const el = document.createElement('div')
    el.className = 'ui-select-hit'
    return el
  }

  /** Sync both scroll containers. */
  private _syncScroll(
    normal: HTMLDivElement | null,
    inverted: HTMLDivElement | null,
    offsetY: number,
    visualIndex: number,
  ): void {
    if (normal) {
      normal.style.transform = `translateY(${offsetY}px)`
    }

    if (inverted) {
      inverted.style.transform = `translateY(${offsetY}px)`
      const tm = this.tileMetrics!
      const totalH = this._items.length * tm.h * 2
      const barTopPx = visualIndex * tm.h
      inverted.style.clipPath = this._clipPath(barTopPx, totalH)
    }
  }

  /** Build the clip-path inset string for the inverted layer. */
  private _clipPath(barTopPx: number, totalHeightPx: number): string {
    const bottomPx = totalHeightPx - barTopPx - this.tileMetrics!.h
    return `inset(${barTopPx}px 0px ${Math.max(0, bottomPx)}px 0px)`
  }

  // ---------------------------------------------------------------------------
  // List mode
  // ---------------------------------------------------------------------------

  private _buildList(): void {
    const tm = this.tileMetrics!
    const count = Math.max(this._items.length, this.h)
    const totalH = count * tm.h
    const barTopPx = this._currentIndex * tm.h

    // Scroll pair, clip must match bar
    const [normal, inverted] = this._makeScrollPair()
    inverted.style.clipPath = this._clipPath(barTopPx, totalH)
    this.el.appendChild(normal)
    this.el.appendChild(inverted)
    this._listScrollEl = normal
    this._listScrollInvEl = inverted

    // Rows + hit zones
    for (let i = 0; i < count; i++) {
      this._makeTextRow(i, i * tm.h, normal)
      this._makeTextRow(i, i * tm.h, inverted)

      const hit = this._makeHitEl()
      hit.style.top = `${i * tm.h}px`
      hit.style.height = `${tm.h}px`
      this.el.appendChild(hit)
      this._listHitEls.push(hit)

      const idx = i
      const dispose = this.engine.pointerManager.registerUIElement(hit, {
        hover: () => this._setSelected(idx),
        pointerDown: (btn) => {
          if (btn === 0) this._confirm(idx)
        },
      })
      this._pointerDisposers.push(dispose)
    }
  }

  private _listRefresh(): void {
    const tm = this.tileMetrics!
    const count = Math.max(this._items.length, this.h)
    const totalH = count * tm.h
    const barTopPx = this._currentIndex * tm.h

    if (this._listBarEl) {
      this._listBarEl.style.top = `${barTopPx}px`
    }

    if (this._listScrollInvEl) {
      this._listScrollInvEl.style.clipPath = this._clipPath(barTopPx, totalH)
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
    const tm = this.tileMetrics!
    const count = this._items.length
    const centerSlot = Math.floor(this.h / 2)
    const evenOffset = this.h % 2 === 0 ? -tm.h / 2 : 0
    const totalH = this.h * tm.h
    const barTopPx = centerSlot * tm.h

    // Scroll pair
    const [normal, inverted] = this._makeScrollPair('ui-select-scroll--roller')
    inverted.style.height = `${this._items.length * this.tileMetrics!.h * 2}px`
    inverted.style.clipPath = this._clipPath(barTopPx, totalH)
    this.el.appendChild(normal)
    this.el.appendChild(inverted)
    this._rollerScrollEl = normal
    this._rollerScrollInvEl = inverted

    // One row per item for - with before/after ghost copies for infinite-scroll illusion
    for (let copy = -1; copy <= 1; copy++) {
      for (let i = 0; i < count; i++) {
        const ypos = (copy * count + i) * tm.h
        this._makeTextRow(i, ypos, normal, 'ui-select-row--roller')
        this._makeTextRow(i, ypos, inverted, 'ui-select-row--roller inverted')
      }
    }

    // Hit zones — one per visible slot
    for (let slot = 0; slot < this.h; slot++) {
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
            this._confirm(this._currentIndex)
          } else {
            const delta = s < centerSlot ? -1 : 1
            this._setSelected(this._clamp(this._currentIndex + delta))
          }
        },
      })
      this._pointerDisposers.push(dispose)
    }

    this._rollerRefresh(0)
  }

  /**
   * @param wrapDirection -1, 0 or 1
   */
  private _rollerRefresh(wrapDirection: number = 0): void {
    this.el.classList.add(ROOT_ROLLER_CLS)
    const tm = this.tileMetrics!
    const centerSlot = Math.floor(this.h / 2)
    const evenOffset = this.h % 2 === 0 ? -tm.h / 2 : 0

    if (wrapDirection) {
      this._rollerScrollEl?.style.setProperty('transition', 'none')
      this._rollerScrollInvEl?.style.setProperty('transition', 'none')

      const ghostOffsetY = (centerSlot + wrapDirection - this._currentIndex) * tm.h + evenOffset
      const visualIndex = wrapDirection === 1 ? -1 : this._currentIndex + 1
      this._syncScroll(this._rollerScrollEl, this._rollerScrollInvEl, ghostOffsetY, visualIndex)

      requestAnimationFrame(() => {
        this._rollerScrollEl?.style.removeProperty('transition')
        this._rollerScrollInvEl?.style.removeProperty('transition')

        const offsetY = (centerSlot - this._currentIndex) * tm.h + evenOffset
        this._syncScroll(this._rollerScrollEl, this._rollerScrollInvEl, offsetY, this._currentIndex)
      })
    } else {
      const offsetY = (centerSlot - this._currentIndex) * tm.h + evenOffset
      this._syncScroll(this._rollerScrollEl, this._rollerScrollInvEl, offsetY, this._currentIndex)
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
    this._singleLabelEl.textContent = cropLabel(this._items[this._currentIndex] ?? '', labelW - 3)
  }

  // ---------------------------------------------------------------------------
  // Selection
  // ---------------------------------------------------------------------------

  private _setSelected(index: number): void {
    const prev = this._currentIndex
    this._currentIndex = index
    this._emitChange()

    if (this._mode === 'list') this._listRefresh()
    else if (this._mode === 'roller') {
      const count = this._items.length
      const wrappedForward = prev === count - 1 && index === 0
      const wrappedBack = prev === 0 && index === count - 1
      const wrapDirection = wrappedForward ? 1 : wrappedBack ? -1 : 0
      this._rollerRefresh(wrapDirection)
    } else this._singleRefresh()
  }

  private _clamp(index: number): number {
    const count = this._items.length
    return ((index % count) + count) % count
  }

  // ---------------------------------------------------------------------------
  // Label rendering
  // ---------------------------------------------------------------------------

  private _renderLabel(index: number): string {
    return cropLabel(this._items[index] ?? '', this.w - 1)
  }

  // ---------------------------------------------------------------------------
  // Confirm
  // ---------------------------------------------------------------------------

  /**
   * @param index Selected option index or -1 for cancel
   */
  private _confirm(index: number): void {
    this._emitSelect(index)
    if (this.closeOnSelect) {
      this.engine.contextManager.popContext(this._contextName, this.suppressOnClose)
      this.engine.renderer.ui.removeElement(this.id)
    }
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
          this._confirm(this._currentIndex)
          break
        case 'cancel':
          this._confirm(-1)
          break
      }
    })
  }

  // ---------------------------------------------------------------------------
  // Emit / cleanup
  // ---------------------------------------------------------------------------

  private _cleanupPointer(): void {
    for (const dispose of this._pointerDisposers) dispose()
    this._pointerDisposers.length = 0
  }
}

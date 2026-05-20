import { UILayoutElement } from './UILayoutElement'

/**
 * A scrollable select list rendered inside a UILayout-managed region.
 *
 * Usage:
 *   const select = new UISelectElement(['Option A', 'Option B', 'Option C'])
 *   engine.renderer.ui.addElement(select, { w: 20, h: 5, xPercent: 50, yPercent: 50 })
 *   const chosen = await select.result  // resolves with index, or -1 on cancel
 *
 * The element removes itself from the layout when the user confirms or cancels.
 */
export class UISelectElement extends UILayoutElement {
  private _items: string[]
  private _currentIndex: number = 0
  private _itemEls: HTMLDivElement[] = []

  private _resolve!: (index: number) => void
  readonly result: Promise<number>

  private _unlistenKey: (() => void) | null = null
  private _pointerDisposers: Array<() => void> = []
  private _contextName = ''

  constructor(items: string[]) {
    super()
    this._items = items
    this.result = new Promise<number>((resolve) => {
      this._resolve = resolve
    })
  }

  // ---------------------------------------------------------------------------
  // Lifecycle hooks
  // ---------------------------------------------------------------------------

  onLoad(): void {
    this._contextName = `select_element_${this.id}`
    this.engine.contextManager.pushContext(this._contextName)

    this._buildItems()
    this._reflowItems()
    this._registerKeys()
  }

  onResize(): void {
    this._reflowItems()
  }

  onUnload(): void {
    this._unlistenKey?.()
    this._unlistenKey = null

    for (const dispose of this._pointerDisposers) dispose()
    this._pointerDisposers.length = 0

    this.engine.contextManager.popContext(this._contextName)
  }

  // ---------------------------------------------------------------------------
  // Private — item DOM
  // ---------------------------------------------------------------------------

  private _buildItems(): void {
    this.el.style.position = 'relative'
    this.el.style.overflow = 'hidden'

    this._itemEls = this._items.map((_text, index) => {
      const itemEl = document.createElement('div')
      itemEl.className = 'ui-selectable'
      itemEl.style.top = `${index * this.tileMetrics!.h}px`
      itemEl.style.cursor = 'pointer'
      this.el.appendChild(itemEl)

      const dispose = this.engine.pointerManager.registerUIElement(itemEl, {
        hover: () => this._setSelected(index),
        pointerDown: (button) => {
          if (button === 0) this._close(index)
        },
      })
      this._pointerDisposers.push(dispose)

      return itemEl
    })

    this._setSelected(0)
  }

  /**
   * Re-pads each item to fill the full element width and re-positions rows.
   * Called on initial load and every resize so the selected highlight always
   * stretches edge-to-edge regardless of text length.
   */
  private _reflowItems(): void {
    const pad = ' '
    const innerW = this.w - 2 // 1-char margin each side

    for (let i = 0; i < this._itemEls.length; i++) {
      const text = this._items[i]
      const padded = pad + text + ' '.repeat(Math.max(1, innerW - text.length))
      this._itemEls[i].textContent = padded
      this._itemEls[i].style.top = `${i * this.tileMetrics!.h}px`
    }
  }

  // ---------------------------------------------------------------------------
  // Private — selection state
  // ---------------------------------------------------------------------------

  private _setSelected(index: number): void {
    this._itemEls[this._currentIndex]?.classList.remove('selected')
    this._currentIndex = index
    this._itemEls[this._currentIndex]?.classList.add('selected')
  }

  private _move(delta: number): void {
    const count = this._items.length
    this._setSelected((((this._currentIndex + delta) % count) + count) % count)
  }

  // ---------------------------------------------------------------------------
  // Private — input
  // ---------------------------------------------------------------------------

  private _registerKeys(): void {
    this._unlistenKey = this.engine.actionManager.onActionKeyDown((action) => {
      switch (action) {
        case 'up':
          this._move(-1)
          break
        case 'down':
          this._move(+1)
          break
        case 'confirm':
          this._close(this._currentIndex)
          break
        case 'pause':
          this._close(-1)
          break
      }
    })
  }

  // ---------------------------------------------------------------------------
  // Private — close
  // ---------------------------------------------------------------------------

  private _close(index: number): void {
    this.engine.renderer.ui.removeElement(this.id) // triggers onUnload → destroy
    this._resolve(index)
  }
}

import type { ContextManager } from '../../../core/ContextManager'
import type { ActionManager } from '../../../core/ActionManager'
import type { RendererUI } from '../RendererUI'
import type { UIPanel } from './UIPanel'
import type { PointerManager } from '../../../core/PointerManager'
import { Anchor } from '../anchor'

export class SelectMenuList {
  private _rendererUI: RendererUI
  private _actionManager: ActionManager
  private _contextManager: ContextManager
  private _pointerManager: PointerManager | null
  private _pointerDisposers: Array<() => void> = []
  private _itemEls: HTMLDivElement[] = []
  private _currentIndex: number = 0
  private _panel: UIPanel | null = null

  private resolve!: (index: number) => void

  constructor(
    rendererUI: RendererUI,
    actionManager: ActionManager,
    contextManager: ContextManager,
    pointerManager: PointerManager | null = null,
  ) {
    this._rendererUI = rendererUI
    this._actionManager = actionManager
    this._contextManager = contextManager
    this._pointerManager = pointerManager
  }

  async open(
    x: number,
    y: number,
    w: number,
    h: number,
    items: string[],
    paddingX: number = 0,
    paddingY: number = 0,
    wraparound: boolean = true,
    anchor: Anchor = Anchor.MiddleCenter,
  ): Promise<number> {
    const container = document.createElement('div')
    container.style.position = 'relative'
    const pad = ' '.repeat(paddingX)

    this._itemEls = items.map((text, index) => {
      const el = document.createElement('div')
      el.className = 'selectable'
      el.textContent = `${pad}${text}${pad}` + ' '.repeat(Math.max(0, w - text.length))

      el.style.position = 'absolute'
      el.style.top = `${(paddingY + index) * this._rendererUI.tileMetrics.h}px`
      el.style.whiteSpace = 'pre'
      el.style.cursor = 'pointer'
      container.appendChild(el)

      if (this._pointerManager) {
        const dispose = this._pointerManager.registerUIElement(el, {
          hover: () => {
            this.setSelected(index)
          },

          pointerDown: (button) => {
            if (button !== 0) return
            void this.close(index)
          },
        })

        this._pointerDisposers.push(dispose)
      }
      return el
    })

    this.setSelected(0)

    const panelId = this._rendererUI.reserveId()
    this._contextManager.pushContext(`select_menu_${panelId}`)
    this._panel = await this._rendererUI.drawPanel(
      x,
      y,
      w,
      h,
      container,
      undefined,
      panelId,
      anchor,
    )

    this.registerKeys(wraparound)

    return new Promise<number>((resolve) => {
      this.resolve = (index) => {
        this._cleanupPointer()
        resolve(index)
      }
    })
  }

  private setSelected(index: number): void {
    this._itemEls[this._currentIndex]?.classList.remove('selected')
    this._currentIndex = index
    this._itemEls[this._currentIndex]?.classList.add('selected')
  }

  private move(delta: number, wraparound: boolean): void {
    const count = this._itemEls.length
    let next = this._currentIndex + delta

    if (wraparound) {
      next = ((next % count) + count) % count
    } else {
      next = Math.max(0, Math.min(count - 1, next))
    }

    this.setSelected(next)
  }

  private registerKeys(wraparound: boolean): void {
    this._actionManager.onActionKeyDown((action) => {
      switch (action) {
        case 'up':
          this.move(-1, wraparound)
          break
        case 'down':
          this.move(+1, wraparound)
          break
        case 'confirm':
          void this.close(this._currentIndex)
          break
        case 'pause':
          void this.close(-1)
          break
      }
    })
  }

  private async close(index: number): Promise<void> {
    const ctxName = `select_menu_${this._panel?.id ?? ''}`
    this._cleanupPointer()

    if (!this._panel) {
      this._contextManager.popContext(ctxName)
      this.resolve(index)
      return
    }
    await this._panel.close()
    this._rendererUI.removePanel(this._panel)
    this._panel = null
    this._contextManager.popContext(ctxName)
    this.resolve(index)
  }

  private _cleanupPointer(): void {
    for (const dispose of this._pointerDisposers) {
      dispose()
    }
    this._pointerDisposers.length = 0
  }
}

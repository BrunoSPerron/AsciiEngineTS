import type { ContextManager } from '../../core/ContextManager'
import type { ActionManager } from '../../core/ActionManager'
import type { RendererUI } from '../RendererUI'
import type { UIPanel } from './UIPanel'
import type { MouseManager } from '../../core/MouseManager'
import { Anchor } from '../anchor'

export class SelectMenuList {
  private _rendererUI: RendererUI
  private _actionManager: ActionManager
  private _contextManager: ContextManager
  private _mouseManager: MouseManager | null
  private _itemEls: HTMLDivElement[] = []
  private _currentIndex: number = 0
  private _panel: UIPanel | null = null

  private resolve!: (index: number) => void

  constructor(
    rendererUI: RendererUI,
    actionManager: ActionManager,
    contextManager: ContextManager,
    mouseManager: MouseManager | null = null,
  ) {
    this._rendererUI = rendererUI
    this._actionManager = actionManager
    this._contextManager = contextManager
    this._mouseManager = mouseManager
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

    this._itemEls = items.map((text, i) => {
      const el = document.createElement('div')
      el.className = 'selectable'
      el.textContent = `${pad}${text}${pad}` + ' '.repeat(w - text.length)
      el.style.position = 'absolute'
      el.style.top = `${(paddingY + i) * this._rendererUI.tileMetrics.h}px`
      el.style.whiteSpace = 'pre'
      container.appendChild(el)
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

    let unlistenHover: (() => void) | null = null
    let unlistenClick: (() => void) | null = null
    if (this._mouseManager) {
      unlistenHover = this._mouseManager.onUIHover((_nodeId, cellX, cellY) => {
        const interiorX0 = x + 1
        const interiorX1 = x + w - 2
        const itemY0 = y + 1 + paddingY

        if (cellX < interiorX0 || cellX > interiorX1) return
        const itemIndex = cellY - itemY0
        if (itemIndex >= 0 && itemIndex < items.length) {
          this.setSelected(itemIndex)
        }
      })
      unlistenClick = this._mouseManager.onUIMouseDown((_nodeId, cellX, cellY, button) => {
        if (button !== 0) return
        const interiorX0 = x + 1
        const interiorX1 = x + w - 2
        const itemY0 = y + 1 + paddingY
        if (cellX < interiorX0 || cellX > interiorX1) return
        const itemIndex = cellY - itemY0
        if (itemIndex >= 0 && itemIndex < items.length) {
          void this.close(itemIndex)
        }
      })
    }

    this.registerKeys(wraparound)

    return new Promise<number>((resolve) => {
      this.resolve = (index) => {
        unlistenHover?.()
        unlistenClick?.()
        resolve(index)
      }
    })
  }

  private setSelected(index: number) {
    this._itemEls[this._currentIndex]?.classList.remove('selected')
    this._currentIndex = index
    this._itemEls[this._currentIndex]?.classList.add('selected')
  }

  private move(delta: number, wraparound: boolean) {
    const count = this._itemEls.length
    let next = this._currentIndex + delta

    if (wraparound) {
      next = ((next % count) + count) % count
    } else {
      next = Math.max(0, Math.min(count - 1, next))
    }

    this.setSelected(next)
  }

  private registerKeys(wraparound: boolean) {
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

  private async close(index: number) {
    const ctxName = `select_menu_${this._panel?.id ?? ''}`
    if (!this._panel) {
      this._contextManager.popContext(ctxName)
      this.resolve(index)
      return
    }
    this._rendererUI.unregisterPanelEarly(this._panel)
    await this._panel.close()
    this._rendererUI.removePanel(this._panel)
    this._panel = null
    this._contextManager.popContext(ctxName)
    this.resolve(index)
  }
}

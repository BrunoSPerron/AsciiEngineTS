import type { InputManager } from '../../core/InputManager'
import type { RendererUI } from '../RendererUI'
import type { UIPanel } from './UIPanel'

export class SelectMenu {
  private rendererUI: RendererUI
  private inputManager: InputManager
  private itemEls: HTMLDivElement[] = []
  private currentIndex: number = 0
  private listenerKey: string = ''
  private panel: UIPanel | null = null

  private resolve!: (index: number) => void

  constructor(rendererUI: RendererUI, inputManager: InputManager) {
    this.rendererUI = rendererUI
    this.inputManager = inputManager
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
  ): Promise<number> {
    const container = document.createElement('div')
    container.style.position = 'relative'
    const pad = ' '.repeat(paddingX)

    this.itemEls = items.map((text, i) => {
      const el = document.createElement('div')
      el.className = 'selectable'
      el.textContent = `${pad}${text}${pad}` + ' '.repeat(w - text.length)
      el.style.position = 'absolute'
      el.style.top = `${(paddingY + i) * this.rendererUI.tileMetrics.h}px`
      el.style.whiteSpace = 'pre'
      container.appendChild(el)
      return el
    })

    this.setSelected(0)

    const panelId = this.rendererUI.reserveId()
    this.inputManager.pushContext(`select_menu_${panelId}`)
    this.panel = await this.rendererUI.drawPanel(x, y, w, h, container, undefined, panelId)
    this.registerKeys(panelId, wraparound)

    return new Promise<number>((resolve) => {
      this.resolve = resolve
    })
  }

  private setSelected(index: number) {
    this.itemEls[this.currentIndex]?.classList.remove('selected')
    this.currentIndex = index
    this.itemEls[this.currentIndex]?.classList.add('selected')
  }

  private move(delta: number, wraparound: boolean) {
    const count = this.itemEls.length
    let next = this.currentIndex + delta

    if (wraparound) {
      next = ((next % count) + count) % count
    } else {
      next = Math.max(0, Math.min(count - 1, next))
    }

    this.setSelected(next)
  }

  private registerKeys(panelId: number, wraparound: boolean) {
    this.listenerKey = this.inputManager.onKeyDown((e) => {
      switch (e.key) {
        case 'ArrowUp':
        case 'w':
          this.move(-1, wraparound)
          break
        case 'ArrowDown':
        case 's':
          this.move(+1, wraparound)
          break
        case 'Enter':
          void this.close(this.currentIndex)
          break
        case 'Escape':
          void this.close(-1)
          break
      }
    })
  }

  private async close(index: number) {
    this.inputManager.unlisten(this.listenerKey)
    const ctxName = `select_menu_${this.panel?.id ?? ''}`
    if (!this.panel) {
      this.inputManager.popContext(ctxName)
      this.resolve(index)
      return
    }
    this.rendererUI.unregisterPanelEarly(this.panel)
    await this.panel.close()
    this.rendererUI.removePanel(this.panel)
    this.panel = null
    this.inputManager.popContext(ctxName)
    this.resolve(index)
  }
}

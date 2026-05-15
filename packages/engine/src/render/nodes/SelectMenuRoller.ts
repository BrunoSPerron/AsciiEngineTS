import type { ActionManager } from '../../core/ActionManager'
import type { RendererUI } from '../RendererUI'
import type { UIPanel } from './UIPanel'

const VISIBLE_ROWS = 5
const CENTER = 2

const SLOT_CLASSES: readonly string[] = [
  'ui-roller fade-high',
  'ui-roller fade-low',
  'ui-roller',
  'ui-roller fade-low',
  'ui-roller fade-high',
]

type ChangeHandler = (index: number) => void

export class SelectMenuRoller {
  private rendererUI: RendererUI
  private _actionManager: ActionManager

  private items: string[] = []
  private currentIndex: number = 0
  private slotEls: HTMLDivElement[] = []
  private panel: UIPanel | null = null
  private resolve!: (index: number) => void

  private _changeListeners = new Set<ChangeHandler>()

  constructor(rendererUI: RendererUI, actionManager: ActionManager) {
    this.rendererUI = rendererUI
    this._actionManager = actionManager
  }

  onChange = (fn: ChangeHandler): (() => void) => {
    this._changeListeners.add(fn)
    return () => this._changeListeners.delete(fn)
  }

  async open(
    x: number,
    y: number,
    items: string[],
    paddingX: number = 1,
    startIndex: number = 0,
  ): Promise<number> {
    const pad = ' '.repeat(paddingX)
    this.items = new Array<string>(items.length)
    for (let i = 0; i < items.length; i++) {
      this.items[i] = `${pad}${items[i]}${pad}`
    }
    this.currentIndex = startIndex

    const innerW = Math.max(...this.items.map((s) => s.length))
    const w = innerW + 2
    const h = VISIBLE_ROWS + 2

    const container = document.createElement('div')
    container.style.position = 'relative'

    this.slotEls = Array.from({ length: VISIBLE_ROWS }, (_, slot) => {
      const el = document.createElement('div')
      el.style.position = 'absolute'
      el.style.top = `${slot * this.rendererUI.tileMetrics.h}px`
      el.style.whiteSpace = 'pre'
      el.style.width = `${innerW * this.rendererUI.tileMetrics.w}px`
      container.appendChild(el)
      return el
    })

    this.renderSlots()
    const panelId = this.rendererUI.reserveId()
    this._actionManager.pushContext(`roller_menu_${panelId}`)
    this.panel = await this.rendererUI.drawPanel(x, y, w, h, container, undefined, panelId)
    this.registerKeys()

    return new Promise<number>((resolve) => {
      this.resolve = resolve
    })
  }

  // ==================================================
  // SLOT RENDERING
  // ==================================================

  private renderSlots() {
    const count = this.items.length

    for (let slot = 0; slot < VISIBLE_ROWS; slot++) {
      const logicalIndex = (((this.currentIndex + slot - CENTER) % count) + count) % count
      const text = this.items[logicalIndex]

      const el = this.slotEls[slot]
      el.textContent = text

      el.className =
        slot === CENTER ? 'selectable selected ' + SLOT_CLASSES[slot] : SLOT_CLASSES[slot]
    }
  }

  // ==================================================
  // NAVIGATION
  // ==================================================

  private move(delta: number) {
    const count = this.items.length
    this.currentIndex = (((this.currentIndex + delta) % count) + count) % count
    this.renderSlots()
    for (const fn of this._changeListeners) fn(this.currentIndex)
  }

  // ==================================================
  // INPUT
  // ==================================================

  private registerKeys() {
    this._actionManager.onActionKeyDown((action) => {
      switch (action) {
        case 'up':
          this.move(-1)
          break
        case 'down':
          this.move(+1)
          break
        case 'confirm':
          void this.close(this.currentIndex)
          break
        case 'pause':
          void this.close(-1)
          break
      }
    })
  }

  private async close(index: number) {
    if (!this.panel) {
      throw Error('Logic Error: Panel Closed too early')
    }
    this.rendererUI.unregisterPanelEarly(this.panel)
    await this.panel.close()
    this._actionManager.popContext(`roller_menu_${this.panel.id}`)
    this.rendererUI.removePanel(this.panel)
    this.panel = null
    this.resolve(index)
  }
}

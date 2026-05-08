import type { InputManager } from "../../core/InputManager"
import type { RendererUI } from "../RendererUI"
import { TileMetrics } from "../TileMetrics"
import { UIPanel } from "./UIPanel"

const VISIBLE_ROWS = 5
const CENTER = 2

const SLOT_CLASSES: readonly string[] = [
  "ui-roller fade-high",
  "ui-roller fade-low",
  "ui-roller",
  "ui-roller fade-low",
  "ui-roller fade-high",
]

type ChangeHandler = (index: number) => void
type ListenerMap = Map<string, ChangeHandler>

export class RollerMenu {
  private rendererUI: RendererUI
  private inputManager: InputManager

  private items: string[] = []
  private currentIndex: number = 0
  private slotEls: HTMLDivElement[] = []
  private panel: UIPanel | null = null
  private resolve!: (index: number) => void

  private idCounter = 0
  private changeListeners: ListenerMap = new Map()
  private listenerKey: string = ""

  constructor(rendererUI: RendererUI, inputManager: InputManager) {
    this.rendererUI   = rendererUI
    this.inputManager = inputManager
  }

  onChanged(fn: ChangeHandler): string {
    const key = `lk_${++this.idCounter}`
    this.changeListeners.set(key, fn)
    return key
  }

  unlisten(key: string): void {
    this.changeListeners.delete(key)
  }

  private emitChanged(index: number) {
    for (const fn of this.changeListeners.values()) fn(index)
  }

  open(
    x: number,
    y: number,
    items: string[],
    paddingX: number = 1,
    startIndex: number = 0,
  ): Promise<number> {
    const pad = " ".repeat(paddingX)
    this.items = new Array<string>(items.length)
    for (let i = 0; i < items.length; i++) {
      this.items[i] = `${pad}${items[i]}${pad}`
    }
    this.currentIndex = startIndex

    const innerW = Math.max(...this.items.map(s => s.length))
    const w = innerW + 2
    const h = VISIBLE_ROWS + 2

    const container = document.createElement("div")
    container.style.position = "relative"

    this.slotEls = Array.from({ length: VISIBLE_ROWS }, (_, slot) => {
      const el = document.createElement("div")
      el.style.position  = "absolute"
      el.style.top       = `${slot * TileMetrics.h}px`
      el.style.whiteSpace = "pre"
      el.style.width     = `${innerW * TileMetrics.w}px`
      container.appendChild(el)
      return el
    })

    this.renderSlots()
    this.registerKeys()

    this.panel = this.rendererUI.drawPanel(x, y, w, h, container)

    return new Promise<number>(resolve => {
      this.resolve = resolve
    })
  }

  // ==================================================
  // SLOT RENDERING
  // ==================================================

  private renderSlots() {
    const count = this.items.length

    for (let slot = 0; slot < VISIBLE_ROWS; slot++) {
      const logicalIndex = ((this.currentIndex + slot - CENTER) % count + count) % count
      const text = this.items[logicalIndex]

      const el = this.slotEls[slot]
      el.textContent = text

      el.className = slot === CENTER
        ? "selectable selected " + SLOT_CLASSES[slot]
        : SLOT_CLASSES[slot]
    }
  }

  // ==================================================
  // NAVIGATION
  // ==================================================

  private move(delta: number) {
    const count = this.items.length
    this.currentIndex = ((this.currentIndex + delta) % count + count) % count
    this.renderSlots()
    this.emitChanged(this.currentIndex)
  }

  // ==================================================
  // INPUT
  // ==================================================

  private registerKeys() {
    this.inputManager.pushContext("roller_menu")
    this.listenerKey = this.inputManager.onKeyDown(e => {
      switch (e.key) {
        case "ArrowUp":
        case "w":
          this.move(-1)
          break
        case "ArrowDown":
        case "s":
          this.move(+1)
          break
        case "Enter":
          this.close(this.currentIndex)
          break
        case "Escape":
          this.close(-1)
          break
      }
    })
  }

  private close(index: number) {
    this.inputManager.unlisten(this.listenerKey)
    if (!this.panel) {
      this.inputManager.popContext("roller_menu")
      this.resolve(index)
      return
    }
    this.rendererUI.unregisterPanelEarly(this.panel)
    this.panel.close().then(() => {
      this.rendererUI.removePanel(this.panel!)
      this.panel = null
      this.inputManager.popContext("roller_menu")
      this.resolve(index)
    })
  }
}

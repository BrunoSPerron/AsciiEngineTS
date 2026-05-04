import type { InputManager } from "../../core/InputManager"
import type { RendererUI } from "../RendererUI"
import { TileMetrics } from "../TileMetrics"
import { UIPanel } from "./UIPanel"

const VISIBLE_ROWS = 5
const CENTER = 2 // index of the selected slot among the 5 visible rows

/**
 * CSS class applied per slot position:
 *   slot 0, 4 → "ui-roller fade-high"
 *   slot 1, 3 → "ui-roller fade-low"
 *   slot 2    → "ui-roller selected"
 */
const SLOT_CLASSES: readonly string[] = [
  "ui-roller fade-high",
  "ui-roller fade-low",
  "ui-roller",
  "ui-roller fade-low",
  "ui-roller fade-high",
]

type ChangeHandler = (index: number) => void
type ListenerMap = Map<string, ChangeHandler>

export class RollerMenu extends UIPanel {
  private items: string[] = []
  private currentIndex: number = 0
  private slotEls: HTMLDivElement[] = []
  private resolve!: (index: number) => void

  private idCounter = 0
  private changeListeners: ListenerMap = new Map()

  constructor(rendererUI: RendererUI, inputManager: InputManager) {
    super(rendererUI, inputManager)
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

  /**
   * Open the roller at (x, y).
   * Height is always 7 (5 visible rows + 2 border rows).
   * Width is derived from the longest item + paddingX * 2 + 2 border cols.
   *
   * @returns Promise resolving with the selected item index, or -1 on Escape.
   */
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
        el.style.position   = "absolute"
        el.style.top        = `${slot * TileMetrics.h}px`
        el.style.whiteSpace = "pre"
        el.style.width      = `${innerW * TileMetrics.w}px`
        container.appendChild(el)
        return el
    })

    this.renderSlots()
    this.registerKeys()

    return new Promise<number>(resolve => {
      this.resolve = resolve
      this.openingPromise = this.openBox(x, y, w, h, undefined, container)
        .then(id => {
          this.menuBoxId = id
        })
    })
  }

  // ==================================================
  // SLOT RENDERING
  // ==================================================

  /**
   * Repaint all 5 slot elements from the current selectedIndex.
   * The item shown in slot `s` is the one at logical index:
   *   (currentIndex + s - CENTER + items.length * largeMultiple) % items.length
   */
  private renderSlots() {
    const count = this.items.length

    for (let slot = 0; slot < VISIBLE_ROWS; slot++) {
      const logicalIndex = ((this.currentIndex + slot - CENTER) % count + count) % count
      const text = this.items[logicalIndex]

      const el = this.slotEls[slot]
      el.textContent = text

      // Clear all roller classes, then apply the correct one for this slot
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
    this.emitChanged(this.currentIndex)   // ← fire here
  }

  // ==================================================
  // INPUT
  // ==================================================

  private registerKeys() {
    this.inputManager.pushContext("roller_menu")
    this.inputManager.onKeyDown(e => {
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
    this.inputManager.popContext("roller_menu")
    this.closeBox().then(() => {
      this.resolve(index)
    })
  }
}

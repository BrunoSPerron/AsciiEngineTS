import type { InputManager } from "../../core/InputManager"
import type { RendererUI } from "../RendererUI"
import { TileMetrics } from "../TileMetrics"
import { UIPanel } from "./UIPanel"

export class SelectMenu extends UIPanel {
  private itemEls: HTMLDivElement[] = []
  private currentIndex: number = 0
  private resolve!: (index: number) => void

  constructor(rendererUI: RendererUI, inputManager: InputManager) {
    super(rendererUI, inputManager)
  }

  open(
    x: number,
    y: number,
    w: number,
    h: number,
    items: string[],
    paddingX: number = 0,
    paddingY: number = 0,
    wraparound: boolean = true,
  ): Promise<number> {
    const container = document.createElement("div")
    container.style.position = "relative"
    const pad = " ".repeat(paddingX)

    this.itemEls = items.map((text, i) => {
      const el = document.createElement("div")
      el.className = "selectable"
      el.textContent = `${pad}${text}${pad}` + " ".repeat(w - text.length)
      el.style.position   = "absolute"
      el.style.top        = `${(paddingY + i) * TileMetrics.h}px`
      el.style.whiteSpace = "pre"
      container.appendChild(el)
      return el
    })

    this.setSelected(0)
    this.registerKeys(wraparound)

    return new Promise<number>(resolve => {
      this.resolve = resolve

      this.openingPromise = this.openBox(x, y, w, h, undefined, container)
        .then(id => {
          this.menuBoxId = id
        })
    })
  }

  private setSelected(index: number) {
    this.itemEls[this.currentIndex]?.classList.remove("selected")
    this.currentIndex = index
    this.itemEls[this.currentIndex]?.classList.add("selected")
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

  private registerKeys(wraparound: boolean) {
    this.inputManager.pushContext("select_menu")
    this.inputManager.onKeyDown(e => {
      switch (e.key) {
        case "ArrowUp":
        case "w":
          this.move(-1, wraparound)
          break
        case "ArrowDown":
        case "s":
          this.move(+1, wraparound)
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
    this.inputManager.popContext("select_menu")
    this.closeBox().then(() => {
      this.resolve(index)
    })
  }
}

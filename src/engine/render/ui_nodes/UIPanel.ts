import type { InputManager } from "../../core/InputManager"
import type { RendererUI } from "../RendererUI"
import { UINode } from "./UINode"


export class UIPanel extends UINode {
  protected rendererUI: RendererUI
  protected inputManager: InputManager

  topId: number = -1
  bottomId: number = -1
  leftId: number = -1
  rightId: number = -1
  panelId: number = -1

  menuBoxId: number = -1

  protected openingPromise: Promise<void> = Promise.resolve()

  constructor(rendererUI: RendererUI, inputManager: InputManager) {
    const el = document.createElement("div")
    super(-1, "panel", el, 0, 0, 0, 0)
    this.rendererUI = rendererUI
    this.inputManager = inputManager
  }

  /**
   * Animate the panel open at the given position and size.
   * Subclasses can pass optional `content` to embed in the background panel.
   *
   * @returns Promise that resolves with the menuBoxId once the animation ends
   */
  protected openBox(
    x: number,
    y: number,
    w: number,
    h: number,
    duration?: number,
    content?: HTMLDivElement
  ): Promise<number> {
    this.x = x
    this.y = y
    this.w = w
    this.h = h

    return new Promise<number>(resolve => {
      this.openingPromise = this.rendererUI
        .animatedMenuBoxOpening(x, y, w, h, duration, content)
        .then(id => {
          this.menuBoxId = id

          const menuBox = this.rendererUI.menuBoxes.get(id)
          if (menuBox) {
            this.topId    = menuBox.topId
            this.bottomId = menuBox.bottomId
            this.leftId   = menuBox.leftId
            this.rightId  = menuBox.rightId
            this.panelId  = menuBox.panelId
          }

          resolve(id)
        })
    })
  }

  /**
   * Animate the panel closed.
   *
   * @returns Promise that resolves once the closing animation ends
   */
  closeBox(): Promise<void> {
    return this.openingPromise.then(() =>
      this.rendererUI.animatedMenuBoxClosing(this.menuBoxId)
    )
  }
}

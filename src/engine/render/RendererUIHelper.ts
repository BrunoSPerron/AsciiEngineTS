//TODO test me

import { Renderer, TILE_H, TILE_W } from "./Renderer"

type MenuChoice = {
  label: string
  value?: any
}

type Rect = {
  x: number
  y: number
  w: number
  h: number
}

export class RendererUIHelper {
  renderer: Renderer

  constructor(renderer: Renderer) {
    this.renderer = renderer
  }

  async showMenuAndGetChoice(
    title: string,
    choices: MenuChoice[],
    x = 2,
    y = 2,
    doubleLine = false
  ): Promise<number> {
    const width =
      Math.max(title.length, ...choices.map(c => c.label.length)) + 4

    const height = choices.length + 4

    await this.animatedMenuBoxOpening(
      { x, y, w: width, h: height },
      doubleLine
    )

    let selected = 0

    return new Promise<number>((resolve) => {
      const render = () => {
        this.clearUI()

        this.drawBox(
          { x, y, w: width, h: height },
          doubleLine
        )

        this.drawText(x + 2, y, title)

        for (let i = 0; i < choices.length; i++) {
          const prefix = i === selected ? "▶ " : "  "
          this.drawText(
            x + 1,
            y + 2 + i,
            prefix + choices[i].label
          )
        }
      }

      const onKey = async (e: KeyboardEvent) => {
        if (e.key === "ArrowUp") {
          selected =
            (selected - 1 + choices.length) %
            choices.length
          render()
        }

        if (e.key === "ArrowDown") {
          selected =
            (selected + 1) %
            choices.length
          render()
        }

        if (e.key === "Enter") {
          cleanup()
          await this.animatedMenuBoxClosing(
            { x, y, w: width, h: height },
            doubleLine
          )
          resolve(selected)
        }

        if (e.key === "Escape") {
          cleanup()
          await this.animatedMenuBoxClosing(
            { x, y, w: width, h: height },
            doubleLine
          )
          resolve(-1)
        }
      }

      const cleanup = () => {
        window.removeEventListener("keydown", onKey)
        this.clearUI()
      }

      window.addEventListener("keydown", onKey)
      render()
    })
  }

  async animatedMenuBoxOpening(
    rect: Rect,
    doubleLine = false
  ) {
    for (let i = 1; i <= rect.h; i++) {
      this.clearUI()

      this.drawBox(
        {
          x: rect.x,
          y: rect.y,
          w: rect.w,
          h: i
        },
        doubleLine
      )

      await this.wait(16)
    }
  }

  async animatedMenuBoxClosing(
    rect: Rect,
    doubleLine = false
  ) {
    for (let i = rect.h; i >= 1; i--) {
      this.clearUI()

      this.drawBox(
        {
          x: rect.x,
          y: rect.y,
          w: rect.w,
          h: i
        },
        doubleLine
      )

      await this.wait(16)
    }

    this.clearUI()
  }

  drawBox(
    rect: Rect,
    doubleLine = false
  ) {
    const { x, y, w, h } = rect

    const chars = doubleLine
      ? {
          tl: "╔",
          tr: "╗",
          bl: "╚",
          br: "╝",
          h: "═",
          v: "║"
        }
      : {
          tl: "┌",
          tr: "┐",
          bl: "└",
          br: "┘",
          h: "─",
          v: "│"
        }

    this.drawGlyph(x, y, chars.tl)
    this.drawGlyph(x + w - 1, y, chars.tr)
    this.drawGlyph(x, y + h - 1, chars.bl)
    this.drawGlyph(x + w - 1, y + h - 1, chars.br)

    this.virtualDrawHorizontalLine(
      x + 1,
      x + w - 2,
      y,
      doubleLine
    )

    this.virtualDrawHorizontalLine(
      x + 1,
      x + w - 2,
      y + h - 1,
      doubleLine
    )

    this.virtualDrawVerticalLine(
      y + 1,
      y + h - 2,
      x,
      doubleLine
    )

    this.virtualDrawVerticalLine(
      y + 1,
      y + h - 2,
      x + w - 1,
      doubleLine
    )
  }

  virtualDrawHorizontalLine(
    x1: number,
    x2: number,
    y: number,
    doubleLine = false
  ) {
    const glyph = doubleLine ? "═" : "─"

    for (let x = x1; x <= x2; x++) {
      this.drawGlyph(x, y, glyph)
    }
  }

  virtualDrawVerticalLine(
    y1: number,
    y2: number,
    x: number,
    doubleLine = false
  ) {
    const glyph = doubleLine ? "║" : "│"

    for (let y = y1; y <= y2; y++) {
      this.drawGlyph(x, y, glyph)
    }
  }

  drawText(x: number, y: number, text: string) {
    for (let i = 0; i < text.length; i++) {
      this.drawGlyph(x + i, y, text[i])
    }
  }

  drawGlyph(x: number, y: number, glyph: string) {
    const el = document.createElement("div")

    el.className = "ui-glyph"
    el.textContent = glyph

    el.dataset.tx = String(x)
    el.dataset.ty = String(y)

    el.style.position = "absolute"
    el.style.left = `${x * TILE_W}px`
    el.style.top = `${y * TILE_H}px`
    el.style.width = `${TILE_W}px`
    el.style.height = `${TILE_H}px`

    this.renderer.ui.appendChild(el)
  }

  clearUI() {
    this.renderer.ui.innerHTML = ""
  }

  wait(ms: number) {
    return new Promise(resolve =>
      setTimeout(resolve, ms)
    )
  }
}
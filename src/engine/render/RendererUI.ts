import { TileMetrics } from "./Renderer"

/**
 * Maps a line mask to its box-drawing glyph.
 * Mask bits: top right bottom left double
 */
const LINE_GLYPHS: Record<number, string> = {
  0b00000: " ",
  0b00001: " ",

  0b01010: "─",
  0b00010: "─",
  0b01000: "─",
  0b01011: "═",
  0b00011: "═",
  0b01001: "═",

  0b10100: "│",
  0b00100: "│",
  0b10000: "│",
  0b10101: "║",
  0b00101: "║",
  0b10001: "║",

  0b01100: "┌",
  0b01101: "╔",

  0b00110: "┐",
  0b00111: "╗",

  0b11000: "└",
  0b11001: "╚",

  0b10010: "┘",
  0b10011: "╝",

  0b11100: "├",
  0b11101: "╠",

  0b10110: "┤",
  0b10111: "╣",

  0b11010: "┴",
  0b11011: "╩",

  0b01110: "┬",
  0b01111: "╦",

  0b11110: "┼",
  0b11111: "╬",
}

type UIKind =
  | "text"
  | "hline"
  | "vline"
  | "panel"

type CellRef = {
  nodeId: number
  index: number
}

type UINode = {
  id: number
  kind: UIKind
  el: HTMLDivElement

  x: number
  y: number
  w: number
  h: number

  chars: string[]
}

type UIMenuBox = {
  id: number
  topId: number
  bottomId: number
  leftId: number
  rightId: number
  panelId: number
}

const TOP    = 0b10000
const RIGHT  = 0b01000
const BOTTOM = 0b00100
const LEFT   = 0b00010
const DOUBLE = 0b00001

export class RendererUI {
  root: HTMLDivElement

  private static readonly PHASE1_RATIO = 0.55
  private static readonly PHASE2_RATIO = 0.45

  private nextId = 1

  nodes = new Map<number, UINode>()
  menuBoxes = new Map<number, UIMenuBox>()
  cells = new Map<string, CellRef>()
  lineMasks = new Map<string, number>() // Mask used to link ui lines

  constructor(root: HTMLDivElement) {
    this.root = root
  }

  // ==================================================
  // PUBLIC API
  // ==================================================

  clear() {
    this.root.innerHTML = ""
    this.nodes.clear()
    this.cells.clear()
  }

  animatedMenuBoxClosing(
    id: number,
    duration = 960
  ): Promise<void> {
    const menuBox = this.menuBoxes.get(id)
    if (!menuBox) return Promise.resolve()

    const topNode    = this.nodes.get(menuBox.topId)!
    const bottomNode = this.nodes.get(menuBox.bottomId)!
    const leftNode   = this.nodes.get(menuBox.leftId)!
    const rightNode  = this.nodes.get(menuBox.rightId)!
    const panelNode  = this.nodes.get(menuBox.panelId)!

    const midY = topNode.y + (bottomNode.y - topNode.y) / 2
    const x    = topNode.x

    return new Promise(resolve => {
      // Phase 1: sides + panel collapse inward, top/bottom converge to midY
      const phase1Duration = duration * RendererUI.PHASE1_RATIO

      for (const node of [leftNode, rightNode, panelNode]) {
        this.animateVerticalClipCollapse(node.el, node.x, node.y, phase1Duration)
      }

      this.animateVerticalSlide(topNode.el, x, topNode.y, midY, phase1Duration, "ease-in")

      const bottomAnim = this.animateVerticalSlide(bottomNode.el, x, bottomNode.y, midY, phase1Duration, "ease-in")

      // Phase 2: top bar clips back to nothing, then everything is removed
      bottomAnim.onfinish = () => {
        bottomNode.el.style.display = "none"

        topNode.chars[0] = "╠"
        topNode.chars[topNode.chars.length - 1] = "╣"
        this.refreshText(topNode)

        const phase2Anim = this.animateHorizontalCollapse(topNode.el, x, midY, duration * RendererUI.PHASE2_RATIO)

        phase2Anim.onfinish = () => {
          this.remove(menuBox.topId)
          this.remove(menuBox.bottomId)
          this.remove(menuBox.leftId)
          this.remove(menuBox.rightId)
          this.remove(menuBox.panelId)
          this.menuBoxes.delete(id)
          resolve()
        }
      }
    })
  }

  animatedMenuBoxOpening(
    x: number, y: number, w: number, h: number,
    duration = 1000, content?: HTMLDivElement
  ): Promise<number> {
    const midY = y + h / 2

    const leftId = this.drawVLine(x, y + 1, h - 2, true)
    const rightId = this.drawVLine(x + w - 1, y + 1, h - 2, true)
    const topId = this.drawHLine(x, y, w, true)
    const bottomId = this.drawHLine(x, y + h - 1, w, true)
    const backgroundPanelId = this.drawPanel(x + 1, y + 1, w - 2, h - 2, content)

    const leftNode = this.nodes.get(leftId)!
    const rightNode = this.nodes.get(rightId)!
    const topNode = this.nodes.get(topId)!
    const bottomNode = this.nodes.get(bottomId)!
    const backgroundPanelNode = this.nodes.get(backgroundPanelId)!

    const menuBox: UIMenuBox = {
      id: this.nextId++,
      topId,
      bottomId,
      leftId,
      rightId,
      panelId: backgroundPanelId,
    }
    this.menuBoxes.set(menuBox.id, menuBox)

    for (const node of [leftNode, rightNode, backgroundPanelNode]) {
      node.el.style.transformOrigin = "50% 50%"
      node.el.style.clipPath = "inset(50% 0 50% 0)"
    }

    topNode.el.style.clipPath = "inset(0 50% 0 50%)"
    bottomNode.el.style.display = "none"

    this.setSymbolAt(x, y, "╠")
    this.setSymbolAt(x + w - 1, y, "╣")
    const topAnim = this.animateHorizontalExpand(topNode.el, x, midY, duration * RendererUI.PHASE2_RATIO)

    return new Promise(resolve => {
      topAnim.onfinish = () => {
        this.reconcileAt(x, y)
        this.reconcileAt(x + w - 1, y)

        backgroundPanelNode.el.style.setProperty("z-index", "-1");

        this.animateVerticalSlide(topNode.el, x, midY, y, duration * RendererUI.PHASE1_RATIO)

        bottomNode.el.style.display = "block"
        this.animateVerticalSlide(bottomNode.el, x, midY, y + h - 1, duration * RendererUI.PHASE1_RATIO)

        const phase2Anims = [leftNode, rightNode, backgroundPanelNode].map(node => {
          node.el.style.transformOrigin = "50% 50%"
          node.el.style.clipPath = "inset(50% 0 50% 0)"
          return this.animateVerticalClipReveal(node.el, node.x, node.y, duration * RendererUI.PHASE1_RATIO)
        })

        Promise.all(phase2Anims.map(anim => anim.finished)).then(() => resolve(menuBox.id))
      }
    })
  }

  drawText(x: number, y: number, text: string): number {
    return this.createTextNode("text", x, y, text)
  }

  drawHLine(
    x: number,
    y: number,
    w: number,
    doubleLine = false
  ): number {
    for (let i = 0; i < w; i++) {
      const xx = x + i

      let mask = 0

      if (i > 0) mask |= LEFT
      if (i < w - 1) mask |= RIGHT
      if (doubleLine) mask |= DOUBLE

      this.addLineMask(xx, y, mask)
    }

    // update neighboring joins
    for (let i = 0; i < w; i++) {
      this.reconcileAt(x + i, y)
      this.reconcileAt(x + i, y - 1)
      this.reconcileAt(x + i, y + 1)
    }

    return this.renderLineRun(x, y, w, "hline")
  }

 drawVLine(
    x: number,
    y: number,
    h: number,
    doubleLine = false
  ): number {
    for (let i = 0; i < h; i++) {
      const yy = y + i

      let mask = 0

      if (i > 0) mask |= TOP
      if (i < h - 1) mask |= BOTTOM
      if (doubleLine) mask |= DOUBLE

      this.addLineMask(x, yy, mask)
    }

    for (let i = 0; i < h; i++) {
      this.reconcileAt(x, y + i)
      this.reconcileAt(x - 1, y + i)
      this.reconcileAt(x + 1, y + i)
    }

    return this.renderLineColumn(x, y, h)
  }

  drawPanel(x: number, y: number, w: number, h: number, content?: HTMLDivElement): number {
    const node = this.createNode("panel", x, y, w, h, [])

    node.el.className = "ui ui-panel"
    node.el.style.width = `${w * TileMetrics.w}px`
    node.el.style.height = `${h * TileMetrics.h}px`

    if (content) {
      node.el.appendChild(content)
    }

    this.registerRectCells(node)

    return node.id
  }

  move(
    id: number,
    x: number,
    y: number
  ) {
    const node = this.nodes.get(id)
    if (!node) return

    this.unregisterNode(node)

    node.x = x
    node.y = y

    this.applyTransform(node)

    this.registerNode(node)
  }

  remove(id: number) {
    const node = this.nodes.get(id)
    if (!node) return

    this.unregisterNode(node)
    node.el.remove()
    this.nodes.delete(id)
  }

  setSymbolAt(x: number, y: number, glyph: string): boolean {
    const ref = this.cells.get(this.key(x, y))
    if (!ref) return false

    const node = this.nodes.get(ref.nodeId)
    if (!node) return false

    if (
      node.kind !== "text" &&
      node.kind !== "hline" &&
      node.kind !== "vline"
    ) {
      return false
      //TODO create new node instead
    }

    node.chars[ref.index] = glyph

    this.refreshText(node)

    return true
  }

  // ==================================================
  // ANIMATION HELPERS
  // ==================================================

  /**
   * Phase 1 of the menu box opening:
   *    Reveal horizontally from center outward, staying at midY.
   */
  private animateHorizontalExpand(
    el: HTMLElement,
    x: number,
    midY: number,
    duration: number
  ): Animation {
    return el.animate(
      [
        {
          transform: `translate(${x * TileMetrics.w}px, ${midY * TileMetrics.h}px)`,
          clipPath: "inset(0 50% 0 50%)"
        },
        {
          transform: `translate(${x * TileMetrics.w}px, ${midY * TileMetrics.h}px)`,
          clipPath: "inset(0 0 0 0)"
        },
      ],
      {
        duration,
        easing: "ease-out",
        fill: "forwards"
      }
    )
  }

  /**
   * Phase 2 of the menu box opening top/bottom bars:
   *    Slide vertically from midY to their final row.
   */
  private animateVerticalSlide(
    el: HTMLElement,
    x: number,
    fromY: number,
    toY: number,
    duration: number,
    easing: string = "ease-out"
  ): Animation {
    return el.animate(
      [
        { transform: `translate(${x * TileMetrics.w}px, ${fromY * TileMetrics.h}px)` },
        { transform: `translate(${x * TileMetrics.w}px, ${toY  * TileMetrics.h}px)` },
      ],
      {
        duration,
        easing,
        fill: "forwards"
      }
    )
  }

  /**
   * Phase 2 of the menu box opening side/panel nodes:
   *    Reveal vertically by collapsing the clip-path inset.
   */
  private animateVerticalClipReveal(
    el: HTMLElement,
    x: number,
    y: number,
    duration: number
  ): Animation {
    return el.animate(
      [
        {
          transform: `translate(${x * TileMetrics.w}px, ${y * TileMetrics.h}px)`,
          clipPath: "inset(50% 0 50% 0)"
        },
        {
          transform: `translate(${x * TileMetrics.w}px, ${y * TileMetrics.h}px)`,
          clipPath: "inset(0 0 0 0)"
        },
      ],
      {
        duration,
        easing: "ease-out",
        fill: "forwards"
      }
    )
  }

  /**
   * Phase 1 of the menu box closing side/panel nodes:
   *    Collapse vertically by expanding the clip-path inset to 50%.
   */
  private animateVerticalClipCollapse(
    el: HTMLElement,
    x: number,
    y: number,
    duration: number
  ): Animation {
    return el.animate(
      [
        {
          transform: `translate(${x * TileMetrics.w}px, ${y * TileMetrics.h}px)`,
          clipPath: "inset(0 0 0 0)"
        },
        {
          transform: `translate(${x * TileMetrics.w}px, ${y * TileMetrics.h}px)`,
          clipPath: "inset(50% 0 50% 0)"
        },
      ],
      {
        duration,
        easing: "ease-in",
        fill: "forwards"
      }
    )
  }

  /**
   * Phase 2 of the menu box closing top bar:
   *    Collapse horizontally back to center.
   */
  private animateHorizontalCollapse(
    el: HTMLElement,
    x: number,
    midY: number,
    duration: number
  ): Animation {
    return el.animate(
      [
        {
          transform: `translate(${x * TileMetrics.w}px, ${midY * TileMetrics.h}px)`,
          clipPath: "inset(0 0 0 0)"
        },
        {
          transform: `translate(${x * TileMetrics.w}px, ${midY * TileMetrics.h}px)`,
          clipPath: "inset(0 50% 0 50%)"
        },
      ],
      {
        duration,
        easing: "ease-in",
        fill: "forwards"
      }
    )
  }

  // ==================================================
  // LINE ENGINE
  // ==================================================

  private addLineMask(x: number, y: number, mask: number) {
    const key = this.key(x, y)
    const prev = this.lineMasks.get(key) ?? 0
    this.lineMasks.set(key, prev | mask)
  }

  private reconcileAt(x: number, y: number) {
    const key = this.key(x, y)
    let mask = this.lineMasks.get(key)
    if (mask == null) return

    if (this.lineMasks.has(this.key(x, y - 1))) {
      mask |= TOP
      this.addLineMask(x, y - 1, BOTTOM)
    }

    if (this.lineMasks.has(this.key(x + 1, y))) {
      mask |= RIGHT
      this.addLineMask(x + 1, y, LEFT)
    }

    if (this.lineMasks.has(this.key(x, y + 1))) {
      mask |= BOTTOM
      this.addLineMask(x, y + 1, TOP)
    }

    if (this.lineMasks.has(this.key(x - 1, y))) {
      mask |= LEFT
      this.addLineMask(x - 1, y, RIGHT)
    }

    this.setSymbolAt(x, y, this.maskToGlyph(mask))

    this.lineMasks.set(key, mask)
  }

  private renderLineRun(
    x: number,
    y: number,
    w: number,
    kind: UIKind
  ): number {
    let text = ""

    for (let i = 0; i < w; i++) {
      const mask = this.lineMasks.get(this.key(x + i, y)) ?? 0
      text += this.maskToGlyph(mask)
    }

    return this.createTextNode(kind, x, y, text)
  }

  private renderLineColumn(
    x: number,
    y: number,
    h: number
  ): number {
    const chars: string[] = []

    for (let i = 0; i < h; i++) {
      const mask = this.lineMasks.get(this.key(x, y + i)) ?? 0
      chars.push(this.maskToGlyph(mask))
    }

    const node = this.createNode("vline", x, y, 1, h, chars)

    node.el.style.whiteSpace = "pre"
    node.el.style.lineHeight = `${TileMetrics.h}px`
    node.el.textContent = chars.join("\n")

    this.registerVerticalCells(node)

    return node.id
  }

  private maskToGlyph(mask: number): string {
    return LINE_GLYPHS[mask] ?? "?"
  }

  // ==================================================
  // NODE / DOM
  // ==================================================

  private createTextNode(
      kind: UIKind, x: number, y: number, text: string
  ): number {
    const chars = [...text]

    const node = this.createNode(kind, x, y, chars.length, 1, chars)

    node.el.textContent = text
    this.registerHorizontalCells(node)

    return node.id
  }

  private createNode(
    kind: UIKind,
    x: number,
    y: number,
    w: number,
    h: number,
    chars: string[]
  ): UINode {
    const el = document.createElement("div")
    
    let clsName = "ui ui-node"
    if (kind === "vline" || kind === "hline") {
      clsName += " ui-line"
    }

    el.className = clsName

    el.style.position = "absolute"
    el.style.whiteSpace = "pre"
    el.style.willChange =
      "transform, opacity"

    const node: UINode = {
      id: this.nextId++,
      kind, el, x, y, w, h, chars
    }

    this.applyTransform(node)

    this.root.appendChild(el)
    this.nodes.set(node.id, node)

    return node
  }

  private applyTransform(node: UINode) {
    node.el.style.transform =
      `translate(${node.x * TileMetrics.w}px, ${node.y * TileMetrics.h}px)`
  }

  private refreshText(node: UINode) {
    if (node.kind === "vline") {
      node.el.textContent = node.chars.join("\n")
      return
    }

    node.el.textContent = node.chars.join("")
  }

  // ==================================================
  // CELL REGISTRATION
  // ==================================================

  private registerNode(
    node: UINode
  ) {
    switch (node.kind) {
      case "text":
      case "hline":
        this.registerHorizontalCells(node)
        break

      case "vline":
        this.registerVerticalCells(node)
        break

      case "panel":
        this.registerRectCells(node)
        break
    }
  }

  private unregisterNode(
    node: UINode
  ) {
    for (let yy = node.y; yy < node.y + node.h; yy++) {
      for (let xx = node.x; xx < node.x + node.w; xx++) {
        const key = this.key(xx, yy)
        const ref = this.cells.get(key)

        if (ref && ref.nodeId === node.id) {
          this.cells.delete(key)
        }
      }
    }
  }

  private registerHorizontalCells(node: UINode) {
    for (let i = 0; i < node.w; i++) {
      this.cells.set(
        this.key(node.x + i, node.y),
        {
          nodeId: node.id,
          index: i
        }
      )
    }
  }

  private registerVerticalCells(node: UINode) {
    for (let i = 0; i < node.h; i++) {
      this.cells.set(
        this.key(node.x, node.y + i),
        {
          nodeId: node.id,
          index: i
        }
      )
    }
  }

  private registerRectCells(node: UINode) {
    for (let yy = 0; yy < node.h; yy++) {
      for (let xx = 0; xx < node.w; xx++) {
        this.cells.set(
          this.key(node.x + xx, node.y + yy),
          {
            nodeId: node.id,
            index: -1
          }
        )
      }
    }
  }

  private key(x: number, y: number) {
    return `${x},${y}`
  }
}

import type { InputManager } from "../core/InputManager"
import { TileMetrics } from "./TileMetrics"
import { UINode, type UIKind } from "./ui_nodes/UINode"
import { LineNode, maskToGlyph, TOP, RIGHT, BOTTOM, LEFT, DOUBLE } from "./ui_nodes/LineNode"
import { SelectMenu } from "./ui_nodes/SelectMenu"
import { RollerMenu } from "./ui_nodes/RollerMenu"

export type UIMenuBox = {
  id: number
  topId: number
  bottomId: number
  leftId: number
  rightId: number
  panelId: number
}

export class RendererUI {
  root: HTMLDivElement
  inputManager: InputManager

  private static readonly PHASE1_RATIO = 0.60
  private static readonly PHASE2_RATIO = 0.4

  private nextId = 1

  nodes     = new Map<number, UINode>()
  menuBoxes = new Map<number, UIMenuBox>()
  cellStack = new Map<string, number[]>()

  constructor(root: HTMLDivElement, inputManager: InputManager) {
    this.inputManager = inputManager
    this.root = root
  }

  // ==========================================================================
  // PUBLIC API
  // ==========================================================================

  clear() {
    this.root.innerHTML = ""
    this.nodes.clear()
    this.cellStack.clear()
  }

  // ---------- animated box helpers ------------------------------------------

animatedMenuBoxClosing(id: number, duration = 500): Promise<void> {
    const menuBox = this.menuBoxes.get(id)
    if (!menuBox) return Promise.resolve()
    const topNode    = this.nodes.get(menuBox.topId)!
    const bottomNode = this.nodes.get(menuBox.bottomId)!
    const leftNode   = this.nodes.get(menuBox.leftId)!
    const rightNode  = this.nodes.get(menuBox.rightId)!
    const panelNode  = this.nodes.get(menuBox.panelId)!
    const lineNodes = [topNode, bottomNode, leftNode, rightNode] as LineNode[]

    const closingCells = new Set<string>()
    for (const node of lineNodes) {
      if (node.kind === "hline") {
        for (let i = 0; i < node.w; i++) closingCells.add(this.key(node.x + i, node.y))
      } else {
        for (let i = 0; i < node.h; i++) closingCells.add(this.key(node.x, node.y + i))
      }
    }

    const toReconcile = new Set<string>()
    const enqueue = (x: number, y: number) => {
      const k = this.key(x, y)
      if (!closingCells.has(k)) toReconcile.add(k)
    }

    for (const node of lineNodes) {
      this.exchangeBitsAt(node, "withdraw")
      node.ownMasks.clear()
      if (node.kind === "hline") {
        enqueue(node.x - 1,      node.y)
        enqueue(node.x + node.w, node.y)
        for (let i = 0; i < node.w; i++) {
          enqueue(node.x + i, node.y - 1)
          enqueue(node.x + i, node.y + 1)
        }
      } else {
        enqueue(node.x, node.y - 1)
        enqueue(node.x, node.y + node.h)
        for (let i = 0; i < node.h; i++) {
          enqueue(node.x - 1, node.y + i)
          enqueue(node.x + 1, node.y + i)
        }
      }
    }

    for (const cell of toReconcile) {
      const [x, y] = cell.split(",").map(Number)
      this.reconcileAt(x, y)
    }

    const midY = topNode.y + (bottomNode.y - topNode.y) / 2
    const x    = topNode.x
    return new Promise(resolve => {
      const phase1Duration = duration * RendererUI.PHASE1_RATIO
      for (const node of [leftNode, rightNode, panelNode]) {
        this.animateVerticalClipCollapse(node.el, node.x, node.y, phase1Duration)
      }
      this.animateVerticalSlide(
        topNode.el, x, topNode.y, midY, phase1Duration, "ease-in"
      )
      const bottomAnim = this.animateVerticalSlide(
        bottomNode.el, x, bottomNode.y, midY, phase1Duration, "ease-in"
      )
      bottomAnim.onfinish = () => {
        resolve()
        bottomNode.el.style.display = "none"
        topNode.chars[0] = "═"
        topNode.chars[topNode.chars.length - 1] = "═"
        topNode.el.textContent = topNode.chars.join("")
        const phase2Anim = this.animateHorizontalCollapse(
          topNode.el, x, midY, duration * RendererUI.PHASE2_RATIO
        )
        phase2Anim.onfinish = () => {
          this.remove(menuBox.topId)
          this.remove(menuBox.bottomId)
          this.remove(menuBox.leftId)
          this.remove(menuBox.rightId)
          this.remove(menuBox.panelId)
          this.menuBoxes.delete(id)
        }
      }
    })
  }

  animatedMenuBoxOpening(
    x: number, y: number, w: number, h: number,
    duration = 500, content?: HTMLDivElement
  ): Promise<number> {
    const midY = y + h / 2

    const leftId = this.drawVLine(x, y, h, true)
    const rightId = this.drawVLine(x + w - 1, y, h, true)
    const topId = this.drawHLine(x, y, w, true)
    const bottomId = this.drawHLine(x, y + h - 1, w, true)
    const backgroundPanelId = this.drawPanel(x + 1, y + 1, w - 2, h - 2, content)

    const leftNode            = this.nodes.get(leftId)!
    const rightNode           = this.nodes.get(rightId)!
    const topNode             = this.nodes.get(topId)!
    const bottomNode          = this.nodes.get(bottomId)!
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
    topNode.chars[0] = "╠"
    topNode.chars[topNode.chars.length - 1] = "╣"
    topNode.el.textContent = topNode.chars.join("")

    const topAnim = this.animateHorizontalExpand(
      topNode.el, x, midY, duration * RendererUI.PHASE2_RATIO
    )

    return new Promise(resolve => {
      topAnim.onfinish = () => {
        this.reconcileAt(x,         y)
        this.reconcileAt(x + w - 1, y)

        backgroundPanelNode.el.style.setProperty("z-index", "-1")

        this.animateVerticalSlide(
          topNode.el, x, midY, y,         duration * RendererUI.PHASE1_RATIO)

        bottomNode.el.style.display = "block"
        this.animateVerticalSlide(
          bottomNode.el, x, midY, y + h - 1, duration * RendererUI.PHASE1_RATIO)

        const phase2Anims = [leftNode, rightNode, backgroundPanelNode].map(node => {
          node.el.style.transformOrigin = "50% 50%"
          node.el.style.clipPath = "inset(50% 0 50% 0)"
          return this.animateVerticalClipReveal(
            node.el, node.x, node.y, duration * RendererUI.PHASE1_RATIO
          )
        })

        Promise.all(phase2Anims.map(a => a.finished)).then(() => resolve(menuBox.id))
      }
    })
  }

  // ---------- primitive draw calls ------------------------------------------

  drawText(x: number, y: number, text: string): number {
    return this.createTextNode("text", x, y, text)
  }

  drawHLine(x: number, y: number, w: number, doubleLine = false): number {
    const node = this.buildHLine(x, y, w, doubleLine)
    this.exchangeBitsAt(node, "grant")

    for (let i = 0; i < w; i++) this.reconcileAt(x + i, y)
    this.reconcileAt(x - 1,    y)
    this.reconcileAt(x + w,    y)

    return node.id
  }

  drawVLine(x: number, y: number, h: number, doubleLine = false): number {
    const node = this.buildVLine(x, y, h, doubleLine)
    this.exchangeBitsAt(node, "grant")

    for (let i = 0; i < h; i++) this.reconcileAt(x, y + i)
    this.reconcileAt(x, y - 1)
    this.reconcileAt(x, y + h)

    return node.id
  }

  drawPanel(x: number, y: number, w: number, h: number, content?: HTMLDivElement): number {
    const node = this.createNode("panel", x, y, w, h, [])

    node.el.className = "ui ui-panel"
    node.el.style.width  = `${w * TileMetrics.w}px`
    node.el.style.height = `${h * TileMetrics.h}px`

    if (content) node.el.appendChild(content)

    this.pushCellsRect(node)
    return node.id
  }

  // ---------- manipulation --------------------------------------------------

  move(id: number, x: number, y: number) {
    const node = this.nodes.get(id)
    if (!node) return

    if (node instanceof LineNode) {
      this.exchangeBitsAt(node, "withdraw")
    }

    this.popCells(node)
    this.reconcileFootprint(node)
    if (node instanceof LineNode) this.reconcileNeighborsOf(node)

    node.x = x
    node.y = y
    node.applyTransform()

    this.pushCells(node)

    if (node instanceof LineNode) {
      this.exchangeBitsAt(node, "grant")
    }

    this.reconcileFootprint(node)
    if (node instanceof LineNode) this.reconcileNeighborsOf(node)
  }

  remove(id: number) {
    const node = this.nodes.get(id)
    if (!node) return

    if (node instanceof LineNode) {
      this.exchangeBitsAt(node, "withdraw")
    }

    this.popCells(node)
    node.el.remove()
    this.nodes.delete(id)

    this.reconcileFootprint(node)

    if (node instanceof LineNode) {
      this.reconcileNeighborsOf(node)
    }
  }

  setSymbolAt(x: number, y: number, glyph: string): boolean {
    const key   = this.key(x, y)
    const stack = this.cellStack.get(key)
    if (!stack || stack.length === 0) return false

    for (let i = stack.length - 1; i >= 0; i--) {
      const node = this.nodes.get(stack[i])
      if (!(node instanceof LineNode)) continue

      const idx = this.charIndexFor(node, x, y)
      if (idx === -1) continue

      node.chars[idx] = glyph
      node.refresh()
      return true
    }

    return false
  }

  // ---------- menus ---------------------------------------------------------

  showSelectMenu(
    x: number, y: number,
    items: string[],
    paddingX = 1, paddingY = 0,
    wraparound = true
  ): Promise<number> {
    const maxLen = Math.max(...items.map(s => s.length))
    const w = maxLen + paddingX * 2 + 2
    const h = items.length + paddingY * 2 + 2

    return new SelectMenu(this, this.inputManager)
      .open(x, y, w, h, items, paddingX, paddingY, wraparound)
  }

  showRollerMenu(
    x: number, y: number,
    items: string[],
    paddingX = 1
  ): Promise<number> {
    return new RollerMenu(this, this.inputManager)
      .open(x, y, items, paddingX)
  }

  createRollerMenu(): RollerMenu {
    return new RollerMenu(this, this.inputManager)
  }

  // ==========================================================================
  // CELL STACK MANAGEMENT
  // ==========================================================================

  private pushCells(node: UINode) {
    if (node instanceof LineNode) {
      this.pushCellsLine(node)
    } else if (node.kind === "panel") {
      this.pushCellsRect(node)
    } else {
      this.pushCellsHorizontal(node)
    }
  }

  private popCells(node: UINode) {
    const coords = this.footprintCoords(node)
    for (const [x, y] of coords) {
      const key   = this.key(x, y)
      const stack = this.cellStack.get(key)
      if (!stack) continue
      const idx = stack.indexOf(node.id)
      if (idx !== -1) stack.splice(idx, 1)
      if (stack.length === 0) this.cellStack.delete(key)
    }
  }

  private pushCellsHorizontal(node: UINode) {
    for (let i = 0; i < node.w; i++) {
      this.pushToStack(this.key(node.x + i, node.y), node.id)
    }
  }

  private pushCellsLine(node: LineNode) {
    if (node.kind === "vline") {
      for (let i = 0; i < node.h; i++) {
        this.pushToStack(this.key(node.x, node.y + i), node.id)
      }
    } else {
      for (let i = 0; i < node.w; i++) {
        this.pushToStack(this.key(node.x + i, node.y), node.id)
      }
    }
  }

  private pushCellsRect(node: UINode) {
    for (let yy = 0; yy < node.h; yy++) {
      for (let xx = 0; xx < node.w; xx++) {
        this.pushToStack(this.key(node.x + xx, node.y + yy), node.id)
      }
    }
  }

  private pushToStack(key: string, id: number) {
    let stack = this.cellStack.get(key)
    if (!stack) {
      stack = []
      this.cellStack.set(key, stack)
    }
    if (!stack.includes(id)) stack.push(id)
  }

  // ==========================================================================
  // BIT EXCHANGE
  // ==========================================================================

  /**
   * For each cell in a LineNode's footprint, look at the four orthogonal
   * neighbors. If a neighboring cell contains a LineNode, grant or withdraw
   * the directional bit between them.
   *
   * "grant"    → called after the node is pushed to the cell stack
   * "withdraw" → called before the node is popped from the cell stack
   */
  private exchangeBitsAt(node: LineNode, mode: "grant" | "withdraw") {
    const cells = node.kind === "vline"
      ? Array.from({ length: node.h }, (_, i): [number, number] => [node.x, node.y + i])
      : Array.from({ length: node.w }, (_, i): [number, number] => [node.x + i, node.y])

    const directions: Array<[number, number, number]> = [
      [0, -1, TOP],
      [1,  0, RIGHT],
      [0,  1, BOTTOM],
      [-1, 0, LEFT],
    ]

    for (const [cx, cy] of cells) {
      for (const [dx, dy, bit] of directions) {
        const nx = cx + dx
        const ny = cy + dy
        const neighbor = this.topLineNodeAt(nx, ny)
        if (!neighbor || neighbor === node) continue

        if (mode === "grant") {
          node.grantBit(cx, cy, bit, neighbor, nx, ny)
        } else {
          node.withdrawBit(cx, cy, bit, neighbor, nx, ny)
        }
      }
    }
  }

  /**
   * Returns the topmost LineNode in the cell stack at (x, y), or null.
   */
  private topLineNodeAt(x: number, y: number): LineNode | null {
    const stack = this.cellStack.get(this.key(x, y))
    if (!stack) return null
    for (let i = stack.length - 1; i >= 0; i--) {
      const n = this.nodes.get(stack[i])
      if (n instanceof LineNode) return n
    }
    return null
  }

  // ==========================================================================
  // RECONCILIATION
  // ==========================================================================

  private reconcileAt(x: number, y: number) {
    const key   = this.key(x, y)
    const stack = this.cellStack.get(key)
    if (!stack || stack.length === 0) return

    const lineNodes: LineNode[] = []
    for (const id of stack) {
      const n = this.nodes.get(id)
      if (n instanceof LineNode) lineNodes.push(n)
    }
    if (lineNodes.length === 0) return

    let merged = 0
    for (const ln of lineNodes) {
      merged |= ln.getOwnMask(x, y)
    }

    const topLine = lineNodes[lineNodes.length - 1]
    for (const ln of lineNodes) {
      const idx = this.charIndexFor(ln, x, y)
      if (idx === -1) continue
      ln.chars[idx] = ln === topLine ? maskToGlyph(merged) : " "
      ln.el.textContent = ln.kind === "vline"
        ? ln.chars.join("\n")
        : ln.chars.join("")
    }
  }

  private reconcileFootprint(node: UINode) {
    for (const [x, y] of this.footprintCoords(node)) {
      this.reconcileAt(x, y)
    }
  }

  private reconcileNeighborsOf(node: LineNode) {
    if (node.kind === "hline") {
      for (let i = 0; i < node.w; i++) {
        this.reconcileAt(node.x + i, node.y - 1)
        this.reconcileAt(node.x + i, node.y + 1)
      }
      this.reconcileAt(node.x - 1,      node.y)
      this.reconcileAt(node.x + node.w, node.y)
    } else {
      for (let i = 0; i < node.h; i++) {
        this.reconcileAt(node.x - 1, node.y + i)
        this.reconcileAt(node.x + 1, node.y + i)
      }
      this.reconcileAt(node.x, node.y - 1)
      this.reconcileAt(node.x, node.y + node.h)
    }
  }

  // ==========================================================================
  // LINE BUILDERS
  // ==========================================================================

  private buildHLine(x: number, y: number, w: number, doubleLine: boolean): LineNode {
    const el = document.createElement("div")
    el.className = "ui ui-node ui-line"
    el.style.position   = "absolute"
    el.style.whiteSpace = "pre"
    el.style.willChange = "transform, opacity"

    const node = new LineNode(this.nextId++, "hline", el, x, y, w, 1)
    node.applyTransform()

    for (let i = 0; i < w; i++) {
      let mask = 0
      if (i > 0)      mask |= LEFT
      if (i < w - 1)  mask |= RIGHT
      if (doubleLine)  mask |= DOUBLE
      node.setOwnMask(x + i, y, mask)
    }

    node.refresh()

    this.root.appendChild(el)
    this.nodes.set(node.id, node)
    this.pushCellsLine(node)

    return node
  }

  private buildVLine(x: number, y: number, h: number, doubleLine: boolean): LineNode {
    const el = document.createElement("div")
    el.className = "ui ui-node ui-line"
    el.style.position   = "absolute"
    el.style.whiteSpace = "pre"
    el.style.willChange = "transform, opacity"

    const node = new LineNode(this.nextId++, "vline", el, x, y, 1, h)
    node.applyTransform()
    node.applyVerticalStyle()

    for (let i = 0; i < h; i++) {
      let mask = 0
      if (i > 0)      mask |= TOP
      if (i < h - 1)  mask |= BOTTOM
      if (doubleLine)  mask |= DOUBLE
      node.setOwnMask(x, y + i, mask)
    }

    node.refresh()

    this.root.appendChild(el)
    this.nodes.set(node.id, node)
    this.pushCellsLine(node)

    return node
  }

  // ==========================================================================
  // NODE / DOM HELPERS
  // ==========================================================================

  private createTextNode(kind: UIKind, x: number, y: number, text: string): number {
    const chars = [...text]
    const node  = this.createNode(kind, x, y, chars.length, 1, chars)
    node.el.textContent = text
    this.pushCellsHorizontal(node)
    return node.id
  }

  private createNode(
    kind: UIKind,
    x: number, y: number,
    w: number, h: number,
    chars: string[]
  ): UINode {
    const el = document.createElement("div")

    let cls = "ui ui-node"
    if (kind === "vline" || kind === "hline") cls += " ui-line"
    el.className = cls

    el.style.position   = "absolute"
    el.style.whiteSpace = "pre"
    el.style.willChange = "transform, opacity"

    const node = new UINode(this.nextId++, kind, el, x, y, w, h, chars)
    node.applyTransform()

    this.root.appendChild(el)
    this.nodes.set(node.id, node)
    return node
  }

  // ==========================================================================
  // UTILITIES
  // ==========================================================================

  private charIndexFor(node: UINode, x: number, y: number): number {
    if (node.kind === "vline") {
      const i = y - node.y
      return i >= 0 && i < node.h ? i : -1
    }
    const i = x - node.x
    return i >= 0 && i < node.w ? i : -1
  }

  private footprintCoords(node: UINode): Array<[number, number]> {
    const coords: Array<[number, number]> = []
    for (let yy = node.y; yy < node.y + node.h; yy++) {
      for (let xx = node.x; xx < node.x + node.w; xx++) {
        coords.push([xx, yy])
      }
    }
    return coords
  }

  private key(x: number, y: number): string {
    return `${x},${y}`
  }

  // ==========================================================================
  // ANIMATION HELPERS
  // ==========================================================================

  private animateHorizontalExpand(el: HTMLElement, x: number, midY: number, duration: number): Animation {
    return el.animate(
      [
        { transform: `translate(${x * TileMetrics.w}px, ${midY * TileMetrics.h}px)`, clipPath: "inset(0 50% 0 50%)" },
        { transform: `translate(${x * TileMetrics.w}px, ${midY * TileMetrics.h}px)`, clipPath: "inset(0 0 0 0)" },
      ],
      { duration, easing: "ease-out", fill: "forwards" }
    )
  }

  private animateVerticalSlide(
    el: HTMLElement, x: number, fromY: number, toY: number,
    duration: number, easing = "ease-out"
  ): Animation {
    return el.animate(
      [
        { transform: `translate(${x * TileMetrics.w}px, ${fromY * TileMetrics.h}px)` },
        { transform: `translate(${x * TileMetrics.w}px, ${toY   * TileMetrics.h}px)` },
      ],
      { duration, easing, fill: "forwards" }
    )
  }

  private animateVerticalClipReveal(el: HTMLElement, x: number, y: number, duration: number): Animation {
    return el.animate(
      [
        { transform: `translate(${x * TileMetrics.w}px, ${y * TileMetrics.h}px)`, clipPath: "inset(50% 0 50% 0)" },
        { transform: `translate(${x * TileMetrics.w}px, ${y * TileMetrics.h}px)`, clipPath: "inset(0 0 0 0)" },
      ],
      { duration, easing: "ease-out", fill: "forwards" }
    )
  }

  private animateVerticalClipCollapse(el: HTMLElement, x: number, y: number, duration: number): Animation {
    return el.animate(
      [
        { transform: `translate(${x * TileMetrics.w}px, ${y * TileMetrics.h}px)`, clipPath: "inset(0 0 0 0)" },
        { transform: `translate(${x * TileMetrics.w}px, ${y * TileMetrics.h}px)`, clipPath: "inset(50% 0 50% 0)" },
      ],
      { duration, easing: "ease-in", fill: "forwards" }
    )
  }

  private animateHorizontalCollapse(el: HTMLElement, x: number, midY: number, duration: number): Animation {
    return el.animate(
      [
        { transform: `translate(${x * TileMetrics.w}px, ${midY * TileMetrics.h}px)`, clipPath: "inset(0 0 0 0)" },
        { transform: `translate(${x * TileMetrics.w}px, ${midY * TileMetrics.h}px)`, clipPath: "inset(0 50% 0 50%)" },
      ],
      { duration, easing: "ease-in", fill: "forwards" }
    )
  }
}
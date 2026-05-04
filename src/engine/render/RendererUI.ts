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

// ---------------------------------------------------------------------------
// RendererUI
// ---------------------------------------------------------------------------
// Cell ownership model:
//
//   cellStack: Map<"x,y", number[]>
//     An ordered list of node IDs occupying that cell, from bottom to top
//     (last element = topmost / highest z).
//
// For LINE cells the merged glyph is computed by OR-ing the ownMasks of
// every LineNode in the stack for that cell, then resolving via maskToGlyph.
//
// For PANEL background cells the topmost panel occludes everything beneath
// it visually.  When that panel is removed every cell in its footprint is
// reconciled, naturally restoring the glyphs of any LineNodes underneath.
// ---------------------------------------------------------------------------

export class RendererUI {
  root: HTMLDivElement
  inputManager: InputManager

  private static readonly PHASE1_RATIO = 0.60
  private static readonly PHASE2_RATIO = 0.4

  private nextId = 1

  nodes    = new Map<number, UINode>()
  menuBoxes = new Map<number, UIMenuBox>()

  /**
   * Per-cell z-stack of node IDs, ordered bottom → top.
   */
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
        bottomNode.el.style.display = "none"

        // Force line glyphs for collapse bar — write directly to DOM,
        // do not call refresh() which would recompute from ownMasks.
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
          resolve()
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

    // Force line glyphs for collapse bar — write directly to DOM,
    // do not call refresh() which would recompute from ownMasks.
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

    // Reconcile this line's cells AND their immediate neighbors
    for (let i = 0; i < w; i++) {
      this.reconcileAt(x + i, y)
      this.reconcileAt(x + i, y - 1)
      this.reconcileAt(x + i, y + 1)
    }

    return node.id
  }

  drawVLine(x: number, y: number, h: number, doubleLine = false): number {
    const node = this.buildVLine(x, y, h, doubleLine)

    for (let i = 0; i < h; i++) {
      this.reconcileAt(x,     y + i)
      this.reconcileAt(x - 1, y + i)
      this.reconcileAt(x + 1, y + i)
    }

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

    this.popCells(node)
    // Reconcile footprint that was vacated
    this.reconcileFootprint(node)

    node.x = x
    node.y = y
    node.applyTransform()

    this.pushCells(node)
    this.reconcileFootprint(node)
  }

  remove(id: number) {
    const node = this.nodes.get(id)
    if (!node) return

    this.popCells(node)
    node.el.remove()
    this.nodes.delete(id)

    // Reconcile the vacated footprint so underlying nodes refresh
    this.reconcileFootprint(node)

    // Also reconcile neighbors one cell beyond the border
    if (node instanceof LineNode) {
      this.reconcileNeighborsOf(node)
    }
  }

  setSymbolAt(x: number, y: number, glyph: string): boolean {
    const key   = this.key(x, y)
    const stack = this.cellStack.get(key)
    if (!stack || stack.length === 0) return false

    // Find the topmost LineNode in the stack
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
  // RECONCILIATION
  // ==========================================================================

  /**
   * Recompute the glyph at (x, y) by merging ownMasks of all LineNodes
   * in the cell's stack, then writing the result to the topmost LineNode.
   *
   * Panel nodes in the stack occlude lines visually but we still merge
   * the masks so that when the panel is removed the lines snap back.
   */
  private reconcileAt(x: number, y: number) {
    const key   = this.key(x, y)
    const stack = this.cellStack.get(key)
    if (!stack || stack.length === 0) return

    // Collect all LineNodes in this cell's stack
    const lineNodes: LineNode[] = []
    for (const id of stack) {
      const n = this.nodes.get(id)
      if (n instanceof LineNode) lineNodes.push(n)
    }
    if (lineNodes.length === 0) return

    // Merge own masks from all LineNodes at this cell
    let merged = 0
    for (const ln of lineNodes) {
      merged |= ln.getOwnMask(x, y)
    }

    // Propagate connectivity from live neighbors
    if (this.hasLineAt(x,     y - 1)) merged |= TOP
    if (this.hasLineAt(x + 1, y    )) merged |= RIGHT
    if (this.hasLineAt(x,     y + 1)) merged |= BOTTOM
    if (this.hasLineAt(x - 1, y    )) merged |= LEFT

    // The topmost LineNode renders the merged glyph.
    // All others render a space at this cell so they don't overdraw.
    const topLine = lineNodes[lineNodes.length - 1]
    for (const ln of lineNodes) {
      const idx = this.charIndexFor(ln, x, y)
      if (idx === -1) continue
      if (ln === topLine) {
        ln.chars[idx] = maskToGlyph(merged)
      } else {
        ln.chars[idx] = " "
      }
      // Directly update DOM without recomputing from ownMasks
      ln.el.textContent = ln.kind === "vline"
        ? ln.chars.join("\n")
        : ln.chars.join("")
    }
  }

  /**
   * Reconcile every cell in a node's footprint.
   */
  private reconcileFootprint(node: UINode) {
    for (const [x, y] of this.footprintCoords(node)) {
      this.reconcileAt(x, y)
    }
  }

  /**
   * Reconcile the cells one step beyond each edge of a LineNode,
   * so neighboring nodes update their junction glyphs.
   */
  private reconcileNeighborsOf(node: LineNode) {
    if (node.kind === "hline") {
      // cells above and below the whole run, plus just outside each end
      for (let i = 0; i < node.w; i++) {
        this.reconcileAt(node.x + i, node.y - 1)
        this.reconcileAt(node.x + i, node.y + 1)
      }
      this.reconcileAt(node.x - 1,          node.y)
      this.reconcileAt(node.x + node.w,     node.y)
    } else {
      for (let i = 0; i < node.h; i++) {
        this.reconcileAt(node.x - 1, node.y + i)
        this.reconcileAt(node.x + 1, node.y + i)
      }
      this.reconcileAt(node.x, node.y - 1)
      this.reconcileAt(node.x, node.y + node.h)
    }
  }

  /**
   * Returns true if there is at least one LineNode in the stack at (x, y).
   */
  private hasLineAt(x: number, y: number): boolean {
    const stack = this.cellStack.get(this.key(x, y))
    if (!stack) return false
    return stack.some(id => this.nodes.get(id) instanceof LineNode)
  }

  // ==========================================================================
  // LINE BUILDERS
  // ==========================================================================

  private buildHLine(x: number, y: number, w: number, doubleLine: boolean): LineNode {
    const el = document.createElement("div")
    el.className = "ui ui-node ui-line"
    el.style.position  = "absolute"
    el.style.whiteSpace = "pre"
    el.style.willChange = "transform, opacity"

    const node = new LineNode(this.nextId++, "hline", el, x, y, w, 1)
    node.applyTransform()

    for (let i = 0; i < w; i++) {
      let mask = 0
      if (i > 0)     mask |= LEFT
      if (i < w - 1) mask |= RIGHT
      if (doubleLine) mask |= DOUBLE
      node.setOwnMask(x + i, y, mask)
    }

    // Build initial chars from own masks only
    node.refresh()

    this.root.appendChild(el)
    this.nodes.set(node.id, node)
    this.pushCellsLine(node)

    return node
  }

  private buildVLine(x: number, y: number, h: number, doubleLine: boolean): LineNode {
    const el = document.createElement("div")
    el.className = "ui ui-node ui-line"
    el.style.position  = "absolute"
    el.style.whiteSpace = "pre"
    el.style.willChange = "transform, opacity"

    const node = new LineNode(this.nextId++, "vline", el, x, y, 1, h)
    node.applyTransform()
    node.applyVerticalStyle()

    for (let i = 0; i < h; i++) {
      let mask = 0
      if (i > 0)     mask |= TOP
      if (i < h - 1) mask |= BOTTOM
      if (doubleLine) mask |= DOUBLE
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

  /**
   * Returns the char array index for the cell (x, y) within a node,
   * or -1 if the node doesn't cover that cell.
   */
  private charIndexFor(node: UINode, x: number, y: number): number {
    if (node.kind === "vline") {
      const i = y - node.y
      return i >= 0 && i < node.h ? i : -1
    }
    const i = x - node.x
    return i >= 0 && i < node.w ? i : -1
  }

  /**
   * All (x, y) coordinates covered by a node's bounding box.
   */
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
  // ANIMATION HELPERS (unchanged from original)
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

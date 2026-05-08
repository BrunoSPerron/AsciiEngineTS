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

  // Maps each cell key to the ordered stack of node IDs occupying it (topmost = last).
  // Used to find which node should render the reconciled glyph at a given cell.
  cellStack = new Map<string, number[]>()

  // Tracks which cells have a LineNode as their topmost entry in cellStack.
  // A panel on top of a line removes that cell from lineCells, hiding it from
  // neighbor detection. Derived from cellStack — updated by recomputeLineCells()
  // whenever the stack at a cell changes. Used exclusively by neighborMask().
  private lineCells = new Map<string, boolean>()

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
    this.lineCells.clear()
  }

  // ---------- animated box helpers ------------------------------------------

  animatedMenuBoxClosing(id: number, duration = 500): Promise<void> {
    const menuBox = this.menuBoxes.get(id)
    if (!menuBox) return Promise.resolve()

    const topNode    = this.nodes.get(menuBox.topId)    as LineNode
    const bottomNode = this.nodes.get(menuBox.bottomId) as LineNode
    const leftNode   = this.nodes.get(menuBox.leftId)   as LineNode
    const rightNode  = this.nodes.get(menuBox.rightId)  as LineNode
    const panelNode  = this.nodes.get(menuBox.panelId)!
    const lineNodes  = [topNode, bottomNode, leftNode, rightNode]

    for (const node of lineNodes) {
      this.unregisterLine(node)
    }
    this.unregisterPanel(panelNode)

    const midY = topNode.y + (bottomNode.y - topNode.y) / 2
    const x    = topNode.x

    return new Promise(resolve => {
      const phase1Duration = duration * RendererUI.PHASE1_RATIO

      for (const node of [leftNode, rightNode, panelNode]) {
        this.animateVerticalClipCollapse(node.el, node.x, node.y, phase1Duration)
      }

      this.animateVerticalSlide(topNode.el, x, topNode.y, midY, phase1Duration, "ease-in")

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
          for (const node of lineNodes) this.removeNode(node.id)
          this.removeNode(menuBox.panelId)
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

    const leftId            = this.drawVLine(x,         y, h)
    const rightId           = this.drawVLine(x + w - 1, y, h)
    const topId             = this.drawHLine(x,         y, w)
    const bottomId          = this.drawHLine(x, y + h - 1, w)
    const backgroundPanelId = this.drawPanel(x + 1, y + 1, w - 2, h - 2, content)

    const leftNode            = this.nodes.get(leftId)!
    const rightNode           = this.nodes.get(rightId)!
    const topNode             = this.nodes.get(topId)   as LineNode
    const bottomNode          = this.nodes.get(bottomId) as LineNode
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

        this.animateVerticalSlide(topNode.el,    x, midY, y,         duration * RendererUI.PHASE1_RATIO)
        bottomNode.el.style.display = "block"
        this.animateVerticalSlide(bottomNode.el, x, midY, y + h - 1, duration * RendererUI.PHASE1_RATIO)

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

  drawHLine(x: number, y: number, w: number): number {
    const node = this.buildHLine(x, y, w)
    this.registerLine(node)
    this.reconcileFootprint(node)
    this.reconcileNeighborsOf(node)
    return node.id
  }

  drawVLine(x: number, y: number, h: number): number {
    const node = this.buildVLine(x, y, h)
    this.registerLine(node)
    this.reconcileFootprint(node)
    this.reconcileNeighborsOf(node)
    return node.id
  }

  drawPanel(x: number, y: number, w: number, h: number, content?: HTMLDivElement): number {
    const node = this.createNode("panel", x, y, w, h, [])

    node.el.className = "ui ui-panel"
    node.el.style.width  = `${w * TileMetrics.w}px`
    node.el.style.height = `${h * TileMetrics.h}px`

    if (content) node.el.appendChild(content)

    this.pushCellsRect(node)

    // Recompute lineCells for every cell this panel covers, then reconcile
    // any line glyphs whose neighbor mask may have changed because lines
    // beneath the panel are now hidden.
    for (const [px, py] of this.footprintCoords(node)) {
      this.recomputeLineCells(this.key(px, py))
      this.reconcileAt(px - 1, py)
      this.reconcileAt(px + 1, py)
      this.reconcileAt(px,     py - 1)
      this.reconcileAt(px,     py + 1)
    }

    return node.id
  }

  // ---------- manipulation --------------------------------------------------

  move(id: number, x: number, y: number) {
    const node = this.nodes.get(id)
    if (!node) return

    if (node instanceof LineNode) {
      this.unregisterLine(node)
      this.reconcileFootprint(node)
      this.reconcileNeighborsOf(node)
    }

    this.popCells(node)

    node.x = x
    node.y = y
    node.applyTransform()

    this.pushCells(node)

    if (node instanceof LineNode) {
      this.registerLine(node)
      this.reconcileFootprint(node)
      this.reconcileNeighborsOf(node)
    }
  }

  remove(id: number) {
    const node = this.nodes.get(id)
    if (!node) return

    if (node instanceof LineNode) {
      this.unregisterLine(node)
    }

    const footprint = this.footprintCoords(node)

    this.popCells(node)
    node.el.remove()
    this.nodes.delete(id)

    if (node instanceof LineNode) {
      // Recompute lineCells for the line's own cells (now vacated or re-topped
      // by whatever was underneath), then reconcile footprint and neighbors.
      for (const [x, y] of footprint) {
        this.recomputeLineCells(this.key(x, y))
      }
      this.reconcileFootprint(node)
      this.reconcileNeighborsOf(node)
    } else if (node.kind === "panel") {
      // Recompute lineCells for every cell this panel covered — lines that
      // were hidden beneath it may now be the topmost entry again.
      for (const [x, y] of footprint) {
        this.recomputeLineCells(this.key(x, y))
        this.reconcileAt(x, y)
        this.reconcileAt(x - 1, y)
        this.reconcileAt(x + 1, y)
        this.reconcileAt(x,     y - 1)
        this.reconcileAt(x,     y + 1)
      }
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
  // LINE CELL REGISTRATION
  // ==========================================================================

  /**
   * Recompute whether cell `key` should be in lineCells.
   * A cell is present if and only if its topmost cellStack entry is a LineNode
   * (i.e. no panel is sitting on top of it).
   * Called whenever the stack at a cell changes.
   */
  private recomputeLineCells(key: string) {
    const stack = this.cellStack.get(key)
    if (!stack || stack.length === 0) {
      this.lineCells.delete(key)
      return
    }
    const top = this.nodes.get(stack[stack.length - 1])
    if (top instanceof LineNode) {
      this.lineCells.set(key, true)
    } else {
      this.lineCells.delete(key)
    }
  }

  /** Register a LineNode into lineCells and reconcile its cells' neighbors. */
  private registerLine(node: LineNode) {
    for (const [x, y] of node.cellCoords()) {
      this.recomputeLineCells(this.key(x, y))
    }
  }

  /**
   * Remove a LineNode from lineCells and reconcile its former neighbors.
   * Used both by remove() and as an early-exit before closing animations,
   * so that neighboring lines revert to non-intersection glyphs immediately.
   *
   * Note: the node is still in cellStack at this point — we force-delete from
   * lineCells directly rather than recomputing from the stack, because the
   * stack hasn't been updated yet.
   */
  private unregisterLine(node: LineNode) {
    for (const [x, y] of node.cellCoords()) {
      this.lineCells.delete(this.key(x, y))
    }
    const toReconcile = this.borderNeighborCells([node])
    for (const [x, y] of toReconcile) {
      this.reconcileAt(x, y)
    }
  }

  /**
   * Early-unregister a panel before its closing animation runs.
   * Pops the panel from the cellStack, recomputes lineCells for every cell it
   * covered (restoring any hidden lines to the mask), and reconciles the
   * surrounding glyphs. removeNode() called later will find nothing to pop
   * and is safe to call without double-reconciling.
   */
  private unregisterPanel(node: UINode) {
    const footprint = this.footprintCoords(node)
    this.popCells(node)
    for (const [x, y] of footprint) {
      this.recomputeLineCells(this.key(x, y))
      this.reconcileAt(x, y)
      this.reconcileAt(x - 1, y)
      this.reconcileAt(x + 1, y)
      this.reconcileAt(x,     y - 1)
      this.reconcileAt(x,     y + 1)
    }
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
      if (idx !== -1) {
        stack.splice(idx, 1)
        this.recomputeLineCells(key)
      }
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
    if (!stack.includes(id)) {
      stack.push(id)
      this.recomputeLineCells(key)
    }
  }

  // ==========================================================================
  // RECONCILIATION
  // ==========================================================================

  /**
   * Recompute and write the correct glyph for the LineNode at (x, y).
   *
   * Three-step sequence:
   *   1. Find the topmost LineNode in the cellStack at this cell.
   *   2. Build a direction bitmask from lineCells neighbors (neighborMask).
   *   3. Write the resolved glyph to that node's chars[], blank all others.
   */
  private reconcileAt(x: number, y: number) {
    if (!this.lineCells.has(this.key(x,y))) return

    const stack = this.cellStack.get(this.key(x, y))
    if (!stack || stack.length === 0) return

    let topLine: LineNode | null = null
    for (let i = stack.length - 1; i >= 0; i--) {
      const n = this.nodes.get(stack[i])
      if (n instanceof LineNode) { topLine = n; break }
    }
    if (!topLine) return

    const glyph = maskToGlyph(this.neighborMask(x, y))

    for (const id of stack) {
      const node = this.nodes.get(id)
      if (!(node instanceof LineNode)) continue
      const idx = this.charIndexFor(node, x, y)
      if (idx === -1) continue
      node.chars[idx] = node === topLine ? glyph : " "
      node.el.textContent = node.kind === "vline"
        ? node.chars.join("\n")
        : node.chars.join("")
    }
  }

  /**
   * Build the direction bitmask at (x, y) by checking the four orthogonal
   * neighbors in lineCells.
   *
   * Note: DOUBLE is always forced on — single-line glyphs are not yet wired up.
   * See LINE_GLYPHS in LineNode.ts for the corresponding TODO.
   */
  private neighborMask(x: number, y: number): number {
    let mask = DOUBLE
    if (this.lineCells.get(this.key(x,     y - 1))) mask |= TOP
    if (this.lineCells.get(this.key(x + 1, y    ))) mask |= RIGHT
    if (this.lineCells.get(this.key(x,     y + 1))) mask |= BOTTOM
    if (this.lineCells.get(this.key(x - 1, y    ))) mask |= LEFT
    return mask
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

  /**
   * Collect all cells orthogonally neighboring the given LineNodes that are
   * NOT part of those nodes' own footprint.
   *
   * Used by unregisterLine() so that cells which were previously intersections
   * with the departing line get reconciled and revert to the correct glyph.
   */
  private borderNeighborCells(lineNodes: LineNode[]): Array<[number, number]> {
    const own   = new Set<string>()
    const outer = new Map<string, [number, number]>()

    for (const node of lineNodes) {
      if (node.kind === "hline") {
        for (let i = 0; i < node.w; i++) own.add(this.key(node.x + i, node.y))
      } else {
        for (let i = 0; i < node.h; i++) own.add(this.key(node.x, node.y + i))
      }
    }

    for (const node of lineNodes) {
      if (node.kind === "hline") {
        for (let i = 0; i < node.w; i++) {
          this.addIfNotOwn(node.x + i, node.y - 1, own, outer)
          this.addIfNotOwn(node.x + i, node.y + 1, own, outer)
        }
        this.addIfNotOwn(node.x - 1,      node.y, own, outer)
        this.addIfNotOwn(node.x + node.w, node.y, own, outer)
      } else {
        for (let i = 0; i < node.h; i++) {
          this.addIfNotOwn(node.x - 1, node.y + i, own, outer)
          this.addIfNotOwn(node.x + 1, node.y + i, own, outer)
        }
        this.addIfNotOwn(node.x, node.y - 1,      own, outer)
        this.addIfNotOwn(node.x, node.y + node.h, own, outer)
      }
    }

    return [...outer.values()]
  }

  private addIfNotOwn(
    x: number, y: number,
    own: Set<string>,
    out: Map<string, [number, number]>
  ) {
    const k = this.key(x, y)
    if (!own.has(k)) out.set(k, [x, y])
  }

  // ==========================================================================
  // LINE BUILDERS
  // ==========================================================================

  private buildHLine(x: number, y: number, w: number): LineNode {
    const el = document.createElement("div")
    el.className = "ui ui-node ui-line"
    el.style.position   = "absolute"
    el.style.whiteSpace = "pre"
    el.style.willChange = "transform, opacity"

    const node = new LineNode(this.nextId++, "hline", el, x, y, w, 1)
    node.applyTransform()

    for (let i = 0; i < w; i++) {
      node.chars[i] = "═"
    }
    node.refresh()

    this.root.appendChild(el)
    this.nodes.set(node.id, node)
    this.pushCellsLine(node)

    return node
  }

  private buildVLine(x: number, y: number, h: number): LineNode {
    const el = document.createElement("div")
    el.className = "ui ui-node ui-line"
    el.style.position   = "absolute"
    el.style.whiteSpace = "pre"
    el.style.willChange = "transform, opacity"

    const node = new LineNode(this.nextId++, "vline", el, x, y, 1, h)
    node.applyTransform()
    node.applyVerticalStyle()

    for (let i = 0; i < h; i++) {
      node.chars[i] = "║"
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

  /**
   * Internal removal used by the closing animation, after unregisterLine /
   * unregisterPanel have already run. popCells() is idempotent — if the node
   * was already removed from the stack, indexOf returns -1 and nothing happens.
   */
  private removeNode(id: number) {
    const node = this.nodes.get(id)
    if (!node) return
    this.popCells(node)
    node.el.remove()
    this.nodes.delete(id)
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

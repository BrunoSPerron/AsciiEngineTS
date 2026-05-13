import type { InputManager } from '../core/InputManager'
import { UINode, type UIKind, isLineLike } from './nodes/UINode'
import { LineNode, maskToGlyph, TOP, RIGHT, BOTTOM, LEFT, DOUBLE } from './nodes/LineNode'
import { UIPanel } from './nodes/UIPanel'
import { SelectMenu } from './nodes/SelectMenu'
import { RollerMenu } from './nodes/RollerMenu'
import type { TileMetricsData } from './tileMetrics'

export class RendererUI {
  root: HTMLDivElement
  inputManager: InputManager
  tileMetrics: TileMetricsData

  private nextId = 1

  nodes = new Map<number, UINode>()

  // Maps each cell key to the ordered stack of node IDs occupying it (topmost = last).
  cellStack = new Map<string, number[]>()

  // Tracks which cells have a line-like node as their topmost entry in cellStack.
  private lineCells = new Map<string, boolean>()

  constructor(root: HTMLDivElement, inputManager: InputManager, tileMetrics: TileMetricsData) {
    this.inputManager = inputManager
    this.root = root
    this.tileMetrics = tileMetrics
  }

  reserveId(): number {
    return this.nextId++
  }

  clear() {
    this.root.innerHTML = ''
    this.nodes.clear()
    this.cellStack.clear()
    this.lineCells.clear()
  }

  // ---------- primitive draw calls ------------------------------------------

  drawText(x: number, y: number, text: string): number {
    return this.createTextNode('text', x, y, text)
  }

  drawHLine(x: number, y: number, w: number): number {
    const node = this.buildHLine(x, y, w)
    this.registerLineLike(node)
    this.reconcileFootprint(node)
    this.reconcileNeighborsOf(node)
    return node.id
  }

  drawVLine(x: number, y: number, h: number): number {
    const node = this.buildVLine(x, y, h)
    this.registerLineLike(node)
    this.reconcileFootprint(node)
    this.reconcileNeighborsOf(node)
    return node.id
  }

  async drawPanel(
    x: number,
    y: number,
    w: number,
    h: number,
    content?: HTMLDivElement,
    duration?: number,
    reservedId?: number,
  ): Promise<UIPanel> {
    const panel = this.buildPanel(x, y, w, h, reservedId)
    this.registerLineLike(panel)
    this.reconcileFootprint(panel)
    this.reconcileNeighborsPanelBorder(panel)
    this.pushInteriorCells(panel)
    await panel.open(duration, content)
    return panel
  }

  // ---------- manipulation --------------------------------------------------

  move(id: number, x: number, y: number) {
    const node = this.nodes.get(id)
    if (!node) return

    if (isLineLike(node)) {
      this.unregisterLineLike(node)
      this.reconcileFootprint(node)
      this.reconcileNeighborsGeneric(node)
    }

    this.popCells(node)

    node.x = x
    node.y = y
    node.applyTransform()

    this.pushCells(node)

    if (isLineLike(node)) {
      this.registerLineLike(node)
      this.reconcileFootprint(node)
      this.reconcileNeighborsGeneric(node)
    }
  }

  remove(id: number) {
    const node = this.nodes.get(id)
    if (!node) return

    if (isLineLike(node)) {
      this.unregisterLineLike(node)
    }

    const footprint = this.footprintCoords(node)

    this.popCells(node)
    node.el.remove()
    this.nodes.delete(id)

    if (isLineLike(node)) {
      for (const [x, y] of footprint) {
        this.recomputeLineCells(this.key(x, y))
      }
      this.reconcileFootprintCoords(footprint)
      this.reconcileNeighborsGeneric(node)
    } else if (node.kind === 'panel') {
      for (const [x, y] of footprint) {
        this.recomputeLineCells(this.key(x, y))
        this.reconcileAt(x, y)
        this.reconcileAt(x - 1, y)
        this.reconcileAt(x + 1, y)
        this.reconcileAt(x, y - 1)
        this.reconcileAt(x, y + 1)
      }
    }
  }

  setSymbolAt(x: number, y: number, glyph: string): boolean {
    const key = this.key(x, y)
    const stack = this.cellStack.get(key)
    if (!stack || stack.length === 0) return false

    for (let i = stack.length - 1; i >= 0; i--) {
      const node = this.nodes.get(stack[i])
      if (!node || !isLineLike(node)) continue

      const idx = node.charIndexFor(x, y)
      if (idx === -1) continue

      node.setCharAt(x, y, glyph)
      return true
    }

    return false
  }

  // ---------- menus ---------------------------------------------------------

  showSelectMenu(
    x: number,
    y: number,
    items: string[],
    paddingX = 1,
    paddingY = 0,
    wraparound = true,
  ): Promise<number> {
    const maxLen = Math.max(...items.map((s) => s.length))
    const w = maxLen + paddingX * 2 + 2
    const h = items.length + paddingY * 2 + 2

    return new SelectMenu(this, this.inputManager).open(
      x,
      y,
      w,
      h,
      items,
      paddingX,
      paddingY,
      wraparound,
    )
  }

  showRollerMenu(x: number, y: number, items: string[], paddingX = 1): Promise<number> {
    return new RollerMenu(this, this.inputManager).open(x, y, items, paddingX)
  }

  createRollerMenu(): RollerMenu {
    return new RollerMenu(this, this.inputManager)
  }

  // ==========================================================================
  // LINE CELL REGISTRATION
  // ==========================================================================

  private recomputeLineCells(key: string) {
    const stack = this.cellStack.get(key)
    if (!stack || stack.length === 0) {
      this.lineCells.delete(key)
      return
    }
    const top = this.nodes.get(stack[stack.length - 1])
    if (top && isLineLike(top)) {
      this.lineCells.set(key, true)
    } else {
      this.lineCells.delete(key)
    }
  }

  private registerLineLike(node: UINode) {
    if (!isLineLike(node)) return
    for (const [x, y] of node.cellCoords()) {
      this.recomputeLineCells(this.key(x, y))
    }
  }

  private unregisterLineLike(node: UINode) {
    if (!isLineLike(node)) return
    for (const [x, y] of node.cellCoords()) {
      this.lineCells.delete(this.key(x, y))
    }
    const toReconcile = this.borderNeighborCells(node)
    for (const [x, y] of toReconcile) {
      this.reconcileAt(x, y)
    }
  }

  unregisterPanelEarly(panel: UIPanel) {
    this.unregisterLineLike(panel)
    const interior = panel.interiorCoords()
    this.popCoordsFromStack(panel.id, interior)
    for (const [x, y] of interior) {
      this.recomputeLineCells(this.key(x, y))
      this.reconcileAt(x, y)
      this.reconcileAt(x - 1, y)
      this.reconcileAt(x + 1, y)
      this.reconcileAt(x, y - 1)
      this.reconcileAt(x, y + 1)
    }
  }

  removePanel(panel: UIPanel) {
    this.unregisterPanelEarly(panel)
    const footprint = this.footprintCoords(panel)
    this.popCells(panel)
    this.nodes.delete(panel.id)
    for (const [x, y] of footprint) {
      this.recomputeLineCells(this.key(x, y))
      this.reconcileAt(x, y)
    }
  }

  // ==========================================================================
  // CELL STACK MANAGEMENT
  // ==========================================================================

  private pushCells(node: UINode) {
    if (node instanceof UIPanel) {
      this.pushBorderCells(node)
      this.pushInteriorCells(node)
    } else if (node instanceof LineNode) {
      this.pushCellsLine(node)
    } else {
      this.pushCellsHorizontal(node)
    }
  }

  private popCells(node: UINode) {
    const coords = this.footprintCoords(node)
    this.popCoordsFromStack(node.id, coords)
  }

  private popCoordsFromStack(id: number, coords: Array<[number, number]>) {
    for (const [x, y] of coords) {
      const key = this.key(x, y)
      const stack = this.cellStack.get(key)
      if (!stack) continue
      const idx = stack.indexOf(id)
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
    if (node.kind === 'vline') {
      for (let i = 0; i < node.h; i++) {
        this.pushToStack(this.key(node.x, node.y + i), node.id)
      }
    } else {
      for (let i = 0; i < node.w; i++) {
        this.pushToStack(this.key(node.x + i, node.y), node.id)
      }
    }
  }

  private pushBorderCells(panel: UIPanel) {
    for (const [x, y] of panel.cellCoords()) {
      this.pushToStack(this.key(x, y), panel.id)
    }
  }

  pushInteriorCells(panel: UIPanel) {
    for (const [x, y] of panel.interiorCoords()) {
      this.pushToStack(this.key(x, y), panel.id)
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

  private reconcileAt(x: number, y: number) {
    if (!this.lineCells.has(this.key(x, y))) return

    const stack = this.cellStack.get(this.key(x, y))
    if (!stack || stack.length === 0) return

    let topLineLike:
      | (UINode & {
          charIndexFor(x: number, y: number): number
          setCharAt(x: number, y: number, g: string): void
        })
      | null = null
    for (let i = stack.length - 1; i >= 0; i--) {
      const n = this.nodes.get(stack[i])
      if (n && isLineLike(n)) {
        topLineLike = n
        break
      }
    }
    if (!topLineLike) return

    const glyph = maskToGlyph(this.neighborMask(x, y))

    for (const id of stack) {
      const node = this.nodes.get(id)
      if (!node || !isLineLike(node)) continue
      const idx = node.charIndexFor(x, y)
      if (idx === -1) continue
      node.setCharAt(x, y, node === topLineLike ? glyph : ' ')
    }
  }

  private neighborMask(x: number, y: number): number {
    let mask = DOUBLE
    if (this.lineCells.get(this.key(x, y - 1))) mask |= TOP
    if (this.lineCells.get(this.key(x + 1, y))) mask |= RIGHT
    if (this.lineCells.get(this.key(x, y + 1))) mask |= BOTTOM
    if (this.lineCells.get(this.key(x - 1, y))) mask |= LEFT
    return mask
  }

  private reconcileFootprint(node: UINode) {
    this.reconcileFootprintCoords(this.footprintCoords(node))
  }

  private reconcileFootprintCoords(coords: Array<[number, number]>) {
    for (const [x, y] of coords) this.reconcileAt(x, y)
  }

  private reconcileNeighborsOf(node: LineNode) {
    if (node.kind === 'hline') {
      for (let i = 0; i < node.w; i++) {
        this.reconcileAt(node.x + i, node.y - 1)
        this.reconcileAt(node.x + i, node.y + 1)
      }
      this.reconcileAt(node.x - 1, node.y)
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

  private reconcileNeighborsPanelBorder(panel: UIPanel) {
    // Reconcile one cell outside each edge of the panel border
    for (let i = 0; i < panel.w; i++) {
      this.reconcileAt(panel.x + i, panel.y - 1)
      this.reconcileAt(panel.x + i, panel.y + panel.h)
    }
    for (let i = 0; i < panel.h; i++) {
      this.reconcileAt(panel.x - 1, panel.y + i)
      this.reconcileAt(panel.x + panel.w, panel.y + i)
    }
  }

  private reconcileNeighborsGeneric(node: UINode) {
    if (node instanceof UIPanel) {
      this.reconcileNeighborsPanelBorder(node)
    } else if (node instanceof LineNode) {
      this.reconcileNeighborsOf(node)
    }
  }

  private borderNeighborCells(node: UINode): Array<[number, number]> {
    if (node instanceof UIPanel) return this.panelBorderNeighborCells(node)
    if (node instanceof LineNode) return this.lineNeighborCells(node)
    return []
  }

  private lineNeighborCells(node: LineNode): Array<[number, number]> {
    const own = new Set<string>()
    const outer = new Map<string, [number, number]>()

    if (node.kind === 'hline') {
      for (let i = 0; i < node.w; i++) own.add(this.key(node.x + i, node.y))
      for (let i = 0; i < node.w; i++) {
        this.addIfNotOwn(node.x + i, node.y - 1, own, outer)
        this.addIfNotOwn(node.x + i, node.y + 1, own, outer)
      }
      this.addIfNotOwn(node.x - 1, node.y, own, outer)
      this.addIfNotOwn(node.x + node.w, node.y, own, outer)
    } else {
      for (let i = 0; i < node.h; i++) own.add(this.key(node.x, node.y + i))
      for (let i = 0; i < node.h; i++) {
        this.addIfNotOwn(node.x - 1, node.y + i, own, outer)
        this.addIfNotOwn(node.x + 1, node.y + i, own, outer)
      }
      this.addIfNotOwn(node.x, node.y - 1, own, outer)
      this.addIfNotOwn(node.x, node.y + node.h, own, outer)
    }

    return [...outer.values()]
  }

  private panelBorderNeighborCells(panel: UIPanel): Array<[number, number]> {
    const own = new Set(panel.cellCoords().map(([x, y]) => this.key(x, y)))
    const outer = new Map<string, [number, number]>()
    for (let i = 0; i < panel.w; i++) {
      this.addIfNotOwn(panel.x + i, panel.y - 1, own, outer)
      this.addIfNotOwn(panel.x + i, panel.y + panel.h, own, outer)
    }
    for (let i = 0; i < panel.h; i++) {
      this.addIfNotOwn(panel.x - 1, panel.y + i, own, outer)
      this.addIfNotOwn(panel.x + panel.w, panel.y + i, own, outer)
    }
    return [...outer.values()]
  }

  private addIfNotOwn(x: number, y: number, own: Set<string>, out: Map<string, [number, number]>) {
    const k = this.key(x, y)
    if (!own.has(k)) out.set(k, [x, y])
  }

  // ==========================================================================
  // LINE BUILDERS
  // ==========================================================================

  private buildHLine(x: number, y: number, w: number): LineNode {
    const el = document.createElement('div')
    el.className = 'ui ui-node ui-line'
    el.style.position = 'absolute'
    el.style.whiteSpace = 'pre'
    el.style.willChange = 'transform, opacity'

    const node = new LineNode(this.nextId++, 'hline', el, x, y, w, 1, this.tileMetrics)
    node.applyTransform()

    for (let i = 0; i < w; i++) node.chars[i] = '═'
    node.refresh()

    this.root.appendChild(el)
    this.nodes.set(node.id, node)
    this.pushCellsLine(node)

    return node
  }

  private buildVLine(x: number, y: number, h: number): LineNode {
    const el = document.createElement('div')
    el.className = 'ui ui-node ui-line'
    el.style.position = 'absolute'
    el.style.whiteSpace = 'pre'
    el.style.willChange = 'transform, opacity'

    const node = new LineNode(this.nextId++, 'vline', el, x, y, 1, h, this.tileMetrics)
    node.applyTransform()
    node.applyVerticalStyle()

    for (let i = 0; i < h; i++) node.chars[i] = '║'
    node.refresh()

    this.root.appendChild(el)
    this.nodes.set(node.id, node)
    this.pushCellsLine(node)

    return node
  }

  private buildPanel(x: number, y: number, w: number, h: number, reservedId?: number): UIPanel {
    const containerEl = document.createElement('div')
    containerEl.className = 'ui-panel-container'
    containerEl.style.position = 'absolute'
    containerEl.style.inset = '0'
    this.root.appendChild(containerEl)

    // el is a no-op placeholder — UIPanel manages its own border divs
    const el = document.createElement('div')
    const id = reservedId ?? this.nextId++
    const panel = new UIPanel(id, el, containerEl, x, y, w, h, this.inputManager, this.tileMetrics)

    this.nodes.set(panel.id, panel)
    this.pushBorderCells(panel)

    return panel
  }

  // ==========================================================================
  // NODE / DOM HELPERS
  // ==========================================================================

  private createTextNode(kind: UIKind, x: number, y: number, text: string): number {
    const chars = [...text]
    const node = this.createNode(kind, x, y, chars.length, 1, chars)
    node.el.textContent = text
    this.pushCellsHorizontal(node)
    return node.id
  }

  private createNode(
    kind: UIKind,
    x: number,
    y: number,
    w: number,
    h: number,
    chars: string[],
  ): UINode {
    const el = document.createElement('div')

    let cls = 'ui ui-node'
    if (kind === 'vline' || kind === 'hline') cls += ' ui-line'
    el.className = cls

    el.style.position = 'absolute'
    el.style.whiteSpace = 'pre'
    el.style.willChange = 'transform, opacity'

    const node = new UINode(this.nextId++, kind, el, x, y, w, h, chars, this.tileMetrics)
    node.applyTransform()

    this.root.appendChild(el)
    this.nodes.set(node.id, node)
    return node
  }

  // ==========================================================================
  // UTILITIES
  // ==========================================================================

  private footprintCoords(node: UINode): Array<[number, number]> {
    // For UIPanel, footprint is border + interior
    if (node instanceof UIPanel) {
      return [...node.cellCoords(), ...node.interiorCoords()]
    }
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
}

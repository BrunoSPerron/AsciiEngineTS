import { UINode } from './nodes/UINode'
import { UIPanel } from './nodes/UIPanel'
import { SelectMenuList } from './nodes/SelectMenuList'
import { SelectMenuRoller } from './nodes/SelectMenuRoller'
import type { TileMetricsData } from '../tileMetrics'
import type { ActionManager } from '../../core/ActionManager'
import type { ContextManager } from '../../core/ContextManager'
import type { PointerManager } from '../../core/PointerManager'
import { Anchor } from './anchor'
import { UILayout } from './UILayout'

// TODO Deprecated dead code, need to be reimplemented
//  all uiNodes are deprecated too and should be rewrote as a single panel accepting a UILayoutElement
export class RendererUI {
  root: HTMLDivElement
  private _actionManager: ActionManager
  private _contextManager: ContextManager
  private _pointerManager: PointerManager
  private _uiLayout: UILayout

  tileMetrics: TileMetricsData

  private nextId = 1

  nodes = new Map<number, UINode>()

  constructor(
    root: HTMLDivElement,
    uiLayoutRoot: HTMLDivElement,
    actionManager: ActionManager,
    contextManager: ContextManager,
    pointerManager: PointerManager,
    tileMetrics: TileMetricsData,
  ) {
    this._actionManager = actionManager
    this._contextManager = contextManager
    this._pointerManager = pointerManager
    this.root = root
    this.tileMetrics = tileMetrics
    this._uiLayout = new UILayout(root, uiLayoutRoot, tileMetrics)
  }

  get pointerManager(): PointerManager {
    return this._pointerManager
  }

  get uiLayout(): UILayout {
    return this._uiLayout
  }

  reserveId(): number {
    return this.nextId++
  }

  clear() {
    this.root.innerHTML = ''
    this.nodes.clear()
  }

  drawFrame(): void {
    this._uiLayout.drawFrame()
  }

  onResize(): void {
    this._uiLayout.onResize()
  }

  // ---------- draw calls ----------------------------------------------------

  drawText(x: number, y: number, text: string): number {
    const chars = [...text]
    const el = document.createElement('div')
    el.className = 'ui ui-node'
    el.style.position = 'absolute'
    el.style.whiteSpace = 'pre'
    el.style.willChange = 'transform, opacity'

    const node = new UINode(
      this.nextId++,
      'text',
      el,
      x,
      y,
      chars.length,
      1,
      chars,
      this.tileMetrics,
    )
    node.applyTransform()
    el.textContent = text

    this.root.appendChild(el)
    this.nodes.set(node.id, node)
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
    anchor: Anchor = Anchor.MiddleCenter,
  ): Promise<UIPanel> {
    const panel = this._buildPanel(x, y, w, h, reservedId, anchor)
    await panel.open(duration, content)
    return panel
  }

  // ---------- panel lifecycle -----------------------------------------------

  removePanel(panel: UIPanel) {
    this.nodes.delete(panel.id)
  }

  // ---------- menus ---------------------------------------------------------

  showSelectMenu(
    x: number,
    y: number,
    items: string[],
    paddingX = 1,
    paddingY = 0,
    wraparound = true,
    anchor: Anchor = Anchor.MiddleCenter,
  ): Promise<number> {
    const maxLen = Math.max(...items.map((s) => s.length))
    const w = maxLen + paddingX * 2 + 2
    const h = items.length + paddingY * 2 + 2

    return new SelectMenuList(
      this,
      this._actionManager,
      this._contextManager,
      this._pointerManager,
    ).open(x, y, w, h, items, paddingX, paddingY, wraparound, anchor)
  }

  showSelectRollerMenu(x: number, y: number, items: string[], paddingX = 1): Promise<number> {
    return new SelectMenuRoller(this, this._actionManager, this._contextManager).open(
      x,
      y,
      items,
      paddingX,
    )
  }

  createSelectRollerMenu(): SelectMenuRoller {
    return new SelectMenuRoller(this, this._actionManager, this._contextManager)
  }

  // ---------- private -------------------------------------------------------

  private _buildPanel(
    x: number,
    y: number,
    w: number,
    h: number,
    reservedId?: number,
    anchor: Anchor = Anchor.MiddleCenter,
  ): UIPanel {
    const containerEl = document.createElement('div')
    containerEl.className = 'ui-panel-container'
    containerEl.style.position = 'absolute'
    containerEl.style.inset = '0'
    this.root.appendChild(containerEl)

    const el = document.createElement('div')
    const id = reservedId ?? this.nextId++
    const panel = new UIPanel(id, el, containerEl, x, y, w, h, this.tileMetrics, anchor)

    this.nodes.set(panel.id, panel)
    return panel
  }
}

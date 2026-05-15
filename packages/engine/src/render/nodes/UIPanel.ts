import type { TileMetricsData } from '../tileMetrics'
import { UINode, type ILineLike } from './UINode'

// Border cell layout for a panel at (x, y) with size (w, h):
//
//   top row:    y,     x .. x+w-1   (hline)
//   bottom row: y+h-1, x .. x+w-1  (hline)
//   left col:   x,     y .. y+h-1  (vline)
//   right col:  x+w-1, y .. y+h-1  (vline)
//
// Corners are shared between an hline and a vline cell — the reconciler
// picks the topmost node owning that cell, same as for LineNode.

// Per-border element indices into UIPanel._borderEls
const TOP_EL = 0
const BOTTOM_EL = 1
const LEFT_EL = 2
const RIGHT_EL = 3
const BG_EL = 4

function waitAnimation(anim: Animation): Promise<void> {
  return new Promise((resolve) => {
    anim.onfinish = () => resolve()
  })
}

export class UIPanel extends UINode implements ILineLike {
  containerEl: HTMLDivElement

  // Raw div elements — one per border side + background.
  // Managed directly instead of going through LineNode so the panel
  // fully owns its DOM without creating extra entries in RendererUI.nodes.
  private _borderEls: [
    HTMLDivElement, // top
    HTMLDivElement, // bottom
    HTMLDivElement, // left
    HTMLDivElement, // right
    HTMLDivElement, // background
  ]

  // chars stores the border glyphs in reading order around the perimeter:
  //   [0 .. w-1]           → top row,    left→right
  //   [w .. w+h-1]         → right col,  top→bottom   (includes corners)
  //   [w+h .. 2w+h-1]      → bottom row, right→left
  //   [2w+h .. 2w+2h-1]    → left col,   bottom→top   (includes corners)
  //
  // This gives each border cell a unique index that charIndexFor() can map to.

  protected openingPromise: Promise<Animation[]> = Promise.resolve([])

  private static readonly PHASE1_RATIO = 0.6
  private static readonly PHASE2_RATIO = 0.4

  constructor(
    id: number,
    el: HTMLDivElement,
    containerEl: HTMLDivElement,
    x: number,
    y: number,
    w: number,
    h: number,
    tileMetrics: TileMetricsData,
  ) {
    super(id, 'panel', el, x, y, w, h, [], tileMetrics)
    this.containerEl = containerEl

    const make = (cls: string): HTMLDivElement => {
      const d = document.createElement('div')
      d.className = `ui ui-node ui-line ${cls}`
      d.style.position = 'absolute'
      d.style.whiteSpace = 'pre'
      d.style.willChange = 'transform, opacity'
      containerEl.appendChild(d)
      return d
    }

    this._borderEls = [
      make('ui-panel-top'),
      make('ui-panel-bottom'),
      make('ui-panel-left'),
      make('ui-panel-right'),
      make('ui-panel-bg'),
    ]

    this._initChars()
    this._applyBorderTransforms()
    this._applyBorderStyles()
    this._refreshAll()
  }

  // ==========================================================================
  // ILineLike
  // ==========================================================================

  /** All perimeter cells — registered into lineCells by RendererUI. */
  cellCoords(): Array<[number, number]> {
    const coords: Array<[number, number]> = []
    // top
    for (let i = 0; i < this.w; i++) coords.push([this.x + i, this.y])
    // bottom
    for (let i = 0; i < this.w; i++) coords.push([this.x + i, this.y + this.h - 1])
    // left (excluding corners)
    for (let i = 1; i < this.h - 1; i++) coords.push([this.x, this.y + i])
    // right (excluding corners)
    for (let i = 1; i < this.h - 1; i++) coords.push([this.x + this.w - 1, this.y + i])
    return coords
  }

  /** Interior cells — registered as panel-type into cellStack by RendererUI. */
  interiorCoords(): Array<[number, number]> {
    const coords: Array<[number, number]> = []
    for (let yy = this.y + 1; yy < this.y + this.h - 1; yy++) {
      for (let xx = this.x + 1; xx < this.x + this.w - 1; xx++) {
        coords.push([xx, yy])
      }
    }
    return coords
  }

  charIndexFor(x: number, y: number): number {
    const { x: px, y: py, w, h } = this
    const inner = h - 2 // number of inner rows (excl corners)
    // top row:    indices 0 .. w-1
    if (y === py && x >= px && x < px + w) return x - px
    // right col inner: indices w .. w+inner-1  (top→bottom, excl corners)
    if (x === px + w - 1 && y > py && y < py + h - 1) return w + (y - py - 1)
    // bottom row: indices w+inner .. 2w+inner-1  (stored right→left)
    if (y === py + h - 1 && x >= px && x < px + w) return w + inner + (px + w - 1 - x)
    // left col inner: indices 2w+inner .. 2w+2*inner-1  (stored bottom→top, excl corners)
    if (x === px && y > py && y < py + h - 1) return w + inner + w + (py + h - 2 - y)
    return -1
  }

  setCharAt(x: number, y: number, glyph: string): void {
    const idx = this.charIndexFor(x, y)
    if (idx === -1) return
    this.chars[idx] = glyph
    this._refreshBorderEls()
  }

  // ==========================================================================
  // UINode overrides
  // ==========================================================================

  applyTransform() {
    // The panel container sits at inset:0 in the layer, so individual elements
    // use absolute coords. Nothing to do on the container el itself.
  }

  refresh() {
    this._refreshAll()
  }

  // ==========================================================================
  // ANIMATIONS
  // ==========================================================================

  async open(duration = 500, content?: HTMLDivElement): Promise<void> {
    if (content) {
      const bg = this._borderEls[BG_EL]
      bg.innerHTML = ''
      bg.appendChild(content)
    }

    const midY = this.y + this.h / 2

    const topEl = this._borderEls[TOP_EL]
    const botEl = this._borderEls[BOTTOM_EL]
    const lefEl = this._borderEls[LEFT_EL]
    const rigEl = this._borderEls[RIGHT_EL]
    const bgEl = this._borderEls[BG_EL]

    const savedFirst = this.chars[0]
    const savedLast = this.chars[this.w - 1]

    // phase 1

    this.chars[0] = '╠'
    this.chars[this.w - 1] = '╣'
    this._refreshBorderEl(TOP_EL)

    for (const el of [lefEl, rigEl, bgEl]) {
      el.style.transformOrigin = '50% 50%'
      el.style.clipPath = 'inset(50% 0 50% 0)'
    }

    topEl.style.clipPath = 'inset(0 50% 0 50%)'
    botEl.style.display = 'none'

    this._setElTranslate(topEl, this.x, midY)

    const topAnim = this._animateHorizontalExpand(
      topEl,
      this.x,
      midY,
      duration * UIPanel.PHASE2_RATIO,
    )

    await waitAnimation(topAnim)

    // phase 2

    this.chars[0] = savedFirst
    this.chars[this.w - 1] = savedLast
    this._refreshBorderEl(TOP_EL)

    this._animateVerticalSlide(topEl, this.x, midY, this.y, duration * UIPanel.PHASE1_RATIO)

    botEl.style.display = 'block'

    this._animateVerticalSlide(
      botEl,
      this.x,
      midY,
      this.y + this.h - 1,
      duration * UIPanel.PHASE1_RATIO,
    )

    const phase2Anims = [lefEl, rigEl, bgEl].map((el) =>
      this._animateVerticalClipReveal(el, duration * UIPanel.PHASE1_RATIO),
    )

    this.openingPromise = Promise.all(phase2Anims.map((a) => a.finished))
  }

  async close(duration = 500): Promise<void> {
    await this.openingPromise
    const midY = this.y + this.h / 2

    const topEl = this._borderEls[TOP_EL]
    const botEl = this._borderEls[BOTTOM_EL]
    const lefEl = this._borderEls[LEFT_EL]
    const rigEl = this._borderEls[RIGHT_EL]
    const bgEl = this._borderEls[BG_EL]

    const phase1Duration = duration * UIPanel.PHASE1_RATIO

    for (const el of [lefEl, rigEl, bgEl]) {
      this._animateVerticalClipCollapse(el, phase1Duration)
    }

    this._animateVerticalSlide(topEl, this.x, this.y, midY, phase1Duration, 'ease-in')

    const botAnim = this._animateVerticalSlide(
      botEl,
      this.x,
      this.y + this.h - 1,
      midY,
      phase1Duration,
      'ease-in',
    )

    await waitAnimation(botAnim)

    botEl.style.display = 'none'
    this.chars[0] = '═'
    this.chars[this.w - 1] = '═'
    this._refreshBorderEl(TOP_EL)

    const phase2Anim = this._animateHorizontalCollapse(
      topEl,
      this.x,
      midY,
      duration * UIPanel.PHASE2_RATIO,
    )

    await waitAnimation(phase2Anim)

    this.containerEl.remove()
  }

  // ==========================================================================
  // PRIVATE — init
  // ==========================================================================

  private _initChars() {
    const { w, h } = this
    // perimeter length: top(w) + right(h-1, excl top-right corner) + bottom(w) + left(h-1, excl both corners)
    // but we store corners only once (in top and bottom rows), left/right exclude both corners
    // total = w + (h-2) + w + (h-2) = 2w + 2h - 4  ... plus the 4 corners already in top/bottom
    // simplest: top(w) + right_inner(h-2) + bottom(w) + left_inner(h-2) = 2w + 2(h-2)
    const len = 2 * w + 2 * (h - 2)
    this.chars = new Array<string>(len).fill(' ')

    // top row
    for (let i = 0; i < w; i++) this.chars[i] = '═'
    // bottom row (stored right→left)
    const botStart = w + (h - 2)
    for (let i = 0; i < w; i++) this.chars[botStart + i] = '═'
    // right col inner
    for (let i = 0; i < h - 2; i++) this.chars[w + i] = '║'
    // left col inner (stored bottom→top)
    const lefStart = 2 * w + (h - 2)
    for (let i = 0; i < h - 2; i++) this.chars[lefStart + i] = '║'

    // Corners
    this.chars[0] = '╔' // top-left
    this.chars[w - 1] = '╗' // top-right
    this.chars[botStart] = '╝' // bottom-right (stored right→left, so index 0 = right)
    this.chars[botStart + w - 1] = '╚' // bottom-left
  }

  // ==========================================================================
  // PRIVATE — layout helpers
  // ==========================================================================

  private _applyBorderTransforms() {
    const { x, y, w, h } = this
    this._setElTranslate(this._borderEls[TOP_EL], x, y)
    this._setElTranslate(this._borderEls[BOTTOM_EL], x, y + h - 1)
    this._setElTranslate(this._borderEls[LEFT_EL], x, y + 1)
    this._setElTranslate(this._borderEls[RIGHT_EL], x + w - 1, y + 1)

    const bg = this._borderEls[BG_EL]
    bg.style.transform = `translate(${(x + 1) * this.tileMetrics.w}px, ${(y + 1) * this.tileMetrics.h}px)`
    bg.style.width = `${(w - 2) * this.tileMetrics.w}px`
    bg.style.height = `${(h - 2) * this.tileMetrics.h}px`
    bg.className = 'ui ui-panel'
  }

  private _applyBorderStyles() {
    this._borderEls[LEFT_EL].style.lineHeight = `${this.tileMetrics.h}px`
    this._borderEls[RIGHT_EL].style.lineHeight = `${this.tileMetrics.h}px`
  }

  private _setElTranslate(el: HTMLElement, x: number, y: number) {
    el.style.transform = `translate(${x * this.tileMetrics.w}px, ${y * this.tileMetrics.h}px)`
  }

  // ==========================================================================
  // PRIVATE — char mapping to border elements
  // ==========================================================================

  // chars layout:
  //   [0 .. w-1]               top,   left→right
  //   [w .. w+(h-2)-1]         right, top→bottom  (inner only)
  //   [w+(h-2) .. 2w+(h-2)-1]  bottom,right→left
  //   [2w+(h-2) .. 2w+2(h-2)-1] left, bottom→top  (inner only)

  private _refreshAll() {
    this._refreshBorderEls()
    // bg has no text content — it's a background block
  }

  private _refreshBorderEls() {
    for (let i = 0; i <= RIGHT_EL; i++) this._refreshBorderEl(i)
  }

  private _refreshBorderEl(elIdx: number) {
    const { w, h } = this
    const el = this._borderEls[elIdx]

    switch (elIdx) {
      case TOP_EL:
        el.textContent = this.chars.slice(0, w).join('')
        break
      case BOTTOM_EL: {
        const start = w + (h - 2)
        // stored right→left, display left→right
        const row = this.chars.slice(start, start + w).reverse()
        el.textContent = row.join('')
        break
      }
      case RIGHT_EL: {
        const inner = this.chars.slice(w, w + (h - 2))
        el.textContent = inner.join('\n')
        break
      }
      case LEFT_EL: {
        const start = 2 * w + (h - 2)
        const inner = this.chars.slice(start, start + (h - 2))
        // stored bottom→top, display top→bottom
        el.textContent = inner.reverse().join('\n')
        break
      }
    }
  }

  // ==========================================================================
  // PRIVATE — animation primitives
  // ==========================================================================

  private _animateHorizontalExpand(
    el: HTMLElement,
    x: number,
    midY: number,
    duration: number,
  ): Animation {
    return el.animate(
      [
        {
          transform: `translate(${x * this.tileMetrics.w}px, ${midY * this.tileMetrics.h}px)`,
          clipPath: 'inset(0 50% 0 50%)',
        },
        {
          transform: `translate(${x * this.tileMetrics.w}px, ${midY * this.tileMetrics.h}px)`,
          clipPath: 'inset(0 0 0 0)',
        },
      ],
      { duration, easing: 'ease-out', fill: 'forwards' },
    )
  }

  private _animateHorizontalCollapse(
    el: HTMLElement,
    x: number,
    midY: number,
    duration: number,
  ): Animation {
    return el.animate(
      [
        {
          transform: `translate(${x * this.tileMetrics.w}px, ${midY * this.tileMetrics.h}px)`,
          clipPath: 'inset(0 0 0 0)',
        },
        {
          transform: `translate(${x * this.tileMetrics.w}px, ${midY * this.tileMetrics.h}px)`,
          clipPath: 'inset(0 50% 0 50%)',
        },
      ],
      { duration, easing: 'ease-in', fill: 'forwards' },
    )
  }

  private _animateVerticalSlide(
    el: HTMLElement,
    x: number,
    fromY: number,
    toY: number,
    duration: number,
    easing = 'ease-out',
  ): Animation {
    return el.animate(
      [
        { transform: `translate(${x * this.tileMetrics.w}px, ${fromY * this.tileMetrics.h}px)` },
        { transform: `translate(${x * this.tileMetrics.w}px, ${toY * this.tileMetrics.h}px)` },
      ],
      { duration, easing, fill: 'forwards' },
    )
  }

  private _animateVerticalClipReveal(el: HTMLElement, duration: number): Animation {
    const cur = el.style.transform
    return el.animate(
      [
        { transform: cur, clipPath: 'inset(50% 0 50% 0)' },
        { transform: cur, clipPath: 'inset(0 0 0 0)' },
      ],
      { duration, easing: 'ease-out', fill: 'forwards' },
    )
  }

  private _animateVerticalClipCollapse(el: HTMLElement, duration: number): Animation {
    const cur = el.style.transform
    return el.animate(
      [
        { transform: cur, clipPath: 'inset(0 0 0 0)' },
        { transform: cur, clipPath: 'inset(50% 0 50% 0)' },
      ],
      { duration, easing: 'ease-in', fill: 'forwards' },
    )
  }
}

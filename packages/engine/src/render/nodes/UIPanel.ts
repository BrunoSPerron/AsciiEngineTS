import type { TileMetricsData } from '../tileMetrics'
import { UINode, type ILineLike } from './UINode'
import { Anchor, applyAnchorToEl } from '../anchor'

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

  private _borderEls: [
    HTMLDivElement,
    HTMLDivElement,
    HTMLDivElement,
    HTMLDivElement,
    HTMLDivElement,
  ]

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
    anchor: Anchor = Anchor.MiddleCenter,
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

    applyAnchorToEl(this.containerEl, anchor)
  }

  // ==========================================================================
  // ILineLike
  // ==========================================================================

  cellCoords(): Array<[number, number]> {
    const coords: Array<[number, number]> = []
    for (let i = 0; i < this.w; i++) coords.push([this.x + i, this.y])
    for (let i = 0; i < this.w; i++) coords.push([this.x + i, this.y + this.h - 1])
    for (let i = 1; i < this.h - 1; i++) coords.push([this.x, this.y + i])
    for (let i = 1; i < this.h - 1; i++) coords.push([this.x + this.w - 1, this.y + i])
    return coords
  }

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
    const inner = h - 2
    if (y === py && x >= px && x < px + w) return x - px
    if (x === px + w - 1 && y > py && y < py + h - 1) return w + (y - py - 1)
    if (y === py + h - 1 && x >= px && x < px + w) return w + inner + (px + w - 1 - x)
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

  // Position the container; all border elements are relative to it.
  applyTransform() {
    this.containerEl.style.transform = `translate(${this.x * this.tileMetrics.w}px, ${this.y * this.tileMetrics.h}px)`
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

    // All y coords are now relative to the container (panel-local), not the viewport.
    const midY = this.h / 2

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

    this._setElTranslate(topEl, 0, midY)

    const topAnim = this._animateHorizontalExpand(topEl, 0, midY, duration * UIPanel.PHASE2_RATIO)

    await waitAnimation(topAnim)

    // phase 2
    this.chars[0] = savedFirst
    this.chars[this.w - 1] = savedLast
    this._refreshBorderEl(TOP_EL)

    this._animateVerticalSlide(topEl, 0, midY, 0, duration * UIPanel.PHASE1_RATIO)

    botEl.style.display = 'block'

    this._animateVerticalSlide(botEl, 0, midY, this.h - 1, duration * UIPanel.PHASE1_RATIO)

    const phase2Anims = [lefEl, rigEl, bgEl].map((el) =>
      this._animateVerticalClipReveal(el, duration * UIPanel.PHASE1_RATIO),
    )

    this.openingPromise = Promise.all(phase2Anims.map((a) => a.finished))
  }

  async close(duration = 500): Promise<void> {
    await this.openingPromise

    const midY = this.h / 2

    const topEl = this._borderEls[TOP_EL]
    const botEl = this._borderEls[BOTTOM_EL]
    const lefEl = this._borderEls[LEFT_EL]
    const rigEl = this._borderEls[RIGHT_EL]
    const bgEl = this._borderEls[BG_EL]

    const phase1Duration = duration * UIPanel.PHASE1_RATIO

    for (const el of [lefEl, rigEl, bgEl]) {
      this._animateVerticalClipCollapse(el, phase1Duration)
    }

    this._animateVerticalSlide(topEl, 0, 0, midY, phase1Duration, 'ease-in')

    const botAnim = this._animateVerticalSlide(
      botEl,
      0,
      this.h - 1,
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
      0,
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
    const len = 2 * w + 2 * (h - 2)
    this.chars = new Array<string>(len).fill(' ')

    for (let i = 0; i < w; i++) this.chars[i] = '═'
    const botStart = w + (h - 2)
    for (let i = 0; i < w; i++) this.chars[botStart + i] = '═'
    for (let i = 0; i < h - 2; i++) this.chars[w + i] = '║'
    const lefStart = 2 * w + (h - 2)
    for (let i = 0; i < h - 2; i++) this.chars[lefStart + i] = '║'

    this.chars[0] = '╔'
    this.chars[w - 1] = '╗'
    this.chars[botStart] = '╝'
    this.chars[botStart + w - 1] = '╚'
  }

  // ==========================================================================
  // PRIVATE — layout helpers
  // ==========================================================================

  private _applyBorderTransforms() {
    const { w, h } = this
    // All positions are relative to the container's origin (the panel's top-left corner).
    this._setElTranslate(this._borderEls[TOP_EL], 0, 0)
    this._setElTranslate(this._borderEls[BOTTOM_EL], 0, h - 1)
    this._setElTranslate(this._borderEls[LEFT_EL], 0, 1)
    this._setElTranslate(this._borderEls[RIGHT_EL], w - 1, 1)

    const bg = this._borderEls[BG_EL]
    bg.style.transform = `translate(${1 * this.tileMetrics.w}px, ${1 * this.tileMetrics.h}px)`
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

  private _refreshAll() {
    this._refreshBorderEls()
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

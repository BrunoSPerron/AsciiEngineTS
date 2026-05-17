import type { TileMetricsData } from '../../tileMetrics'
import { UINode } from './UINode'
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

export class UIPanel extends UINode {
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

    this._applyBorderTransforms()
    this._renderBorderGlyphs()

    applyAnchorToEl(this.containerEl, anchor)
  }

  // ==========================================================================
  // UINode overrides
  // ==========================================================================

  applyTransform() {
    this.containerEl.style.transform = `translate(${this.x * this.tileMetrics.w}px, ${this.y * this.tileMetrics.h}px)`
  }

  refresh() {
    this._renderBorderGlyphs()
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

    const midY = this.h / 2

    const topEl = this._borderEls[TOP_EL]
    const botEl = this._borderEls[BOTTOM_EL]
    const lefEl = this._borderEls[LEFT_EL]
    const rigEl = this._borderEls[RIGHT_EL]
    const bgEl = this._borderEls[BG_EL]

    // phase 1 — horizontal expand of centre line
    const savedTopRow = topEl.textContent ?? ''
    topEl.textContent = '╠' + '═'.repeat(this.w - 2) + '╣'

    for (const el of [lefEl, rigEl, bgEl]) {
      el.style.transformOrigin = '50% 50%'
      el.style.clipPath = 'inset(50% 0 50% 0)'
    }

    topEl.style.clipPath = 'inset(0 50% 0 50%)'
    botEl.style.display = 'none'

    this._setElTranslate(topEl, 0, midY)

    const topAnim = this._animateHorizontalExpand(topEl, 0, midY, duration * UIPanel.PHASE2_RATIO)

    await waitAnimation(topAnim)

    // phase 2 — vertical reveal
    topEl.textContent = savedTopRow
    this._setElTranslate(topEl, 0, 0)
    topEl.style.clipPath = ''

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
    topEl.textContent = '═'.repeat(this.w)

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
  // PRIVATE — layout
  // ==========================================================================

  private _applyBorderTransforms() {
    const { w, h } = this
    this._setElTranslate(this._borderEls[TOP_EL], 0, 0)
    this._setElTranslate(this._borderEls[BOTTOM_EL], 0, h - 1)
    this._setElTranslate(this._borderEls[LEFT_EL], 0, 1)
    this._setElTranslate(this._borderEls[RIGHT_EL], w - 1, 1)

    const bg = this._borderEls[BG_EL]
    bg.style.transform = `translate(${1 * this.tileMetrics.w}px, ${1 * this.tileMetrics.h}px)`
    bg.style.width = `${(w - 2) * this.tileMetrics.w}px`
    bg.style.height = `${(h - 2) * this.tileMetrics.h}px`
    bg.className = 'ui ui-panel'

    this._borderEls[LEFT_EL].style.lineHeight = `${this.tileMetrics.h}px`
    this._borderEls[RIGHT_EL].style.lineHeight = `${this.tileMetrics.h}px`
  }

  private _renderBorderGlyphs() {
    const { w, h } = this
    const inner = h - 2

    this._borderEls[TOP_EL].textContent = '╔' + '═'.repeat(w - 2) + '╗'
    this._borderEls[BOTTOM_EL].textContent = '╚' + '═'.repeat(w - 2) + '╝'
    this._borderEls[LEFT_EL].textContent = Array(inner).fill('║').join('\n')
    this._borderEls[RIGHT_EL].textContent = Array(inner).fill('║').join('\n')
  }

  private _setElTranslate(el: HTMLElement, x: number, y: number) {
    el.style.transform = `translate(${x * this.tileMetrics.w}px, ${y * this.tileMetrics.h}px)`
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

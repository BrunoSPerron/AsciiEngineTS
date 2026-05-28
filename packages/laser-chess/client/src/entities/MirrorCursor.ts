import { Entity, GridVector, lerp, MASK, maskToGlyph } from 'ascii-game-engine'

export class MirrorCursor extends Entity {
  private _last: number = 0
  private _targetPos: GridVector = new GridVector(0, 0)

  private _el!: HTMLDivElement

  constructor() {
    super('/', new GridVector(15, 15))
    this._targetPos.set(this.pos)
  }

  loaded() {
    if (!this.el) return
    const tm = this.engine.renderer.tileMetrics
    this._el = this.el
    this._addGuides()

    // Hook into camera raf loop
    this.engine.renderer.camera.onFrame((now) => {
      const delta = now - this._last
      this._last = now
      const alpha = 1 - Math.pow(0.5, delta / 40)
      this.pos.x = lerp(this.pos.x, this._targetPos.x, alpha)
      this.pos.y = lerp(this.pos.y, this._targetPos.y, alpha)
      this._el.style.transform = `translate(${this.pos.x * tm.w}px, ${this.pos.y * tm.h}px)`
    })
  }

  private _addGuides() {
    const vertical = maskToGlyph(MASK.TOP | MASK.BOTTOM)
    const horizontal = maskToGlyph(MASK.LEFT | MASK.RIGHT)

    const topEl = document.createElement('pre')
    topEl.textContent = `${vertical}\n`.repeat(40)
    topEl.style.position = 'absolute'
    topEl.style.margin = '0'
    topEl.style.top = `${-40 * this.engine.renderer.tileMetrics.h}px`

    const bottomEl = document.createElement('pre')
    bottomEl.textContent = `${vertical}\n`.repeat(40)
    bottomEl.style.position = 'absolute'
    bottomEl.style.margin = '0'
    bottomEl.style.top = `${1 * this.engine.renderer.tileMetrics.h}px`

    const leftEl = document.createElement('pre')
    leftEl.textContent = horizontal.repeat(40)
    leftEl.style.position = 'absolute'
    leftEl.style.margin = '0'
    leftEl.style.left = `${-40 * this.engine.renderer.tileMetrics.w}px`
    leftEl.style.top = '0'

    const rightEl = document.createElement('pre')
    rightEl.textContent = horizontal.repeat(40)
    rightEl.style.position = 'absolute'
    rightEl.style.margin = '0'
    rightEl.style.left = `${1 * this.engine.renderer.tileMetrics.w}px`
    rightEl.style.top = '0'

    this._el.append(topEl, bottomEl, leftEl, rightEl)
  }

  setTarget(x: number, y: number) {
    this._targetPos.setXY(x, y)
  }
}

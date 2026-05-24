import { UIContainerBase, type InnerLineData } from './UIContainerBase'

/**
 * A container that stacks UILayoutElements children top-to-bottom.
 */
export class UIContainerVertical extends UIContainerBase {
  constructor() {
    super()
    this.el.style.overflow = 'hidden'
  }

  protected _layoutChildren(): void {
    const tm = this.tileMetrics
    if (!tm) return

    let cursorY = 0

    for (let i = 0; i < this._children.length; i++) {
      const { element, config } = this._children[i]
      const childH = config.h

      element.el.style.top = `${cursorY * tm.h}px`
      element.el.style.width = `${this.w * tm.w}px`
      element.el.style.height = `${childH * tm.h}px`
      element.layout(0, cursorY, this.w, childH)

      cursorY += childH
      if (i < this._children.length - 1) {
        cursorY += 1
      }
    }
  }

  getInnerLineData(): InnerLineData[] {
    const lines: InnerLineData[] = []
    let cursorY = 0

    for (let i = 0; i < this._children.length - 1; i++) {
      const { config } = this._children[i]
      const childH = (config as { h: number }).h
      cursorY += childH

      lines.push({
        x: 0,
        y: cursorY,
        length: this.w,
        vertical: false,
      })

      cursorY += 1
    }

    return lines
  }
}

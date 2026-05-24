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
      const child = this._children[i]
      const childH = child.maxH
      child.layout(0, cursorY, this.w, childH)

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
      const child = this._children[i]
      cursorY += child.h

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

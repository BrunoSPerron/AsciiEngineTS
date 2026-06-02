import { UILayoutElement } from './UILayoutElement'

export type MODE = 'simple' | 'centered'

export class UITextBox extends UILayoutElement {
  private _content: string[]
  mode: MODE

  private _contentContainer: HTMLDivElement | null = null

  constructor(content: string[], mode: MODE = 'simple') {
    super()
    this._content = content
    this.mode = mode
  }

  get content(): string[] {
    return this._content
  }

  set content(value: string | string[]) {
    this._content = typeof value === 'string' ? [value] : value
    this._updateContent()
  }

  loaded(): void {
    this._contentContainer = document.createElement('div')
    this._contentContainer.style.position = 'absolute'
    this.el.append(this._contentContainer)
    this._updateContent()
  }

  private _updateContent() {
    const longestStringLen = Math.max(...this.content.map((str) => str.length))

    const height = this.content.length * this.tileMetrics.h
    const width = longestStringLen * this.tileMetrics.w

    this._contentContainer!.innerHTML = this._content.join('<br>')
    this._contentContainer!.style.height = `${height}px`
    this._contentContainer!.style.width = `${width}px`
  }

  resized(): void {
    if (this._contentContainer === null) return

    const longestStringLen = Math.max(...this.content.map((str) => str.length))

    if (this.mode === 'centered') {
      const top = ((this.h - this.content.length) / 2) * this.tileMetrics.h
      const left = ((this.w - longestStringLen) / 2) * this.tileMetrics.w
      this._contentContainer.style.top = `${top}px`
      this._contentContainer.style.left = `${left}px`
    } else {
      this._contentContainer.style.top = '0'
      this._contentContainer.style.left = '0'
    }
  }
}

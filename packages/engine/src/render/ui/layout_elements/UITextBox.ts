import { Logger } from '../../../core/Logger'
import { UILayoutElement } from './UILayoutElement'

const MODES = ['simple', 'centered']

export class UITextBox extends UILayoutElement {
  private _content: string[]
  private _mode: string

  private _contentContainer: HTMLDivElement | null = null

  constructor(content: string[], mode: string = 'simple') {
    super()
    this._content = content
    this._mode = MODES.includes(mode) ? mode : MODES[0]
  }

  get content(): string[] {
    return this._content
  }

  set content(value: string | string[]) {
    this._content = typeof value === 'string' ? [value] : value
    this._updateContent()
  }

  get mode(): string {
    return this._mode
  }

  set mode(value: string) {
    if (!MODES.includes(value)) {
      Logger.warn(
        `[UITextBox] Tried to assign an invalid mode: "${value}".` +
          ` Valid values: [${MODES.join(', ')}]. Defaulted to "${MODES[0]}"`,
      )
      return
    }
    this._mode = value
  }

  loaded(): void {
    this._contentContainer = document.createElement('div')
    this._contentContainer.style.position = 'absolute'
    this.el.append(this._contentContainer)
    this._updateContent()
  }

  private _updateContent() {
    console.log(`w: ${this.tileMetrics.w}, h: ${this.tileMetrics.h}`)
    let longestStringLen = Math.max(...this.content.map((str) => str.length))

    const height = this.content.length * this.tileMetrics!.h
    const width = (longestStringLen * this.tileMetrics!.w) / 2

    this._contentContainer!.innerHTML = this._content.join('<br>')
    this._contentContainer!.style.height = `${height}px`
    this._contentContainer!.style.width = `${width}px`
  }

  resized(): void {
    const longestStringLen = Math.max(...this.content.map((str) => str.length))

    const top = (this.h - this.content.length) * this.tileMetrics!.h
    const left = (this.w - longestStringLen) * this.tileMetrics!.w

    if (this._contentContainer == null) return
    this._contentContainer!.style.top = `${top}px`
    this._contentContainer!.style.left = `${left}px`
  }
}

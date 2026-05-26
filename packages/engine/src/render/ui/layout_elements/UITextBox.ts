import { Logger } from '../../../core/Logger'
import { UILayoutElement } from './UILayoutElement'

const MODES = ['simple', 'centered']

export class UITextBox extends UILayoutElement {
  private _content: string[]
  private _mode: string

  container: HTMLDivElement | null = null

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
    this.container = document.createElement('div')
  }

  resized(): void {
    const longestStringLen = Math.max(...this.content.map((str) => str.length))

    const height = ((this.h - this.content.length) * this.tileMetrics!.h) / 2
    const width = ((this.w - longestStringLen) * this.tileMetrics!.h) / 2

    if (this.container == null) return
    this.container!.style.top = `${height} px`
    this.container!.style.left = `${(width - this.content.length) / 2}px`
  }
}

import { UINode } from './UINode'

export type MODE = 'simple' | 'centered' | 'bottom'

export class UITextBox extends UINode {
  private _content: string[]
  mode: MODE

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
    this._render()
  }

  loaded(): void {
    this._render()
  }

  resized(): void {
    this._render()
  }

  private _render(): void {
    this.el.innerHTML = this._content.join('<br>')
    this.el.style.display = 'flex'
    this.el.style.flexDirection = 'column'

    switch (this.mode) {
      case 'centered':
        this.el.style.justifyContent = 'center'
        this.el.style.alignItems = 'center'
        this.el.style.textAlign = 'center'
        this.el.style.overflow = ''
        break
      case 'bottom':
        this.el.style.justifyContent = 'flex-end'
        this.el.style.alignItems = 'flex-start'
        this.el.style.textAlign = ''
        this.el.style.overflow = 'hidden'
        break
      default:
        this.el.style.justifyContent = 'flex-start'
        this.el.style.alignItems = 'flex-start'
        this.el.style.textAlign = ''
        this.el.style.overflow = ''
    }
  }
}

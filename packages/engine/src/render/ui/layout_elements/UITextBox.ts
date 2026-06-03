import { UINode } from './UINode'

export type MODE = 'simple' | 'centered'

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
    this.el.style.justifyContent = this.mode === 'centered' ? 'center' : 'flex-start'
    this.el.style.alignItems = this.mode === 'centered' ? 'center' : 'flex-start'
    this.el.style.textAlign = this.mode === 'centered' ? 'center' : ''
  }
}

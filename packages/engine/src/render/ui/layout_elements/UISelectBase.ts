import { UILayoutElement } from './UILayoutElement'

type ChangeHandler = (index: number) => void
type SelectHandler = (index: number) => void

export abstract class UISelectBase extends UILayoutElement {
  abstract currentIndex: number
  closeOnSelect: boolean = true
  suppressOnClose: Set<string> = new Set(['confirm', 'cancel', 'pause'])

  private _changeListeners = new Set<ChangeHandler>()
  private _selectListeners = new Set<SelectHandler>()

  onChange(fn: ChangeHandler): () => void {
    this._changeListeners.add(fn)
    return () => this._changeListeners.delete(fn)
  }

  onSelect(fn: SelectHandler): () => void {
    this._selectListeners.add(fn)
    return () => this._selectListeners.delete(fn)
  }

  protected _emitChange(): void {
    for (const fn of this._changeListeners) fn(this.currentIndex)
  }

  protected _emitSelect(index: number): void {
    for (const fn of this._selectListeners) fn(index)
  }
}

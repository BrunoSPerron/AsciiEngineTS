import { UINode } from './UINode'

export type UIInputOptions = {
  closeOnSubmit?: boolean
}

/**
 * Abstract base for input elements that capture a single value from the user.
 *
 * Manages:
 *  - A result Promise that resolves once on submit or cancel.
 *  - A native-input focus/blur context: pushes an engine input context while
 *    the field is focused so the custom action system is silenced, pops it on blur.
 *
 * Subclasses implement:
 *  - `_buildContent()` — render DOM inside `this.el`
 *  - `_rebuildContent()` — re-render on resize
 *  - `_focusInput()` — programmatically focus the native input
 */
export abstract class UIInputBase extends UINode {
  closeOnSubmit: boolean

  private _contextName = ''
  private _contextActive = false

  constructor(options: UIInputOptions = {}) {
    super()
    this.closeOnSubmit = options.closeOnSubmit ?? true
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  loaded(): void {
    this._buildContent()
    queueMicrotask(() => this._focusInput())
  }

  resized(): void {
    this._rebuildContent()
  }

  unloaded(): void {
    this._popContext()
  }

  // ---------------------------------------------------------------------------
  // Context management — called by the concrete input's focus/blur handlers
  // ---------------------------------------------------------------------------

  protected _onNativeFocus(): void {
    if (this._contextActive) return
    this._contextName = `input_element_${this.id}`
    this.engine.contextManager.pushContext(this._contextName)
    this._contextActive = true
  }

  protected _onNativeBlur(): void {
    this._popContext()
  }

  private _popContext(): void {
    if (!this._contextActive) return
    this._contextActive = false
    this.engine.contextManager.popContext(this._contextName)
  }

  // ---------------------------------------------------------------------------
  // Submit / cancel — called by concrete subclass
  // ---------------------------------------------------------------------------

  protected _submit(value: number | string): void {
    if (this.closeOnSubmit) {
      this.engine.renderer.ui.removeElement(this.id)
    }
    if (value !== null) {
      this.emit('select', value)
    }
  }

  // ---------------------------------------------------------------------------
  // Abstract interface for subclasses
  // ---------------------------------------------------------------------------

  protected abstract _buildContent(): void
  protected abstract _rebuildContent(): void
  protected abstract _focusInput(): void
}

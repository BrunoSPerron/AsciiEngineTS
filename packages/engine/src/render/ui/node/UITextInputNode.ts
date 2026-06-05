import { UIInputBase, type UIInputOptions } from './UIInputBase'

export type UITextInputOptions = UIInputOptions & {
  message?: string[]
}

/**
 * A single-line text input element.
 *
 * Layout (top to bottom inside the interior):
 *   [message line 0]   ← only shown when rows remain after reserving input row
 *   [message line 1]
 *   ...
 *   [label: ____input____]  ← always the last row
 *
 * The label is shown inline only when w >= label.length + 5.
 * The message block is shown only when h > 1 and there are rows to spare.
 *
 * Resolves result with the entered string, or null on cancel (Escape).
 */
export class UITextInputNode extends UIInputBase<string> {
  private _label: string
  private _message: string[]

  private _inputEl: HTMLInputElement | null = null
  private _messageEls: HTMLDivElement[] = []

  constructor(label: string, options: UITextInputOptions = {}) {
    super(options)
    this._label = label
    this._message = options.message ?? []
  }

  // ---------------------------------------------------------------------------
  // Build
  // ---------------------------------------------------------------------------

  protected _buildContent(): void {
    this.el.innerHTML = ''
    this._inputEl = null
    this._messageEls = []

    const tm = this.tileMetrics
    const h = this.h
    const w = this.w

    // How many rows the message can occupy (reserve 1 for the input row)
    const messageRowCount = Math.max(0, h - 1)
    const visibleMessageLines = messageRowCount > 0 ? this._message.slice(0, messageRowCount) : []

    // Message lines
    for (let i = 0; i < visibleMessageLines.length; i++) {
      const lineEl = document.createElement('div')
      lineEl.className = 'ui-input-message'
      lineEl.style.width = `${w * tm.w}px`
      lineEl.style.top = `${i * tm.h}px`
      lineEl.style.height = `${tm.h}px`
      lineEl.style.lineHeight = `${tm.h}px`
      lineEl.textContent = visibleMessageLines[i]
      this.el.appendChild(lineEl)
      this._messageEls.push(lineEl)
    }

    // Input row — always the last tile row
    const rowEl = document.createElement('div')
    rowEl.className = 'ui-input-row'
    rowEl.style.top = `${(h - 1) * tm.h}px`
    rowEl.style.width = `${w * tm.w}px`
    rowEl.style.height = `${tm.h}px`
    this.el.appendChild(rowEl)

    // Label (only when wide enough)
    const showLabel = w >= this._label.length + 5
    if (showLabel && this._label.length > 0) {
      const labelEl = document.createElement('span')
      labelEl.className = 'ui-input-label'
      labelEl.style.lineHeight = `${tm.h}px`
      labelEl.textContent = `${this._label}: `
      rowEl.appendChild(labelEl)
    }

    // Field wrapper (retro darker background)
    const fieldWrap = document.createElement('div')
    fieldWrap.className = 'ui-input-field'
    fieldWrap.style.height = `${tm.h}px`
    rowEl.appendChild(fieldWrap)

    // Native input
    const inputEl = document.createElement('input')
    inputEl.className = 'ui-input-native'
    inputEl.type = 'text'
    inputEl.spellcheck = false
    inputEl.autocomplete = 'off'
    inputEl.style.height = `${tm.h}px`
    inputEl.style.lineHeight = `${tm.h}px`

    inputEl.addEventListener('focus', () => this._onNativeFocus())
    inputEl.addEventListener('blur', () => this._onNativeBlur())
    inputEl.addEventListener('keydown', (e) => this._onKeyDown(e))

    fieldWrap.appendChild(inputEl)
    this._inputEl = inputEl
  }

  protected _rebuildContent(): void {
    this._buildContent()
    // Re-focus after rebuild so the user doesn't lose the field on resize
    queueMicrotask(() => this._focusInput())
  }

  protected _focusInput(): void {
    this._inputEl?.focus()
  }

  // ---------------------------------------------------------------------------
  // Key handling — runs on the native input, outside the engine action system
  // ---------------------------------------------------------------------------

  private _onKeyDown(e: KeyboardEvent): void {
    if (e.code === 'Enter' || e.code === 'NumpadEnter') {
      e.preventDefault()
      this._submit(this._inputEl?.value ?? '')
    } else if (e.code === 'Escape') {
      e.preventDefault()
      this._submit(null)
    }
    // All other keys are handled natively by the browser — no engine involvement
    e.stopPropagation()
  }
}

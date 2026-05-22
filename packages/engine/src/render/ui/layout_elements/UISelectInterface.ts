/**
 * The select-specific public surface shared by UISelectElement and any
 * custom implementation that can be passed wherever a select element is
 * expected (e.g. addPaletteElement, openEscapeMenu).
 *
 * Lifecycle management (loaded, resized, unloaded, el, id, …) is inherited
 * from UILayoutElement and is intentionally excluded here — consumers that
 * need those should depend on UILayoutElement directly.
 */
export interface IUSelectInterface {
  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------

  /** Currently selected item. (Highlighted) */
  currentIndex: number

  /**
   * When true the element removes itself from the layout after a confirmed
   * selection or cancellation. Defaults to true in UISelectElement.
   */
  closeOnSelect: boolean

  /**
   * Action names that are suppressed in the incoming context when the element
   * closes. UISelectElement defaults to `new Set(['confirm', 'cancel', 'pause'])`.
   */
  suppressOnClose: Set<string>

  // ---------------------------------------------------------------------------
  // Listeners
  // ---------------------------------------------------------------------------

  /**
   * Fires whenever the highlighted index changes (keyboard nav, hover, etc.).
   * Returns an unsubscribe function.
   */
  onChange(fn: (index: number) => void): () => void

  /**
   * Fires once when the user confirms or cancels.
   * `index` is the confirmed 0-based item index, or `-1` on cancellation.
   * Returns an unsubscribe function.
   */
  onSelect(fn: (index: number) => void): () => void
}

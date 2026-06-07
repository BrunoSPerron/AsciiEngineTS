import Flamingo from './css/themes/Flamingo.css?inline'
import Midnight from './css/themes/Midnight.css?inline'
import BabyBlue from './css/themes/Baby Blue.css?inline'
import CreamyPink from './css/themes/Creamy Pink.css?inline'
import SaphirePeach from './css/themes/Saphire Peach.css?inline'
import GreyAndBeige from './css/themes/Grey and Beige.css?inline'
import Flower from './css/themes/Flower.css?inline'
import BurgundyPink from './css/themes/Burgundy Pink.css?inline'
import Chiffon from './css/themes/Chiffon.css?inline'
import Raspberry from './css/themes/Raspberry.css?inline'
import Copper from './css/themes/Copper.css?inline'
import RetroGold from './css/themes/Retro Gold.css?inline'
import OldParchment from './css/themes/Old Parchment.css?inline'
import PurpleSpace from './css/themes/Purple Space.css?inline'
import DeepSea from './css/themes/Deep Sea.css?inline'
import { EngineObject } from '../core/EngineObject'
import type { AsciiEngine } from '../core/Engine'

const ENGINE_THEMES: Record<string, string> = {
  Flamingo: Flamingo,
  Midnight: Midnight,
  'Baby Blue': BabyBlue,
  'Creamy Pink': CreamyPink,
  'Saphire Peach': SaphirePeach,
  'Grey and Beige': GreyAndBeige,
  Flower: Flower,
  'Burgundy Pink': BurgundyPink,
  Chiffon: Chiffon,
  Raspberry: Raspberry,
  Copper: Copper,
  'Retro Gold': RetroGold,
  'Old Parchment': OldParchment,
  'Purple Space': PurpleSpace,
  'Deep Sea': DeepSea,
}

type ThemeDef = {
  name: string
  css: string | null // null = URL-based
  url: string | null // null = inline
}

export type ThemeManagerEvent = {
  none: []
}

export class ThemeManager extends EngineObject<ThemeManagerEvent> {
  private themes = new Map<string, ThemeDef>()
  private _styleEl: HTMLStyleElement
  private _linkEl: HTMLLinkElement

  private _current: string = ''

  /**
   * Cancels the load/error listeners attached during the previous URL theme
   * set() call. Cleared when the listeners fire or a new set() supersedes them.
   */
  private _pendingLinkCleanup: (() => void) | null = null

  get current(): string {
    return this._current
  }

  constructor() {
    super()
    this._styleEl = document.createElement('style')
    document.head.appendChild(this._styleEl)

    this._linkEl = document.createElement('link')
    this._linkEl.rel = 'stylesheet'
    this._linkEl.disabled = true
    document.head.appendChild(this._linkEl)
  }

  _init(engine: AsciiEngine) {
    super._init(engine)

    for (const { name, url } of engine.assets.themes) {
      this.register(name, url, true)
    }
    this.set(engine.config.game.initial_theme)

    const whiteList = this.engine.config.game.engine_themes
    for (const name of whiteList) {
      const css = ENGINE_THEMES[name]
      if (css) this.register(name, css)
    }
  }

  register(name: string, cssOrUrl: string, isUrl = false) {
    this.themes.set(name.toLowerCase(), {
      name,
      css: isUrl ? null : cssOrUrl,
      url: isUrl ? cssOrUrl : null,
    })
  }

  set(name: string) {
    const theme = this.themes.get(name.toLowerCase())
    if (!theme) return

    // Cancel any in-flight load listener
    this._pendingLinkCleanup?.()
    this._pendingLinkCleanup = null

    if (theme.css) {
      this._styleEl.textContent = theme.css
      this._linkEl.disabled = true
      this._linkEl.href = ''
      this._current = theme.name
      this._onThemeLoaded()
    } else if (theme.url) {
      this._styleEl.textContent = ''
      this._linkEl.href = theme.url
      this._linkEl.disabled = false
      this._current = theme.name

      // Make sure the css is loaded before calling _onThemeLoaded()
      if (this._linkEl.sheet) {
        this._onThemeLoaded()
      } else {
        const onSettled = () => {
          this._pendingLinkCleanup = null
          this._onThemeLoaded()
        }
        this._linkEl.addEventListener('load', onSettled, { once: true })
        this._linkEl.addEventListener('error', onSettled, { once: true })
        this._pendingLinkCleanup = () => {
          this._linkEl.removeEventListener('load', onSettled)
          this._linkEl.removeEventListener('error', onSettled)
        }
      }
    }
  }

  getThemeNames(): string[] {
    return [...this.themes.values()].map((t) => t.name)
  }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  /**
   * Refresh the rendering in case the --font-size changed
   */
  private _onThemeLoaded(): void {
    if (!this._engine) return
    this.engine.renderer.setTileHAndW()
    this.engine.renderer.ui.drawFrame()
    this.engine.renderer.invalidateChunks()
  }
}

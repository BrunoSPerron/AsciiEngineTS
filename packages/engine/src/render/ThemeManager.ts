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
  css: string
}

export class ThemeManager {
  private themes = new Map<string, ThemeDef>()
  private style: HTMLStyleElement

  private _current: string = ''

  get current(): string {
    return this._current
  }

  constructor() {
    this.style = document.createElement('style')
    document.head.appendChild(this.style)
  }

  init(engineThemeWhitelist: string[]) {
    for (const name of engineThemeWhitelist) {
      const css = ENGINE_THEMES[name]
      if (css) this.register(name, css)
    }
  }

  register(name: string, css: string) {
    this.themes.set(name.toLowerCase(), { name, css })
  }

  set(name: string) {
    const theme = this.themes.get(name.toLowerCase())
    if (theme) {
      this.style.textContent = theme.css
      this._current = theme.name
    }
  }

  getThemeNames(): string[] {
    return [...this.themes.values()].map((t) => t.name)
  }
}

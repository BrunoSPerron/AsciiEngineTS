import type { AsciiEngine } from '../../core/Engine'
import { Logger } from '../../core/Logger'
import type { Renderer } from './../Renderer'

type MenuEntry = {
  label: string
  action: () => void | Promise<void>
}

export class SelectMenu {
  private engine: AsciiEngine
  private renderer: Renderer

  private entries: MenuEntry[] = []

  constructor(engine: AsciiEngine) {
    this.engine = engine
    this.renderer = this.engine.renderer
  }

  register(label: string, action: () => void | Promise<void>): void {
    this.entries.push({ label, action })
  }

  registerPaletteSelect(): void {
    this.register('Palette', () => this._openPaletteMenu())
  }

  async open(): Promise<number> {
    if (this.entries.length === 0) return -1

    this.engine.pause()

    const labels = this.entries.map((e) => e.label)
    const uiLayer = this.renderer.uiLayer
    if (uiLayer === null) {
      Logger.error('Cannot Open Menu: No uiLayer in renderer')
      return -1
    }
    const selected = await uiLayer!.showSelectMenu(0, 0, labels)
    if (selected >= 0 && selected < this.entries.length) {
      await this.entries[selected].action()
    }

    this.engine.unpause()
    return selected
  }

  private async _openPaletteMenu(): Promise<void> {
    const themes = this.renderer.themeManager.getThemeNames()
    const currentTheme = this.renderer.themeManager.current
    const currentIndex = themes.indexOf(currentTheme)
    const previousTheme = currentTheme

    const uiLayer = this.renderer.uiLayer
    if (uiLayer === null) {
      Logger.error('No uiLayer in renderer')
      return
    }
    const roller = uiLayer!.createSelectRollerMenu()

    const unlisten = roller.onChange((selected: number) => {
      this.renderer.themeManager.set(themes[selected])
    })

    const selected = await roller.open(10, 10, themes, 1, currentIndex)
    unlisten()

    if (selected === -1) {
      this.renderer.themeManager.set(previousTheme)
    }
  }
}

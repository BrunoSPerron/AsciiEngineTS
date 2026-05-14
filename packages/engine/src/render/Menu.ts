import type { Renderer } from './Renderer'

type MenuEntry = {
  label: string
  action: () => void | Promise<void>
}

export class Menu {
  private renderer: Renderer
  private entries: MenuEntry[] = []

  constructor(renderer: Renderer) {
    this.renderer = renderer
  }

  register(label: string, action: () => void | Promise<void>): void {
    this.entries.push({ label, action })
  }

  registerPaletteSelect(): void {
    this.register('Palette', () => this._openPaletteMenu())
  }

  async open(): Promise<number> {
    if (this.entries.length === 0) return -1

    const labels = this.entries.map((e) => e.label)
    const selected = await this.renderer.uiLayer.showSelectMenu(10, 10, labels)
    if (selected >= 0 && selected < this.entries.length) {
      await this.entries[selected].action()
    }
    return selected
  }

  private async _openPaletteMenu(): Promise<void> {
    const themes = this.renderer.themeManager.getThemeNames()
    const currentTheme = this.renderer.themeManager.current
    const currentIndex = themes.indexOf(currentTheme)
    const previousTheme = currentTheme

    const roller = this.renderer.uiLayer.createRollerMenu()

    const unlisten = roller.onChange((selected) => {
      this.renderer.themeManager.set(themes[selected])
    })

    const selected = await roller.open(10, 10, themes, 1, currentIndex)
    unlisten()

    if (selected === -1) {
      this.renderer.themeManager.set(previousTheme)
    }
  }
}
